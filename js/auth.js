// ============================================================
// auth.js
// Login / logout y cambio de pantalla login <-> app.
//  - Con Firebase configurado: Firebase Auth (correo + contraseña).
//  - En MODO DEMO: acceso local con las credenciales de prueba
//    (DEMO_USER), la sesión queda recordada en el dispositivo.
// No mezclar lógica de negocio aquí: solo autenticación.
// ============================================================

import { DEMO_MODE, ENTORNO, getFirebase } from "./firebase-config.js";
import { reportarError } from "./errores.js";
import { initRouter } from "./router.js";
import { initStore, stopStore } from "./store.js";
import { initDocumento } from "./documento.js";
import { closeModal } from "./ui.js";
import { marcaEnLogin } from "./marca.js";

const DEMO_USER = { email: "demo@example.com", password: "demo2026" };
const SESSION_KEY = "jsl_demo_session";

const loginScreen = document.getElementById("login-screen");
const appShell = document.getElementById("app-shell");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginBtn = document.getElementById("login-btn");
const emailIn = document.getElementById("login-email");
const passIn = document.getElementById("login-password");

function showError(msg) { loginError.textContent = msg; loginError.hidden = false; }
function clearError() { loginError.hidden = true; loginError.textContent = ""; }

async function entrar(user) {
  document.getElementById("user-email").textContent = user.email || "";
  loginScreen.hidden = true;
  appShell.hidden = false;
  document.getElementById("loading").hidden = false;
  try {
    await initStore(user);
  } catch (e) {
    reportarError("cargar datos", e);
  } finally {
    document.getElementById("loading").hidden = true;
  }
  initRouter(user);
}

function salir() {
  stopStore();
  closeModal();
  appShell.hidden = true;
  loginScreen.hidden = false;
}

initDocumento();
marcaEnLogin();
document.getElementById("env-banner").hidden = ENTORNO !== "prueba";

// Menú lateral en teléfono
document.getElementById("menu-btn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
document.getElementById("nav-backdrop").addEventListener("click", () => document.body.classList.remove("nav-open"));
document.querySelector("#modal [data-close]").addEventListener("click", closeModal);
document.getElementById("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

if (DEMO_MODE) {
  document.getElementById("demo-hint").hidden = false;
  emailIn.value = DEMO_USER.email;
  passIn.value = DEMO_USER.password;

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    if (emailIn.value.trim().toLowerCase() !== DEMO_USER.email || passIn.value !== DEMO_USER.password) {
      showError("Correo o contraseña incorrectos.");
      return;
    }
    const user = { uid: "demo", email: DEMO_USER.email };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch {}
    entrar(user);
  });

  document.getElementById("logout-btn").addEventListener("click", () => {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    salir();
  });

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch {}
  if (saved) entrar(saved); else loginScreen.hidden = false;
} else {
  const fb = await getFirebase();
  const { signInWithEmailAndPassword, signOut, onAuthStateChanged } = fb.authMod;

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    loginBtn.disabled = true;
    loginBtn.textContent = "Entrando...";
    try {
      await signInWithEmailAndPassword(fb.auth, emailIn.value.trim(), passIn.value);
    } catch (err) {
      showError(traducirErrorFirebase(err.code));
      if (!["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"].includes(err.code)) reportarError("login", err);
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "Entrar";
    }
  });

  document.getElementById("logout-btn").addEventListener("click", () => signOut(fb.auth));

  onAuthStateChanged(fb.auth, (user) => { if (user) entrar(user); else salir(); });
}

function traducirErrorFirebase(code) {
  const mapa = {
    "auth/invalid-email": "Correo inválido.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/user-not-found": "Ese usuario no existe.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
    "auth/network-request-failed": "Sin conexión a internet."
  };
  return mapa[code] || "No se pudo iniciar sesión. Intenta de nuevo.";
}
