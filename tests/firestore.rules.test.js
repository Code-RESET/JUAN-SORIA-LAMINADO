// ============================================================
// tests/firestore.rules.test.js  —  npm run test:rules
// Prueba las reglas REALES (firestore.rules) en el emulador local
// de Firebase. No toca ningún proyecto en la nube.
// Por qué existe: en NEXORA la función de permisos existía pero
// nunca se llamaba y todos tenían acceso de admin. Aquí se prueba
// que cada usuario SOLO ve lo suyo, y que sin sesión no hay nada.
// ============================================================

import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-juan-soria",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const juan = () => env.authenticatedContext("uid_juan").firestore();
const otro = () => env.authenticatedContext("uid_otro").firestore();
const anonimo = () => env.unauthenticatedContext().firestore();

test("un usuario lee y escribe SUS propios datos", async () => {
  const ref = doc(juan(), "usuarios/uid_juan/ordenes/o1");
  await assertSucceeds(setDoc(ref, { folio: 1, clienteNombre: "Cliente Ejemplo" }));
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(getDocs(collection(juan(), "usuarios/uid_juan/clientes")));
});

test("un usuario NO puede leer ni escribir datos de otro usuario", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "usuarios/uid_juan/ordenes/o1"), { folio: 1 });
  });
  await assertFails(getDoc(doc(otro(), "usuarios/uid_juan/ordenes/o1")));
  await assertFails(getDocs(collection(otro(), "usuarios/uid_juan/ordenes")));
  await assertFails(setDoc(doc(otro(), "usuarios/uid_juan/ordenes/o2"), { folio: 2 }));
});

test("sin sesión no se puede leer ni escribir nada", async () => {
  await assertFails(getDoc(doc(anonimo(), "usuarios/uid_juan/ordenes/o1")));
  await assertFails(setDoc(doc(anonimo(), "usuarios/uid_juan/ordenes/o1"), { folio: 1 }));
});

test("colecciones fuera de la lista quedan cerradas", async () => {
  await assertFails(setDoc(doc(juan(), "usuarios/uid_juan/admin/x"), { rol: "admin" }));
  await assertFails(setDoc(doc(juan(), "config/global"), { abierto: true }));
});

test("todas las colecciones que usa la app están permitidas", async () => {
  for (const col of ["clientes", "ordenes", "cotizaciones", "gastos", "servicios", "ajustes"]) {
    await assertSucceeds(setDoc(doc(juan(), `usuarios/uid_juan/${col}/x`), { ok: true }));
  }
});
