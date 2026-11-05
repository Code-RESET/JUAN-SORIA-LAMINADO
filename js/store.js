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
// Colecciones cuya lectura falló. Mientras haya alguna, no se
// generan folios ni se siembra el catálogo (se quitan al reconectar).
const fallidas = new Set();
// Colecciones clave que llegaron vacías SOLO desde la cache (sin
// confirmar con el servidor). Se quitan al confirmar.
const sinConfirmar = new Set();
const confirmadas = new Set(); // ya vistas desde el servidor al menos una vez

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
  fallidas.clear();
  sinConfirmar.clear();
  confirmadas.clear();

  if (DEMO_MODE) {
    COLLECTIONS.forEach((c) => (cache[c] = lsRead(c)));
    seedIfEmpty();
    return;
  }

  fb = await getFirebase();
  const { collection, onSnapshot } = fb.fsMod;
  // Primera carga: esperamos a que cada colección responda una vez
  // (desde la cache offline si no hay red) antes de pintar la app.
  const sesion = uid;
  await Promise.all(COLLECTIONS.map((col) => new Promise((resolve) => {
    let first = true;
    let espera = 2000;
    // onSnapshot se apaga tras un error: lo volvemos a suscribir con
    // espera creciente (2s, 4s... máx 60s) para que no quede congelado.
    const suscribir = () => {
      // includeMetadataChanges: sin esto, si el servidor confirma una
      // colección VACÍA no llega ningún evento y nunca sabríamos que ya
      // está confirmada (bloqueaba los folios para siempre).
      const unsub = onSnapshot(collection(fb.db, "usuarios", uid, col), { includeMetadataChanges: true }, (snap) => {
        espera = 2000;
        fallidas.delete(col);
        const clave = col === "servicios" || col === "ajustes";
        // Dispositivo nuevo sin señal: la cache local llega vacía. No es
        // "no hay datos", es "aún no sabemos": no sembrar ni numerar.
        // Perder la señal después NO vuelve a marcarla: ya se confirmó.
        if (!snap.metadata.fromCache) { confirmadas.add(col); sinConfirmar.delete(col); }
        else if (clave && snap.empty && !confirmadas.has(col)) sinConfirmar.add(col);
        const soloMetadatos = !first && snap.docChanges().length === 0;
        cache[col] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        if (first) { first = false; resolve(); return; }
        if (!soloMetadatos) emit(col);
        if (clave) seedIfEmpty();
      }, (err) => {
        // Antes este error solo iba a la consola y la app se veía "vacía".
        fallidas.add(col);
        reportarError(`leer ${col} (Firestore)`, err);
        if (first) { first = false; resolve(); }
        if (err?.code !== "permission-denied") {
          setTimeout(() => { if (uid === sesion && unsubs.length) suscribir(); }, espera);
          espera = Math.min(espera * 2, 60000);
        }
      });
      unsubs.push(unsub);
    };
    suscribir();
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

export async function save(col, obj, { conservarFecha = false } = {}) {
  const item = { ...obj };
  const isNew = !item.id;
  if (isNew) { item.id = newId(); item.creado = Date.now(); }
  if (!conservarFecha || !item.actualizado) item.actualizado = Date.now();

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
    // ajustes se fusiona (merge) para que dos dispositivos no se pisen campos distintos.
    try {
      setDoc(doc(fb.db, "usuarios", uid, col, id), data, col === "ajustes" ? { merge: true } : {}).catch((e) => reportarError(`guardar ${col}`, e));
    } catch (e) {
      // setDoc puede fallar ANTES de devolver la promesa (dato inválido): también se reporta.
      reportarError(`guardar ${col}`, e);
    }
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
// El contador vive en ajustes/config y NUNCA baja: si se borra el
// trabajo #7, el siguiente es #8 (el #7 ya pudo entregarse impreso).
// Nota: con Firebase y dos dispositivos SIN señal al mismo tiempo
// aún podría repetirse un folio; para eso haría falta una
// transacción en línea (pendiente si usan varios dispositivos).
export function siguienteFolio(col) {
  const max = all(col).reduce((m, x) => Math.max(m, Number(x.folio) || 0), 0);
  return Math.max(max, Number(ajustes().folios?.[col]) || 0) + 1;
}

export async function reservarFolio(col) {
  if (fallidas.size) throw new Error("No se pudieron leer los datos; no se generan folios para no repetirlos. Revisa la conexión.");
  if (sinConfirmar.has("ajustes")) throw new Error("Primera vez en este dispositivo y sin internet: conéctate un momento para sincronizar los folios.");
  const folio = siguienteFolio(col);
  const a = ajustes();
  await save("ajustes", { ...a, folios: { ...(a.folios || {}), [col]: folio } });
  return folio;
}

// ---------- Respaldo / restauración ----------
export function exportarTodo() {
  const data = { app: "juan-soria-laminado", version: 1, fecha: new Date().toISOString() };
  COLLECTIONS.forEach((c) => (data[c] = all(c)));
  return data;
}

// Valida lo que viene de un archivo (puede estar manipulado) y NO
// pisa registros que hoy son más nuevos que los del respaldo.
const ESTADOS_VALIDOS = {
  ordenes: ["MEDICION", "MATERIAL", "INSTALACION", "TERMINADO"],
  cotizaciones: ["ABIERTA", "ACEPTADA", "RECHAZADA"]
};
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function limpiarImportado(col, item) {
  if (!item || typeof item !== "object" || !/^[\w-]{1,40}$/.test(String(item.id || ""))) return null;
  const x = { ...item };
  if ("folio" in x) x.folio = Number.parseInt(x.folio, 10) || 0;
  if (ESTADOS_VALIDOS[col] && !ESTADOS_VALIDOS[col].includes(x.estado)) x.estado = ESTADOS_VALIDOS[col][0];
  for (const k of ["fecha", "fechaIngreso", "fechaInstalacion", "fechaTerminado"]) {
    if (k in x && x[k] && !FECHA_RE.test(String(x[k]))) x[k] = "";
  }
  if (Array.isArray(x.pagos)) x.pagos = x.pagos.map((p) => ({ ...p, monto: Number(p?.monto) || 0, metodo: String(p?.metodo ?? ""), fecha: FECHA_RE.test(String(p?.fecha)) ? p.fecha : "" }));
  else if ("pagos" in x) x.pagos = [];
  if (Array.isArray(x.servicios)) x.servicios = x.servicios.map((l) => ({ ...l, descripcion: String(l?.descripcion ?? ""), cantidad: Number(l?.cantidad) || 1, precio: Number(l?.precio) || 0, costo: Number(l?.costo) || 0 })).map((l) => {
    // cajas: solo enteros > 0; si no, se quita (Firestore rechaza `undefined`).
    const n = Number.parseInt(l.cajas, 10);
    if (n > 0) l.cajas = n; else delete l.cajas;
    return l;
  });
  else if ("servicios" in x) x.servicios = [];
  if ("m2Caja" in x) x.m2Caja = Number(x.m2Caja) > 0 ? Number(x.m2Caja) : "";
  for (const k of ["ivaPct", "vigenciaDias", "monto", "precio", "costo", "descuento"]) if (k in x) x[k] = Number(x[k]) || 0;
  for (const k of ["nombre", "clienteNombre", "telefono", "concepto", "categoria", "negocio"]) if (k in x) x[k] = String(x[k] ?? "");
  if ((col === "clientes" || col === "servicios") && !String(x.nombre ?? "").trim()) return null;
  if (col === "ajustes" && x.id !== "config") return null;
  return x;
}

export async function importarTodo(data) {
  const res = { nuevos: 0, actualizados: 0, omitidos: 0 };

  // Ajustes: si aquí nunca se editaron (dispositivo nuevo), se toman los
  // del respaldo aunque sean "más viejos". Los folios toman el MAYOR.
  for (const col of COLLECTIONS) {
    if (col in data && !Array.isArray(data[col])) throw new Error(`El respaldo está dañado: "${col}" no es una lista.`);
  }
  const ajR = limpiarImportado("ajustes", (data.ajustes || []).find((x) => x?.id === "config"));
  if (ajR) {
    const act = ajustes();
    const folios = {};
    for (const k of new Set([...Object.keys(act.folios || {}), ...Object.keys(ajR.folios || {})])) {
      folios[k] = Math.max(Number(act.folios?.[k]) || 0, Number(ajR.folios?.[k]) || 0);
    }
    const base = !act.editado || (Number(ajR.actualizado) || 0) > (Number(act.actualizado) || 0) ? { ...act, ...ajR } : act;
    await save("ajustes", { ...base, id: "config", folios, catalogoSembrado: true });
    res.actualizados++;
  }

  // Catálogo: si el actual es solo el de fábrica y el respaldo trae uno, se reemplaza.
  // Solo si el respaldo trae al menos un servicio VÁLIDO (si no, la app quedaría sin catálogo).
  const servR = (data.servicios || []).map((s) => limpiarImportado("servicios", s)).filter(Boolean);
  if (servR.length && all("servicios").every((s) => s.semilla)) {
    for (const s of [...all("servicios")]) await remove("servicios", s.id);
  }

  for (const col of COLLECTIONS) {
    if (col === "ajustes") continue;
    if (!Array.isArray(data[col])) continue;
    for (const raw of data[col]) {
      const item = limpiarImportado(col, raw);
      if (!item) { res.omitidos++; continue; }
      const actual = get(col, item.id);
      if (actual && (Number(actual.actualizado) || 0) >= (Number(item.actualizado) || 0)) { res.omitidos++; continue; }
      await save(col, item, { conservarFecha: true });
      actual ? res.actualizados++ : res.nuevos++;
    }
  }
  return res;
}

// ---------- Catálogo inicial (solo la primera vez) ----------
function seedIfEmpty() {
  // Si la carga falló (ej. permisos) NO sembramos: escribiría encima de datos que no pudimos leer.
  // La marca vive en ajustes/config (compartida entre dispositivos), no en el teléfono.
  if (fallidas.size || sinConfirmar.size || all("servicios").length || ajustes().catalogoSembrado) return;
  // Precios y m² por caja de EJEMPLO; Juan los ajusta en Ajustes → Catálogo.
  const base = [
    ["Piso laminado 8 mm", "m2", 320, 210, 2.13],
    ["Piso laminado 12 mm", "m2", 420, 290, 1.48],
    ["Piso SPC 5 mm (click)", "m2", 480, 330, 2.23],
    ["Piso vinílico PVC autoadherible", "m2", 260, 160, 5.02],
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
  save("ajustes", { ...ajustes(), catalogoSembrado: true });
  // semilla:true = catálogo de fábrica; se reemplaza si se restaura un respaldo.
  base.forEach(([nombre, unidad, precio, costo, m2Caja]) => save("servicios", { nombre, unidad, precio, costo, m2Caja: m2Caja || "", semilla: true }));
}
