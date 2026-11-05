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
import { renderBienvenida, onboardingPendiente } from "./modules/bienvenida.js";
import { onChange } from "./store.js";
import { esc, waLink } from "./ui.js";
import { reportarError } from "./errores.js";
import { planActivo, desbloqueado, PAQUETE_COMPLETO, CONTACTO } from "./plan.js";
import { aplicarMarca } from "./marca.js";

// group -> título de sección en el menú.
// Las secciones del paquete completo (plan.js) se ven con 🔒 en el
// plan "cotizador": muestran qué hacen, sin pedirle al cliente que las use.
const MODULES = [
  { path: "cotizaciones", label: "Cotizaciones", icon: "📄", group: "COTIZAR", render: renderCotizaciones },
  { path: "dashboard", label: "Inicio", icon: "📊", group: "NEGOCIO", render: renderDashboard },
  { path: "ordenes", label: "Trabajos", icon: "🏠", group: "NEGOCIO", render: renderOrdenes },
  { path: "clientes", label: "Clientes", icon: "👤", group: "NEGOCIO", render: renderClientes },
  { path: "gastos", label: "Gastos", icon: "🧰", group: "NEGOCIO", render: renderGastos },
  { path: "ajustes", label: "Mi negocio", icon: "⚙️", group: "CONFIG", render: renderAjustes }
];
const OCULTOS = [{ path: "bienvenida", render: renderBienvenida }]; // rutas sin entrada en el menú

const nav = document.getElementById("app-nav");
const tabbar = document.getElementById("tabbar");
const content = document.getElementById("app-content");

let currentUser = null;
let started = false;

const inicio = () => (planActivo() === "completo" ? "dashboard" : "cotizaciones");

function buildNav() {
  let lastGroup = "";
  const completo = planActivo() === "completo";
  const orden = completo ? ["dashboard", "ordenes", "cotizaciones", "clientes", "gastos", "ajustes"] : MODULES.map((m) => m.path);
  nav.innerHTML = orden.map((p) => MODULES.find((m) => m.path === p)).map((m) => {
    const grupo = completo ? (m.path === "ajustes" ? "CONFIG" : "NEGOCIO") : m.group;
    const head = grupo !== lastGroup ? `<div class="nav-group">${esc(grupo)}${!completo && grupo === "NEGOCIO" ? ` <span class="nav-pro">PAQUETE COMPLETO</span>` : ""}</div>` : "";
    lastGroup = grupo;
    const candado = desbloqueado(m.path) ? "" : `<span class="nav-lock" title="Paquete completo">🔒</span>`;
    return `${head}<a href="#/${m.path}" data-path="${m.path}" class="${candado ? "locked" : ""}"><span class="nav-icon">${m.icon}</span>${esc(m.label)}${candado}</a>`;
  }).join("");

  // Barra inferior en teléfono.
  const tab = (p, label) => { const m = MODULES.find((x) => x.path === p); return `<a href="#/${p}" data-path="${p}"><span>${m.icon}</span>${label || m.label}</a>`; };
  if (completo) {
    tabbar.className = "tabbar";
    tabbar.innerHTML = tab("dashboard") + tab("ordenes")
      + `<a href="#/ordenes/nueva" class="tab-plus" aria-label="Nuevo trabajo"><span>＋</span></a>`
      + tab("cotizaciones", "Cotizar") + tab("clientes");
  } else {
    tabbar.className = "tabbar tabbar-3";
    tabbar.innerHTML = tab("cotizaciones", "Cotizaciones")
      + `<a href="#/cotizaciones/nueva" class="tab-plus" aria-label="Nueva cotización"><span>＋</span></a>`
      + tab("ajustes", "Mi negocio");
  }
}

// Pantalla de una sección bloqueada: qué hace, sin presionar.
function renderBloqueado(container, path) {
  const info = PAQUETE_COMPLETO[path];
  const msg = `Hola ${CONTACTO.nombre}, me interesa activar "${info.titulo.split(":")[0]}" en mi app.`;
  container.innerHTML = `
    <div class="bloqueado">
      <div class="bloq-icon">🔒</div>
      <h2>${esc(info.titulo)}</h2>
      <p class="muted">Viene en el paquete completo. Tu cotizador sigue funcionando igual: esto es solo para que veas lo que sigue.</p>
      <ul class="bloq-lista">${info.puntos.map((t) => `<li>✓ ${esc(t)}</li>`).join("")}</ul>
      ${CONTACTO.whatsapp
        ? `<a class="btn btn-ghost" target="_blank" rel="noopener" href="${waLink(CONTACTO.whatsapp, msg)}">💬 Me interesa</a>`
        : `<p class="small muted">¿Te interesa? Avísale a ${esc(CONTACTO.nombre)}.</p>`}
      <a class="btn btn-primary" href="#/cotizaciones">Volver a cotizar</a>
    </div>`;
}

function parseHash() {
  const [path, ...rest] = location.hash.replace(/^#\/?/, "").split("/");
  return { path: path || inicio(), param: rest.join("/") || null };
}

// Formularios de la página a medio escribir (ej. Ajustes): al repintar
// por un cambio de datos se conserva lo escrito (por id de form + name).
content.addEventListener("input", (e) => {
  const f = e.target.closest("form");
  if (f) f.setAttribute("data-dirty", "");
});

function renderRoute() {
  let { path, param } = parseHash();
  // Primera vez: configurar negocio y precios antes de cotizar.
  if (onboardingPendiente() && path !== "bienvenida" && path !== "ajustes") {
    history.replaceState(null, "", "#/bienvenida");
    path = "bienvenida"; param = null;
  }
  if (path === "bienvenida" && !onboardingPendiente()) {
    history.replaceState(null, "", "#/" + inicio());
    path = inicio(); param = null;
  }
  const mod = MODULES.find((m) => m.path === path) || OCULTOS.find((m) => m.path === path) || MODULES.find((m) => m.path === inicio());

  document.querySelectorAll("[data-path]").forEach((a) => a.classList.toggle("active", a.dataset.path === mod.path));
  document.body.classList.remove("nav-open");
  document.body.classList.toggle("en-bienvenida", mod.path === "bienvenida");
  const keepScroll = !param && content.dataset.view === mod.path ? window.scrollY : 0;
  content.dataset.view = mod.path;
  content.innerHTML = "";
  try {
    if (!desbloqueado(mod.path)) renderBloqueado(content, mod.path);
    else mod.render(content, currentUser, param);
  } catch (e) {
    reportarError(`pantalla ${mod.path}`, e);
    content.innerHTML = `<p class="error-text">Error al mostrar la sección: ${esc(e.message)}</p>`;
  }
  window.scrollTo(0, keepScroll);
}

export function initRouter(user) {
  currentUser = user;
  buildNav();
  aplicarMarca();
  if (!started) {
    started = true;
    window.addEventListener("hashchange", renderRoute);
    // Cuando cambian los datos (otro dispositivo o un guardado) se
    // repinta la vista actual; los modales abiertos no se tocan.
    let t;
    onChange(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        const guardado = [...content.querySelectorAll("form[data-dirty][id]")].map((f) => [f.id,
          [...f.elements].filter((el) => el.name).map((el) => [el.name, el.type === "checkbox" ? el.checked : el.value])]);
        const activo = document.activeElement?.closest("#app-content form[id]") ? [document.activeElement.form?.id, document.activeElement.name] : null;
        aplicarMarca();
        buildNav(); // los candados dependen de los datos (uso previo)
        renderRoute();
        guardado.forEach(([id, campos]) => {
          const f = document.getElementById(id);
          if (!f) return;
          f.setAttribute("data-dirty", "");
          campos.forEach(([n, v]) => { const el = f.elements[n]; if (!el) return; if (el.type === "checkbox") el.checked = v; else el.value = v; });
        });
        if (activo) document.getElementById(activo[0])?.elements[activo[1]]?.focus();
      }, 60);
    });
  }
  renderRoute();
}
