// ============================================================
// router.js
// Router por hash (#/ruta/parametro), sin recargar la página.
// Para agregar una sección: crear js/modules/xxx.js con su
// render(container, user, param) y registrarla en MODULES.
// El menú lateral se arma solo a partir de este arreglo.
// ============================================================

import { renderDashboard } from "./modules/dashboard.js";
import { renderOrdenes } from "./modules/ordenes.js";
import { renderCotizaciones } from "./modules/cotizaciones.js";
import { renderClientes } from "./modules/clientes.js";
import { renderGastos } from "./modules/gastos.js";
import { renderAjustes } from "./modules/ajustes.js";
import { onChange } from "./store.js";
import { esc } from "./ui.js";
import { reportarError } from "./errores.js";

// group -> título de sección en el menú
const MODULES = [
  { path: "dashboard", label: "Inicio", icon: "📊", group: "PRINCIPAL", render: renderDashboard },
  { path: "ordenes", label: "Trabajos", icon: "🏠", group: "NEGOCIO", render: renderOrdenes },
  { path: "cotizaciones", label: "Cotizaciones", icon: "📄", group: "NEGOCIO", render: renderCotizaciones },
  { path: "clientes", label: "Clientes", icon: "👤", group: "NEGOCIO", render: renderClientes },
  { path: "gastos", label: "Gastos", icon: "🧰", group: "DINERO", render: renderGastos },
  { path: "ajustes", label: "Ajustes", icon: "⚙️", group: "CONFIG", render: renderAjustes }
];

const nav = document.getElementById("app-nav");
const tabbar = document.getElementById("tabbar");
const content = document.getElementById("app-content");

let currentUser = null;
let started = false;

function buildNav() {
  let lastGroup = "";
  nav.innerHTML = MODULES.map((m) => {
    const head = m.group !== lastGroup ? `<div class="nav-group">${esc(m.group)}</div>` : "";
    lastGroup = m.group;
    return `${head}<a href="#/${m.path}" data-path="${m.path}"><span class="nav-icon">${m.icon}</span>${esc(m.label)}</a>`;
  }).join("");

  // Barra inferior en teléfono: las 4 secciones de uso diario + "+".
  const tab = (p) => MODULES.find((m) => m.path === p);
  tabbar.innerHTML = ["dashboard", "ordenes"].map((p) => `<a href="#/${p}" data-path="${p}"><span>${tab(p).icon}</span>${tab(p).label}</a>`).join("")
    + `<a href="#/ordenes/nueva" class="tab-plus" aria-label="Nuevo trabajo"><span>＋</span></a>`
    + ["cotizaciones", "clientes"].map((p) => `<a href="#/${p}" data-path="${p}"><span>${tab(p).icon}</span>${p === "cotizaciones" ? "Cotizar" : tab(p).label}</a>`).join("");
}

function parseHash() {
  const [path, ...rest] = location.hash.replace(/^#\/?/, "").split("/");
  return { path: path || MODULES[0].path, param: rest.join("/") || null };
}

// Si hay un formulario de la página a medio escribir (ej. Ajustes),
// un cambio de datos NO repinta: se perdería lo escrito.
content.addEventListener("input", (e) => {
  const f = e.target.closest("form");
  if (f) f.setAttribute("data-dirty", "");
});

function renderRoute() {
  const { path, param } = parseHash();
  const mod = MODULES.find((m) => m.path === path) || MODULES[0];

  document.querySelectorAll("[data-path]").forEach((a) => a.classList.toggle("active", a.dataset.path === mod.path));
  document.body.classList.remove("nav-open");
  const keepScroll = !param && content.dataset.view === mod.path ? window.scrollY : 0;
  content.dataset.view = mod.path;
  content.innerHTML = "";
  try {
    mod.render(content, currentUser, param);
  } catch (e) {
    reportarError(`pantalla ${mod.path}`, e);
    content.innerHTML = `<p class="error-text">Error al mostrar la sección: ${esc(e.message)}</p>`;
  }
  window.scrollTo(0, keepScroll);
}

export function initRouter(user) {
  currentUser = user;
  buildNav();
  if (!started) {
    started = true;
    window.addEventListener("hashchange", renderRoute);
    // Cuando cambian los datos (otro dispositivo o un guardado) se
    // repinta la vista actual; los modales abiertos no se tocan.
    let t;
    onChange(() => {
      clearTimeout(t);
      t = setTimeout(() => { if (!content.querySelector("form[data-dirty]")) renderRoute(); }, 60);
    });
  }
  renderRoute();
}
