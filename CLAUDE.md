# Code-Reset — Contexto del proyecto

Desarrollador: Ing. Luis Ángel Díaz Bernal. Empresa: CODE-RESET.

## Stack fijo (no cambiar sin que Angel lo pida)
- HTML + CSS + JS puro, ES6 modules. Sin build step, sin npm install para correr.
- Debe correr sin instalar nada en Chrome, Safari (iOS), Samsung Internet, Firefox.
- PWA: manifest.json + service-worker.js + ícono personalizado.
- Backend: Firebase (Auth + Firestore).
- npm solo se usa para las PRUEBAS (package.json); la app nunca lo necesita para correr.
- Arquitectura modular: un archivo por función en /js y /js/modules.
- Navegación por routing (hash), sin recargar la página.
- Responsive: PC, tablet, iPhone, Android.

## Pantalla de login obligatoria
Logo pequeño + "Desarrollado por: Ing. Luis Ángel Díaz Bernal" + "Compañía: CODE-RESET".

## Cómo agregar un módulo nuevo
1. Copiar js/modules/dashboard.js y renombrar.
2. Escribir su render(container, user).
3. Registrarlo en el arreglo MODULES de js/router.js.
4. Agregar el archivo a CORE_ASSETS de service-worker.js.
5. Datos siempre vía js/store.js y errores siempre vía reportarError() de js/errores.js.

## Reglas fijas desde el día uno (todos los proyectos)
1. **Login y reglas por usuario desde el día uno.** Nada de "luego le ponemos login".
   Firestore: `usuarios/{uid}/...` con regla `request.auth.uid == uid` y todo lo demás cerrado.
   Si hay roles, la función de permisos se prueba en tests/firestore.rules.test.js.
2. **Proyecto Firebase de PRUEBA separado del REAL.** Dos configs en js/firebase-config.js;
   localhost o `?env=prueba` usa PRUEBA (franja amarilla visible). Nunca probar contra datos reales.
3. **Sistema visible de errores silenciosos.** Ningún `catch` que solo haga console.error:
   usar `reportarError(contexto, err)`. Los errores se ven en el indicador ⚠ y en Ajustes → Errores.
4. **Pruebas automáticas + `revisor-bugs` antes de entregar.**
   `npm test` (unitarias + candado de datos), `npm run test:e2e` (navegador), `npm run test:rules`
   (reglas en emulador). Después correr el agente `revisor-bugs` (.claude/agents/) y no entregar
   si su veredicto es "NO ENTREGAR TODAVÍA".
5. **Datos ficticios, nunca clientes reales en el repo.** Teléfonos 8710000xxx, correos @example.com,
   nombres "Cliente Ejemplo". Respaldos y exportaciones están en .gitignore. Un test lo verifica.

## Antes de dar por terminado un proyecto
- Pasar las 3 suites de pruebas y el revisor-bugs (ver reglas fijas).
- Probar en Chrome, Safari iOS, Samsung Internet.
- Escribir y probar Firestore security rules (cuidado: en NEXORA hubo un bug donde puede()
  existía pero nunca se llamaba, y todos terminaban con acceso admin).
- Confirmar que la app es instalable como PWA en Android e iOS.
- Actualizar CACHE_VERSION en service-worker.js si se tocó el shell base.

## Estilo de trabajo con Angel
Angel es el arquitecto/product owner: revisa, prueba y despliega, pero no escribe todo
el código a mano. Explica brevemente el "por qué" de las decisiones técnicas.

## Este proyecto: Juan Soria (pisos y decoración)
Giro: piso laminado, PVC, SPC, persianas, paneles y decoración. NO es taller de autos.
Trabajos con obra (dirección, espacios, m²), conceptos con unidad (m², ml, pza, caja) y
flujo Medición → Pedido de material → En instalación → Terminado.
