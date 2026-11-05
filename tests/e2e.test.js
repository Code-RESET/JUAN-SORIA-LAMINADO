// ============================================================
// tests/e2e.test.js  —  npm run test:e2e
// Prueba la app completa en un navegador real (Chromium, tamaño
// iPhone y PC): login, trabajo nuevo con calculadora de m²,
// anticipo y pago, cambio de estado, documento, cotización →
// trabajo, persistencia al recargar y sistema de errores.
// Levanta su propio servidor local: no necesita nada más.
// Capturas en tests/capturas/ (ignoradas por git).
// ============================================================

import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium, devices;
try { ({ chromium, devices } = require("playwright")); }
catch { console.error("Falta Playwright: npm i -D playwright && npx playwright install chromium"); process.exit(1); }

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "tests", "capturas");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

const server = http.createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  if (path.endsWith("/")) path += "index.html";
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${server.address().port}/`;
await mkdir(OUT, { recursive: true });

const pasos = [];
const paso = async (nombre, fn) => {
  try { await fn(); pasos.push(["✔", nombre]); }
  catch (e) { pasos.push(["✘", nombre + " — " + e.message.split("\n")[0]]); }
};

// CHROME_PATH permite usar un Chromium ya instalado (opcional).
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const errores = [];
try {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], serviceWorkers: "block" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push(e.message));
  page.on("dialog", (d) => { errores.push("dialog: " + d.message()); d.accept(); });

  await paso("login demo y franja de PRUEBA", async () => {
    await page.goto(B);
    await page.waitForSelector("#login-screen:not([hidden])");
    await page.screenshot({ path: `${OUT}/1-login.png` });
    await page.click("#login-btn");
    await page.waitForSelector("#app-shell:not([hidden])");
    assert.ok(await page.isVisible("#env-banner"), "debe verse la franja de entorno de prueba");
  });

  await paso("contraseña incorrecta muestra error", async () => {
    const p = await ctx.newPage();
    await p.goto(B);
    await p.evaluate(() => localStorage.removeItem("jsl_demo_session"));
    await p.reload();
    await p.fill("#login-password", "mala");
    await p.click("#login-btn");
    assert.ok(await p.isVisible("#login-error"));
    await p.close();
    await page.reload(); // la sesión de la página principal se borró arriba
    await page.waitForSelector("#login-screen:not([hidden])");
    await page.click("#login-btn");
    await page.waitForSelector("#app-shell:not([hidden])");
  });

  await paso("catálogo inicial de pisos y persianas", async () => {
    const n = await page.evaluate(() => JSON.parse(localStorage.getItem("jsl_demo_servicios")).length);
    assert.ok(n >= 10, `catálogo con ${n} productos`);
  });

  await paso("cargar datos de ejemplo e Inicio", async () => {
    await page.goto(B + "#/ajustes");
    await page.click("#btn-ejemplo");
    await page.waitForTimeout(300);
    await page.goto(B + "#/dashboard");
    await page.waitForSelector(".stats");
    await page.screenshot({ path: `${OUT}/2-inicio.png`, fullPage: true });
  });

  await paso("trabajo nuevo con calculadora de m² y anticipo", async () => {
    await page.click(".tab-plus");
    await page.waitForSelector("#f-orden");
    await page.fill("[name=clienteNombre]", "Cliente Prueba E2E");
    await page.fill("[name=telefono]", "8710000099");
    await page.fill("[name=direccion]", "Calle Ficticia 999");
    await page.fill("[name=espacio]", "Sala");
    await page.fill(".l-desc", "Piso SPC 5 mm (click)");
    await page.click("#toggle-calc");
    await page.fill(".c-a", "5");
    await page.fill(".c-b", "4");          // 20 m² + 10% merma = 22 m²
    await page.click("#calc-usar");
    assert.equal(await page.inputValue(".l-cant"), "22");
    assert.equal(await page.inputValue(".l-unidad"), "m2");
    assert.equal(await page.inputValue(".l-precio"), "480"); // precio del catálogo
    await page.fill("[name=anticipo]", "5000");
    await page.screenshot({ path: `${OUT}/3-form.png` });
    await page.click("#btn-guardar-orden");
    await page.waitForSelector("#modal .resumen");
    const r = (await page.textContent("#modal .resumen")).replace(/\s+/g, " ");
    assert.match(r, /TOTAL\$10,560\.00/);
    assert.match(r, /Saldo\$5,560\.00/);
    await page.screenshot({ path: `${OUT}/4-detalle.png` });
  });

  await paso("registrar pago liquida el saldo", async () => {
    await page.click("#f-pago button");
    await page.waitForTimeout(200);
    assert.match((await page.textContent("#modal .resumen")).replace(/\s+/g, " "), /Saldo\$0\.00/);
  });

  await paso("cambiar estado y ver documento", async () => {
    await page.click("[data-estado=INSTALACION]");
    await page.waitForSelector(".estado-opt.e-INSTALACION.sel");
    await page.click("[data-act=doc]");
    await page.waitForSelector("#doc-overlay:not([hidden]) .doc");
    assert.match(await page.textContent(".doc"), /22 m²/);
    await page.screenshot({ path: `${OUT}/5-documento.png` });
    await page.click("[data-doc-close]");
    await page.click("#modal [data-close]");
  });

  await paso("cotización → trabajo", async () => {
    await page.goto(B + "#/cotizaciones");
    await page.click("#lista-cot [data-id]");
    await page.click("[data-act=convertir]");
    await page.waitForSelector("#f-orden");
    assert.equal(await page.inputValue("[name=direccion]"), "Calle Ficticia 505");
    await page.click("#btn-guardar-orden");
    await page.waitForSelector("#modal .resumen");
    await page.click("#modal [data-close]");
    await page.click('#filtros-cot [data-f="ACEPTADA"]');
    assert.equal(await page.locator("#lista-cot [data-id]").count(), 1);
  });

  await paso("los datos siguen al recargar", async () => {
    await page.reload();
    await page.waitForSelector("#app-shell:not([hidden])");
    const n = await page.evaluate(() => JSON.parse(localStorage.getItem("jsl_demo_ordenes")).length);
    assert.equal(n, 6);
  });

  await paso("sistema de errores: un error silencioso se vuelve visible", async () => {
    await page.evaluate(() => setTimeout(() => { throw new Error("error de prueba E2E"); }));
    await page.waitForSelector("#err-badge:not([hidden])");
    await page.goto(B + "#/ajustes");
    assert.match(await page.textContent("#errores"), /error de prueba E2E/);
    await page.click("#err-limpiar");
    assert.ok(await page.isHidden("#err-badge"));
    errores.splice(errores.findIndex((e) => e.includes("error de prueba E2E")), 1);
  });

  // ---- Regresiones de bugs encontrados por revisor-bugs ----
  await paso("folio no se reutiliza al borrar un trabajo", async () => {
    const antes = await page.evaluate(() => Math.max(...JSON.parse(localStorage.getItem("jsl_demo_ordenes")).map((o) => o.folio)));
    await page.goto(B + "#/ordenes/f:TODAS");
    await page.click(`#lista-ordenes .orden-card:has(.folio:text("#${String(antes).padStart(4, "0")}"))`);
    await page.click("[data-act=del]");
    await page.click("#confirm [data-ok]");
    await page.click(".tab-plus");
    await page.fill("[name=clienteNombre]", "Cliente Ejemplo Folio");
    await page.fill(".l-desc", "Zoclo PVC");
    await page.click("#btn-guardar-orden");
    await page.waitForSelector("#modal .resumen");
    assert.equal(await page.textContent("#modal .modal-title"), `Trabajo #${String(antes + 1).padStart(4, "0")}`);
    await page.click("#modal [data-close]");
  });

  await paso("restaurar respaldo: no pisa lo más nuevo y limpia datos manipulados", async () => {
    const actual = await page.evaluate(() => JSON.parse(localStorage.getItem("jsl_demo_ordenes"))[0]);
    const respaldo = {
      app: "juan-soria-laminado",
      ordenes: [
        { ...actual, clienteNombre: "VERSION VIEJA", actualizado: 1 },
        { id: "malo1", folio: "1<img>", estado: '"><img src=x onerror=window.__xss=1>', fechaIngreso: "<img src=x onerror=window.__xss=1>",
          clienteNombre: "Cliente Ejemplo Importado", servicios: [], actualizado: 5 }
      ]
    };
    await page.goto(B + "#/ajustes");
    await page.setInputFiles("#file-restaurar", { name: "r.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(respaldo)) });
    await page.click("#confirm [data-ok]");
    await page.waitForTimeout(300);
    const o = await page.evaluate((id) => JSON.parse(localStorage.getItem("jsl_demo_ordenes")).find((x) => x.id === id), actual.id);
    assert.notEqual(o.clienteNombre, "VERSION VIEJA");
    await page.goto(B + "#/ordenes/f:TODAS");
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__xss), undefined, "no debe ejecutarse script del respaldo");
    assert.ok(await page.isVisible("text=Cliente Ejemplo Importado"));
  });

  await paso("Ajustes: lo escrito no se borra si cambian los datos", async () => {
    await page.goto(B + "#/ajustes");
    await page.fill("[name=direccion]", "Dirección a medio escribir");
    await page.click("#nuevo-serv");
    await page.fill("#f-serv [name=nombre]", "Servicio Ejemplo");
    await page.click("#f-serv [type=submit]");
    await page.waitForTimeout(200);
    assert.equal(await page.inputValue("[name=direccion]"), "Dirección a medio escribir");
  });

  await paso("pantallas en teléfono", async () => {
    for (const r of ["ordenes", "clientes", "gastos"]) {
      await page.goto(B + "#/" + r);
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${OUT}/6-${r}.png`, fullPage: true });
    }
  });

  await paso("vista de PC", async () => {
    const d = await browser.newContext({ viewport: { width: 1366, height: 860 }, serviceWorkers: "block" });
    const p2 = await d.newPage();
    p2.on("pageerror", (e) => errores.push("pc: " + e.message));
    await p2.goto(B);
    await p2.click("#login-btn");
    await p2.goto(B + "#/ajustes");
    await p2.click("#btn-ejemplo");
    await p2.goto(B + "#/dashboard");
    await p2.waitForSelector(".stats");
    assert.ok(await p2.isVisible(".sidebar"));
    await p2.screenshot({ path: `${OUT}/7-pc.png` });
  });

  await paso("sin errores de JavaScript en toda la prueba", async () => {
    assert.deepEqual(errores, []);
  });
} finally {
  await browser.close();
  server.close();
}

pasos.forEach(([s, n]) => console.log(`${s} ${n}`));
const fallos = pasos.filter(([s]) => s === "✘").length;
console.log(`\n${pasos.length - fallos}/${pasos.length} pasos OK · capturas en tests/capturas/`);
process.exit(fallos ? 1 : 0);
