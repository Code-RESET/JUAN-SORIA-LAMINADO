// ============================================================
// documento.js
// Vista de Orden de trabajo / Cotización + envío como PDF.
// Al abrir la vista se genera el PDF (js/pdf.js) en segundo plano.
// "Enviar PDF" usa el menú Compartir del teléfono (Web Share API con
// archivo): ahí se elige WhatsApp y el cliente recibe el PDF, no texto.
// Por qué generarlo ANTES del toque: iPhone solo deja abrir Compartir
// justo después de un toque; si esperáramos a crear el PDF, lo bloquea.
// Si el navegador no puede compartir archivos (PC), se descarga el PDF
// y se abre WhatsApp para adjuntarlo.
// ============================================================

import { esc, money, fecha, waLink, toast, descargar } from "./ui.js";
import { generarPDF, nombreArchivo } from "./pdf.js";
import { reportarError } from "./errores.js";
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

  prepararPDF(tipo, doc, a, t);

  ov.hidden = false;
  document.body.classList.add("no-scroll");
}

// ---------- PDF: generar, compartir, descargar ----------
let actual = null; // { archivo: File, nombre, mensaje, telefono, id }
let generacion = 0;

function prepararPDF(tipo, doc, a, t) {
  const ov = document.getElementById("doc-overlay");
  const share = ov.querySelector("[data-doc-share]");
  const down = ov.querySelector("[data-doc-download]");
  const id = ++generacion;
  actual = null;
  share.disabled = down.disabled = true;
  share.textContent = "Preparando PDF…";
  const folio = String(doc.folio || "").padStart(4, "0");
  const que = tipo === "orden" ? "orden de trabajo" : "cotización";
  const mensaje = `Hola ${doc.clienteNombre || ""}, le comparto su ${que} #${folio} de ${a.negocio}. Total: ${money(t.total)}.`;

  generarPDF(tipo, doc).then((blob) => {
    if (id !== generacion) return; // ya se abrió otro documento
    const nombre = nombreArchivo(tipo, doc);
    actual = { archivo: new File([blob], nombre, { type: "application/pdf" }), blob, nombre, mensaje, telefono: doc.telefono, titulo: `${que} #${folio}` };
    share.disabled = down.disabled = false;
    share.textContent = "📲 Enviar PDF";
  }).catch((e) => {
    if (id !== generacion) return;
    reportarError("generar PDF", e);
    share.textContent = "PDF no disponible";
  });
}

function puedeCompartirArchivo(file) {
  try { return !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch { return false; }
}

async function enviarPDF() {
  if (!actual) return;
  const { archivo, blob, nombre, mensaje, telefono, titulo } = actual;
  if (puedeCompartirArchivo(archivo)) {
    try {
      // Solo el archivo (+título): en iPhone, mandar texto junto con el
      // archivo hace que algunas apps descarten el PDF.
      await navigator.share({ files: [archivo], title: titulo });
      return;
    } catch (e) {
      if (e?.name === "AbortError") return; // el usuario cerró el menú
      reportarError("compartir PDF", e);
    }
  }
  // Respaldo (PC o navegador sin compartir archivos): descargar + abrir WhatsApp.
  descargar(nombre, blob, "application/pdf");
  if (telefono) window.open(waLink(telefono, mensaje + " (Le adjunto el PDF)"), "_blank", "noopener");
  toast("PDF descargado: adjúntalo en el chat de WhatsApp");
}

export function initDocumento() {
  const ov = document.getElementById("doc-overlay");
  ov.querySelector("[data-doc-print]").addEventListener("click", () => window.print());
  ov.querySelector("[data-doc-share]").addEventListener("click", enviarPDF);
  ov.querySelector("[data-doc-download]").addEventListener("click", () => {
    if (actual) { descargar(actual.nombre, actual.blob, "application/pdf"); toast("PDF descargado"); }
  });
  ov.querySelector("[data-doc-close]").addEventListener("click", () => {
    ov.hidden = true;
    document.body.classList.remove("no-scroll");
  });
}

export { ESTADOS, obraTxt };
export const _pdfActual = () => actual; // para pruebas
