// ============================================================
// lineas.js
// Editor de "conceptos" compartido por Trabajos y Cotizaciones
// (misma tabla, mismos cálculos), para que una cotización se
// convierta en trabajo sin perder nada.
// Cada concepto lleva unidad (m², ml, pza, caja...) y hay una
// calculadora de m² con % de merma para pisos y persianas.
// ============================================================

import { esc, money, num, $, $$ } from "./ui.js";
import * as store from "./store.js";
import { UNIDADES } from "./documento.js";

// Totales de un documento (trabajo o cotización).
export function totales(doc) {
  const lineas = doc.servicios || [];
  const subtotal = lineas.reduce((s, l) => s + num(l.cantidad || 1) * num(l.precio), 0);
  const costo = lineas.reduce((s, l) => s + num(l.cantidad || 1) * num(l.costo), 0);
  const descuento = num(doc.descuento);
  const base = Math.max(subtotal - descuento, 0);
  const iva = doc.conIva ? base * (num(doc.ivaPct ?? 16) / 100) : 0;
  const total = base + iva;
  const pagado = (doc.pagos || []).reduce((s, p) => s + num(p.monto), 0);
  return { subtotal, costo, descuento, iva, total, pagado, saldo: Math.max(total - pagado, 0), utilidad: base - costo };
}

function rowHTML(l = {}) {
  const u = l.unidad || "m2";
  return `
  <div class="linea">
    <input class="input l-desc" list="catalogo-servicios" placeholder="Producto o servicio (ej. Piso SPC)" value="${esc(l.descripcion || "")}" />
    <div class="linea-nums">
      <label><span>Cantidad</span><input class="input l-cant" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(l.cantidad || 1)}" /></label>
      <label><span>Unidad</span><select class="input l-unidad">${Object.entries(UNIDADES).map(([k, v]) => `<option value="${k}" ${k === u ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label><span>Precio unit.</span><input class="input l-precio" type="number" inputmode="decimal" step="0.01" value="${esc(l.precio ?? "")}" placeholder="0" /></label>
      <label><span>Costo unit.</span><input class="input l-costo" type="number" inputmode="decimal" step="0.01" value="${esc(l.costo ?? "")}" placeholder="0" /></label>
      <button type="button" class="icon-btn l-del" title="Quitar">✕</button>
    </div>
  </div>`;
}

export function lineasEditorHTML(lineas) {
  const cat = store.all("servicios").slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  const rows = (lineas && lineas.length ? lineas : [{}]).map(rowHTML).join("");
  return `
    <datalist id="catalogo-servicios">${cat.map((s) => `<option value="${esc(s.nombre)}">${money(s.precio)} / ${UNIDADES[s.unidad] || ""}</option>`).join("")}</datalist>
    <div class="lineas" id="lineas">${rows}</div>
    <div class="form-actions" style="margin:0 0 10px">
      <button type="button" class="btn btn-ghost grow" id="add-linea">+ Agregar concepto</button>
      <button type="button" class="btn btn-ghost" id="toggle-calc">📐 Calcular m²</button>
    </div>
    <div class="calc" id="calc" hidden>
      <div class="calc-title">Calculadora de m² <span class="muted small">(piso: largo × ancho · persiana: ancho × alto)</span></div>
      <div class="calc-grid">
        <label><span>Medida 1 (m)</span><input class="input c-a" type="number" inputmode="decimal" step="0.01" placeholder="4.20" /></label>
        <label><span>Medida 2 (m)</span><input class="input c-b" type="number" inputmode="decimal" step="0.01" placeholder="3.50" /></label>
        <label><span>Merma %</span><input class="input c-merma" type="number" inputmode="decimal" step="1" value="10" /></label>
      </div>
      <div class="calc-res">
        <span>Total: <strong class="c-res">0.00 m²</strong> <em class="muted small c-det"></em></span>
        <button type="button" class="btn btn-primary btn-sm" id="calc-usar">Usar en el último concepto</button>
      </div>
    </div>`;
}

// Conecta eventos del editor. onUpdate() se llama en cada cambio.
export function bindLineas(root, onUpdate) {
  const cont = $("#lineas", root);
  const cat = store.all("servicios");

  $("#add-linea", root).addEventListener("click", () => {
    cont.insertAdjacentHTML("beforeend", rowHTML());
    $$(".l-desc", cont).pop().focus();
    onUpdate();
  });

  cont.addEventListener("click", (e) => {
    if (!e.target.classList.contains("l-del")) return;
    const rows = $$(".linea", cont);
    if (rows.length > 1) e.target.closest(".linea").remove();
    else $$("input", rows[0]).forEach((i) => (i.value = i.classList.contains("l-cant") ? 1 : ""));
    onUpdate();
  });

  const alCambiar = (e) => {
    // Al elegir un producto del catálogo se llenan unidad, precio y costo.
    if (e.target.classList.contains("l-desc")) {
      const s = cat.find((x) => x.nombre.toLowerCase() === e.target.value.trim().toLowerCase());
      if (s) {
        const row = e.target.closest(".linea");
        if (s.unidad) $(".l-unidad", row).value = s.unidad;
        if (!$(".l-precio", row).value) $(".l-precio", row).value = s.precio;
        if (!$(".l-costo", row).value) $(".l-costo", row).value = s.costo || "";
      }
    }
    onUpdate();
  };
  cont.addEventListener("input", alCambiar);
  cont.addEventListener("change", alCambiar);

  // Calculadora de m² con merma (desperdicio por cortes).
  const calc = $("#calc", root);
  let resultado = 0;
  $("#toggle-calc", root).onclick = () => { calc.hidden = !calc.hidden; if (!calc.hidden) $(".c-a", calc).focus(); };
  calc.addEventListener("input", () => {
    const area = num($(".c-a", calc).value) * num($(".c-b", calc).value);
    resultado = Math.ceil(area * (1 + num($(".c-merma", calc).value) / 100) * 100) / 100;
    $(".c-res", calc).textContent = resultado.toFixed(2) + " m²";
    $(".c-det", calc).textContent = area ? `(${area.toFixed(2)} m² + merma)` : "";
  });
  $("#calc-usar", root).onclick = () => {
    if (!resultado) return;
    const row = $$(".linea", cont).pop();
    $(".l-cant", row).value = resultado;
    $(".l-unidad", row).value = "m2";
    onUpdate();
  };
}

export function leerLineas(root) {
  return $$(".linea", root).map((r) => ({
    descripcion: $(".l-desc", r).value.trim(),
    cantidad: num($(".l-cant", r).value) || 1,
    unidad: $(".l-unidad", r).value,
    precio: num($(".l-precio", r).value),
    costo: num($(".l-costo", r).value)
  })).filter((l) => l.descripcion || l.precio);
}

export function lineaTxt(l) {
  return `${l.cantidad} ${UNIDADES[l.unidad] || ""}`.trim();
}

export function resumenHTML(t, { conPagos = false } = {}) {
  return `
    <div class="resumen">
      <div><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
      ${t.descuento ? `<div><span>Descuento</span><span class="neg">-${money(t.descuento)}</span></div>` : ""}
      ${t.iva ? `<div><span>IVA</span><span>${money(t.iva)}</span></div>` : ""}
      <div class="total"><span>TOTAL</span><span>${money(t.total)}</span></div>
      ${conPagos ? `
        <div><span>Pagado</span><span class="pos">${money(t.pagado)}</span></div>
        <div class="saldo"><span>Saldo</span><span>${money(t.saldo)}</span></div>` : ""}
      <div class="muted small"><span>Utilidad estimada (sin IVA)</span><span>${money(t.utilidad)}</span></div>
    </div>`;
}
