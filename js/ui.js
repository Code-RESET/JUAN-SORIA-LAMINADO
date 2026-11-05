// ============================================================
// ui.js
// Utilidades de interfaz compartidas por todos los módulos:
// escape de HTML (anti-XSS), formato de dinero/fechas, toast,
// modal, confirmación y enlaces de WhatsApp.
// ============================================================

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
export function money(n) {
  return mxn.format(Number(n) || 0);
}

export function num(v) {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function hoyISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function fecha(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso).slice(0, 10))) return esc(iso);
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(d)} ${meses[Number(m) - 1]} ${y}`;
}

export function mesClave(iso) {
  return String(iso || "").slice(0, 7);
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

// ---------- Toast ----------
let toastTimer;
export function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

// ---------- Modal ----------
const overlay = () => document.getElementById("modal");

export function openModal(title, html, { wide = false } = {}) {
  const m = overlay();
  m.querySelector(".modal-title").textContent = title;
  const body = m.querySelector(".modal-body");
  body.innerHTML = html;
  m.querySelector(".modal").classList.toggle("wide", wide);
  m.hidden = false;
  document.body.classList.add("no-scroll");
  body.scrollTop = 0;
  return body;
}

export function closeModal() {
  overlay().hidden = true;
  document.body.classList.remove("no-scroll");
}

export function confirmar(msg, okLabel = "Eliminar") {
  return new Promise((resolve) => {
    const d = document.getElementById("confirm");
    d.querySelector(".confirm-msg").textContent = msg;
    const ok = d.querySelector("[data-ok]");
    const no = d.querySelector("[data-no]");
    ok.textContent = okLabel;
    d.hidden = false;
    const done = (v) => { d.hidden = true; ok.onclick = no.onclick = null; resolve(v); };
    ok.onclick = () => done(true);
    no.onclick = () => done(false);
  });
}

// ---------- WhatsApp ----------
export function waLink(telefono, texto) {
  let t = String(telefono || "").replace(/\D/g, "");
  if (t.length === 10) t = "52" + t; // número mexicano sin lada de país
  return `https://wa.me/${t}?text=${encodeURIComponent(texto)}`;
}

export function emptyState(icon, text) {
  return `<div class="empty"><div class="empty-icon">${icon}</div><p>${esc(text)}</p></div>`;
}

// ---------- Descargar archivo ----------
export function descargar(nombre, contenido, tipo = "application/json") {
  const blob = new Blob([contenido], { type: tipo });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
