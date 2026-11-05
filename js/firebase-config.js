// ============================================================
// firebase-config.js
// DOS proyectos de Firebase, nunca uno solo:
//   - PRUEBA:     para desarrollar y probar (datos ficticios).
//   - PRODUCCION: el del cliente (datos reales).
// Por qué: probar contra la base real es como se rompen datos de
// clientes. La app elige sola el entorno:
//   - localhost / 127.0.0.1 / 192.168.x  -> PRUEBA
//   - cualquier URL con ?env=prueba       -> PRUEBA (se recuerda)
//   - ?env=produccion                     -> vuelve a PRODUCCION
//   - todo lo demás (GitHub Pages)        -> PRODUCCION
// En PRUEBA se muestra una franja amarilla "ENTORNO DE PRUEBA".
//
// MODO DEMO: si el proyecto del entorno elegido sigue con
// "TU_API_KEY", la app corre sin Firebase: login local y datos en
// el propio dispositivo. Así se puede mandar al cliente para que la
// pruebe antes de crear los proyectos. Credenciales embebidas en
// el código (no solo en localStorage) por lo visto en HD Crédit.
// ============================================================

const CONFIGS = {
  prueba: {
    apiKey: "TU_API_KEY",
    authDomain: "TU_PROYECTO_PRUEBA.firebaseapp.com",
    projectId: "TU_PROYECTO_PRUEBA",
    storageBucket: "TU_PROYECTO_PRUEBA.appspot.com",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:xxxxxxxxxxxxxxxx"
  },
  produccion: {
    apiKey: "TU_API_KEY",
    authDomain: "TU_PROYECTO.firebaseapp.com",
    projectId: "TU_PROYECTO",
    storageBucket: "TU_PROYECTO.appspot.com",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:xxxxxxxxxxxxxxxx"
  }
};

function elegirEntorno() {
  const q = new URLSearchParams(location.search).get("env");
  try {
    if (q === "prueba" || q === "produccion") localStorage.setItem("jsl_env", q);
    const guardado = localStorage.getItem("jsl_env");
    if (guardado === "prueba" || guardado === "produccion") return guardado;
  } catch {}
  const h = location.hostname;
  const local = h === "localhost" || h === "127.0.0.1" || h.startsWith("192.168.") || h.endsWith(".local");
  return local ? "prueba" : "produccion";
}

export const ENTORNO = elegirEntorno();
export const FIREBASE_CONFIG = CONFIGS[ENTORNO];
export const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.12.2";
export const DEMO_MODE = FIREBASE_CONFIG.apiKey === "TU_API_KEY";

// Candado: el entorno de prueba jamás debe apuntar al proyecto real.
if (!DEMO_MODE && CONFIGS.prueba.projectId === CONFIGS.produccion.projectId) {
  throw new Error("firebase-config: el proyecto de PRUEBA y el de PRODUCCIÓN son el mismo. Usa dos proyectos distintos.");
}

// Pide al navegador no borrar los datos en bajo almacenamiento
// (importante en modo demo, donde todo vive en el teléfono).
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

// Firebase se carga bajo demanda: en modo demo nunca se descarga.
let _fb = null;
export async function getFirebase() {
  if (DEMO_MODE) return null;
  if (_fb) return _fb;
  const [{ initializeApp }, authMod, fsMod] = await Promise.all([
    import(`${FIREBASE_SDK}/firebase-app.js`),
    import(`${FIREBASE_SDK}/firebase-auth.js`),
    import(`${FIREBASE_SDK}/firebase-firestore.js`)
  ]);
  const app = initializeApp(FIREBASE_CONFIG);
  const db = fsMod.initializeFirestore(app, {
    ignoreUndefinedProperties: true, // un campo undefined no debe tumbar un guardado
    localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() })
  });
  _fb = { app, auth: authMod.getAuth(app), db, authMod, fsMod };
  return _fb;
}
