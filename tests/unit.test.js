// ============================================================
// tests/unit.test.js  —  npm test   (node --test, sin navegador)
// Pruebas de la lógica pura: dinero, totales, IVA, saldo,
// escape anti-XSS, WhatsApp, texto de obra.
// ============================================================

import { test } from "node:test";
import assert from "node:assert/strict";

// Entorno mínimo de navegador para poder importar los módulos.
const mem = {};
globalThis.window = globalThis;
globalThis.location = { hostname: "localhost", search: "", hash: "" };
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; }
};
globalThis.document = { getElementById: () => null, addEventListener: () => {} };
globalThis.addEventListener = () => {};

const { totales } = await import("../js/lineas.js");
const { esc, num, waLink, money } = await import("../js/ui.js");
const { obraTxt } = await import("../js/documento.js");
const { ENTORNO, DEMO_MODE } = await import("../js/firebase-config.js");

test("totales: subtotal, costo y utilidad con cantidades decimales (m²)", () => {
  const t = totales({ servicios: [
    { descripcion: "Piso SPC", cantidad: 42.5, unidad: "m2", precio: 480, costo: 330 },
    { descripcion: "Zoclo", cantidad: 10, unidad: "ml", precio: 95, costo: 45 }
  ] });
  assert.equal(t.subtotal, 42.5 * 480 + 950);
  assert.equal(t.costo, 42.5 * 330 + 450);
  assert.equal(t.utilidad, t.subtotal - t.costo);
  assert.equal(t.total, t.subtotal);
});

test("totales: descuento antes de IVA", () => {
  const t = totales({ servicios: [{ cantidad: 1, precio: 1000 }], descuento: 100, conIva: true, ivaPct: 16 });
  assert.equal(t.iva, 900 * 0.16);
  assert.equal(t.total, 1044);
});

test("totales: el descuento nunca deja el total negativo", () => {
  const t = totales({ servicios: [{ cantidad: 1, precio: 100 }], descuento: 500 });
  assert.equal(t.total, 0);
});

test("totales: pagos parciales y saldo nunca negativo", () => {
  const base = { servicios: [{ cantidad: 2, precio: 500 }] };
  assert.equal(totales({ ...base, pagos: [{ monto: 300 }] }).saldo, 700);
  assert.equal(totales({ ...base, pagos: [{ monto: 300 }, { monto: 700 }] }).saldo, 0);
  assert.equal(totales({ ...base, pagos: [{ monto: 5000 }] }).saldo, 0);
});

test("totales: tolera datos viejos o incompletos", () => {
  const t = totales({});
  assert.equal(t.total, 0);
  assert.equal(totales({ servicios: [{ precio: "1,200.50" }] }).total, 1200.5);
});

test("esc: neutraliza HTML (anti-XSS)", () => {
  assert.equal(esc(`<img src=x onerror="alert(1)">`), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(esc(null), "");
});

test("num: convierte textos con formato", () => {
  assert.equal(num("$1,500.25"), 1500.25);
  assert.equal(num("abc"), 0);
  assert.equal(num(undefined), 0);
});

test("waLink: agrega lada 52 a números de 10 dígitos", () => {
  assert.match(waLink("871 000 0001", "Hola"), /^https:\/\/wa\.me\/528710000001\?text=Hola$/);
});

test("money: formato pesos mexicanos", () => {
  assert.match(money(1234.5), /1,234\.50/);
});

test("obraTxt: arma el texto de la obra sin huecos", () => {
  assert.equal(obraTxt({ espacio: "Sala", direccion: "Calle 1", colonia: "Centro" }), "Sala · Calle 1, Centro");
  assert.equal(obraTxt({ direccion: "Calle 1" }), "Calle 1");
  assert.equal(obraTxt(), "");
});

test("entorno: en localhost se usa el proyecto de PRUEBA", () => {
  assert.equal(ENTORNO, "prueba");
  assert.equal(typeof DEMO_MODE, "boolean");
});

// ---------- Candado: solo datos ficticios en el repo ----------
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

test("el repo no contiene teléfonos ni correos que parezcan reales", () => {
  const root = new URL("..", import.meta.url).pathname;
  const archivos = [];
  const recorrer = (d) => readdirSync(d).forEach((f) => {
    if (["node_modules", ".git", "capturas", "assets", "vendor"].includes(f)) return;
    const p = join(d, f);
    if (statSync(p).isDirectory()) recorrer(p);
    else if (/\.(js|html|json|md|rules)$/.test(f) && f !== "package-lock.json") archivos.push(p);
  });
  recorrer(root);
  const problemas = [];
  for (const p of archivos) {
    const txt = readFileSync(p, "utf8");
    // Teléfonos de 10 dígitos: solo se permiten los ficticios 871-000-00xx.
    for (const m of txt.matchAll(/(?<![\d.])\d{3}[ -]?\d{3}[ -]?\d{4}(?![\d.])/g)) {
      const d = m[0].replace(/\D/g, "");
      if (!d.startsWith("8710000") && !/^0+$/.test(d)) problemas.push(`${p}: teléfono ${m[0]}`);
    }
    // Correos: solo dominios de demo/ejemplo o de Code-Reset.
    for (const m of txt.matchAll(/[\w.+-]+@[\w-]+\.[\w.]+/g)) {
      if (!/@(example\.(com|mx))$/.test(m[0]) && !m[0].startsWith("i@izs")) problemas.push(`${p}: correo ${m[0]}`);
    }
  }
  assert.deepEqual(problemas, [], "Usa datos ficticios (teléfonos 8710000xxx, correos @example.com)");
});

test("totales: sin saldos fantasma de centavos (m² decimales + IVA)", () => {
  const doc = { servicios: [{ cantidad: 16.18, precio: 333.33 }], conIva: true, ivaPct: 16 };
  const t = totales(doc);
  assert.equal(t.total, 6256.2);
  const t2 = totales({ ...doc, pagos: [{ monto: Number(t.saldo.toFixed(2)) }] });
  assert.equal(t2.saldo, 0);
});

test("fecha: un texto que no es fecha sale escapado (anti-XSS)", async () => {
  const { fecha } = await import("../js/ui.js");
  assert.equal(fecha("<img src=x onerror=alert(1)>"), "&lt;img src=x onerror=alert(1)&gt;");
  assert.equal(fecha("2026-11-05"), "5 nov 2026");
});
