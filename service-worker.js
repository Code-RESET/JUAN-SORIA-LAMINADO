// ============================================================
// service-worker.js
// Cache del shell para que la app abra sin internet.
// Estrategia: red primero para archivos de la app (así siempre
// llega la versión nueva si hay señal) y cache como respaldo.
// Subir CACHE_VERSION cada vez que cambien archivos base.
// ============================================================

const CACHE_VERSION = "juan-soria-v7";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/auth.js",
  "./js/router.js",
  "./js/store.js",
  "./js/ui.js",
  "./js/errores.js",
  "./js/lineas.js",
  "./js/documento.js",
  "./js/firebase-config.js",
  "./js/modules/dashboard.js",
  "./js/modules/ordenes.js",
  "./js/modules/cotizaciones.js",
  "./js/modules/clientes.js",
  "./js/modules/gastos.js",
  "./js/modules/ajustes.js",
  "./assets/logo.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Firebase / Google APIs: siempre directo a la red (Firestore ya trae su propia cache offline).
  if (url.hostname.includes("firebase") || (url.hostname.includes("googleapis.com") && !url.hostname.startsWith("fonts"))) return;

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // Fuentes y SDK externos: cache primero.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
