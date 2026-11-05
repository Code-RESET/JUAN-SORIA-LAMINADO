// ============================================================
// errores.js
// Sistema VISIBLE de errores silenciosos.
// Por qué: los bugs más caros de proyectos anteriores fueron
// errores que nadie vio (un catch que se tragaba el error, un
// listener de Firestore con permission-denied, una función que
// lanzaba ReferenceError dentro de un try). Aquí todo error:
//   1) se guarda en una bitácora local (últimos 50),
//   2) enciende un indicador rojo "⚠ N" en la barra superior,
//   3) se puede ver, copiar y descargar desde Ajustes → Errores.
// Uso en cualquier módulo:  reportarError("contexto", err)
// ============================================================

const KEY = "jsl_errores";
const MAX = 50;
const subs = new Set();

function leer() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

function escribir(lista) {
  try { localStorage.setItem(KEY, JSON.stringify(lista.slice(-MAX))); } catch {}
}

export function listarErrores() {
  return leer().slice().reverse();
}

export function limpiarErrores() {
  escribir([]);
  pintarIndicador();
  subs.forEach((fn) => fn());
}

export function onErrores(fn) { subs.add(fn); return () => subs.delete(fn); }

export function reportarError(contexto, err) {
  const e = err instanceof Error ? err : new Error(String(err?.message || err));
  const item = {
    fecha: new Date().toISOString(),
    contexto: String(contexto || "app"),
    mensaje: e.message || String(err),
    codigo: err?.code || "",
    stack: (e.stack || "").split("\n").slice(0, 4).join("\n"),
    ruta: location.hash,
    visto: false
  };
  console.error(`[${item.contexto}]`, err);
  const lista = leer();
  // Evita llenar la bitácora con el mismo error repetido en bucle.
  const ult = lista[lista.length - 1];
  if (ult && ult.mensaje === item.mensaje && ult.contexto === item.contexto && Date.now() - new Date(ult.fecha) < 3000) return;
  lista.push(item);
  escribir(lista);
  pintarIndicador();
  subs.forEach((fn) => fn());
  if (err?.code === "permission-denied") {
    aviso("Sin permiso para leer/guardar datos (reglas de Firestore). Revisa Ajustes → Errores.");
  }
}

export function marcarVistos() {
  escribir(leer().map((x) => ({ ...x, visto: true })));
  pintarIndicador();
}

function pintarIndicador() {
  const el = document.getElementById("err-badge");
  if (!el) return;
  const n = leer().filter((x) => !x.visto).length;
  el.hidden = n === 0;
  el.textContent = `⚠ ${n}`;
}

function aviso(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show", "toast-error");
  setTimeout(() => t.classList.remove("show", "toast-error"), 5000);
}

// Captura global: cualquier error no atrapado o promesa rechazada.
window.addEventListener("error", (ev) => {
  // Errores de carga de recursos (img/script) no traen ev.error.
  reportarError("global", ev.error || new Error(`${ev.message || "Error de recurso"} ${ev.filename || ev.target?.src || ""}`));
});
window.addEventListener("unhandledrejection", (ev) => reportarError("promesa", ev.reason));

document.addEventListener("DOMContentLoaded", pintarIndicador);
pintarIndicador();
