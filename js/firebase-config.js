// ============================================================
// firebase-config.js
// Credenciales de Firebase de ESTE cliente, embebidas en el código
// (no solo en localStorage: en HD Crédit se vio que localStorage se
// puede perder con actualizaciones del sistema del teléfono).
//
// MODO DEMO: mientras apiKey siga como "TU_API_KEY", la app corre en
// modo demo: login local y datos guardados en el propio dispositivo.
// Así se le puede mandar al cliente para que la pruebe sin crear aún
// el proyecto de Firebase. Al pegar aquí el firebaseConfig real, la
// app cambia sola a Firebase Auth + Firestore (sin tocar nada más).
// ============================================================

export const FIREBASE_CONFIG = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxx"
};

export const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.12.2";

export const DEMO_MODE = FIREBASE_CONFIG.apiKey === "TU_API_KEY";

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
    localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() })
  });
  _fb = { app, auth: authMod.getAuth(app), db, authMod, fsMod };
  return _fb;
}
