// ============================================================
// modules/bienvenida.js
// Primera vez que el cliente abre la app (plan cotizador):
//   Paso 1: su negocio (nombre, teléfono, logo).
//   Paso 2: sus materiales y precio por m² (lo mínimo para cotizar).
// Después, la "primera tarea" en Cotizaciones: cotizar un piso REAL
// y mandar el PDF por WhatsApp. Así la prueba no depende de datos
// de ejemplo: desde el día 1 usa SUS precios con SU logo.
// ============================================================

import * as store from "../store.js";
import { esc, money, num, toast, $, $$ } from "../ui.js";
import { UNIDADES } from "../documento.js";
import { procesarLogo, logoValido, aplicarMarca } from "../marca.js";
import { reportarError } from "../errores.js";
import { CONTACTO } from "../plan.js";

let paso = 1;

// "Primera vez" = no hay ajustes del dueño ni datos previos. Quien ya
// usaba la app (versión anterior) NO pasa por el asistente.
export function onboardingPendiente() {
  if (!store.ajustesConfiables()) return false; // sin leer ajustes no se decide nada
  const a = store.ajustes();
  if (a.onboarding) return false;
  if (a.enBienvenida) return true;   // a medio asistente
  if (a.editado) return false;       // ya configuró su negocio en una versión anterior
  return !["cotizaciones", "ordenes", "clientes", "gastos"].some((c) => store.all(c).length);
}

export function renderBienvenida(container) {
  if (paso === 2) return pasoMateriales(container);
  pasoNegocio(container);
}

function cabecera(n, titulo, texto) {
  return `
    <div class="onb-head">
      <div class="onb-pasos"><span class="${n >= 1 ? "on" : ""}">1</span><i></i><span class="${n >= 2 ? "on" : ""}">2</span></div>
      <h2>${titulo}</h2>
      <p class="muted">${texto}</p>
    </div>`;
}

// ---------------- Paso 1: el negocio ----------------
function pasoNegocio(container) {
  const a = store.ajustes();
  let logo = logoValido(a.logo) ? a.logo : "";
  container.innerHTML = `
    <div class="onb">
      ${cabecera(1, "Bienvenido 👋", "Dos pasos y empiezas a mandar cotizaciones con tu nombre y tu logo.")}
      <form id="onb-negocio" class="card form">
        <label class="field"><span>Nombre de tu negocio *</span>
          <input class="input" name="negocio" required value="${esc(a.negocio)}" placeholder="Ej. Pisos y Decoración Soria" /></label>
        <div class="cols-2">
          <label class="field"><span>Tu WhatsApp (sale en la cotización)</span><input class="input" name="telefono" type="tel" inputmode="tel" value="${esc(a.telefono)}" /></label>
          <label class="field"><span>Ciudad o dirección (opcional)</span><input class="input" name="direccion" value="${esc(a.direccion)}" /></label>
        </div>
        <div class="field"><span>Tu logo (opcional)</span>
          <div class="logo-pick">
            <div class="logo-prev" id="logo-prev">${logo ? `<img alt="Logo" />` : `<span class="muted small">Sin logo</span>`}</div>
            <label class="btn btn-ghost btn-sm">📷 Elegir imagen<input type="file" accept="image/*" id="logo-file" hidden /></label>
            <button type="button" class="btn btn-ghost btn-sm" id="logo-quitar" ${logo ? "" : "hidden"}>Quitar</button>
          </div>
        </div>
        <div class="form-actions"><button class="btn btn-primary grow" type="submit">Siguiente →</button></div>
      </form>
    </div>`;

  const prev = $("#logo-prev", container);
  const pintar = () => {
    prev.innerHTML = logo ? `<img alt="Logo" />` : `<span class="muted small">Sin logo</span>`;
    if (logo) $("img", prev).src = logo;
    $("#logo-quitar", container).hidden = !logo;
  };
  pintar();
  $("#logo-file", container).onchange = async (e) => {
    try { logo = await procesarLogo(e.target.files[0]); pintar(); }
    catch (err) { toast(err.message); reportarError("logo", err); }
    finally { e.target.value = ""; }
  };
  $("#logo-quitar", container).onclick = () => { logo = ""; pintar(); };

  $("#onb-negocio", container).onsubmit = async (e) => {
    e.preventDefault();
    e.target.removeAttribute("data-dirty");
    const f = Object.fromEntries(new FormData(e.target).entries());
    // enBienvenida (no "editado"): el asistente sigue abierto hasta el paso 2.
    await store.save("ajustes", { ...store.ajustes(), id: "config", enBienvenida: true,
      negocio: f.negocio.trim(), telefono: f.telefono.trim(), direccion: f.direccion.trim(), logo });
    aplicarMarca();
    paso = 2;
    renderBienvenida(container);
    window.scrollTo(0, 0);
  };
}

// ---------------- Paso 2: materiales y precios ----------------
function filaMaterial(s = {}) {
  const ejemplo = s.semilla ? s.precio : "";
  const precio = s.semilla ? "" : (s.precio ?? "");
  return `
    <div class="mat" data-id="${esc(s.id || "")}">
      <input class="input m-nombre" placeholder="Material o servicio" value="${esc(s.nombre || "")}" />
      <select class="input m-unidad">${Object.entries(UNIDADES).map(([k, v]) => `<option value="${k}" ${(s.unidad || "m2") === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      <input class="input m-precio" type="number" inputmode="decimal" step="0.01" min="0" placeholder="${ejemplo ? "ej. " + esc(ejemplo) : "Precio"}" value="${esc(precio)}" />
      <input class="input m-costo" type="number" inputmode="decimal" step="0.01" min="0" placeholder="Tu costo" value="${esc(s.semilla ? "" : (s.costo || ""))}" />
      <button type="button" class="icon-btn m-del" title="Quitar">✕</button>
    </div>`;
}

function pasoMateriales(container) {
  const cat = store.all("servicios").slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  container.innerHTML = `
    <div class="onb">
      ${cabecera(2, "Tus materiales y precios", "Pon tu precio a lo que vendes. Lo que dejes sin precio no se guarda. Tu costo es opcional: solo tú lo ves y te dice cuánto ganas en cada cotización.")}
      <form id="onb-mat" class="card form">
        <div class="mat mat-head muted small"><span>Material</span><span>Unidad</span><span>Precio</span><span>Tu costo</span><span></span></div>
        <div id="mats">${(cat.length ? cat : [{}]).map(filaMaterial).join("")}</div>
        <button type="button" class="btn btn-ghost btn-block" id="mat-add">+ Agregar material</button>
        <p class="error-text" id="mat-err" hidden></p>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" id="mat-atras">← Atrás</button>
          <button class="btn btn-primary grow" type="submit">Listo, empezar a cotizar</button>
        </div>
      </form>
    </div>`;

  const lista = $("#mats", container);
  $("#mat-add", container).onclick = () => { lista.insertAdjacentHTML("beforeend", filaMaterial()); $$(".m-nombre", lista).pop().focus(); };
  lista.addEventListener("click", (e) => {
    if (!e.target.classList.contains("m-del")) return;
    const fila = e.target.closest(".mat");
    fila.hidden = true; fila.dataset.borrar = "1";
  });
  $("#mat-atras", container).onclick = () => { paso = 1; renderBienvenida(container); };

  $("#onb-mat", container).onsubmit = async (e) => {
    e.preventDefault();
    e.target.removeAttribute("data-dirty");
    const filas = $$(".mat[data-id]", lista);
    const conPrecio = filas.filter((f) => !f.dataset.borrar && $(".m-nombre", f).value.trim() && num($(".m-precio", f).value) > 0);
    const err = $("#mat-err", container);
    if (!conPrecio.length) { err.textContent = "Ponle precio al menos a un material."; err.hidden = false; return; }
    try {
      for (const f of filas) {
        const id = f.dataset.id;
        const actual = id ? store.get("servicios", id) : null;
        const guardar = conPrecio.includes(f);
        if (!guardar) {
          // Solo se borra lo que el usuario quitó con ✕ o un ejemplo sin precio;
          // un material suyo con precio 0 (p. ej. "visita gratis") se respeta.
          if (actual && (f.dataset.borrar || actual.semilla)) await store.remove("servicios", id);
          continue;
        }
        await store.save("servicios", {
          ...(actual || {}), semilla: false,
          // El tamaño de caja de ejemplo es inventado: no se conserva a escondidas.
          m2Caja: actual?.semilla ? "" : (actual?.m2Caja || ""),
          nombre: $(".m-nombre", f).value.trim(), unidad: $(".m-unidad", f).value,
          precio: num($(".m-precio", f).value), costo: num($(".m-costo", f).value)
        });
      }
      await store.save("ajustes", { ...store.ajustes(), id: "config", onboarding: true, enBienvenida: false, editado: true, catalogoSembrado: true });
      paso = 1;
      toast("¡Listo! Ahora cotiza tu primer piso");
      location.hash = "#/cotizaciones";
    } catch (ex) {
      reportarError("guardar materiales", ex);
      toast("No se pudo guardar: " + ex.message);
    }
  };
}

// ---------------- Primera tarea (en Cotizaciones) ----------------
export function primeraTareaHTML() {
  const a = store.ajustes();
  if (a.tareaCerrada) return "";
  const cotizo = store.all("cotizaciones").length > 0;
  const envio = !!a.primerPdf;
  const quien = CONTACTO.nombre || "quien te compartió la app";
  const item = (ok, titulo, texto, extra = "") => `
    <li class="${ok ? "ok" : ""}"><span class="tick">${ok ? "✓" : ""}</span>
      <div><b>${titulo}</b><div class="muted small">${texto}</div>${ok ? "" : extra}</div></li>`;
  const todo = cotizo && envio;
  return `
    <div class="card tarea">
      <div class="tarea-head"><strong>${todo ? "🎉 ¡Primera tarea completa!" : "Tu primera tarea · 5 minutos"}</strong>
        ${todo ? `<button class="icon-btn" data-tarea-cerrar title="Ocultar">✕</button>` : ""}</div>
      <ol class="tarea-lista">
        ${item(true, "Tu negocio, logo y precios", "Listo. Puedes cambiarlos en Mi negocio.")}
        ${item(cotizo, `Cotiza un piso real`, `Por ejemplo, el de ${esc(quien)}: mide el cuarto y usa 📐 Calcular m².`,
          `<a class="btn btn-primary btn-sm" href="#/cotizaciones/nueva">Cotizar ahora</a>`)}
        ${item(envio, "Manda el PDF por WhatsApp", `Abre la cotización → 📄 PDF / WhatsApp → 📲 Enviar PDF${CONTACTO.nombre ? ` a ${esc(CONTACTO.nombre)}` : ""}.`)}
      </ol>
      ${todo ? `<p class="small muted">Así le llegan tus cotizaciones a tus clientes: con tu logo, tus precios y en PDF.</p>` : ""}
    </div>`;
}

export function bindPrimeraTarea(container) {
  const b = container.querySelector("[data-tarea-cerrar]");
  if (b) b.onclick = () => store.save("ajustes", { ...store.ajustes(), id: "config", tareaCerrada: true });
}

export async function marcarPdfEnviado() {
  if (store.ajustes().primerPdf) return;
  await store.save("ajustes", { ...store.ajustes(), id: "config", primerPdf: true });
}
