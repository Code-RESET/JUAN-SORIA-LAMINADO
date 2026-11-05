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
import { reportarError } from "./errores.js";

export const COLLECTIONS = ["clientes", "ordenes", "cotizaciones", "gastos", "servicios", "ajustes"];
const LS_PREFIX = "jsl_";

const cache = {};
const listeners = new Set();
let fb = null;
let uid = null;
let unsubs = [];
let cargaFallida = false;

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function emit(col) {
  listeners.forEach((fn) => { try { fn(col); } catch (e) { reportarError("vista", e); } });
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Datos separados POR USUARIO también en modo demo: jsl_<uid>_<col>
const lsKey = (col) => `${LS_PREFIX}${uid}_${col}`;

function lsRead(col) {
  try { return JSON.parse(localStorage.getItem(lsKey(col)) || "[]"); }
  catch (e) { reportarError("leer " + col, e); return []; }
}

function lsWrite(col) {
  try {
    localStorage.setItem(lsKey(col), JSON.stringify(cache[col]));
  } catch (e) {
    reportarError("guardar " + col, e);
    alert("No se pudo guardar en el dispositivo (almacenamiento lleno). Haz un respaldo JSON desde Ajustes.");
  }
}

export async function initStore(user) {
  stopStore();
  COLLECTIONS.forEach((c) => (cache[c] = []));
  uid = user.uid;
  cargaFallida = false;

  if (DEMO_MODE) {
    COLLECTIONS.forEach((c) => (cache[c] = lsRead(c)));
    seedIfEmpty();
    return;
  }

  fb = await getFirebase();
  const { collection, onSnapshot } = fb.fsMod;
  // Primera carga: esperamos a que cada colección responda una vez
  // (desde la cache offline si no hay red) antes de pintar la app.
  await Promise.all(COLLECTIONS.map((col) => new Promise((resolve) => {
    let first = true;
    const unsub = onSnapshot(collection(fb.db, "usuarios", uid, col), (snap) => {
      cache[col] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      if (first) { first = false; resolve(); } else emit(col);
    }, (err) => {
      // Antes este error solo iba a la consola y la app se veía "vacía".
      cargaFallida = true;
      reportarError(`leer ${col} (Firestore)`, err);
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
    setDoc(doc(fb.db, "usuarios", uid, col, id), data).catch((e) => reportarError(`guardar ${col}`, e));
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
    deleteDoc(doc(fb.db, "usuarios", uid, col, id)).catch((e) => reportarError(`eliminar ${col}`, e));
  }
  emit(col);
}

// ---------- Ajustes del negocio (un solo documento) ----------
const DEFAULT_AJUSTES = {
  id: "config",
  negocio: "Juan Soria · Pisos y Decoración",
  telefono: "",
  direccion: "",
  ivaPct: 16,
  garantia: "Garantía de 1 año en mano de obra de instalación. El material cuenta con la garantía del fabricante.",
  condiciones: "50% de anticipo para pedir el material, resto al terminar la instalación. Medidas sujetas a verificación en obra.",
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
  // Si la carga falló (ej. permisos) NO sembramos: escribiría encima de datos que no pudimos leer.
  if (cargaFallida || all("servicios").length || localStorage.getItem(lsKey("seeded_pisos"))) return;
  // Precios de ejemplo (por unidad); Juan los ajusta en Ajustes → Catálogo.
  const base = [
    ["Piso laminado 8 mm", "m2", 320, 210],
    ["Piso laminado 12 mm", "m2", 420, 290],
    ["Piso SPC 5 mm (click)", "m2", 480, 330],
    ["Piso vinílico PVC autoadherible", "m2", 260, 160],
    ["Bajo piso / espuma", "m2", 35, 18],
    ["Instalación de piso", "m2", 120, 0],
    ["Zoclo PVC", "ml", 95, 45],
    ["Perfil de transición / remate", "pza", 180, 90],
    ["Persiana enrollable blackout", "m2", 950, 520],
    ["Persiana enrollable screen", "m2", 1050, 580],
    ["Persiana sheer elegance", "m2", 1250, 700],
    ["Instalación de persiana", "pza", 250, 0],
    ["Panel decorativo WPC / ranurado", "pza", 650, 380],
    ["Papel tapiz (incluye instalación)", "m2", 380, 190],
    ["Retiro de piso existente", "m2", 60, 0]
  ];
  base.forEach(([nombre, unidad, precio, costo]) => save("servicios", { nombre, unidad, precio, costo }));
  try { localStorage.setItem(lsKey("seeded_pisos"), "1"); } catch {}
}
