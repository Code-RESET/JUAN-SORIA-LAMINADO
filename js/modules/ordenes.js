// ============================================================
// modules/ordenes.js
// Órdenes de trabajo: alta/edición, estado del trabajo
// (Recibido → En proceso → Listo → Entregado), abonos/pagos
// parciales, impresión y avisos por WhatsApp.
//
// Mejora vs. la app de alarmas: el estado del TRABAJO y el estado
// del PAGO van separados (un auto puede estar entregado y con
// saldo pendiente), y los pagos quedan como historial de abonos.
// ============================================================

import * as store from "../store.js";
import { esc, money, num, fecha, hoyISO, toast, openModal, closeModal, confirmar, emptyState, waLink, $, $$ } from "../ui.js";
import { lineasEditorHTML, bindLineas, leerLineas, totales, resumenHTML } from "../lineas.js";
import { abrirDocumento, ESTADOS, vehiculoTxt } from "../documento.js";
import { asegurarCliente } from "./clientes.js";

const FILTROS = [
  ["ACTIVAS", "Activas"], ["RECIBIDO", "Recibidos"], ["EN_PROCESO", "En proceso"],
  ["LISTO", "Listos"], ["ENTREGADO", "Entregados"], ["POR_COBRAR", "Por cobrar"], ["TODAS", "Todas"]
];
const METODOS = ["Efectivo", "Transferencia", "Tarjeta", "Aseguradora"];

let filtro = "ACTIVAS";
let busqueda = "";

export function renderOrdenes(container, user, param) {
  if (param && param.startsWith("f:")) { // #/ordenes/f:LISTO  -> abre con ese filtro
    filtro = param.slice(2);
    param = null;
    history.replaceState(null, "", "#/ordenes");
  }
  container.innerHTML = `
    <div class="view-head">
      <h2>Órdenes de trabajo</h2>
      <button class="btn btn-primary" id="nueva-orden">+ Nueva orden</button>
    </div>
    <input class="input search" id="buscar-orden" placeholder="🔍 Cliente, vehículo, placas, folio..." value="${esc(busqueda)}" />
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
  const txt = [o.folio, o.clienteNombre, o.telefono, vehiculoTxt(o.vehiculo), o.siniestro,
    ...(o.servicios || []).map((s) => s.descripcion)].join(" ").toLowerCase();
  return txt.includes(q);
}

function pasaFiltro(o) {
  const t = totales(o);
  switch (filtro) {
    case "ACTIVAS": return o.estado !== "ENTREGADO" || t.saldo > 0;
    case "POR_COBRAR": return t.saldo > 0;
    case "TODAS": return true;
    default: return o.estado === filtro;
  }
}

export function ordenCardHTML(o) {
  const t = totales(o);
  const pago = t.saldo <= 0 && t.total > 0 ? `<span class="pill ok">Pagado</span>`
    : t.pagado > 0 ? `<span class="pill warn">Saldo ${money(t.saldo)}</span>`
    : `<span class="pill bad">Sin pago</span>`;
  return `
  <div class="card orden-card" data-id="${o.id}">
    <div class="orden-top">
      <span class="folio">#${String(o.folio).padStart(4, "0")}</span>
      <span class="estado e-${o.estado}">${ESTADOS[o.estado] || ""}</span>
    </div>
    <div class="card-title">${esc(vehiculoTxt(o.vehiculo) || "Vehículo")}</div>
    <div class="muted small">${esc(o.clienteNombre || "")} · Ingreso ${fecha(o.fechaIngreso)}${o.fechaEntrega ? ` · Entrega ${fecha(o.fechaEntrega)}` : ""}</div>
    <div class="orden-bottom"><strong>${money(t.total)}</strong>${pago}</div>
  </div>`;
}

function pintar(container) {
  const q = busqueda.trim().toLowerCase();
  const lista = store.all("ordenes").filter((o) => pasaFiltro(o) && coincide(o, q))
    .sort((a, b) => (b.folio || 0) - (a.folio || 0));
  const el = $("#lista-ordenes", container);
  el.innerHTML = lista.length ? `<div class="grid-cards">${lista.map(ordenCardHTML).join("")}</div>`
    : emptyState("🚗", q ? "Sin resultados." : "No hay órdenes en este filtro.");
  el.querySelectorAll("[data-id]").forEach((n) => (n.onclick = () => detalleOrden(n.dataset.id)));
}

// ---------------- Detalle ----------------
export function detalleOrden(id) {
  const o = store.get("ordenes", id);
  if (!o) { toast("La orden ya no existe"); return; }
  const t = totales(o);
  const a = store.ajustes();
  const folio = String(o.folio).padStart(4, "0");

  const body = openModal(`Orden #${folio}`, `
    <div class="card-title">${esc(vehiculoTxt(o.vehiculo))}</div>
    <div class="muted small">${esc(o.clienteNombre)}${o.telefono ? " · " + esc(o.telefono) : ""}
      ${o.tipo === "ASEGURADORA" ? ` · Aseguradora: ${esc(o.aseguradora || "")} ${o.siniestro ? "(Siniestro " + esc(o.siniestro) + ")" : ""}` : ""}</div>
    <div class="muted small">Ingreso ${fecha(o.fechaIngreso)}${o.fechaEntrega ? " · Entrega estimada " + fecha(o.fechaEntrega) : ""}</div>

    <h4 class="section-label">Estado del trabajo</h4>
    <div class="estado-picker">
      ${Object.entries(ESTADOS).map(([k, l]) => `<button class="estado-opt e-${k} ${o.estado === k ? "sel" : ""}" data-estado="${k}">${l}</button>`).join("")}
    </div>

    <h4 class="section-label">Servicios</h4>
    <div class="tabla-lineas">
      ${(o.servicios || []).map((l) => `<div><span>${esc(l.descripcion)}${l.cantidad > 1 ? ` <em>x${l.cantidad}</em>` : ""}</span><span>${money(l.cantidad * l.precio)}</span></div>`).join("") || `<p class="muted">Sin servicios.</p>`}
    </div>
    ${resumenHTML(t, { conPagos: true })}

    <h4 class="section-label">Pagos / abonos</h4>
    <div class="pagos">
      ${(o.pagos || []).map((p, i) => `<div><span>${fecha(p.fecha)} · ${esc(p.metodo)}</span><span>${money(p.monto)} <button class="icon-btn" data-del-pago="${i}" title="Quitar">✕</button></span></div>`).join("") || `<p class="muted small">Sin pagos registrados.</p>`}
    </div>
    ${t.saldo > 0 ? `
    <form class="pago-form" id="f-pago">
      <input class="input" name="monto" type="number" inputmode="decimal" step="0.01" placeholder="Monto" value="${t.saldo.toFixed(2)}" required />
      <select class="input" name="metodo">${METODOS.map((m) => `<option>${m}</option>`).join("")}</select>
      <input class="input" name="fecha" type="date" value="${hoyISO()}" />
      <button class="btn btn-primary" type="submit">Registrar pago</button>
    </form>` : ""}

    ${o.notas ? `<h4 class="section-label">Notas</h4><p>${esc(o.notas)}</p>` : ""}

    <div class="form-actions wrap">
      <button class="btn btn-ghost" data-act="doc">🖨️ Imprimir / PDF</button>
      ${o.telefono ? `<a class="btn btn-wa" target="_blank" rel="noopener" data-act="wa-listo"
        href="${waLink(o.telefono, `Hola ${o.clienteNombre}, le informamos de ${a.negocio} que su ${vehiculoTxt(o.vehiculo)} ya está listo para entregar.${t.saldo > 0 ? ` Saldo pendiente: ${money(t.saldo)}.` : ""} ¡Gracias!`)}">💬 Avisar "listo"</a>` : ""}
      <button class="btn btn-ghost" data-act="edit">✏️ Editar</button>
      <button class="btn btn-danger" data-act="del">🗑️</button>
    </div>
  `, { wide: true });

  body.querySelectorAll("[data-estado]").forEach((b) => (b.onclick = async () => {
    const upd = { ...o, estado: b.dataset.estado };
    if (b.dataset.estado === "ENTREGADO" && !o.fechaEntregado) upd.fechaEntregado = hoyISO();
    await store.save("ordenes", upd);
    toast(`Estado: ${ESTADOS[b.dataset.estado]}`);
    detalleOrden(id);
  }));

  const fp = $("#f-pago", body);
  if (fp) fp.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(fp).entries());
    const monto = num(f.monto);
    if (monto <= 0) return;
    await store.save("ordenes", { ...o, pagos: [...(o.pagos || []), { monto, metodo: f.metodo, fecha: f.fecha || hoyISO() }] });
    toast("Pago registrado");
    detalleOrden(id);
  };

  body.querySelectorAll("[data-del-pago]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmar("¿Quitar este pago?", "Quitar"))) return;
    const pagos = (o.pagos || []).filter((_, i) => i !== Number(b.dataset.delPago));
    await store.save("ordenes", { ...o, pagos });
    detalleOrden(id);
  }));

  $("[data-act=doc]", body).onclick = () => abrirDocumento("orden", o);
  $("[data-act=edit]", body).onclick = () => formOrden(o);
  $("[data-act=del]", body).onclick = async () => {
    if (!(await confirmar(`¿Eliminar la orden #${folio}? No se puede deshacer.`))) return;
    await store.remove("ordenes", o.id);
    closeModal();
    toast("Orden eliminada");
  };
}

// ---------------- Formulario ----------------
// `base` puede ser una orden existente o los datos de una cotización.
export function formOrden(base = {}) {
  const o = base;
  const v = o.vehiculo || {};
  const a = store.ajustes();
  const editando = !!o.id;
  const clientes = store.all("clientes");

  const body = openModal(editando ? `Editar orden #${String(o.folio).padStart(4, "0")}` : "Nueva orden de trabajo", `
    <form id="f-orden" class="form">
      <div class="form-section">Cliente</div>
      <datalist id="dl-clientes">${clientes.map((c) => `<option value="${esc(c.nombre)}">${esc(c.telefono || "")}</option>`).join("")}</datalist>
      <div class="cols-2">
        <label class="field"><span>Nombre *</span><input class="input" name="clienteNombre" list="dl-clientes" required value="${esc(o.clienteNombre || "")}" /></label>
        <label class="field"><span>Teléfono (WhatsApp)</span><input class="input" name="telefono" type="tel" inputmode="tel" value="${esc(o.telefono || "")}" /></label>
      </div>
      <div class="cols-2">
        <label class="field"><span>Tipo</span>
          <select class="input" name="tipo">
            <option value="PARTICULAR" ${o.tipo !== "ASEGURADORA" ? "selected" : ""}>Particular</option>
            <option value="ASEGURADORA" ${o.tipo === "ASEGURADORA" ? "selected" : ""}>Aseguradora</option>
          </select></label>
        <div class="cols-2 aseg" ${o.tipo === "ASEGURADORA" ? "" : "hidden"}>
          <label class="field"><span>Aseguradora</span><input class="input" name="aseguradora" value="${esc(o.aseguradora || "")}" /></label>
          <label class="field"><span>No. siniestro</span><input class="input" name="siniestro" value="${esc(o.siniestro || "")}" /></label>
        </div>
      </div>

      <div class="form-section">Vehículo</div>
      <div class="cols-3">
        <label class="field"><span>Marca *</span><input class="input" name="marca" required placeholder="Nissan" value="${esc(v.marca || "")}" /></label>
        <label class="field"><span>Modelo</span><input class="input" name="modelo" placeholder="Versa" value="${esc(v.modelo || "")}" /></label>
        <label class="field"><span>Año</span><input class="input" name="anio" inputmode="numeric" placeholder="2019" value="${esc(v.anio || "")}" /></label>
      </div>
      <div class="cols-2">
        <label class="field"><span>Color</span><input class="input" name="color" value="${esc(v.color || "")}" /></label>
        <label class="field"><span>Placas</span><input class="input" name="placas" style="text-transform:uppercase" value="${esc(v.placas || "")}" /></label>
      </div>
      <label class="field"><span>Daños / estado al recibir</span><textarea class="input" name="danos" rows="2" placeholder="Golpe en puerta trasera izq., rayón en defensa...">${esc(o.danos || "")}</textarea></label>

      <div class="form-section">Servicios</div>
      ${lineasEditorHTML(o.servicios)}

      <div class="cols-3">
        <label class="field"><span>Descuento $</span><input class="input" name="descuento" type="number" inputmode="decimal" step="0.01" value="${esc(o.descuento || "")}" placeholder="0" /></label>
        <label class="field check"><input type="checkbox" name="conIva" ${o.conIva ? "checked" : ""} /><span>Agregar IVA ${a.ivaPct}%</span></label>
        ${editando ? "" : `<label class="field"><span>Anticipo $</span><input class="input" name="anticipo" type="number" inputmode="decimal" step="0.01" placeholder="0" /></label>`}
      </div>
      <div id="resumen-orden"></div>

      <div class="form-section">Fechas y estado</div>
      <div class="cols-3">
        <label class="field"><span>Ingreso</span><input class="input" type="date" name="fechaIngreso" value="${esc(o.fechaIngreso || hoyISO())}" /></label>
        <label class="field"><span>Entrega estimada</span><input class="input" type="date" name="fechaEntrega" value="${esc(o.fechaEntrega || "")}" /></label>
        <label class="field"><span>Estado</span>
          <select class="input" name="estado">${Object.entries(ESTADOS).map(([k, l]) => `<option value="${k}" ${(o.estado || "RECIBIDO") === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <label class="field"><span>Notas internas / recordatorios</span><textarea class="input" name="notas" rows="2">${esc(o.notas || "")}</textarea></label>
      <label class="field"><span>Garantía</span><input class="input" name="garantia" value="${esc(o.garantia ?? a.garantia)}" /></label>

      <div class="form-actions">
        <button class="btn btn-primary grow" type="submit" id="btn-guardar-orden">💾 Guardar orden</button>
        <button class="btn btn-ghost" type="button" data-cancel>Cancelar</button>
      </div>
    </form>`, { wide: true });

  const form = $("#f-orden", body);
  const tipoSel = form.elements.tipo;
  tipoSel.onchange = () => ($(".aseg", form).hidden = tipoSel.value !== "ASEGURADORA");

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
    if (!servicios.length) { toast("Agrega al menos un servicio"); return; }
    enviando = true;
    $("#btn-guardar-orden", form).disabled = true;

    const cliente = await asegurarCliente(f.clienteNombre, f.telefono);
    const orden = {
      ...(editando ? o : {}),
      folio: editando ? o.folio : store.siguienteFolio("ordenes"),
      clienteId: cliente?.id || "",
      clienteNombre: f.clienteNombre.trim(),
      telefono: f.telefono.trim(),
      tipo: f.tipo,
      aseguradora: f.tipo === "ASEGURADORA" ? f.aseguradora.trim() : "",
      siniestro: f.tipo === "ASEGURADORA" ? f.siniestro.trim() : "",
      vehiculo: { marca: f.marca.trim(), modelo: f.modelo.trim(), anio: f.anio.trim(), color: f.color.trim(), placas: f.placas.trim().toUpperCase() },
      danos: f.danos.trim(),
      servicios,
      descuento: num(f.descuento),
      conIva: !!f.conIva,
      ivaPct: a.ivaPct,
      fechaIngreso: f.fechaIngreso || hoyISO(),
      fechaEntrega: f.fechaEntrega,
      estado: f.estado,
      notas: f.notas.trim(),
      garantia: f.garantia.trim(),
      pagos: editando ? (o.pagos || []) : (num(f.anticipo) > 0 ? [{ monto: num(f.anticipo), metodo: "Efectivo", fecha: hoyISO(), nota: "Anticipo" }] : []),
      cotizacionId: o.cotizacionId || ""
    };
    const saved = await store.save("ordenes", orden);

    if (o.cotizacionId) {
      const cot = store.get("cotizaciones", o.cotizacionId);
      if (cot) await store.save("cotizaciones", { ...cot, estado: "ACEPTADA", ordenId: saved.id });
    }
    toast(editando ? "Orden actualizada" : `Orden #${String(saved.folio).padStart(4, "0")} creada`);
    detalleOrden(saved.id);
  };
}
