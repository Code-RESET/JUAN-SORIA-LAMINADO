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
    if (["node_modules", ".git", "capturas", "assets"].includes(f)) return;
    if (f === "jspdf.umd.min.js") return; // librería de terceros (MIT), sin datos de clientes
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

test("calculadora de m²: resultados exactos y redondeo hacia arriba", async () => {
  const { calcularM2 } = await import("../js/lineas.js");
  const casos = [
    // [medida1, medida2, merma%, esperado]
    [4.2, 3.5, 10, 16.17],   // antes daba 16.18 por error de punto flotante
    [1.1, 1.1, 0, 1.21],     // antes daba 1.22
    [5, 4, 10, 22],
    [3, 3, 10, 9.9],
    [2.5, 4, 10, 11],
    [4.2, 3.5, 0, 14.7],
    [6.1, 3, 5, 19.22],      // 19.215 -> sube a 19.22 (no falta material)
    [3.33, 2.87, 8, 10.33],  // 9.5571 × 1.08 = 10.321668 -> 10.33
    [0.7, 0.1, 0, 0.07],
    [12.35, 8.4, 12, 116.19] // 103.74 × 1.12 = 116.1888 -> 116.19
  ];
  for (const [a, b, m, esp] of casos) {
    assert.equal(calcularM2(a, b, m).total, esp, `${a} × ${b} + ${m}%`);
  }
});

test("calculadora de m²: entradas inválidas no dan resultados raros", async () => {
  const { calcularM2 } = await import("../js/lineas.js");
  assert.equal(calcularM2("", 3, 10).total, 0);
  assert.equal(calcularM2(-4, 3, 10).total, 0);
  assert.equal(calcularM2(4, 3, -50).total, 12);    // merma negativa = 0 %
  assert.equal(calcularM2(4, 3, 500).total, 24);    // merma máxima 100 %
  assert.equal(calcularM2("4.5", "2", "").total, 9);
});

test("calculadora de m²: medidas de 3 decimales con merma decimal", async () => {
  const { calcularM2 } = await import("../js/lineas.js");
  assert.equal(calcularM2(3.247, 4.724, 9.2).total, 16.76); // 16.750000176 -> sube a 16.76
});

test("calculadora: suma de varias áreas (cuarto en L) + merma", async () => {
  const { calcularAreas } = await import("../js/lineas.js");
  // L = 4.20×3.50 + 2.10×1.80 = 14.70 + 3.78 = 18.48 m²; +10% = 20.328 -> 20.33
  const r = calcularAreas([[4.2, 3.5], [2.1, 1.8]], 10);
  assert.equal(r.area, 18.48);
  assert.equal(r.total, 20.33);
  // Áreas vacías o negativas no suman
  assert.equal(calcularAreas([[4, 3], ["", 2], [-1, 5]], 0).total, 12);
  assert.equal(calcularAreas([], 10).total, 0);
});

test("cajas: redondea a cajas completas y da los m² reales a cobrar", async () => {
  const { calcularCajas } = await import("../js/lineas.js");
  assert.deepEqual(calcularCajas(16.17, 2.13), { cajas: 8, m2: 17.04 });   // 7.59 cajas -> 8
  assert.deepEqual(calcularCajas(21.3, 2.13), { cajas: 10, m2: 21.3 });    // exacto: 10, no 11
  assert.deepEqual(calcularCajas(6.69, 2.23), { cajas: 3, m2: 6.69 });     // 2.23×3 sin error de punto flotante
  assert.deepEqual(calcularCajas(22, 2.23), { cajas: 10, m2: 22.3 });
  assert.equal(calcularCajas(10, ""), null);   // producto sin m² por caja
  assert.equal(calcularCajas(0, 2.13), null);
});
