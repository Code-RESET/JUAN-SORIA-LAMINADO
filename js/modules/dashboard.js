// ============================================================
// modules/dashboard.js
// Inicio: números del mes (cobrado, por cobrar, gastos, utilidad
// neta), trabajos por estado y agenda de próximas instalaciones.
// ============================================================

import * as store from "../store.js";
import { esc, money, num, fecha, hoyISO, mesClave } from "../ui.js";
import { totales } from "../lineas.js";
import { ESTADOS, obraTxt } from "../documento.js";
import { detalleOrden } from "./ordenes.js";

export function renderDashboard(container) {
  const hoy = hoyISO();
  const mes = mesClave(hoy);
  const ordenes = store.all("ordenes");

  let cobradoMes = 0, vendidoMes = 0, costoMes = 0, porCobrar = 0;
  ordenes.forEach((o) => {
    const t = totales(o);
    porCobrar += t.saldo;
    if (mesClave(o.fechaIngreso) === mes) { vendidoMes += t.total; costoMes += t.costo; }
    (o.pagos || []).forEach((p) => { if (mesClave(p.fecha) === mes) cobradoMes += num(p.monto); });
  });
  const gastosMes = store.all("gastos").filter((g) => mesClave(g.fecha) === mes).reduce((s, g) => s + num(g.monto), 0);
  // Utilidad del mes sobre lo VENDIDO (no lo cobrado): los anticipos
  // pagan material y harían ver pérdidas falsas a mitad de mes.
  const utilidad = vendidoMes - costoMes - gastosMes;
  const cotAbiertas = store.all("cotizaciones").filter((c) => c.estado === "ABIERTA").length;

  const conteo = Object.keys(ESTADOS).map((k) => [k, ordenes.filter((o) => o.estado === k).length]);
  const agenda = ordenes.filter((o) => o.fechaInstalacion && o.estado !== "TERMINADO")
    .sort((a, b) => a.fechaInstalacion.localeCompare(b.fechaInstalacion)).slice(0, 8);
  const sinFecha = ordenes.filter((o) => !o.fechaInstalacion && o.estado !== "TERMINADO").length;
  const nombreMes = new Date(hoy + "T12:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" });

  const etiquetaDia = (f) => {
    if (f === hoy) return "HOY";
    const man = new Date(hoy + "T12:00:00"); man.setDate(man.getDate() + 1);
    if (f === man.toISOString().slice(0, 10)) return "MAÑANA";
    return fecha(f).split(" ").slice(0, 2).join(" ");
  };

  container.innerHTML = `
    <div class="view-head">
      <div>
        <h2>Inicio</h2>
        <div class="muted small">Resumen de ${esc(nombreMes)}</div>
      </div>
      <a class="btn btn-primary" href="#/ordenes/nueva">+ Nuevo trabajo</a>
    </div>

    <div class="stats">
      <a class="stat ok" href="#/ordenes/f:TODAS"><span>Cobrado este mes</span><strong>${money(cobradoMes)}</strong></a>
      <a class="stat warn" href="#/ordenes/f:POR_COBRAR"><span>Por cobrar</span><strong>${money(porCobrar)}</strong></a>
      <a class="stat" href="#/ordenes/f:TODAS"><span>Vendido este mes</span><strong>${money(vendidoMes)}</strong></a>
      <a class="stat bad" href="#/gastos"><span>Gastos del mes</span><strong>${money(gastosMes)}</strong></a>
      <div class="stat ${utilidad >= 0 ? "ok" : "bad"} wide"><span>Utilidad estimada del mes</span><strong>${money(utilidad)}</strong>
        <small>Vendido − costo de material − gastos</small></div>
    </div>

    <h3 class="section-label">Trabajos</h3>
    <div class="pipeline">
      ${conteo.map(([k, n]) => `<a class="pipe e-${k}" href="#/ordenes/f:${k}"><strong>${n}</strong><span>${ESTADOS[k]}</span></a>`).join("")}
    </div>
    ${cotAbiertas ? `<a class="card row-card link-card" href="#/cotizaciones"><span class="grow">📄 ${cotAbiertas} cotización${cotAbiertas === 1 ? "" : "es"} esperando respuesta</span><span class="muted">›</span></a>` : ""}

    <h3 class="section-label">Agenda de instalaciones</h3>
    ${agenda.length ? `<div class="list" data-cards>${agenda.map((o) => {
      const late = o.fechaInstalacion < hoy;
      return `
      <div class="card row-card" data-id="${o.id}">
        <div class="date-badge ${late ? "late" : o.fechaInstalacion === hoy ? "today" : ""}">${etiquetaDia(o.fechaInstalacion)}</div>
        <div class="grow"><div class="card-title">${esc(o.clienteNombre)}</div>
          <div class="small">${esc((o.servicios || []).map((s) => s.descripcion).slice(0, 2).join(" + "))}</div>
          <div class="muted small">${esc(obraTxt(o.obra) || "Sin dirección")} · ${ESTADOS[o.estado]}${late ? " · <b class='neg'>Atrasado</b>" : ""}</div></div>
        <strong class="${totales(o).saldo ? "" : "pos"}">${money(totales(o).saldo)}</strong>
      </div>`;
    }).join("")}</div>` : `<p class="muted">Sin instalaciones programadas.</p>`}
    ${sinFecha ? `<p class="muted small">${sinFecha} trabajo${sinFecha === 1 ? "" : "s"} sin fecha de instalación.</p>` : ""}
  `;

  container.querySelectorAll("[data-cards] [data-id]").forEach((n) => (n.onclick = () => detalleOrden(n.dataset.id)));
}
