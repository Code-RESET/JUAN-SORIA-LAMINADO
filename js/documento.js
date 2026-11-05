// ============================================================
// documento.js
// Vista imprimible de Orden de trabajo / Cotización.
// Se muestra dentro de la misma app (no en ventana nueva) y se
// imprime con window.print(): así funciona igual en iPhone (PWA),
// Android y PC, donde window.open suele estar bloqueado.
// "Guardar como PDF" sale del mismo diálogo de impresión.
// ============================================================

import { esc, money, fecha, waLink } from "./ui.js";
import { totales } from "./lineas.js";
import * as store from "./store.js";

// Flujo de un trabajo de pisos / persianas.
const ESTADOS = {
  MEDICION: "Medición", MATERIAL: "Pedido de material", INSTALACION: "En instalación", TERMINADO: "Terminado"
};

export const UNIDADES = { m2: "m²", ml: "ml", pza: "pza", caja: "caja", serv: "serv." };

// Texto corto de la obra: "Sala y comedor · Calle 5 #120, Col. Centro"
function obraTxt(o = {}) {
  return [o.espacio, [o.direccion, o.colonia].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
}

export function abrirDocumento(tipo, doc) {
  const a = store.ajustes();
  const t = totales(doc);
  const esOrden = tipo === "orden";
  const titulo = esOrden ? "ORDEN DE TRABAJO" : "COTIZACIÓN";
  const folio = esc(String(doc.folio || "").padStart(4, "0"));

  const filas = (doc.servicios || []).map((l) => `
    <tr><td>${esc(l.descripcion)}</td><td class="c">${esc(l.cantidad || 1)} ${UNIDADES[l.unidad] || ""}</td>
    <td class="r">${money(l.precio)}</td><td class="r">${money((l.cantidad || 1) * l.precio)}</td></tr>`).join("");

  const pagos = esOrden && (doc.pagos || []).length ? `
    <h4>Pagos registrados</h4>
    <table><tbody>${doc.pagos.map((p) => `<tr><td>${fecha(p.fecha)}</td><td>${esc(p.metodo || "")}</td><td class="r">${money(p.monto)}</td></tr>`).join("")}</tbody></table>` : "";

  const html = `
  <div class="doc">
    <div class="doc-head">
      <div>
        <div class="doc-negocio">${esc(a.negocio)}</div>
        <div class="doc-sub">${esc(a.direccion)}${a.direccion && a.telefono ? " · " : ""}${a.telefono ? "Tel. " + esc(a.telefono) : ""}</div>
      </div>
      <div class="doc-folio"><div>${titulo}</div><strong>#${folio}</strong><div>${fecha(doc.fecha || doc.fechaIngreso)}</div></div>
    </div>
    <div class="doc-grid">
      <div><span>Cliente</span><strong>${esc(doc.clienteNombre || "—")}</strong>${doc.telefono ? `<div>${esc(doc.telefono)}</div>` : ""}</div>
      <div><span>Obra / dirección</span><strong>${esc(obraTxt(doc.obra) || "—")}</strong>${doc.obra?.m2 ? `<div>Superficie: ${esc(doc.obra.m2)} m²</div>` : ""}</div>
      ${esOrden ? `<div><span>Estado</span><strong>${ESTADOS[doc.estado] || ""}</strong>${doc.fechaInstalacion ? `<div>Instalación: ${fecha(doc.fechaInstalacion)}</div>` : ""}</div>`
                : `<div><span>Vigencia</span><strong>${esc(doc.vigenciaDias || a.vigenciaDias)} días</strong></div>`}
    </div>
    <table>
      <thead><tr><th>Concepto</th><th class="c">Cant.</th><th class="r">Precio</th><th class="r">Importe</th></tr></thead>
      <tbody>${filas || `<tr><td colspan="4">Sin conceptos</td></tr>`}</tbody>
    </table>
    <div class="doc-totales">
      <div><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
      ${t.descuento ? `<div><span>Descuento</span><span>-${money(t.descuento)}</span></div>` : ""}
      ${t.iva ? `<div><span>IVA ${esc(doc.ivaPct)}%</span><span>${money(t.iva)}</span></div>` : ""}
      <div class="grand"><span>Total</span><span>${money(t.total)}</span></div>
      ${esOrden ? `<div><span>Pagado</span><span>${money(t.pagado)}</span></div><div class="grand"><span>Saldo</span><span>${money(t.saldo)}</span></div>` : ""}
    </div>
    ${pagos}
    ${doc.notas ? `<h4>Notas</h4><p>${esc(doc.notas)}</p>` : ""}
    <h4>Condiciones</h4>
    <p>${esc(esOrden ? (doc.garantia || a.garantia) : a.condiciones)}</p>
    ${esOrden ? `<div class="firmas"><div>Firma del cliente</div><div>Recibe: ${esc(a.negocio)}</div></div>` : ""}
  </div>`;

  const ov = document.getElementById("doc-overlay");
  ov.querySelector(".doc-frame").innerHTML = html;
  ov.querySelector(".doc-topbar-title").textContent = `${esOrden ? "Trabajo" : "Cotización"} #${doc.folio || ""}`;

  const resumen = `${a.negocio}\n${esOrden ? "Orden de trabajo" : "Cotización"} #${folio}\n` +
    (obraTxt(doc.obra) ? `Obra: ${obraTxt(doc.obra)}\n` : "") +
    (doc.servicios || []).map((l) => `• ${l.descripcion} (${l.cantidad} ${UNIDADES[l.unidad] || ""}): ${money(l.cantidad * l.precio)}`).join("\n") +
    `\nTotal: ${money(t.total)}` + (esOrden ? `\nPagado: ${money(t.pagado)}\nSaldo: ${money(t.saldo)}` : `\nVigencia: ${doc.vigenciaDias || a.vigenciaDias} días`);
  const wa = ov.querySelector("[data-doc-wa]");
  wa.href = waLink(doc.telefono, resumen);
  wa.hidden = !doc.telefono;

  ov.hidden = false;
  document.body.classList.add("no-scroll");
}

export function initDocumento() {
  const ov = document.getElementById("doc-overlay");
  ov.querySelector("[data-doc-print]").addEventListener("click", () => window.print());
  ov.querySelector("[data-doc-close]").addEventListener("click", () => {
    ov.hidden = true;
    document.body.classList.remove("no-scroll");
  });
}

export { ESTADOS, obraTxt };
