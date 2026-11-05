// ============================================================
// lineas.js
// Editor de "servicios / conceptos" compartido por Órdenes y
// Cotizaciones (misma tabla, mismos cálculos), para que una
// cotización se convierta en orden sin perder nada.
// ============================================================

import { esc, money, num, $, $$ } from "./ui.js";
import * as store from "./store.js";

// Totales de un documento (orden o cotización).
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
  return `
  <div class="linea">
    <input class="input l-desc" list="catalogo-servicios" placeholder="Servicio o pieza" value="${esc(l.descripcion || "")}" />
    <div class="linea-nums">
      <label><span>Cant.</span><input class="input l-cant" type="number" inputmode="decimal" min="1" step="1" value="${esc(l.cantidad || 1)}" /></label>
      <label><span>Precio</span><input class="input l-precio" type="number" inputmode="decimal" step="0.01" value="${esc(l.precio ?? "")}" placeholder="0" /></label>
      <label><span>Costo mat.</span><input class="input l-costo" type="number" inputmode="decimal" step="0.01" value="${esc(l.costo ?? "")}" placeholder="0" /></label>
      <button type="button" class="icon-btn l-del" title="Quitar">✕</button>
    </div>
  </div>`;
}

export function lineasEditorHTML(lineas) {
  const cat = store.all("servicios").slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  const rows = (lineas && lineas.length ? lineas : [{}]).map(rowHTML).join("");
  return `
    <datalist id="catalogo-servicios">${cat.map((s) => `<option value="${esc(s.nombre)}">${money(s.precio)}</option>`).join("")}</datalist>
    <div class="lineas" id="lineas">${rows}</div>
    <button type="button" class="btn btn-ghost btn-block" id="add-linea">+ Agregar servicio</button>`;
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

  cont.addEventListener("input", (e) => {
    // Al elegir un servicio del catálogo se llenan precio y costo.
    if (e.target.classList.contains("l-desc")) {
      const s = cat.find((x) => x.nombre.toLowerCase() === e.target.value.trim().toLowerCase());
      if (s) {
        const row = e.target.closest(".linea");
        if (!$(".l-precio", row).value) $(".l-precio", row).value = s.precio;
        if (!$(".l-costo", row).value) $(".l-costo", row).value = s.costo || "";
      }
    }
    onUpdate();
  });
}

export function leerLineas(root) {
  return $$(".linea", root).map((r) => ({
    descripcion: $(".l-desc", r).value.trim(),
    cantidad: num($(".l-cant", r).value) || 1,
    precio: num($(".l-precio", r).value),
    costo: num($(".l-costo", r).value)
  })).filter((l) => l.descripcion || l.precio);
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
