// ============================================================
// marca.js
// La identidad del CLIENTE dentro de la app: su nombre y su logo.
// El logo se reduce en el teléfono (máx. 400 px) y se guarda como
// imagen dentro de ajustes: pesa poco, sale en el PDF y funciona
// sin internet. Se copia a localStorage para mostrarlo también en
// la pantalla de login (que aparece antes de cargar los datos).
// ============================================================

import * as store from "./store.js";
import { reportarError } from "./errores.js";

const LOGO_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const CACHE_KEY = "jsl_marca";

export function logoValido(v) {
  return typeof v === "string" && v.length < 900000 && LOGO_RE.test(v);
}

// Lee un archivo de imagen, lo reduce y devuelve un dataURL.
export function procesarLogo(file, max = 400) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("Elige una imagen (JPG o PNG)."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      // PNG conserva transparencia; si pesa mucho, JPEG con fondo blanco.
      let out = c.toDataURL("image/png");
      if (out.length > 250000) {
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        out = c.toDataURL("image/jpeg", 0.85);
      }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen.")); };
    img.src = url;
  });
}

// Pinta nombre y logo del negocio en la cabecera, el menú y el login.
export function aplicarMarca() {
  const a = store.ajustes();
  const nombre = a.negocio || "Mi negocio";
  const logo = logoValido(a.logo) ? a.logo : "";
  document.querySelectorAll("[data-marca-nombre]").forEach((el) => (el.textContent = nombre));
  document.querySelectorAll("img[data-marca-logo]").forEach((img) => {
    img.hidden = !logo;
    if (logo) img.src = logo; else img.removeAttribute("src");
  });
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ nombre, logo })); }
  catch (e) { reportarError("guardar logo para el login", e); }
}

// Login: usa la última marca vista en este teléfono (si hay).
export function marcaEnLogin() {
  let m = null;
  try { m = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch {}
  if (!m) return;
  const t = document.querySelector(".login-title");
  if (t && m.nombre) t.textContent = m.nombre;
  const img = document.getElementById("login-logo-cliente");
  if (img && logoValido(m.logo)) { img.src = m.logo; img.hidden = false; }
}
