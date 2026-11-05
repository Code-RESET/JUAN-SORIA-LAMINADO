// ============================================================
// modules/cotizaciones.js
// Cotizaciones guardadas (en la app de alarmas solo se generaban
// y se perdían): folio, vigencia, estado Abierta / Aceptada /
// Rechazada, envío por WhatsApp, PDF y botón "Convertir en orden"
// que pasa cliente, obra y conceptos sin volver a capturar.
// ============================================================

import * as store from "../store.js";
import { esc, money, num, fecha, hoyISO, toast, openModal, closeModal, confirmar, emptyState, $, $$ } from "../ui.js";
import { lineasEditorHTML, bindLineas, leerLineas, totales, resumenHTML, lineaTxt } from "../lineas.js";
import { abrirDocumento, obraTxt } from "../documento.js";
import { asegurarCliente } from "./clientes.js";
import { formOrden, detalleOrden, obraFieldsHTML, leerObra } from "./ordenes.js";
import { reportarError } from "../errores.js";
import { desbloqueado } from "../plan.js";
import { primeraTareaHTML, bindPrimeraTarea } from "./bienvenida.js";

const EST = { ABIERTA: "Abierta", ACEPTADA: "Aceptada", RECHAZADA: "Rechazada" };
let filtro = "ABIERTA";

function vencida(c) {
  if (c.estado !== "ABIERTA" || !c.fecha) return false;
  const vence = new Date(c.fecha + "T00:00:00");
  vence.setDate(vence.getDate() + Number(c.vigenciaDias || 15));
  return vence < new Date();
}

export function renderCotizaciones(container, user, param) {
  container.innerHTML = `
    ${primeraTareaHTML()}
    <div class="view-head">
      <h2>Cotizaciones</h2>
      <button class="btn btn-primary" id="nueva-cot">+ Nueva cotización</button>
    </div>
    <div class="filters" id="filtros-cot">
      ${[["ABIERTA", "Abiertas"], ["ACEPTADA", "Aceptadas"], ["RECHAZADA", "Rechazadas"], ["TODAS", "Todas"]]
        .map(([k, l]) => `<button class="chip ${k === filtro ? "active" : ""}" data-f="${k}">${l}</button>`).join("")}
    </div>
    <div id="lista-cot"></div>`;

  bindPrimeraTarea(container);
  $("#nueva-cot", container).onclick = () => formCotizacion();
  $("#filtros-cot", container).onclick = (e) => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    filtro = b.dataset.f;
    $$(".chip", container).forEach((c) => c.classList.toggle("active", c === b));
    pintar(container);
  };
  pintar(container);

  if (param) {
    history.replaceState(null, "", "#/cotizaciones");
    if (param === "nueva") formCotizacion();
    else detalleCot(param);
  }
}

function pintar(container) {
  const lista = store.all("cotizaciones").filter((c) => filtro === "TODAS" || c.estado === filtro)
    .sort((a, b) => (b.folio || 0) - (a.folio || 0));
  const el = $("#lista-cot", container);
  el.innerHTML = lista.length ? `<div class="grid-cards">${lista.map((c) => `
    <div class="card orden-card" data-id="${esc(c.id)}">
      <div class="orden-top"><span class="folio">COT #${esc(String(c.folio).padStart(4, "0"))}</span>
        <span class="estado c-${esc(c.estado)}">${vencida(c) ? "Vencida" : esc(EST[c.estado] || "")}</span></div>
      <div class="card-title">${esc(c.clienteNombre || "")}</div>
      <div class="small">${esc((c.servicios || []).map((s) => s.descripcion).slice(0, 2).join(" + "))}</div>
      <div class="muted small">${esc(obraTxt(c.obra) || "")}${obraTxt(c.obra) ? " · " : ""}${fecha(c.fecha)}</div>
      <div class="orden-bottom"><strong>${money(totales(c).total)}</strong>${totales(c).costo ? `<span class="pill ${totales(c).utilidad < 0 ? "bad" : "ok"}" title="Tu ganancia (solo tú la ves)">${totales(c).utilidad < 0 ? "" : "+"}${money(totales(c).utilidad)}</span>` : ""}</div>
    </div>`).join("")}</div>` : emptyState("📄", "No hay cotizaciones en este filtro.");
  el.querySelectorAll("[data-id]").forEach((n) => (n.onclick = () => detalleCot(n.dataset.id)));
}

function detalleCot(id) {
  const c = store.get("cotizaciones", id);
  if (!c) return;
  const t = totales(c);
  const body = openModal(`Cotización #${String(c.folio).padStart(4, "0")}`, `
    <div class="card-title">${esc(c.clienteNombre)}</div>
    ${obraTxt(c.obra) ? `<div class="obra-box">📍 ${esc(obraTxt(c.obra))}${c.obra.m2 ? ` · ${esc(c.obra.m2)} m²` : ""}</div>` : ""}
    <div class="muted small">${c.telefono ? " · " + esc(c.telefono) : ""} · ${fecha(c.fecha)} · Vigencia ${esc(c.vigenciaDias)} días ${vencida(c) ? '<span class="pill bad">Vencida</span>' : ""}</div>
    <h4 class="section-label">Conceptos</h4>
    <div class="tabla-lineas">
      ${(c.servicios || []).map((l) => `<div><span>${esc(l.descripcion)} <em>${esc(lineaTxt(l))}</em></span><span>${money(l.cantidad * l.precio)}</span></div>`).join("")}
    </div>
    ${resumenHTML(t)}
    ${c.notas ? `<p class="muted">${esc(c.notas)}</p>` : ""}
    <div class="form-actions wrap">
      ${c.ordenId && desbloqueado("ordenes") ? `<button class="btn btn-primary" data-act="ver-orden">Ver trabajo</button>`
        : desbloqueado("ordenes")
          ? `<button class="btn btn-primary" data-act="convertir">✅ Convertir en trabajo</button>`
          : `<a class="btn btn-ghost locked-btn" href="#/ordenes" title="Paquete completo">🔒 Convertir en trabajo</a>`}
      <button class="btn ${desbloqueado("ordenes") ? "btn-ghost" : "btn-primary"}" data-act="doc">📄 PDF / WhatsApp</button>
      <button class="btn btn-ghost" data-act="edit">✏️ Editar</button>
      ${c.estado === "ABIERTA" ? `<button class="btn btn-ghost" data-act="rechazar">Rechazada</button>` : ""}
      <button class="btn btn-danger" data-act="del">🗑️</button>
    </div>`, { wide: true });

  const act = (k) => $(`[data-act=${k}]`, body);
  act("doc").onclick = () => abrirDocumento("cotizacion", c);
  act("edit").onclick = () => formCotizacion(c);
  if (act("ver-orden")) act("ver-orden").onclick = () => detalleOrden(c.ordenId);
  if (act("convertir")) act("convertir").onclick = () => formOrden({
    clienteNombre: c.clienteNombre, telefono: c.telefono, obra: c.obra,
    servicios: c.servicios, descuento: c.descuento, conIva: c.conIva, notas: c.notas, cotizacionId: c.id
  });
  if (act("rechazar")) act("rechazar").onclick = async () => {
    await store.save("cotizaciones", { ...(store.get("cotizaciones", id) || c), estado: "RECHAZADA" });
    toast("Marcada como rechazada");
    detalleCot(id);
  };
  act("del").onclick = async () => {
    if (!(await confirmar("¿Eliminar esta cotización?"))) return;
    await store.remove("cotizaciones", c.id);
    closeModal();
  };
}

function formCotizacion(c = {}) {
  const a = store.ajustes();
  const clientes = store.all("clientes");
  const editando = !!c.id;

  const body = openModal(editando ? "Editar cotización" : "Nueva cotización", `
    <form id="f-cot" class="form">
      <datalist id="dl-clientes-c">${clientes.map((x) => `<option value="${esc(x.nombre)}">`).join("")}</datalist>
      <div class="cols-2">
        <label class="field"><span>Cliente *</span><input class="input" name="clienteNombre" list="dl-clientes-c" required value="${esc(c.clienteNombre || "")}" /></label>
        <label class="field"><span>Teléfono (WhatsApp)</span><input class="input" name="telefono" type="tel" inputmode="tel" value="${esc(c.telefono || "")}" /></label>
      </div>
      ${obraFieldsHTML(c.obra)}
      <div class="form-section">Conceptos</div>
      ${lineasEditorHTML(c.servicios)}
      <div class="cols-3">
        <label class="field"><span>Descuento $</span><input class="input" name="descuento" type="number" inputmode="decimal" step="0.01" value="${esc(c.descuento || "")}" /></label>
        <label class="field check"><input type="checkbox" name="conIva" ${c.conIva ? "checked" : ""} /><span>Agregar IVA ${esc(a.ivaPct)}%</span></label>
        <label class="field"><span>Vigencia (días)</span><input class="input" name="vigenciaDias" type="number" value="${esc(c.vigenciaDias || a.vigenciaDias)}" /></label>
      </div>
      <div id="resumen-cot"></div>
      <label class="field"><span>Notas para el cliente</span><textarea class="input" name="notas" rows="2">${esc(c.notas || "")}</textarea></label>
      <div class="form-actions">
        <button class="btn btn-primary grow" type="submit">💾 Guardar cotización</button>
        <button class="btn btn-ghost" type="button" data-cancel>Cancelar</button>
      </div>
    </form>`, { wide: true });

  const form = $("#f-cot", body);
  const actualizar = () => {
    $("#resumen-cot", form).innerHTML = resumenHTML(totales({
      servicios: leerLineas(form), descuento: form.elements.descuento.value, conIva: form.elements.conIva.checked, ivaPct: a.ivaPct
    }));
  };
  bindLineas(form, actualizar);
  form.elements.descuento.oninput = actualizar;
  form.elements.conIva.onchange = actualizar;
  actualizar();
  $("[data-cancel]", form).onclick = closeModal;

  let enviando = false; // evita cotizaciones duplicadas con doble toque
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (enviando) return;
    const f = Object.fromEntries(new FormData(form).entries());
    const servicios = leerLineas(form);
    if (!servicios.length) { toast("Agrega al menos un concepto"); return; }
    enviando = true;
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    let folio;
    try {
      folio = editando ? c.folio : await store.reservarFolio("cotizaciones");
    } catch (err) {
      reportarError("folio de cotización", err);
      toast(err.message);
      enviando = false; btn.disabled = false;
      return;
    }
    try {
      const cli = await asegurarCliente(f.clienteNombre, f.telefono);
      const actual = editando ? (store.get("cotizaciones", c.id) || c) : {};
      const saved = await store.save("cotizaciones", {
        ...actual,
        folio,
        fecha: actual.fecha || hoyISO(),
        estado: actual.estado || "ABIERTA",
        clienteId: cli?.id || "",
        clienteNombre: f.clienteNombre.trim(),
        telefono: f.telefono.trim(),
        obra: leerObra(f),
        servicios,
        descuento: num(f.descuento),
        conIva: !!f.conIva,
        ivaPct: a.ivaPct,
        vigenciaDias: num(f.vigenciaDias) || a.vigenciaDias,
        notas: f.notas.trim()
      });
      toast("Cotización guardada");
      detalleCot(saved.id);
    } catch (err) {
      reportarError("guardar cotización", err);
      toast("No se pudo guardar: " + err.message);
      enviando = false; btn.disabled = false;
    }
  };
}
