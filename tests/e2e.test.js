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
// Plan completo + bienvenida ya hecha: así se prueban todas las secciones.
// (El recorrido del plan "cotizador" tiene su propia sección al final.)
const PLAN_COMPLETO = () => {
  try {
    localStorage.setItem("jsl_plan", "completo");
    if (!localStorage.getItem("jsl_demo_ajustes")) localStorage.setItem("jsl_demo_ajustes", JSON.stringify([{ id: "config", onboarding: true }]));
  } catch {}
};
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const errores = [];
try {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], serviceWorkers: "block" });
  await ctx.addInitScript(PLAN_COMPLETO);
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
    // SPC del catálogo: 2.23 m² por caja -> 22 m² = 10 cajas = 22.30 m²
    assert.match(await page.textContent(".c-cajas"), /10 cajas = 22\.30 m²/);
    await page.click("#calc-usar");
    assert.equal(await page.inputValue(".l-cant"), "22.3");
    assert.equal(await page.inputValue(".l-unidad"), "m2");
    assert.equal(await page.inputValue(".l-precio"), "480"); // precio del catálogo
    assert.match(await page.textContent(".l-cajas"), /10 cajas/);
    // Segunda línea: instalación cobrada sobre el ÁREA REAL (sin merma ni cajas)
    await page.click("#add-linea");
    await page.locator(".l-desc").nth(1).fill("Instalación de piso");
    await page.click("#calc-add");
    await page.locator(".c-a").nth(1).fill("2");
    await page.locator(".c-b").nth(1).fill("1.5");          // 20 + 3 = 23 m² reales
    assert.match(await page.textContent(".c-area"), /23\.00 m²/);
    await page.selectOption(".c-dest", { label: "Instalación de piso" });
    await page.click("#calc-usar-real");
    assert.equal(await page.locator(".l-cant").nth(1).inputValue(), "23");
    await page.locator(".l-desc").nth(1).evaluate((el) => el.blur());
    await page.fill("[name=anticipo]", "5000");
    await page.screenshot({ path: `${OUT}/3-form.png` });
    await page.click("#btn-guardar-orden");
    await page.waitForSelector("#modal .resumen");
    const r = (await page.textContent("#modal .resumen")).replace(/\s+/g, " ");
    // 22.30 × 480 = 10,704 + 23 × 120 = 2,760 -> 13,464
    assert.match(r, /TOTAL\$13,464\.00/);
    assert.match(r, /Saldo\$8,464\.00/);
    assert.match(await page.textContent("#modal .tabla-lineas"), /10 cajas/);
    await page.screenshot({ path: `${OUT}/4-detalle.png` });
  });

  await paso("registrar pago liquida el saldo", async () => {
    await page.click("[data-llenar-saldo]");
    await page.click("#f-pago [type=submit]");
    await page.waitForTimeout(200);
    assert.match((await page.textContent("#modal .resumen")).replace(/\s+/g, " "), /Saldo\$0\.00/);
  });

  await paso("cambiar estado y ver documento", async () => {
    await page.click("[data-estado=INSTALACION]");
    await page.waitForSelector(".estado-opt.e-INSTALACION.sel");
    await page.click("[data-act=doc]");
    await page.waitForSelector("#doc-overlay:not([hidden]) .doc");
    assert.match(await page.textContent(".doc"), /22\.3 m²/);
    assert.match(await page.textContent(".doc"), /10 cajas/);
    await page.screenshot({ path: `${OUT}/5-documento.png` });
    await page.click("[data-doc-close]");
    await page.click("#modal [data-close]");
  });

  await paso("editar el precio ANTES que la descripción recalcula el total (sin errores)", async () => {
    await page.goto(B + "#/ordenes");
    await page.click(".tab-plus");
    await page.waitForSelector("#f-orden");
    await page.fill(".l-precio", "250");
    await page.fill(".l-cant", "4");
    assert.match((await page.textContent("#resumen-orden")).replace(/\s+/g, " "), /TOTAL\$1,000\.00/);
    await page.click("#modal [data-close]");
  });

  await paso("'Aplicar a' sigue al concepto elegido aunque se borre otro", async () => {
    await page.goto(B + "#/ordenes");
    await page.click(".tab-plus");
    await page.waitForSelector("#f-orden");
    await page.fill(".l-desc", "Bajo piso / espuma");
    await page.click("#add-linea"); await page.locator(".l-desc").nth(1).fill("Zoclo PVC");
    await page.click("#add-linea"); await page.locator(".l-desc").nth(2).fill("Instalación de piso");
    await page.click("#toggle-calc");
    await page.fill(".c-a", "3"); await page.fill(".c-b", "2");
    await page.selectOption(".c-dest", { label: "Zoclo PVC" });
    await page.locator(".l-del").nth(0).click();          // borra "Bajo piso"
    assert.equal(await page.$eval(".c-dest", (s) => s.selectedOptions[0].textContent), "Zoclo PVC");
    await page.click("#calc-usar-real");
    assert.equal(await page.locator(".l-cant").nth(0).inputValue(), "6");   // Zoclo (ahora 1ª fila)
    assert.equal(await page.locator(".l-cant").nth(1).inputValue(), "1");   // Instalación intacta
    await page.click("#modal [data-close]");
  });

  await paso("PDF de cotización: se genera, se descarga y es un PDF válido", async () => {
    await page.goto(B + "#/cotizaciones");
    await page.click('#filtros-cot [data-f="TODAS"]');
    await page.click("#lista-cot [data-id]");
    await page.click("[data-act=doc]");
    await page.waitForSelector("[data-doc-share]:not([disabled])", { timeout: 15000 });
    assert.match(await page.textContent("[data-doc-share]"), /Enviar PDF/);
    await page.screenshot({ path: `${OUT}/5b-documento-pdf.png` });
    const [descarga] = await Promise.all([page.waitForEvent("download"), page.click("[data-doc-download]")]);
    assert.match(descarga.suggestedFilename(), /^Cotizacion-\d{4}-.+\.pdf$/);
    const ruta = await descarga.path();
    const { readFile: rf } = await import("node:fs/promises");
    const bytes = await rf(ruta);
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    assert.ok(bytes.length > 2000 && bytes.length < 200000, `tamaño ${bytes.length}`);
    const { copyFile } = await import("node:fs/promises");
    await copyFile(ruta, `${OUT}/cotizacion-ejemplo.pdf`);
  });

  await paso("PDF con notas muy largas: el texto continúa en otra página, no se pierde", async () => {
    const b64 = await page.evaluate(async () => {
      const { generarPDF } = await import("/js/pdf.js");
      const notas = Array.from({ length: 140 }, (_, i) => `Renglón de nota número ${i + 1} con medidas y detalles de la obra.`).join("\n") + "\nFIN-DE-NOTAS";
      const blob = await generarPDF("cotizacion", { folio: 99, clienteNombre: "Cliente Ejemplo PDF ", servicios: [{ descripcion: "Piso SPC", cantidad: 10, unidad: "m2", precio: 480 }], notas });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = ""; buf.forEach((c) => (s += String.fromCharCode(c)));
      return btoa(s);
    });
    const { writeFile } = await import("node:fs/promises");
    const ruta = `${OUT}/notas-largas.pdf`;
    await writeFile(ruta, Buffer.from(b64, "base64"));
    const { execFileSync } = await import("node:child_process");
    let texto;
    try { texto = execFileSync("pdftotext", ["-layout", ruta, "-"]).toString(); }
    catch { console.log("   (pdftotext no instalado: se omite la verificación de texto)"); return; }
    const paginas = texto.split("\f").filter((p) => p.trim());
    assert.ok(paginas.length >= 2, `debe ocupar 2+ páginas, ocupó ${paginas.length}`);
    assert.match(texto, /FIN-DE-NOTAS/);
    assert.match(texto, /NOTAS \(continúa\)/);
    // Ningún renglón de nota encimado con el pie de página.
    assert.doesNotMatch(texto, /obra\.[ \t]+Juan Soria/); // mismo renglón = encimado
  });

  await paso("Enviar PDF: comparte el ARCHIVO (no texto) con el menú del teléfono", async () => {
    await page.evaluate(() => {
      window.__compartido = null;
      navigator.canShare = (d) => !!(d && d.files && d.files.length);
      navigator.share = async (d) => { window.__compartido = { n: d.files.length, tipo: d.files[0].type, nombre: d.files[0].name, texto: d.text || null }; };
    });
    await page.click("[data-doc-share]");
    await page.waitForFunction(() => window.__compartido);
    const c = await page.evaluate(() => window.__compartido);
    assert.equal(c.n, 1);
    assert.equal(c.tipo, "application/pdf");
    assert.match(c.nombre, /\.pdf$/);
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
    assert.ok(await page.isVisible(".catalogo >> text=Servicio Ejemplo"), "el catálogo sí debe actualizarse");
  });

  await paso("doble toque en 'Registrar pago' no cobra de más", async () => {
    await page.goto(B + "#/ordenes/f:POR_COBRAR");
    await page.click("#lista-ordenes .orden-card");
    await page.waitForSelector("#f-pago");
    const antes = (await page.evaluate(() => JSON.parse(localStorage.getItem("jsl_demo_ordenes")).map((o) => (o.pagos || []).length).reduce((a, b) => a + b, 0)));
    await page.fill("#f-pago [name=monto]", "100");
    await page.evaluate(() => { const b = document.querySelector("#f-pago [type=submit]"); b.click(); b.click(); });
    await page.waitForTimeout(150);
    await page.evaluate(() => document.querySelector("#f-pago [type=submit]")?.click()); // toque sobre el formulario repintado
    await page.waitForTimeout(300);
    const despues = (await page.evaluate(() => JSON.parse(localStorage.getItem("jsl_demo_ordenes")).map((o) => (o.pagos || []).length).reduce((a, b) => a + b, 0)));
    assert.equal(despues - antes, 1, `se registraron ${despues - antes} pagos`);
    await page.click("#modal [data-close]");
  });

  await paso("respaldo en dispositivo nuevo: toma datos del negocio y catálogo; ivaPct malicioso neutralizado", async () => {
    const c2 = await browser.newContext({ ...devices["iPhone 13"], serviceWorkers: "block" });
    await c2.addInitScript(PLAN_COMPLETO);
    const p = await c2.newPage();
    p.on("pageerror", (e) => errores.push("nuevo: " + e.message));
    await p.goto(B);
    await p.click("#login-btn");
    await p.waitForSelector("#app-shell:not([hidden])");
    const respaldo = {
      app: "juan-soria-laminado",
      ajustes: [{ id: "config", negocio: "Negocio Ejemplo Restaurado", ivaPct: "<img src=x onerror=window.__xss=1>", folios: { ordenes: 40 }, actualizado: 1 }],
      servicios: [{ id: "s1", nombre: "Producto Ejemplo Respaldo", unidad: "m2", precio: 100, costo: 50, actualizado: 1 }]
    };
    await p.goto(B + "#/ajustes");
    await p.setInputFiles("#file-restaurar", { name: "r.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(respaldo)) });
    await p.click("#confirm [data-ok]");
    await p.waitForTimeout(300);
    const st = await p.evaluate(() => ({
      aj: JSON.parse(localStorage.getItem("jsl_demo_ajustes"))[0],
      serv: JSON.parse(localStorage.getItem("jsl_demo_servicios")).map((s) => s.nombre)
    }));
    assert.equal(st.aj.negocio, "Negocio Ejemplo Restaurado");
    assert.equal(st.aj.ivaPct, 0, "ivaPct no numérico debe quedar en 0");
    assert.deepEqual(st.serv, ["Producto Ejemplo Respaldo"], "el catálogo de fábrica se reemplaza");
    await p.click("#app-content .tab-plus, .tab-plus");
    await p.waitForSelector("#f-orden");
    assert.equal(await p.evaluate(() => window.__xss), undefined);
    await p.click("#modal [data-close]");

    // Respaldo dañado: cliente sin nombre y servicios inválidos -> no truena ni deja sin catálogo.
    const antes = await p.evaluate(() => JSON.parse(localStorage.getItem("jsl_demo_servicios")).length);
    const danado = { app: "juan-soria-laminado", clientes: [{ id: "c-sin-nombre" }], servicios: [{ id: "s-malo" }] };
    await p.goto(B + "#/ajustes");
    await p.setInputFiles("#file-restaurar", { name: "d.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(danado)) });
    await p.click("#confirm [data-ok]");
    await p.waitForTimeout(300);
    const despues = await p.evaluate(() => JSON.parse(localStorage.getItem("jsl_demo_servicios")).length);
    assert.equal(despues, antes, "el catálogo no debe perderse con un respaldo dañado");
    await c2.close();
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
    await d.addInitScript(PLAN_COMPLETO);
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

  // ================= PLAN COTIZADOR (la demo de Juan) =================
  const cj = await browser.newContext({ ...devices["iPhone 13"], serviceWorkers: "block", acceptDownloads: true });
  const j = await cj.newPage();
  j.on("pageerror", (e) => errores.push("cotizador: " + e.message));
  j.on("dialog", (d) => { errores.push("cotizador dialog: " + d.message()); d.accept(); });

  await paso("cotizador: la primera vez pide negocio y logo (sin datos de ejemplo)", async () => {
    await j.goto(B);
    await j.click("#login-btn");
    await j.waitForSelector("#onb-negocio");
    assert.equal(await j.evaluate(() => location.hash), "#/bienvenida");
    assert.equal(await j.locator("#btn-ejemplo").count(), 0);
    await j.fill("[name=negocio]", "Pisos Ejemplo Soria");
    await j.fill("[name=telefono]", "8710000001");
    await j.setInputFiles("#logo-file", join(ROOT, "assets", "icon-192.png"));
    await j.waitForSelector("#logo-prev img");
    await j.screenshot({ path: `${OUT}/c1-bienvenida.png` });
    await j.click("#onb-negocio [type=submit]");
    await j.waitForSelector("#onb-mat");
    assert.equal(await j.textContent(".app-header [data-marca-nombre]"), "Pisos Ejemplo Soria");
    assert.ok(await j.isVisible(".app-header img[data-marca-logo]"), "logo en la cabecera");
  });

  await paso("cotizador: sus materiales y precio por m² (solo se guardan los que tienen precio)", async () => {
    await j.waitForTimeout(400); // deja pasar el repintado por el guardado del paso 1
    assert.equal(await j.evaluate(() => location.hash), "#/bienvenida", "el asistente no debe cerrarse a medias");
    assert.ok(await j.isVisible("#onb-mat"));
    const err = j.locator("#mat-err");
    await j.click("#onb-mat [type=submit]");               // sin ningún precio -> aviso
    assert.ok(await err.isVisible());
    const filas = j.locator("#mats .mat");
    const n = await filas.count();
    let spc = -1;
    for (let i = 0; i < n; i++) if ((await filas.nth(i).locator(".m-nombre").inputValue()).startsWith("Piso SPC")) spc = i;
    await filas.nth(spc).locator(".m-precio").fill("450");
    await filas.nth(spc).locator(".m-costo").fill("300");
    await j.click("#mat-add");
    await filas.last().locator(".m-nombre").fill("Instalación ejemplo");
    await filas.last().locator(".m-precio").fill("110");
    await j.screenshot({ path: `${OUT}/c2-materiales.png` });
    await j.click("#onb-mat [type=submit]");
    await j.waitForSelector(".tarea");
    const serv = await j.evaluate(() => JSON.parse(localStorage.getItem("jsl_demo_servicios")).map((x) => `${x.nombre}:${x.precio}`).sort());
    assert.deepEqual(serv, ["Instalación ejemplo:110", "Piso SPC 5 mm (click):450"]);
  });

  await paso("cotizador: menú con Cotizaciones y Mi negocio; lo demás con 🔒", async () => {
    assert.equal(await j.evaluate(() => location.hash), "#/cotizaciones");
    assert.equal(await j.locator("#app-nav a.locked").count(), 4);
    assert.equal(await j.locator("#tabbar a").count(), 3);
    await j.goto(B + "#/ordenes");
    await j.waitForSelector(".bloqueado");
    assert.match(await j.textContent(".bloqueado"), /paquete completo/i);
    await j.screenshot({ path: `${OUT}/c3-bloqueado.png` });
    await j.goto(B + "#/ordenes/nueva");                   // ni por URL se abre
    await j.waitForSelector(".bloqueado");
    assert.equal(await j.locator("#f-orden").count(), 0);
  });

  await paso("cotizador: primera tarea — cotizar un piso real y ver la ganancia", async () => {
    await j.goto(B + "#/cotizaciones");
    await j.waitForSelector(".tarea");
    await j.screenshot({ path: `${OUT}/c4-tarea.png`, fullPage: true });
    await j.click(".tarea a.btn");
    await j.waitForSelector("#f-cot");
    await j.fill("[name=clienteNombre]", "Cliente Ejemplo Prueba");
    await j.fill(".l-desc", "Piso SPC 5 mm (click)");
    assert.equal(await j.inputValue(".l-precio"), "450");
    await j.click("#toggle-calc");
    await j.fill(".c-a", "4"); await j.fill(".c-b", "3");  // 12 m² + 10% = 13.2 m²
    await j.click("#calc-usar");
    const g = (await j.textContent("#resumen-cot")).replace(/\s+/g, " ");
    // 13.2 × 450 = 5,940 ; costo 13.2 × 300 = 3,960 ; ganancia 1,980 (33%)
    assert.match(g, /TOTAL\$5,940\.00/);
    assert.match(g, /Tu ganancia en este trabajo\$1,980\.00/);
    await j.screenshot({ path: `${OUT}/c5-cotizacion.png` });
    await j.click("#f-cot [type=submit]");
    await j.waitForSelector("#modal .ganancia");
    assert.equal(await j.locator("[data-act=convertir]").count(), 0, "convertir en trabajo bloqueado");
    assert.ok(await j.isVisible(".locked-btn"));
  });

  await paso("cotizador: el PDF lleva su logo y la ganancia NO sale en el PDF", async () => {
    await j.click("[data-act=doc]");
    await j.waitForSelector("[data-doc-share]:not([disabled])", { timeout: 15000 });
    assert.ok(await j.isVisible(".doc .doc-logo"));
    const b64 = await j.evaluate(async () => {
      const { _pdfActual } = await import("/js/documento.js");
      const buf = new Uint8Array(await _pdfActual().blob.arrayBuffer());
      let s = ""; buf.forEach((c) => (s += String.fromCharCode(c))); return btoa(s);
    });
    const pdf = Buffer.from(b64, "base64");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(`${OUT}/cotizacion-cotizador.pdf`, pdf);
    assert.match(pdf.toString("latin1"), /\/Subtype\s*\/Image/, "el PDF debe incluir el logo");
    const { execFileSync } = await import("node:child_process");
    try {
      const texto = execFileSync("pdftotext", [`${OUT}/cotizacion-cotizador.pdf`, "-"]).toString();
      assert.match(texto, /Pisos Ejemplo Soria/);
      assert.doesNotMatch(texto, /ganancia|3,960|1,980/i, "costos y ganancia no deben ir al cliente");
    } catch (e) { if (e.code !== "ENOENT") throw e; }
  });

  await paso("cotizador: al mandar el PDF la primera tarea queda completa", async () => {
    await j.evaluate(() => { navigator.canShare = () => true; navigator.share = async () => {}; });
    await j.click("[data-doc-share]");
    await j.waitForFunction(() => JSON.parse(localStorage.getItem("jsl_demo_ajustes"))[0].primerPdf === true);
    await j.click("[data-doc-close]");
    await j.click("#modal [data-close]");
    await j.waitForSelector(".tarea [data-tarea-cerrar]");
    assert.match(await j.textContent(".tarea"), /Primera tarea completa/);
    await j.screenshot({ path: `${OUT}/c6-tarea-completa.png` });
    await j.click("[data-tarea-cerrar]");
    await j.waitForFunction(() => !document.querySelector(".tarea"));
  });

  await paso("cotizador: logo y nombre en el login al volver a entrar", async () => {
    await j.click("#menu-btn");
    await j.click("#logout-btn");
    await j.waitForSelector("#login-screen:not([hidden])");
    await j.reload();
    await j.waitForSelector("#login-screen:not([hidden])");
    assert.equal(await j.textContent(".login-title"), "Pisos Ejemplo Soria");
    assert.ok(await j.isVisible("#login-logo-cliente"));
    await j.screenshot({ path: `${OUT}/c7-login.png` });
  });
  await paso("cotizador: la bienvenida no se vuelve a abrir una vez terminada", async () => {
    await j.click("#login-btn");
    await j.waitForSelector("#app-shell:not([hidden])");
    await j.goto(B + "#/bienvenida");
    await j.waitForSelector("#lista-cot");
    assert.equal(await j.evaluate(() => location.hash), "#/cotizaciones");
  });
  await cj.close();

  await paso("cotizador: quien ya usaba la app (versión anterior) no pierde nada", async () => {
    const cv = await browser.newContext({ ...devices["iPhone 13"], serviceWorkers: "block" });
    // Datos que dejó la versión anterior: un trabajo y un material sin editar.
    await cv.addInitScript(() => {
      if (localStorage.getItem("jsl_demo_ordenes")) return;
      localStorage.setItem("jsl_demo_ordenes", JSON.stringify([{ id: "o1", folio: 1, clienteNombre: "Cliente Ejemplo Viejo", estado: "MEDICION", servicios: [{ descripcion: "Piso", cantidad: 10, unidad: "m2", precio: 300 }], pagos: [] }]));
      localStorage.setItem("jsl_demo_servicios", JSON.stringify([{ id: "s1", nombre: "Piso laminado 8 mm", unidad: "m2", precio: 320, costo: 210, semilla: true }]));
      localStorage.setItem("jsl_demo_ajustes", JSON.stringify([{ id: "config", catalogoSembrado: true }]));
    });
    const v = await cv.newPage();
    v.on("pageerror", (e) => errores.push("previo: " + e.message));
    await v.goto(B);
    await v.click("#login-btn");
    await v.waitForSelector("#app-shell:not([hidden])");
    await v.waitForTimeout(200);
    assert.notEqual(await v.evaluate(() => location.hash), "#/bienvenida", "no debe forzar la bienvenida");
    assert.equal(await v.locator("#app-nav a.locked").count(), 0, "no se le bloquea lo que ya usaba");
    await v.goto(B + "#/ordenes/f:TODAS");
    await v.waitForSelector("#lista-ordenes .orden-card");
    assert.equal(await v.evaluate(() => JSON.parse(localStorage.getItem("jsl_demo_servicios")).length), 1, "no borra materiales");
    await cv.close();
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
