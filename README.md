# Juan Soria · Laminado y Pintura — Control de taller (DEMO)

PWA en HTML/JS puro (ES6 modules, sin build), basada en la estructura de *Alarmas ReSeT Pro* con mejoras.
Desarrollado por: Ing. Luis Ángel Díaz Bernal · Compañía: CODE-RESET

## Secciones
| Sección | Qué hace |
|---|---|
| **Inicio** | Cobrado del mes, por cobrar, trabajos del mes, gastos, utilidad neta; autos por estado; listos para entregar; próximas entregas (marca atrasados). |
| **Órdenes** | Folio consecutivo, cliente, vehículo (marca/modelo/año/color/placas), daños al recibir, particular o aseguradora (+ no. de siniestro), servicios del catálogo, descuento, IVA opcional, anticipo, fecha de entrega. Estado del trabajo (Recibido → En proceso → Listo → Entregado) separado del pago, abonos parciales con historial, impresión/PDF y aviso "listo" por WhatsApp. |
| **Cotizaciones** | Se guardan con folio, vigencia y estado (Abierta/Aceptada/Rechazada/Vencida). PDF + WhatsApp. **Convertir en orden** con un toque. |
| **Clientes** | Se crean solos al hacer una orden/cotización. Historial de trabajos, total histórico y saldo, WhatsApp y llamada. |
| **Gastos** | Por mes y categoría (pintura y materiales, herramienta, renta, sueldos...). |
| **Ajustes** | Datos del negocio (salen en los documentos), catálogo de servicios con precio y costo, respaldo/restauración JSON, exportar órdenes a Excel (CSV), instalar app, datos de ejemplo. |

## Modo demo vs. Firebase
- Mientras `js/firebase-config.js` tenga `apiKey: "TU_API_KEY"`, la app corre en **modo demo**: login local
  (`demo@juansoria.mx` / `demo2026`) y datos guardados en el propio teléfono (localStorage). No requiere crear nada.
- Para producción: pegar el `firebaseConfig` real, crear el usuario en Firebase Auth y publicar `firestore.rules`.
  La app cambia sola a Firebase Auth + Firestore (con cache offline), sin tocar los módulos — todos usan `js/store.js`.

## Estructura
```
js/firebase-config.js   credenciales + detección de modo demo
js/store.js             capa de datos única (localStorage o Firestore)
js/auth.js              login/logout
js/router.js            rutas por hash + menú (arreglo MODULES)
js/ui.js                utilidades (escape XSS, dinero, modal, toast, WhatsApp)
js/lineas.js            editor de servicios + cálculo de totales (órdenes y cotizaciones)
js/documento.js         orden/cotización imprimible
js/modules/*.js         una sección por archivo
```

## Publicar
GitHub Pages: Settings → Pages → rama `main`, carpeta `/root`. Subir `CACHE_VERSION` en `service-worker.js` al cambiar archivos.

## Pendiente antes de entregar la versión final
- Logo y colores del cliente (`assets/`, `--accent` en `css/styles.css`).
- Proyecto Firebase + `firestore.rules` publicadas y probadas.
- Probar instalación PWA en Android e iOS, y en Safari iOS / Samsung Internet.
