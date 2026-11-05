// ============================================================
// store.js
// Capa de datos única para toda la app. Los módulos NUNCA hablan
// directo con Firestore ni con localStorage: usan store.all(),
// store.get(), store.save(), store.remove().
//
// Por qué: así la misma app corre en modo demo (localStorage del
// dispositivo) o con Firebase (Firestore en tiempo real) sin que
// ningún módulo cambie. Todo se mantiene en memoria (cache) y se
// avisa a la vista con onChange() cuando algo cambia.
//
// Firestore: usuarios/{uid}/{coleccion}/{id}  (ver firestore.rules)
// ============================================================

import { DEMO_MODE, getFirebase } from "./firebase-config.js";

export const COLLECTIONS = ["clientes", "ordenes", "cotizaciones", "gastos", "servicios", "ajustes"];
const LS_PREFIX = "jsl_";

const cache = {};
const listeners = new Set();
let fb = null;
let uid = null;
let unsubs = [];

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function emit(col) {
  listeners.forEach((fn) => { try { fn(col); } catch (e) { console.error(e); } });
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function lsRead(col) {
  try { return JSON.parse(localStorage.getItem(LS_PREFIX + col) || "[]"); }
  catch { return []; }
}

function lsWrite(col) {
  try {
    localStorage.setItem(LS_PREFIX + col, JSON.stringify(cache[col]));
  } catch (e) {
    console.error(e);
    alert("No se pudo guardar en el dispositivo (almacenamiento lleno). Haz un respaldo JSON desde Ajustes.");
  }
}

export async function initStore(user) {
  stopStore();
  COLLECTIONS.forEach((c) => (cache[c] = []));

  if (DEMO_MODE) {
    COLLECTIONS.forEach((c) => (cache[c] = lsRead(c)));
    seedIfEmpty();
    return;
  }

  fb = await getFirebase();
  uid = user.uid;
  const { collection, onSnapshot } = fb.fsMod;
  // Primera carga: esperamos a que cada colección responda una vez
  // (desde la cache offline si no hay red) antes de pintar la app.
  await Promise.all(COLLECTIONS.map((col) => new Promise((resolve) => {
    let first = true;
    const unsub = onSnapshot(collection(fb.db, "usuarios", uid, col), (snap) => {
      cache[col] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      if (first) { first = false; resolve(); } else emit(col);
    }, (err) => {
      console.error(col, err);
      if (first) { first = false; resolve(); }
    });
    unsubs.push(unsub);
  })));
  seedIfEmpty();
}

export function stopStore() {
  unsubs.forEach((u) => u());
  unsubs = [];
}

export function all(col) {
  return cache[col] || [];
}

export function get(col, id) {
  return all(col).find((x) => x.id === id) || null;
}

export async function save(col, obj) {
  const item = { ...obj };
  const isNew = !item.id;
  if (isNew) { item.id = newId(); item.creado = Date.now(); }
  item.actualizado = Date.now();

  const list = cache[col] || (cache[col] = []);
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) list[idx] = item; else list.push(item);

  if (DEMO_MODE) {
    lsWrite(col);
  } else {
    const { doc, setDoc } = fb.fsMod;
    const { id, ...data } = item;
    // Sin await del servidor: con la cache offline la escritura queda
    // en cola y se sube sola al volver la señal.
    setDoc(doc(fb.db, "usuarios", uid, col, id), data).catch((e) => {
      console.error(e);
      alert("Error al guardar en la nube: " + e.message);
    });
  }
  emit(col);
  return item;
}

export async function remove(col, id) {
  cache[col] = all(col).filter((x) => x.id !== id);
  if (DEMO_MODE) {
    lsWrite(col);
  } else {
    const { doc, deleteDoc } = fb.fsMod;
    deleteDoc(doc(fb.db, "usuarios", uid, col, id)).catch((e) => console.error(e));
  }
  emit(col);
}

// ---------- Ajustes del negocio (un solo documento) ----------
const DEFAULT_AJUSTES = {
  id: "config",
  negocio: "Juan Soria · Laminado y Pintura",
  telefono: "",
  direccion: "",
  ivaPct: 16,
  garantia: "Garantía de 6 meses en mano de obra y pintura.",
  condiciones: "50% de anticipo para iniciar el trabajo, resto contra entrega.",
  vigenciaDias: 15
};

export function ajustes() {
  return { ...DEFAULT_AJUSTES, ...(get("ajustes", "config") || {}) };
}

// ---------- Folios consecutivos ----------
export function siguienteFolio(col) {
  const max = all(col).reduce((m, x) => Math.max(m, Number(x.folio) || 0), 0);
  return max + 1;
}

// ---------- Respaldo / restauración ----------
export function exportarTodo() {
  const data = { app: "juan-soria-laminado", version: 1, fecha: new Date().toISOString() };
  COLLECTIONS.forEach((c) => (data[c] = all(c)));
  return data;
}

export async function importarTodo(data) {
  for (const col of COLLECTIONS) {
    if (!Array.isArray(data[col])) continue;
    for (const item of data[col]) {
      if (item && item.id) await save(col, item);
    }
  }
}

// ---------- Catálogo inicial (solo la primera vez) ----------
function seedIfEmpty() {
  if (all("servicios").length || localStorage.getItem(LS_PREFIX + "seeded")) return;
  const base = [
    ["Laminado de puerta", 1800, 300],
    ["Laminado de cofre", 2200, 350],
    ["Laminado de defensa", 1500, 250],
    ["Laminado de salpicadera", 1600, 250],
    ["Pintura por pieza", 1800, 600],
    ["Pintura completa", 18000, 6000],
    ["Pulido y encerado", 900, 150],
    ["Reparación de rayón", 700, 120],
    ["Desabollado sin pintura (PDR)", 800, 0],
    ["Cambio de pieza (mano de obra)", 600, 0]
  ];
  base.forEach(([nombre, precio, costo]) => save("servicios", { nombre, precio, costo }));
  try { localStorage.setItem(LS_PREFIX + "seeded", "1"); } catch {}
}
