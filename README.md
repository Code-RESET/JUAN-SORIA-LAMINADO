# Juan Soria · Pisos y Decoración — App de control (DEMO)

PWA en HTML/JS puro (ES6 modules, sin build) para un negocio de **piso laminado, PVC, SPC, persianas y decoración**.
Basada en la estructura de *Alarmas ReSeT Pro*, con mejoras.
Desarrollado por: Ing. Luis Ángel Díaz Bernal · Compañía: CODE-RESET

## Plan de la demo: empieza con cotizaciones
La demo arranca en **plan cotizador** (`js/plan.js`): Cotizaciones + Mi negocio. La primera vez pide nombre, logo y
precios por m², y propone una **primera tarea**: cotizar un piso real y mandar el PDF por WhatsApp. Cada cotización
muestra **tu ganancia** (precio − tu costo), que solo ve el dueño. Inicio, Trabajos, Clientes y Gastos se ven con 🔒
y se desbloquean con `PLAN = "completo"`.

## Secciones
| Sección | Qué hace |
|---|---|
| **Inicio** | Cobrado, vendido, por cobrar, gastos y utilidad estimada del mes; trabajos por estado; **agenda de instalaciones** (HOY / MAÑANA / atrasados); cotizaciones esperando respuesta. |
| **Trabajos** | Folio, cliente, obra (dirección, colonia, espacios, m², link a mapa), conceptos con unidad (m², ml, pza, caja), **calculadora de m² con % de merma**, descuento, IVA opcional, anticipo, fecha de instalación. Flujo **Medición → Pedido de material → En instalación → Terminado**, separado del pago; abonos con historial; PDF; WhatsApp para confirmar instalación o cobrar saldo. |
| **Cotizaciones** | Folio, vigencia, estado (Abierta/Aceptada/Rechazada/Vencida), PDF + WhatsApp, **convertir en trabajo** con un toque. |
| **Clientes** | Se crean solos al guardar un trabajo/cotización; historial, total y saldo, WhatsApp y llamada. |
| **Gastos** | Por mes y categoría (material, herramienta, fletes, instaladores, renta, publicidad...). |
| **Ajustes** | Datos del negocio, catálogo de productos (unidad, precio, costo), respaldo/restauración, exportar a Excel, **panel de errores**, datos de ejemplo. |

## Reglas fijas del proyecto
1. **Login y reglas por usuario desde el día uno** — `firestore.rules`: cada usuario solo ve `usuarios/{su uid}/...`. Incluso en modo demo los datos se guardan separados por usuario.
2. **Firebase de PRUEBA separado del REAL** — `js/firebase-config.js` tiene dos configs. `localhost` o `?env=prueba` usa PRUEBA y muestra una franja amarilla; `?env=produccion` regresa al real. Si ambos apuntan al mismo proyecto, la app se niega a arrancar.
3. **Errores silenciosos visibles** — `js/errores.js` captura todo error (incluidos los de Firestore y promesas sin catch), enciende un indicador **⚠ N** arriba y los lista en **Ajustes → Errores** para copiarlos o descargarlos.
4. **Pruebas automáticas + revisor-bugs antes de entregar** (ver abajo).
5. **Solo datos ficticios en el repo** — los ejemplos usan teléfonos 8710000xxx y correos @example.com; un test falla si aparece algo que parezca real. Respaldos y exportaciones están en `.gitignore`.

## Modo demo
Mientras el proyecto del entorno tenga `apiKey: "TU_API_KEY"`, la app corre **sin Firebase**: login local
(`demo@example.com` / `demo2026`) y datos en el propio teléfono. Sirve para que el cliente la pruebe unos días.
Al pegar las credenciales reales cambia sola a Firebase Auth + Firestore, sin tocar los módulos.

## Pruebas
La app no necesita npm. npm es solo para las pruebas:
```bash
npm install
npx playwright install chromium
npm test            # unitarias: dinero, IVA, saldos, XSS, WhatsApp + candado de datos ficticios
npm run test:e2e    # navegador real (iPhone y PC): flujo completo + sistema de errores
npm run test:rules  # reglas de Firestore en el emulador local (requiere Java)
```
Después: correr el agente **`revisor-bugs`** (`.claude/agents/revisor-bugs.md`) y no entregar si dice "NO ENTREGAR TODAVÍA".

## Estructura
```
js/firebase-config.js   entornos PRUEBA / PRODUCCIÓN + modo demo
js/store.js             capa de datos única (localStorage por usuario o Firestore)
js/errores.js           bitácora visible de errores
js/auth.js              login/logout
js/router.js            rutas por hash + menú (arreglo MODULES)
js/ui.js                utilidades (escape XSS, dinero, modal, toast, WhatsApp)
js/lineas.js            conceptos con unidad, calculadora de m², totales
js/documento.js         trabajo/cotización imprimible, estados, unidades
js/modules/*.js         una sección por archivo
tests/                  unitarias, e2e y reglas
firestore.rules         reglas por usuario
```

## Publicar
GitHub Pages: Settings → Pages → rama `main`, carpeta `/root`. Subir `CACHE_VERSION` en `service-worker.js` al cambiar archivos.

## Pendiente antes de la versión final
- Logo y colores del cliente (`assets/`, `--accent` en `css/styles.css`).
- Crear los 2 proyectos Firebase (prueba y real), pegar configs, publicar `firestore.rules`.
- Probar instalación PWA en Android e iOS, y en Safari iOS / Samsung Internet.
