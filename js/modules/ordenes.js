// ============================================================
// modules/ordenes.js
// Trabajos (órdenes) de pisos, persianas y decoración:
// cliente, obra (dirección, espacios, m²), conceptos con unidad,
// flujo Medición → Pedido de material → En instalación →
// Terminado, abonos/pagos parciales, impresión y WhatsApp.
//
// Mejora vs. la app de alarmas: el estado del TRABAJO y el estado
// del PAGO van separados (se puede terminar y quedar saldo), y los
// pagos quedan como historial de abonos.
// ============================================================

import * as store from "../store.js";
import { esc, money, num, fecha, hoyISO, toast, openModal, closeModal, confirmar, emptyState, waLink, $, $$ } from "../ui.js";
import { lineasEditorHTML, bindLineas, leerLineas, totales, resumenHTML, lineaTxt } from "../lineas.js";
import { abrirDocumento, ESTADOS, obraTxt } from "../documento.js";
import { asegurarCliente } from "./clientes.js";
import { reportarError } from "../errores.js";

const FILTROS = [
  ["ACTIVAS", "Activos"], ["MEDICION", "Medición"], ["MATERIAL", "Material"],
  ["INSTALACION", "Instalando"], ["TERMINADO", "Terminados"], ["POR_COBRAR", "Por cobrar"], ["TODAS", "Todos"]
];
const METODOS = ["Efectivo", "Transferencia", "Tarjeta"];

let filtro = "ACTIVAS";
let busqueda = "";

const fol = (n) => esc(String(n || "").padStart(4, "0"));

export function renderOrdenes(container, user, param) {
  if (param && param.startsWith("f:")) { // #/ordenes/f:MATERIAL -> abre con ese filtro
    filtro = param.slice(2);
    param = null;
    history.replaceState(null, "", "#/ordenes");
  }
  container.innerHTML = `
    <div class="view-head">
      <h2>Trabajos</h2>
      <button class="btn btn-primary" id="nueva-orden">+ Nuevo trabajo</button>
    </div>
    <input class="input search" id="buscar-orden" placeholder="🔍 Cliente, dirección, producto, folio..." value="${esc(busqueda)}" />
    <div class="filters" id="filtros">
      ${FILTROS.map(([k, l]) => `<button class="chip ${k === filtro ? "active" : ""}" data-f="${k}">${l}</button>`).join("")}
    </div>
    <div id="lista-ordenes"></div>`;

  $("#nueva-orden", container).onclick = () => formOrden();
  $("#buscar-orden", container).oninput = (e) => { busqueda = e.target.value; pintar(container); };
  $("#filtros", container).onclick = (e) => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    filtro = b.dataset.f;
    $$(".chip", container).forEach((c) => c.classList.toggle("active", c === b));
    pintar(container);
  };
  pintar(container);

  // Rutas: #/ordenes/nueva  y  #/ordenes/<id>
  if (param) {
    history.replaceState(null, "", "#/ordenes");
    if (param === "nueva") formOrden();
    else detalleOrden(param);
  }
}

function coincide(o, q) {
  if (!q) return true;
  const txt = [o.folio, o.clienteNombre, o.telefono, obraTxt(o.obra),
    ...(o.servicios || []).map((s) => s.descripcion)].join(" ").toLowerCase();
  return txt.includes(q);
}

function pasaFiltro(o) {
  const t = totales(o);
  switch (filtro) {
    case "ACTIVAS": return o.estado !== "TERMINADO" || t.saldo > 0;
    case "POR_COBRAR": return t.saldo > 0;
    case "TODAS": return true;
    default: return o.estado === filtro;
  }
}

function titulo(o) {
  return (o.servicios || []).map((s) => s.descripcion).filter(Boolean).slice(0, 2).join(" + ") || "Trabajo";
}

export function ordenCardHTML(o) {
  const t = totales(o);
  const pago = t.saldo <= 0 && t.total > 0 ? `<span class="pill ok">Pagado</span>`
    : t.pagado > 0 ? `<span class="pill warn">Saldo ${money(t.saldo)}</span>`
    : `<span class="pill bad">Sin anticipo</span>`;
  return `
  <div class="card orden-card" data-id="${esc(o.id)}">
    <div class="orden-top">
      <span class="folio">#${fol(o.folio)}</span>
      <span class="estado e-${esc(o.estado)}">${ESTADOS[o.estado] || ""}</span>
    </div>
    <div class="card-title">${esc(o.clienteNombre || "")}</div>
    <div class="small">${esc(titulo(o))}</div>
    <div class="muted small">${esc(obraTxt(o.obra) || "Sin dirección")}${o.fechaInstalacion ? ` · Instalación ${fecha(o.fechaInstalacion)}` : ""}</div>
    <div class="orden-bottom"><strong>${money(t.total)}</strong>${pago}</div>
  </div>`;
}

function pintar(container) {
  const q = busqueda.trim().toLowerCase();
  const lista = store.all("ordenes").filter((o) => pasaFiltro(o) && coincide(o, q))
    .sort((a, b) => (b.folio || 0) - (a.folio || 0));
  const el = $("#lista-ordenes", container);
  el.innerHTML = lista.length ? `<div class="grid-cards">${lista.map(ordenCardHTML).join("")}</div>`
    : emptyState("🏠", q ? "Sin resultados." : "No hay trabajos en este filtro.");
  el.querySelectorAll("[data-id]").forEach((n) => (n.onclick = () => detalleOrden(n.dataset.id)));
}

function mensajeWA(o, t, a) {
  if (o.estado === "TERMINADO") {
    return `Hola ${o.clienteNombre}, gracias por confiar en ${a.negocio}. Su trabajo quedó terminado.` +
      (t.saldo > 0 ? ` Saldo pendiente: ${money(t.saldo)}.` : "") + " ¡Que lo disfrute!";
  }
  if (o.fechaInstalacion) {
    return `Hola ${o.clienteNombre}, le confirmamos de ${a.negocio} su instalación para el ${fecha(o.fechaInstalacion)}` +
      (o.obra?.direccion ? ` en ${o.obra.direccion}` : "") + ". Cualquier cambio avísenos por este medio.";
  }
  return `Hola ${o.clienteNombre}, le escribimos de ${a.negocio} sobre su trabajo #${fol(o.folio)}.`;
}

// ---------------- Detalle ----------------
export function detalleOrden(id) {
  const o = store.get("ordenes", id);
  if (!o) { toast("El trabajo ya no existe"); return; }
  const t = totales(o);
  const a = store.ajustes();
  const ob = o.obra || {};
  const mapa = ob.direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([ob.direccion, ob.colonia].filter(Boolean).join(", "))}` : "";

  const body = openModal(`Trabajo #${fol(o.folio)}`, `
    <div class="card-title">${esc(o.clienteNombre)}</div>
    <div class="muted small">${o.telefono ? esc(o.telefono) + " · " : ""}Alta ${fecha(o.fechaIngreso)}${o.fechaInstalacion ? " · <b>Instalación " + fecha(o.fechaInstalacion) + "</b>" : ""}</div>
    ${obraTxt(ob) ? `<div class="obra-box">📍 ${esc(obraTxt(ob))}${ob.m2 ? ` · ${esc(ob.m2)} m²` : ""}
      ${mapa ? ` <a href="${mapa}" target="_blank" rel="noopener">Ver mapa</a>` : ""}</div>` : ""}

    <h4 class="section-label">Estado del trabajo</h4>
    <div class="estado-picker">
      ${Object.entries(ESTADOS).map(([k, l]) => `<button class="estado-opt e-${k} ${o.estado === k ? "sel" : ""}" data-estado="${k}">${l}</button>`).join("")}
    </div>

    <h4 class="section-label">Conceptos</h4>
    <div class="tabla-lineas">
      ${(o.servicios || []).map((l) => `<div><span>${esc(l.descripcion)} <em>${esc(lineaTxt(l))}</em></span><span>${money(l.cantidad * l.precio)}</span></div>`).join("") || `<p class="muted">Sin conceptos.</p>`}
    </div>
    ${resumenHTML(t, { conPagos: true })}

    <h4 class="section-label">Pagos / abonos</h4>
    <div class="pagos">
      ${(o.pagos || []).map((p, i) => `<div><span>${fecha(p.fecha)} · ${esc(p.metodo)}${p.nota ? " · " + esc(p.nota) : ""}</span><span>${money(p.monto)} <button class="icon-btn" data-del-pago="${i}" title="Quitar">✕</button></span></div>`).join("") || `<p class="muted small">Sin pagos registrados.</p>`}
    </div>
    ${t.saldo > 0 ? `
    <form class="pago-form" id="f-pago">
      <!-- Sin monto prellenado: así un doble toque cae en un campo vacío y no cobra dos veces. -->
      <div class="monto-wrap"><input class="input" name="monto" type="number" inputmode="decimal" step="0.01" min="0.01" placeholder="Saldo ${money(t.saldo)}" required />
        <button type="button" class="btn btn-ghost btn-sm" data-llenar-saldo="${t.saldo.toFixed(2)}">Saldo</button></div>
      <select class="input" name="metodo">${METODOS.map((m) => `<option>${m}</option>`).join("")}</select>
      <input class="input" name="fecha" type="date" value="${hoyISO()}" />
      <button class="btn btn-primary" type="submit">Registrar pago</button>
    </form>` : ""}

    ${o.notas ? `<h4 class="section-label">Notas</h4><p>${esc(o.notas)}</p>` : ""}

    <div class="form-actions wrap">
      <button class="btn btn-ghost" data-act="doc">📄 PDF / WhatsApp</button>
      ${o.telefono ? `<a class="btn btn-wa" target="_blank" rel="noopener" href="${waLink(o.telefono, mensajeWA(o, t, a))}">💬 ${o.estado === "TERMINADO" ? "Agradecer / cobrar" : o.fechaInstalacion ? "Confirmar instalación" : "WhatsApp"}</a>` : ""}
      <button class="btn btn-ghost" data-act="edit">✏️ Editar</button>
      <button class="btn btn-danger" data-act="del">🗑️</button>
    </div>
  `, { wide: true });

  // Siempre releer antes de guardar: otro dispositivo pudo cambiar
  // el trabajo mientras este modal estaba abierto (no pisar abonos).
  const fresco = () => store.get("ordenes", id) || o;

  body.querySelectorAll("[data-estado]").forEach((b) => (b.onclick = async () => {
    const upd = { ...fresco(), estado: b.dataset.estado };
    if (b.dataset.estado === "TERMINADO" && !o.fechaTerminado) upd.fechaTerminado = hoyISO();
    await store.save("ordenes", upd);
    toast(`Estado: ${ESTADOS[b.dataset.estado]}`);
    detalleOrden(id);
  }));

  const fp = $("#f-pago", body);
  const llenar = $("[data-llenar-saldo]", body);
  if (llenar) llenar.onclick = () => { fp.elements.monto.value = llenar.dataset.llenarSaldo; };
  let pagando = false; // doble toque = doble cobro: bloquear hasta repintar
  if (fp) fp.onsubmit = async (e) => {
    e.preventDefault();
    if (pagando) return;
    const f = Object.fromEntries(new FormData(fp).entries());
    const monto = num(f.monto);
    if (monto <= 0) return;
    pagando = true;
    fp.querySelectorAll("button, input, select").forEach((el) => (el.disabled = true));
    const act = fresco();
    await store.save("ordenes", { ...act, pagos: [...(act.pagos || []), { monto, metodo: f.metodo, fecha: f.fecha || hoyISO() }] });
    toast("Pago registrado");
    detalleOrden(id);
  };

  body.querySelectorAll("[data-del-pago]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmar("¿Quitar este pago?", "Quitar"))) return;
    const p0 = (o.pagos || [])[Number(b.dataset.delPago)];
    const act = fresco();
    const idx = (act.pagos || []).findIndex((q) => q.monto === p0?.monto && q.fecha === p0?.fecha && q.metodo === p0?.metodo);
    if (idx < 0) { detalleOrden(id); return; }
    await store.save("ordenes", { ...act, pagos: act.pagos.filter((_, i) => i !== idx) });
    detalleOrden(id);
  }));

  $("[data-act=doc]", body).onclick = () => abrirDocumento("orden", o);
  $("[data-act=edit]", body).onclick = () => formOrden(o);
  $("[data-act=del]", body).onclick = async () => {
    if (!(await confirmar(`¿Eliminar el trabajo #${fol(o.folio)}? No se puede deshacer.`))) return;
    await store.remove("ordenes", o.id);
    closeModal();
    toast("Trabajo eliminado");
  };
}

// Campos de la obra, compartidos con Cotizaciones.
export function obraFieldsHTML(ob = {}) {
  return `
      <div class="cols-2">
        <label class="field"><span>Dirección de la obra</span><input class="input" name="direccion" placeholder="Calle y número" value="${esc(ob.direccion || "")}" /></label>
        <label class="field"><span>Colonia / ciudad</span><input class="input" name="colonia" value="${esc(ob.colonia || "")}" /></label>
      </div>
      <div class="cols-2">
        <label class="field"><span>Espacios</span><input class="input" name="espacio" placeholder="Sala, comedor, 2 recámaras..." value="${esc(ob.espacio || "")}" /></label>
        <label class="field"><span>Superficie total (m²)</span><input class="input" name="m2" type="number" inputmode="decimal" step="0.01" value="${esc(ob.m2 || "")}" /></label>
      </div>`;
}

export function leerObra(f) {
  return { direccion: (f.direccion || "").trim(), colonia: (f.colonia || "").trim(), espacio: (f.espacio || "").trim(), m2: num(f.m2) || "" };
}

// ---------------- Formulario ----------------
// `base` puede ser un trabajo existente o los datos de una cotización.
export function formOrden(base = {}) {
  const o = base;
  const a = store.ajustes();
  const editando = !!o.id;
  const clientes = store.all("clientes");

  const body = openModal(editando ? `Editar trabajo #${fol(o.folio)}` : "Nuevo trabajo", `
    <form id="f-orden" class="form">
      <div class="form-section">Cliente</div>
      <datalist id="dl-clientes">${clientes.map((c) => `<option value="${esc(c.nombre)}">${esc(c.telefono || "")}</option>`).join("")}</datalist>
      <div class="cols-2">
        <label class="field"><span>Nombre *</span><input class="input" name="clienteNombre" list="dl-clientes" required value="${esc(o.clienteNombre || "")}" /></label>
        <label class="field"><span>Teléfono (WhatsApp)</span><input class="input" name="telefono" type="tel" inputmode="tel" value="${esc(o.telefono || "")}" /></label>
      </div>

      <div class="form-section">Obra</div>
      ${obraFieldsHTML(o.obra)}

      <div class="form-section">Conceptos</div>
      ${lineasEditorHTML(o.servicios)}

      <div class="cols-3">
        <label class="field"><span>Descuento $</span><input class="input" name="descuento" type="number" inputmode="decimal" step="0.01" value="${esc(o.descuento || "")}" placeholder="0" /></label>
        <label class="field check"><input type="checkbox" name="conIva" ${o.conIva ? "checked" : ""} /><span>Agregar IVA ${esc(a.ivaPct)}%</span></label>
        ${editando ? "" : `<label class="field"><span>Anticipo $</span><input class="input" name="anticipo" type="number" inputmode="decimal" step="0.01" placeholder="0" /></label>`}
      </div>
      <div id="resumen-orden"></div>

      <div class="form-section">Fechas y estado</div>
      <div class="cols-3">
        <label class="field"><span>Fecha de alta</span><input class="input" type="date" name="fechaIngreso" value="${esc(o.fechaIngreso || hoyISO())}" /></label>
        <label class="field"><span>Fecha de instalación</span><input class="input" type="date" name="fechaInstalacion" value="${esc(o.fechaInstalacion || "")}" /></label>
        <label class="field"><span>Estado</span>
          <select class="input" name="estado">${Object.entries(ESTADOS).map(([k, l]) => `<option value="${k}" ${(o.estado || "MEDICION") === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <label class="field"><span>Notas (color, modelo, medidas, recordatorios)</span><textarea class="input" name="notas" rows="2">${esc(o.notas || "")}</textarea></label>
      <label class="field"><span>Garantía</span><input class="input" name="garantia" value="${esc(o.garantia ?? a.garantia)}" /></label>

      <div class="form-actions">
        <button class="btn btn-primary grow" type="submit" id="btn-guardar-orden">💾 Guardar trabajo</button>
        <button class="btn btn-ghost" type="button" data-cancel>Cancelar</button>
      </div>
    </form>`, { wide: true });

  const form = $("#f-orden", body);

  // Autocompletar teléfono al escoger un cliente existente.
  form.elements.clienteNombre.addEventListener("change", (e) => {
    const c = clientes.find((x) => x.nombre.toLowerCase() === e.target.value.trim().toLowerCase());
    if (c && !form.elements.telefono.value) form.elements.telefono.value = c.telefono || "";
  });

  const actualizar = () => {
    const t = totales({ servicios: leerLineas(form), descuento: form.elements.descuento.value, conIva: form.elements.conIva.checked, ivaPct: a.ivaPct });
    $("#resumen-orden", form).innerHTML = resumenHTML(t);
  };
  bindLineas(form, actualizar);
  form.elements.descuento.oninput = actualizar;
  form.elements.conIva.onchange = actualizar;
  actualizar();

  $("[data-cancel]", form).onclick = closeModal;

  let enviando = false; // evita doble envío (duplicados) con doble toque
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (enviando) return;
    const f = Object.fromEntries(new FormData(form).entries());
    const servicios = leerLineas(form);
    if (!servicios.length) { toast("Agrega al menos un concepto"); return; }
    enviando = true;
    $("#btn-guardar-orden", form).disabled = true;

    let folio;
    try {
      folio = editando ? o.folio : await store.reservarFolio("ordenes");
    } catch (err) {
      reportarError("folio de trabajo", err);
      toast(err.message);
      enviando = false;
      $("#btn-guardar-orden", form).disabled = false;
      return;
    }
    try {
      const cliente = await asegurarCliente(f.clienteNombre, f.telefono);
      const actual = editando ? (store.get("ordenes", o.id) || o) : {};
      const orden = {
        ...actual,
        folio,
        clienteId: cliente?.id || "",
        clienteNombre: f.clienteNombre.trim(),
        telefono: f.telefono.trim(),
        obra: leerObra(f),
        servicios,
        descuento: num(f.descuento),
        conIva: !!f.conIva,
        ivaPct: a.ivaPct,
        fechaIngreso: f.fechaIngreso || hoyISO(),
        fechaInstalacion: f.fechaInstalacion,
        estado: f.estado,
        notas: f.notas.trim(),
        garantia: f.garantia.trim(),
        pagos: editando ? (actual.pagos || []) : (num(f.anticipo) > 0 ? [{ monto: num(f.anticipo), metodo: "Efectivo", fecha: hoyISO(), nota: "Anticipo" }] : []),
        cotizacionId: o.cotizacionId || ""
      };
      const saved = await store.save("ordenes", orden);

      if (o.cotizacionId) {
        const cot = store.get("cotizaciones", o.cotizacionId);
        if (cot) await store.save("cotizaciones", { ...cot, estado: "ACEPTADA", ordenId: saved.id });
      }
      toast(editando ? "Trabajo actualizado" : `Trabajo #${fol(saved.folio)} creado`);
      detalleOrden(saved.id);
    } catch (err) {
      reportarError("guardar trabajo", err);
      toast("No se pudo guardar: " + err.message);
      enviando = false;
      $("#btn-guardar-orden", form).disabled = false;
    }
  };
}
