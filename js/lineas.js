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

// Redondeo a centavos. Sin esto, m² decimales × precio × IVA dejan
// saldos fantasma (ej. $0.0041) que no se pueden liquidar.
export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Totales de un documento (trabajo o cotización), siempre en centavos.
export function totales(doc) {
  const lineas = doc.servicios || [];
  const subtotal = r2(lineas.reduce((s, l) => s + r2(num(l.cantidad || 1) * num(l.precio)), 0));
  const costo = r2(lineas.reduce((s, l) => s + num(l.cantidad || 1) * num(l.costo), 0));
  const descuento = r2(num(doc.descuento));
  const base = r2(Math.max(subtotal - descuento, 0));
  const iva = doc.conIva ? r2(base * (num(doc.ivaPct ?? 16) / 100)) : 0;
  const total = r2(base + iva);
  const pagado = r2((doc.pagos || []).reduce((s, p) => s + num(p.monto), 0));
  return { subtotal, costo, descuento, iva, total, pagado, saldo: r2(Math.max(total - pagado, 0)), utilidad: r2(base - costo) };
}

// ---------- Calculadora de m² ----------
// Suma de varias áreas (cuartos en "L", varios espacios) + % de merma,
// redondeado HACIA ARRIBA a centésimas (mejor que sobre a que falte).
// Por qué los Math.round previos: en JavaScript 4.2 × 3.5 × 1.1 da
// 16.170000000000002 y un Math.ceil directo lo subía a 16.18.
// Medidas negativas o vacías cuentan como 0; la merma va de 0 a 100 %.
const limpio = (n) => Math.round(n * 1e9) / 1e9;

export function calcularAreas(areas, mermaPct = 0) {
  const area = limpio((areas || []).reduce((s, [m1, m2]) =>
    s + limpio(Math.max(num(m1), 0) * Math.max(num(m2), 0)), 0));
  const merma = Math.min(Math.max(num(mermaPct), 0), 100);
  const total = Math.ceil(Math.round(area * (1 + merma / 100) * 1e9) / 1e7) / 100;
  return { area, merma, total };
}

// Compatibilidad: una sola área.
export function calcularM2(medida1, medida2, mermaPct = 0) {
  const r = calcularAreas([[medida1, medida2]], mermaPct);
  return { area: r.area, total: r.total };
}

// El piso se vende por CAJA: cuántas cajas completas cubren `m2`
// y cuántos m² trae eso en realidad (lo que se cobra).
export function calcularCajas(m2, m2PorCaja) {
  const porCaja = num(m2PorCaja);
  if (!(porCaja > 0) || !(num(m2) > 0)) return null;
  const cajas = Math.ceil(limpio(num(m2) / porCaja));
  return { cajas, m2: Math.ceil(Math.round(cajas * porCaja * 1e9) / 1e7) / 100 };
}

let siguienteK = 1; // id estable de cada fila (el selector "Aplicar a" no usa posiciones)

function rowHTML(l = {}) {
  const u = l.unidad || "m2";
  return `
  <div class="linea" data-k="${siguienteK++}"${l.cajas ? ` data-cajas="${esc(l.cajas)}"` : ""}>
    <input class="input l-desc" list="catalogo-servicios" placeholder="Producto o servicio (ej. Piso SPC)" value="${esc(l.descripcion || "")}" />
    <div class="linea-nums">
      <label><span>Cantidad</span><input class="input l-cant" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(l.cantidad || 1)}" /></label>
      <label><span>Unidad</span><select class="input l-unidad">${Object.entries(UNIDADES).map(([k, v]) => `<option value="${k}" ${k === u ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label><span>Precio unit.</span><input class="input l-precio" type="number" inputmode="decimal" step="0.01" value="${esc(l.precio ?? "")}" placeholder="0" /></label>
      <label><span>Costo unit.</span><input class="input l-costo" type="number" inputmode="decimal" step="0.01" value="${esc(l.costo ?? "")}" placeholder="0" /></label>
      <button type="button" class="icon-btn l-del" title="Quitar">✕</button>
    </div>
    <div class="l-cajas muted small"${l.cajas ? "" : " hidden"}>📦 ${esc(l.cajas || "")} cajas completas</div>
  </div>`;
}

function areaHTML() {
  return `
    <div class="calc-area">
      <label><span>Medida 1 (m)</span><input class="input c-a" type="number" inputmode="decimal" step="0.01" min="0" placeholder="4.20" /></label>
      <span class="calc-x">×</span>
      <label><span>Medida 2 (m)</span><input class="input c-b" type="number" inputmode="decimal" step="0.01" min="0" placeholder="3.50" /></label>
      <span class="calc-sub muted small">0.00 m²</span>
      <button type="button" class="icon-btn c-del" title="Quitar área">✕</button>
    </div>`;
}

export function lineasEditorHTML(lineas) {
  const cat = store.all("servicios").slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  const rows = (lineas && lineas.length ? lineas : [{}]).map(rowHTML).join("");
  return `
    <datalist id="catalogo-servicios">${cat.map((s) => `<option value="${esc(s.nombre)}">${money(s.precio)} / ${UNIDADES[s.unidad] || ""}${s.m2Caja ? ` · caja ${esc(s.m2Caja)} m²` : ""}</option>`).join("")}</datalist>
    <div class="lineas" id="lineas">${rows}</div>
    <div class="form-actions" style="margin:0 0 10px">
      <button type="button" class="btn btn-ghost grow" id="add-linea">+ Agregar concepto</button>
      <button type="button" class="btn btn-ghost" id="toggle-calc">📐 Calcular m²</button>
    </div>
    <div class="calc" id="calc" hidden>
      <div class="calc-title">Calculadora de m² <span class="muted small">(piso: largo × ancho · persiana: ancho × alto)</span></div>
      <div class="calc-areas">${areaHTML()}</div>
      <div class="calc-opts">
        <button type="button" class="btn btn-ghost btn-sm" id="calc-add">+ otra área</button>
        <label class="calc-merma-l"><span>Merma %</span><input class="input c-merma" type="number" inputmode="decimal" step="1" min="0" max="100" value="10" /></label>
      </div>
      <div class="calc-out">
        <div><span>Área real</span><strong class="c-area">0.00 m²</strong></div>
        <div><span>Con merma</span><strong class="c-res">0.00 m²</strong></div>
        <div class="c-cajas-box" hidden><span>En cajas</span><strong class="c-cajas"></strong></div>
      </div>
      <label class="field calc-dest"><span>Aplicar a</span><select class="input c-dest"></select></label>
      <div class="calc-btns">
        <button type="button" class="btn btn-primary btn-sm" id="calc-usar">Usar con merma</button>
        <button type="button" class="btn btn-ghost btn-sm" id="calc-usar-real" title="Para instalación: se cobra el área real">Usar área real</button>
      </div>
    </div>`;
}

// Conecta eventos del editor. onUpdate() se llama en cada cambio.
export function bindLineas(root, onUpdate) {
  const cont = $("#lineas", root);
  const cat = store.all("servicios");
  const producto = (row) => {
    const d = $(".l-desc", row).value.trim().toLowerCase();
    return d ? cat.find((x) => x.nombre.toLowerCase() === d) : null;
  };
  const marcarCajas = (row, cajas) => {
    if (cajas) row.dataset.cajas = cajas; else delete row.dataset.cajas;
    const el = $(".l-cajas", row);
    el.hidden = !cajas;
    el.textContent = cajas ? `📦 ${cajas} cajas completas` : "";
  };

  $("#add-linea", root).addEventListener("click", () => {
    cont.insertAdjacentHTML("beforeend", rowHTML());
    $$(".l-desc", cont).pop().focus();
    llenarDestinos();
    onUpdate();
  });

  cont.addEventListener("click", (e) => {
    if (!e.target.classList.contains("l-del")) return;
    const rows = $$(".linea", cont);
    if (rows.length > 1) e.target.closest(".linea").remove();
    else { $$("input", rows[0]).forEach((i) => (i.value = i.classList.contains("l-cant") ? 1 : "")); marcarCajas(rows[0], null); }
    llenarDestinos();
    onUpdate();
  });

  const alCambiar = (e) => {
    const row = e.target.closest(".linea");
    // Si se cambia a mano la cantidad o el producto, ya no son "cajas completas".
    if (row && ["l-cant", "l-desc", "l-unidad"].some((c) => e.target.classList.contains(c))) marcarCajas(row, null);
    // Al elegir un producto del catálogo se llenan unidad, precio y costo.
    if (e.target.classList.contains("l-desc")) {
      const s = producto(row);
      if (s) {
        if (s.unidad) $(".l-unidad", row).value = s.unidad;
        if (!$(".l-precio", row).value) $(".l-precio", row).value = s.precio;
        if (!$(".l-costo", row).value) $(".l-costo", row).value = s.costo || "";
      }
      llenarDestinos();
    }
    actualizarCalc();
    onUpdate();
  };
  cont.addEventListener("input", alCambiar);
  cont.addEventListener("change", alCambiar);

  // ----- Calculadora -----
  const calc = $("#calc", root);
  const areas = $(".calc-areas", calc);
  const dest = $(".c-dest", calc);
  let r = { area: 0, total: 0 };
  let elegidoAMano = false; // si el usuario eligió destino, se respeta

  function llenarDestinos() {
    const filas = $$(".linea", cont);
    const prev = dest.value;
    dest.innerHTML = filas.map((row, i) => {
      const s = producto(row);
      const nombre = $(".l-desc", row).value.trim() || `Concepto ${i + 1} (sin nombre)`;
      return `<option value="${esc(row.dataset.k)}">${esc(nombre)}${s?.m2Caja ? ` · caja ${esc(s.m2Caja)} m²` : ""}</option>`;
    }).join("");
    const existe = filas.some((row) => row.dataset.k === prev);
    if (elegidoAMano && existe) {
      dest.value = prev;
    } else {
      elegidoAMano = false;
      // Por omisión: el primer concepto que se vende por caja; si no, el último.
      const def = filas.find((row) => producto(row)?.m2Caja) || filas[filas.length - 1];
      dest.value = def ? def.dataset.k : "";
    }
    actualizarCalc();
  }

  function filaDestino() { return $$(".linea", cont).find((row) => row.dataset.k === dest.value) || null; }

  function actualizarCalc() {
    const pares = $$(".calc-area", areas).map((el) => {
      const a = $(".c-a", el).value, b = $(".c-b", el).value;
      $(".calc-sub", el).textContent = calcularM2(a, b, 0).area.toFixed(2) + " m²";
      return [a, b];
    });
    r = calcularAreas(pares, $(".c-merma", calc).value);
    $(".c-area", calc).textContent = r.area.toFixed(2) + " m²";
    $(".c-res", calc).textContent = r.total.toFixed(2) + " m²" + (r.merma ? ` (+${r.merma}%)` : "");
    const s = producto(filaDestino() || {});
    const cj = s ? calcularCajas(r.total, s.m2Caja) : null;
    $(".c-cajas-box", calc).hidden = !cj;
    if (cj) $(".c-cajas", calc).textContent = `${cj.cajas} cajas = ${cj.m2.toFixed(2)} m²`;
    $("#calc-usar", calc).textContent = cj ? `Usar ${cj.cajas} cajas` : "Usar con merma";
  }

  $("#toggle-calc", root).onclick = () => {
    calc.hidden = !calc.hidden;
    if (!calc.hidden) { llenarDestinos(); $(".c-a", calc).focus(); }
  };
  $("#calc-add", calc).onclick = () => {
    areas.insertAdjacentHTML("beforeend", areaHTML());
    $$(".c-a", areas).pop().focus();
    actualizarCalc();
  };
  areas.addEventListener("click", (e) => {
    if (!e.target.classList.contains("c-del")) return;
    const filas = $$(".calc-area", areas);
    if (filas.length > 1) e.target.closest(".calc-area").remove();
    else $$("input", filas[0]).forEach((i) => (i.value = ""));
    actualizarCalc();
  });
  calc.addEventListener("input", actualizarCalc);
  dest.addEventListener("change", () => { elegidoAMano = true; actualizarCalc(); });

  const aplicar = (cantidad, cajas) => {
    const row = filaDestino();
    if (!row || !(cantidad > 0)) return;
    $(".l-cant", row).value = cantidad;
    $(".l-unidad", row).value = "m2";
    marcarCajas(row, cajas);
    onUpdate();
  };
  $("#calc-usar", calc).onclick = () => {
    const s = producto(filaDestino() || {});
    const cj = s ? calcularCajas(r.total, s.m2Caja) : null;
    aplicar(cj ? cj.m2 : r.total, cj ? cj.cajas : null);
  };
  $("#calc-usar-real", calc).onclick = () => aplicar(r.area, null);
}

export function leerLineas(root) {
  return $$(".linea", root).map((r) => {
    const l = {
      descripcion: $(".l-desc", r).value.trim(),
      cantidad: num($(".l-cant", r).value) || 1,
      unidad: $(".l-unidad", r).value,
      precio: num($(".l-precio", r).value),
      costo: num($(".l-costo", r).value)
    };
    const cajas = Number.parseInt(r.dataset.cajas, 10);
    if (cajas > 0) l.cajas = cajas;
    return l;
  }).filter((l) => l.descripcion || l.precio);
}

export function lineaTxt(l) {
  return `${l.cantidad} ${UNIDADES[l.unidad] || ""}`.trim() + (l.cajas ? ` (${l.cajas} cajas)` : "");
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
