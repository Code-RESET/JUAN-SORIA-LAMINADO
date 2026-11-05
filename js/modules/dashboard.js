// ============================================================
// modules/dashboard.js
// Inicio: números del mes (cobrado, por cobrar, gastos, utilidad
// neta), trabajos en el taller por estado y entregas próximas.
// ============================================================

import * as store from "../store.js";
import { esc, money, num, fecha, hoyISO, mesClave } from "../ui.js";
import { totales } from "../lineas.js";
import { ESTADOS, vehiculoTxt } from "../documento.js";
import { ordenCardHTML, detalleOrden } from "./ordenes.js";

export function renderDashboard(container, user) {
  const hoy = hoyISO();
  const mes = mesClave(hoy);
  const ordenes = store.all("ordenes");

  let cobradoMes = 0, facturadoMes = 0, costoMes = 0, porCobrar = 0;
  ordenes.forEach((o) => {
    const t = totales(o);
    porCobrar += t.saldo;
    if (mesClave(o.fechaIngreso) === mes) { facturadoMes += t.total; costoMes += t.costo; }
    (o.pagos || []).forEach((p) => { if (mesClave(p.fecha) === mes) cobradoMes += num(p.monto); });
  });
  const gastosMes = store.all("gastos").filter((g) => mesClave(g.fecha) === mes).reduce((s, g) => s + num(g.monto), 0);
  const utilidad = cobradoMes - costoMes - gastosMes;

  const conteo = Object.keys(ESTADOS).map((k) => [k, ordenes.filter((o) => o.estado === k).length]);
  const listos = ordenes.filter((o) => o.estado === "LISTO");
  const proximas = ordenes.filter((o) => o.fechaEntrega && o.estado !== "ENTREGADO" && o.estado !== "LISTO")
    .sort((a, b) => a.fechaEntrega.localeCompare(b.fechaEntrega)).slice(0, 6);
  const nombreMes = new Date(hoy + "T12:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" });

  container.innerHTML = `
    <div class="view-head">
      <div>
        <h2>Inicio</h2>
        <div class="muted small">Resumen de ${esc(nombreMes)}</div>
      </div>
      <a class="btn btn-primary" href="#/ordenes/nueva">+ Nueva orden</a>
    </div>

    <div class="stats">
      <a class="stat ok" href="#/ordenes"><span>Cobrado este mes</span><strong>${money(cobradoMes)}</strong></a>
      <a class="stat warn" href="#/ordenes/f:POR_COBRAR"><span>Por cobrar</span><strong>${money(porCobrar)}</strong></a>
      <a class="stat" href="#/ordenes/f:TODAS"><span>Trabajos del mes</span><strong>${money(facturadoMes)}</strong></a>
      <a class="stat bad" href="#/gastos"><span>Gastos del mes</span><strong>${money(gastosMes)}</strong></a>
      <div class="stat ${utilidad >= 0 ? "ok" : "bad"} wide"><span>Utilidad neta del mes</span><strong>${money(utilidad)}</strong>
        <small>Cobrado − materiales de los trabajos − gastos</small></div>
    </div>

    <h3 class="section-label">En el taller</h3>
    <div class="pipeline">
      ${conteo.map(([k, n]) => `<a class="pipe e-${k}" href="#/ordenes/f:${k}"><strong>${n}</strong><span>${ESTADOS[k]}</span></a>`).join("")}
    </div>

    ${listos.length ? `<h3 class="section-label">Listos para entregar</h3>
      <div class="grid-cards" data-cards>${listos.map(ordenCardHTML).join("")}</div>` : ""}

    <h3 class="section-label">Próximas entregas</h3>
    ${proximas.length ? `<div class="list" data-cards>${proximas.map((o) => `
      <div class="card row-card" data-id="${o.id}">
        <div class="date-badge ${o.fechaEntrega < hoy ? "late" : ""}">${fecha(o.fechaEntrega).split(" ").slice(0, 2).join(" ")}</div>
        <div class="grow"><div class="card-title">${esc(vehiculoTxt(o.vehiculo))}</div>
        <div class="muted small">${esc(o.clienteNombre)} · ${ESTADOS[o.estado]}${o.fechaEntrega < hoy ? " · <b class='neg'>Atrasado</b>" : ""}</div></div>
        <strong>${money(totales(o).saldo)}</strong>
      </div>`).join("")}</div>` : `<p class="muted">Sin entregas programadas.</p>`}
  `;

  container.querySelectorAll("[data-cards] [data-id]").forEach((n) => (n.onclick = () => detalleOrden(n.dataset.id)));
}
