// ============================================================
// modules/gastos.js
// Gastos generales del negocio (herramienta, fletes, renta,
// instaladores...) que no van ligados a un trabajo. Se ven por
// mes y por categoría; alimentan la "utilidad neta" del Inicio.
// ============================================================

import * as store from "../store.js";
import { esc, money, num, fecha, hoyISO, mesClave, toast, openModal, closeModal, confirmar, emptyState, $ } from "../ui.js";

export const CATEGORIAS = ["Material", "Herramienta", "Fletes / gasolina", "Instaladores / sueldos", "Renta", "Publicidad", "Luz / agua / internet", "Otros"];
let mes = mesClave(hoyISO());

// <select> de meses en lugar de <input type="month">, que Firefox y
// Safari de escritorio muestran como texto libre.
function opcionesMes() {
  const meses = new Set(store.all("gastos").map((g) => mesClave(g.fecha)).filter((m) => /^\d{4}-\d{2}$/.test(m)));
  const d = new Date(hoyISO() + "T12:00:00");
  for (let i = 0; i < 12; i++) { meses.add(mesClave(d.toISOString())); d.setMonth(d.getMonth() - 1); }
  meses.add(mes);
  return [...meses].sort().reverse().map((m) => {
    const txt = new Date(m + "-15T12:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" });
    return `<option value="${esc(m)}" ${m === mes ? "selected" : ""}>${esc(txt)}</option>`;
  }).join("");
}

export function renderGastos(container) {
  container.innerHTML = `
    <div class="view-head">
      <h2>Gastos</h2>
      <button class="btn btn-primary" id="nuevo-gasto">+ Nuevo gasto</button>
    </div>
    <label class="field inline"><span>Mes</span><select class="input" id="mes-gastos">${opcionesMes()}</select></label>
    <div id="gastos-resumen"></div>
    <div id="gastos-lista"></div>`;

  $("#nuevo-gasto", container).onclick = () => formGasto();
  $("#mes-gastos", container).onchange = (e) => { mes = e.target.value || mesClave(hoyISO()); pintar(container); };
  pintar(container);
}

function pintar(container) {
  const lista = store.all("gastos").filter((g) => mesClave(g.fecha) === mes)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const total = lista.reduce((s, g) => s + num(g.monto), 0);
  const porCat = {};
  lista.forEach((g) => (porCat[g.categoria] = (porCat[g.categoria] || 0) + num(g.monto)));

  $("#gastos-resumen", container).innerHTML = `
    <div class="card">
      <div class="muted small">Total del mes</div>
      <div class="big-number neg">${money(total)}</div>
      ${Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([c, m]) => `
        <div class="bar-row"><span>${esc(c)}</span><div class="bar"><i style="width:${total ? (m / total) * 100 : 0}%"></i></div><span>${money(m)}</span></div>`).join("")}
    </div>`;

  const el = $("#gastos-lista", container);
  el.innerHTML = lista.length ? lista.map((g) => `
    <div class="card row-card" data-id="${esc(g.id)}">
      <div class="grow">
        <div class="card-title">${esc(g.concepto)}</div>
        <div class="muted small">${fecha(g.fecha)} · ${esc(g.categoria)}</div>
      </div>
      <strong class="neg">${money(g.monto)}</strong>
    </div>`).join("") : emptyState("🧰", "Sin gastos registrados este mes.");
  el.querySelectorAll("[data-id]").forEach((n) => (n.onclick = () => formGasto(store.get("gastos", n.dataset.id))));
}

function formGasto(g = {}) {
  const body = openModal(g.id ? "Editar gasto" : "Nuevo gasto", `
    <form id="f-gasto" class="form">
      <label class="field"><span>Concepto *</span><input class="input" name="concepto" required placeholder="Ej. Pegamento, discos de corte" value="${esc(g.concepto || "")}" /></label>
      <div class="cols-3">
        <label class="field"><span>Monto *</span><input class="input" name="monto" type="number" inputmode="decimal" step="0.01" required value="${esc(g.monto ?? "")}" /></label>
        <label class="field"><span>Fecha</span><input class="input" name="fecha" type="date" value="${esc(g.fecha || hoyISO())}" /></label>
        <label class="field"><span>Categoría</span>
          <select class="input" name="categoria">${CATEGORIAS.map((c) => `<option ${g.categoria === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary grow" type="submit">Guardar</button>
        ${g.id ? `<button class="btn btn-danger" type="button" data-del>Eliminar</button>` : ""}
      </div>
    </form>`);

  $("#f-gasto", body).onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    mes = mesClave(f.fecha || hoyISO()); // antes de guardar: la vista se repinta al guardar
    await store.save("gastos", { ...g, concepto: f.concepto.trim(), monto: num(f.monto), fecha: f.fecha || hoyISO(), categoria: f.categoria });
    closeModal();
    toast("Gasto guardado");
  };
  const del = $("[data-del]", body);
  if (del) del.onclick = async () => {
    if (!(await confirmar("¿Eliminar este gasto?"))) return;
    await store.remove("gastos", g.id);
    closeModal();
  };
}
