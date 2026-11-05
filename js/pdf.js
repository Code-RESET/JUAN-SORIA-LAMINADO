// ============================================================
// pdf.js
// Genera el PDF de una Cotización / Orden de trabajo, tamaño carta,
// listo para imprimir o mandar por WhatsApp como ARCHIVO.
//
// Por qué jsPDF dibujando texto (y no una "foto" de la pantalla):
// el PDF sale nítido al imprimir, pesa ~10-30 KB (rápido por
// WhatsApp) y el texto se puede copiar. La librería vive DENTRO del
// repo (js/vendor/) y se carga solo al usarla: funciona sin internet
// y sin npm install.
// ============================================================

import { money, fecha } from "./ui.js";
import { totales } from "./lineas.js";
import * as store from "./store.js";
import { ESTADOS, UNIDADES, obraTxt } from "./documento.js";
import { logoValido } from "./marca.js";
import { reportarError } from "./errores.js";

let cargando = null;
function cargarJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!cargando) {
    cargando = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = new URL("./vendor/jspdf.umd.min.js", import.meta.url).href;
      s.onload = () => {
        if (window.jspdf?.jsPDF) return resolve(window.jspdf.jsPDF);
        cargando = null; s.remove(); // permitir reintentar (ej. sin conexión)
        reject(new Error("jsPDF no se inicializó"));
      };
      s.onerror = () => { cargando = null; reject(new Error("No se pudo cargar el generador de PDF")); };
      document.head.appendChild(s);
    });
  }
  return cargando;
}

// Las fuentes estándar del PDF solo traen caracteres latinos (WinAnsi):
// se conservan acentos, ñ, ², ·; se quitan emojis y símbolos raros.
const EXTRA_OK = "•–—…‘’“”€";
function txt(v) {
  return String(v ?? "").replace(/−/g, "-").replace(/[^\n\x20-\xFF]/g, (c) => (EXTRA_OK.includes(c) ? c : ""));
}
const fechaTxt = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(String(iso || "")) ? fecha(iso) : "");

export function nombreArchivo(tipo, doc) {
  const base = `${tipo === "orden" ? "Orden" : "Cotizacion"}-${String(doc.folio || "").padStart(4, "0")}-${String(doc.clienteNombre || "").trim() || "cliente"}`;
  return base.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").slice(0, 80).replace(/-+$/, "") + ".pdf";
}

export async function generarPDF(tipo, doc) {
  const jsPDF = await cargarJsPDF();
  const a = store.ajustes();
  const t = totales(doc);
  const esOrden = tipo === "orden";
  const pdf = new jsPDF({ unit: "mm", format: "letter", compress: true });

  const W = pdf.internal.pageSize.getWidth();   // 215.9
  const H = pdf.internal.pageSize.getHeight();  // 279.4
  const M = 15;                                  // margen
  const ancho = W - M * 2;
  const NEGRO = [17, 17, 17], GRIS = [110, 110, 110], LINEA = [220, 220, 220];
  let y = M;

  const set = (size, estilo = "normal", color = NEGRO) => { pdf.setFont("helvetica", estilo); pdf.setFontSize(size); pdf.setTextColor(...color); };
  const salto = (alto) => { if (y + alto > H - 18) { pdf.addPage(); y = M; return true; } return false; };

  // ---------- Encabezado ----------
  const titulo = esOrden ? "ORDEN DE TRABAJO" : "COTIZACIÓN";
  const folio = "#" + String(doc.folio || "").padStart(4, "0");
  // Logo del cliente (si lo subió): máx. 40 × 20 mm, a la izquierda.
  let xTxt = M, altoLogo = 0;
  if (logoValido(a.logo)) {
    try {
      const fmt = a.logo.startsWith("data:image/png") ? "PNG" : a.logo.startsWith("data:image/webp") ? "WEBP" : "JPEG";
      const p = pdf.getImageProperties(a.logo);
      const k = Math.min(40 / p.width, 20 / p.height);
      const lw = p.width * k, lh = p.height * k;
      pdf.addImage(a.logo, fmt, M, y, lw, lh);
      xTxt = M + lw + 5; altoLogo = lh;
    } catch (e) { reportarError("logo en PDF", e); /* el PDF sale sin logo */ }
  }
  const anchoTxt = ancho - 62 - (xTxt - M);
  set(15, "bold");
  const negocio = pdf.splitTextToSize(txt(a.negocio), anchoTxt);
  pdf.text(negocio, xTxt, y + 5);
  let yIzq = y + 5 + negocio.length * 6;
  set(9, "normal", GRIS);
  const contacto = [a.direccion, a.telefono ? "Tel. " + a.telefono : ""].filter(Boolean).map(txt);
  contacto.forEach((l) => { pdf.splitTextToSize(l, anchoTxt).forEach((p) => { pdf.text(p, xTxt, yIzq); yIzq += 4.2; }); });
  yIzq = Math.max(yIzq, y + altoLogo + 2);

  set(9, "normal", GRIS);
  pdf.text(titulo, W - M, y + 3, { align: "right" });
  set(18, "bold");
  pdf.text(folio, W - M, y + 11, { align: "right" });
  set(9, "normal", GRIS);
  pdf.text(fechaTxt(doc.fecha || doc.fechaIngreso), W - M, y + 16, { align: "right" });

  y = Math.max(yIzq, y + 19) + 2;
  pdf.setDrawColor(...NEGRO); pdf.setLineWidth(0.8); pdf.line(M, y, W - M, y);
  y += 7;

  // ---------- Datos: cliente / obra / estado o vigencia ----------
  const bloques = [
    ["CLIENTE", [doc.clienteNombre || "-", doc.telefono || ""]],
    ["OBRA / DIRECCIÓN", [obraTxt(doc.obra) || "-", doc.obra?.m2 ? `Superficie: ${doc.obra.m2} m²` : ""]],
    esOrden
      ? ["ESTADO", [ESTADOS[doc.estado] || "", doc.fechaInstalacion ? "Instalación: " + fechaTxt(doc.fechaInstalacion) : ""]]
      : ["VIGENCIA", [`${doc.vigenciaDias || a.vigenciaDias} días`]]
  ];
  const colW = ancho / 3;
  let altoBloques = 0;
  bloques.forEach(([etq, lineas], i) => {
    const x = M + i * colW;
    let yy = y;
    set(7.5, "bold", GRIS); pdf.text(etq, x, yy); yy += 4.5;
    lineas.filter(Boolean).forEach((l, j) => {
      set(j === 0 ? 10 : 9, j === 0 ? "bold" : "normal", j === 0 ? NEGRO : GRIS);
      pdf.splitTextToSize(txt(l), colW - 4).forEach((p) => { pdf.text(p, x, yy); yy += 4.4; });
    });
    altoBloques = Math.max(altoBloques, yy - y);
  });
  y += altoBloques + 4;

  // ---------- Tabla de conceptos ----------
  const cols = [
    { t: "Concepto", w: ancho - 32 - 32 - 32, al: "left" },
    { t: "Cantidad", w: 32, al: "center" },
    { t: "P. unitario", w: 32, al: "right" },
    { t: "Importe", w: 32, al: "right" }
  ];
  const encabezadoTabla = () => {
    pdf.setFillColor(...NEGRO); pdf.rect(M, y, ancho, 8, "F");
    set(8.5, "bold", [255, 255, 255]);
    let x = M;
    cols.forEach((c) => {
      const tx = c.al === "left" ? x + 2.5 : c.al === "center" ? x + c.w / 2 : x + c.w - 2.5;
      pdf.text(c.t, tx, y + 5.3, { align: c.al });
      x += c.w;
    });
    y += 8;
  };
  encabezadoTabla();

  const lineasDoc = doc.servicios || [];
  if (!lineasDoc.length) { set(9.5, "italic", GRIS); pdf.text("Sin conceptos", M + 2.5, y + 6); y += 9; }
  lineasDoc.forEach((l) => {
    set(9.5);
    const desc = pdf.splitTextToSize(txt(l.descripcion), cols[0].w - 5);
    const alto = Math.max(l.cajas ? 12 : 8, desc.length * 4.4 + 3.6); // 2º renglón para "(N cajas)"
    if (salto(alto)) encabezadoTabla();
    set(9.5);
    pdf.text(desc, M + 2.5, y + 5.4);
    const cant = `${Number(l.cantidad || 1).toLocaleString("es-MX", { maximumFractionDigits: 2 })} ${UNIDADES[l.unidad] || ""}`.trim();
    const cajasTxt = l.cajas ? `(${Number.parseInt(l.cajas, 10)} cajas)` : "";
    let x = M + cols[0].w;
    pdf.text(txt(cant), x + cols[1].w / 2, y + 5.4, { align: "center" });
    if (cajasTxt) { set(8, "normal", GRIS); pdf.text(cajasTxt, x + cols[1].w / 2, y + 9.4, { align: "center" }); set(9.5); }
    x += cols[1].w;
    pdf.text(money(l.precio), x + cols[2].w - 2.5, y + 5.4, { align: "right" }); x += cols[2].w;
    pdf.text(money((l.cantidad || 1) * l.precio), x + cols[3].w - 2.5, y + 5.4, { align: "right" });
    y += alto;
    pdf.setDrawColor(...LINEA); pdf.setLineWidth(0.2); pdf.line(M, y, W - M, y);
  });
  y += 4;

  // ---------- Totales ----------
  const filasTot = [["Subtotal", money(t.subtotal)]];
  if (t.descuento) filasTot.push(["Descuento", "-" + money(t.descuento)]);
  if (t.iva) filasTot.push([`IVA ${doc.ivaPct}%`, money(t.iva)]);
  filasTot.push(["TOTAL", money(t.total), true]);
  if (esOrden) { filasTot.push(["Pagado", money(t.pagado)]); filasTot.push(["SALDO", money(t.saldo), true]); }
  salto(filasTot.length * 6.5 + 4);
  const xT = W - M - 75;
  filasTot.forEach(([k, v, fuerte]) => {
    if (fuerte) { pdf.setDrawColor(...NEGRO); pdf.setLineWidth(0.4); pdf.line(xT, y, W - M, y); y += 1.2; }
    set(fuerte ? 11.5 : 9.5, fuerte ? "bold" : "normal");
    pdf.text(k, xT, y + 4.6);
    pdf.text(v, W - M, y + 4.6, { align: "right" });
    y += fuerte ? 7.5 : 6;
  });
  y += 4;

  // ---------- Pagos, notas y condiciones ----------
  // Renglón por renglón: un texto largo continúa en la página siguiente
  // en vez de salirse del borde (antes se perdía sin aviso).
  const seccion = (etq, texto) => {
    const p = (set(9.5), pdf.splitTextToSize(txt(texto), ancho));
    salto(8 + Math.min(p.length, 3) * 4.4); // título + primeros renglones juntos
    set(7.5, "bold", GRIS); pdf.text(etq, M, y); y += 4.5;
    p.forEach((renglon) => {
      if (salto(4.4)) { set(7.5, "bold", GRIS); pdf.text(etq + " (continúa)", M, y); y += 4.5; }
      set(9.5); pdf.text(renglon, M, y); y += 4.4;
    });
    y += 4;
  };
  if (esOrden && (doc.pagos || []).length) {
    seccion("PAGOS REGISTRADOS", doc.pagos.map((p) => `${fechaTxt(p.fecha)}   ${p.metodo || ""}   ${money(p.monto)}`).join("\n"));
  }
  if (doc.notas) seccion("NOTAS", doc.notas);
  seccion("CONDICIONES", esOrden ? (doc.garantia || a.garantia) : a.condiciones);

  if (esOrden) {
    salto(30);
    y += 18;
    pdf.setDrawColor(...NEGRO); pdf.setLineWidth(0.3);
    const fw = (ancho - 20) / 2;
    pdf.line(M, y, M + fw, y); pdf.line(M + fw + 20, y, W - M, y);
    set(8.5, "normal", GRIS);
    pdf.text("Firma del cliente", M + fw / 2, y + 4.5, { align: "center" });
    pdf.text(txt("Recibe: " + a.negocio), M + fw + 20 + fw / 2, y + 4.5, { align: "center" });
  }

  // ---------- Pie en todas las páginas ----------
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    set(7.5, "normal", GRIS);
    pdf.text(txt(`${a.negocio} · ${titulo} ${folio}`), M, H - 9);
    pdf.text(`Página ${i} de ${n}`, W - M, H - 9, { align: "right" });
  }

  pdf.setProperties({ title: `${titulo} ${folio}`, subject: txt(doc.clienteNombre || ""), creator: txt(a.negocio) });
  return pdf.output("blob");
}
