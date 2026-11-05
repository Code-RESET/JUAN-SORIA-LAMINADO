// ============================================================
// modules/clientes.js
// Directorio de clientes (CRM): alta, edición, historial de
// trabajos y saldo pendiente por cliente, acceso directo a
// WhatsApp y llamada.
// ============================================================

import * as store from "../store.js";
import { esc, money, fecha, toast, openModal, closeModal, confirmar, emptyState, waLink, $ } from "../ui.js";
import { totales } from "../lineas.js";
import { ESTADOS, obraTxt } from "../documento.js";

let filtro = "";

// Busca un cliente por nombre (o teléfono) y lo crea si no existe.
// Lo usan Órdenes y Cotizaciones al guardar.
export async function asegurarCliente(nombre, telefono) {
  nombre = (nombre || "").trim();
  if (!nombre) return null;
  const tel = (telefono || "").replace(/\D/g, "");
  let c = store.all("clientes").find((x) =>
    x.nombre.toLowerCase() === nombre.toLowerCase() || (tel && (x.telefono || "").replace(/\D/g, "") === tel));
  if (!c) c = await store.save("clientes", { nombre, telefono: telefono || "" });
  else if (telefono && !c.telefono) c = await store.save("clientes", { ...c, telefono });
  return c;
}

function ordenesDe(c) {
  return store.all("ordenes").filter((o) => o.clienteId === c.id || o.clienteNombre === c.nombre);
}

export function renderClientes(container) {
  container.innerHTML = `
    <div class="view-head">
      <h2>Clientes</h2>
      <button class="btn btn-primary" id="nuevo-cliente">+ Nuevo cliente</button>
    </div>
    <input class="input search" id="buscar-cliente" placeholder="🔍 Buscar por nombre o teléfono" value="${esc(filtro)}" />
    <div id="lista-clientes"></div>`;

  $("#nuevo-cliente", container).onclick = () => formCliente();
  $("#buscar-cliente", container).oninput = (e) => { filtro = e.target.value; pintar(container); };
  pintar(container);
}

function pintar(container) {
  const q = filtro.trim().toLowerCase();
  const lista = store.all("clientes")
    .filter((c) => !q || c.nombre.toLowerCase().includes(q) || (c.telefono || "").includes(q))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const el = $("#lista-clientes", container);
  if (!lista.length) { el.innerHTML = emptyState("👤", q ? "Sin resultados." : "Aún no hay clientes. Se agregan solos al crear una orden."); return; }

  el.innerHTML = lista.map((c) => {
    const ords = ordenesDe(c);
    const saldo = ords.reduce((s, o) => s + totales(o).saldo, 0);
    return `
    <div class="card row-card" data-id="${c.id}">
      <div class="avatar">${esc(c.nombre.slice(0, 2).toUpperCase())}</div>
      <div class="grow">
        <div class="card-title">${esc(c.nombre)}</div>
        <div class="muted small">${esc(c.telefono || "Sin teléfono")} · ${ords.length} trabajo${ords.length === 1 ? "" : "s"}</div>
      </div>
      ${saldo > 0 ? `<span class="pill warn">Debe ${money(saldo)}</span>` : ""}
    </div>`;
  }).join("");

  el.querySelectorAll("[data-id]").forEach((n) => (n.onclick = () => detalleCliente(n.dataset.id)));
}

function detalleCliente(id) {
  const c = store.get("clientes", id);
  if (!c) return;
  const ords = ordenesDe(c).sort((a, b) => (b.creado || 0) - (a.creado || 0));
  const totalGastado = ords.reduce((s, o) => s + totales(o).total, 0);
  const saldo = ords.reduce((s, o) => s + totales(o).saldo, 0);

  const body = openModal(c.nombre, `
    <div class="chips">
      ${c.telefono ? `<a class="btn btn-wa" target="_blank" rel="noopener" href="${waLink(c.telefono, `Hola ${c.nombre}, `)}">WhatsApp</a>
      <a class="btn btn-ghost" href="tel:${esc(c.telefono)}">Llamar</a>` : ""}
      <button class="btn btn-ghost" data-edit>Editar</button>
    </div>
    <div class="mini-stats">
      <div><span>Trabajos</span><strong>${ords.length}</strong></div>
      <div><span>Total histórico</span><strong>${money(totalGastado)}</strong></div>
      <div><span>Saldo</span><strong class="${saldo ? "neg" : ""}">${money(saldo)}</strong></div>
    </div>
    ${c.notas ? `<p class="muted">${esc(c.notas)}</p>` : ""}
    <h4 class="section-label">Historial</h4>
    ${ords.length ? ords.map((o) => `
      <div class="card row-card" data-orden="${o.id}">
        <div class="grow">
          <div class="card-title">#${String(o.folio).padStart(4, "0")} · ${esc((o.servicios || []).map((s) => s.descripcion).slice(0, 2).join(" + "))}</div>
          <div class="muted small">${fecha(o.fechaIngreso)} · ${ESTADOS[o.estado] || ""}${obraTxt(o.obra) ? " · " + esc(obraTxt(o.obra)) : ""}</div>
        </div>
        <strong>${money(totales(o).total)}</strong>
      </div>`).join("") : `<p class="muted">Sin trabajos registrados.</p>`}
  `);
  $("[data-edit]", body).onclick = () => formCliente(c);
  body.querySelectorAll("[data-orden]").forEach((n) => (n.onclick = () => { location.hash = `#/ordenes/${n.dataset.orden}`; }));
}

function formCliente(c = {}) {
  const body = openModal(c.id ? "Editar cliente" : "Nuevo cliente", `
    <form id="f-cliente" class="form">
      <label class="field"><span>Nombre *</span><input class="input" name="nombre" required value="${esc(c.nombre || "")}" /></label>
      <label class="field"><span>Teléfono (WhatsApp)</span><input class="input" name="telefono" type="tel" inputmode="tel" value="${esc(c.telefono || "")}" /></label>
      <label class="field"><span>Correo</span><input class="input" name="email" type="email" value="${esc(c.email || "")}" /></label>
      <label class="field"><span>Notas</span><textarea class="input" name="notas" rows="2">${esc(c.notas || "")}</textarea></label>
      <div class="form-actions">
        <button class="btn btn-primary grow" type="submit">Guardar</button>
        ${c.id ? `<button class="btn btn-danger" type="button" data-del>Eliminar</button>` : ""}
      </div>
    </form>`);

  $("#f-cliente", body).onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const data = Object.fromEntries(f.entries());
    await store.save("clientes", { ...c, ...data, nombre: data.nombre.trim() });
    closeModal();
    toast("Cliente guardado");
  };
  const del = $("[data-del]", body);
  if (del) del.onclick = async () => {
    if (!(await confirmar(`¿Eliminar a ${c.nombre}? Sus órdenes se conservan.`))) return;
    await store.remove("clientes", c.id);
    closeModal();
    toast("Cliente eliminado");
  };
}
