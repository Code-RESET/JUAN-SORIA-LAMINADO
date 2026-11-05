// ============================================================
// plan.js
// Qué partes de la app están activas para este cliente.
//
// Estrategia comercial: la demo empieza SOLO con cotizaciones
// ("cotizador"). Lo demás se ve en el menú con 🔒 y una explicación,
// sin pedirle que lo use. Si le interesa, se desbloquea. Así nunca
// se le QUITA algo que ya usaba (eso sí se siente como pérdida).
//
// Para desbloquear todo al cerrar la venta: PLAN = "completo"
// y volver a publicar (subir CACHE_VERSION en service-worker.js).
// ============================================================

import * as store from "./store.js";

export const PLAN = "cotizador"; // "cotizador" | "completo"

// A quién avisa el botón "Me interesa" de las secciones bloqueadas.
// whatsapp: 10 dígitos (México) o con lada de país. Vacío = solo muestra el aviso.
export const CONTACTO = { nombre: "Angel", whatsapp: "" };

// Secciones del paquete completo y qué le resuelven al cliente.
export const PAQUETE_COMPLETO = {
  dashboard: {
    titulo: "Inicio: tus números del mes",
    puntos: ["Cuánto vendiste, cobraste y te deben", "Tu ganancia del mes después de material y gastos", "Agenda de instalaciones: hoy, mañana y atrasadas"]
  },
  ordenes: {
    titulo: "Trabajos: de la medición a la entrega",
    puntos: ["Cada cotización aceptada pasa a trabajo con un toque", "Medición → Material → Instalación → Terminado", "Anticipos y abonos: quién te debe y cuánto"]
  },
  clientes: {
    titulo: "Clientes: tu cartera en el teléfono",
    puntos: ["Historial de trabajos de cada cliente", "Quién te debe, con WhatsApp y llamada a un toque", "Se llena solo con tus cotizaciones"]
  },
  gastos: {
    titulo: "Gastos: lo que se lleva el negocio",
    puntos: ["Fletes, herramienta, renta, instaladores", "Por mes y por categoría", "Se descuenta de tu ganancia del mes"]
  }
};

// En la computadora de desarrollo (localhost) se puede probar el
// plan completo con localStorage "jsl_plan" = "completo". En el link
// público (GitHub Pages) esto NO aplica: manda la constante PLAN.
export function planActivo() {
  const h = location.hostname;
  const local = h === "localhost" || h === "127.0.0.1";
  if (local) {
    try {
      const p = localStorage.getItem("jsl_plan");
      if (p === "completo" || p === "cotizador") return p;
    } catch {}
  }
  return PLAN;
}

// Quien ya usó Trabajos o Gastos (versión anterior de la demo o un
// respaldo) los conserva: quitarle algo que ya usaba sí se siente como
// pérdida. Solo se bloquea lo que nunca ha usado.
export function usoPrevio() {
  return store.all("ordenes").length > 0 || store.all("gastos").length > 0;
}

export function desbloqueado(path) {
  return planActivo() === "completo" || !(path in PAQUETE_COMPLETO) || usoPrevio();
}
