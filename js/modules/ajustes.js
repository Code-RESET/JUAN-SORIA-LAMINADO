// ============================================================
// modules/ajustes.js
// Datos del negocio (salen en las órdenes y cotizaciones),
// catálogo de servicios con precios, respaldo/restauración JSON,
// exportación a Excel (CSV) e instalación como app.
// ============================================================

import * as store from "../store.js";
import { DEMO_MODE } from "../firebase-config.js";
import { esc, money, num, toast, openModal, closeModal, confirmar, descargar, hoyISO, $ } from "../ui.js";
import { totales } from "../lineas.js";
import { ESTADOS, vehiculoTxt } from "../documento.js";

export function renderAjustes(container) {
  const a = store.ajustes();
  const cat = store.all("servicios").slice().sort((x, y) => x.nombre.localeCompare(y.nombre));

  container.innerHTML = `
    <div class="view-head"><h2>Ajustes</h2></div>

    <div class="card">
      <h3 class="card-h">Datos del negocio</h3>
      <form id="f-negocio" class="form">
        <label class="field"><span>Nombre del negocio</span><input class="input" name="negocio" value="${esc(a.negocio)}" /></label>
        <div class="cols-2">
          <label class="field"><span>Teléfono</span><input class="input" name="telefono" type="tel" value="${esc(a.telefono)}" /></label>
          <label class="field"><span>IVA %</span><input class="input" name="ivaPct" type="number" value="${esc(a.ivaPct)}" /></label>
        </div>
        <label class="field"><span>Dirección</span><input class="input" name="direccion" value="${esc(a.direccion)}" /></label>
        <label class="field"><span>Garantía (sale en la orden)</span><input class="input" name="garantia" value="${esc(a.garantia)}" /></label>
        <label class="field"><span>Condiciones (salen en la cotización)</span><input class="input" name="condiciones" value="${esc(a.condiciones)}" /></label>
        <label class="field"><span>Vigencia de cotización (días)</span><input class="input" name="vigenciaDias" type="number" value="${esc(a.vigenciaDias)}" /></label>
        <button class="btn btn-primary" type="submit">Guardar datos</button>
      </form>
    </div>

    <div class="card">
      <div class="card-h-row"><h3 class="card-h">Catálogo de servicios</h3><button class="btn btn-ghost btn-sm" id="nuevo-serv">+ Agregar</button></div>
      <p class="muted small">Al escribir un servicio en una orden o cotización, el precio se llena solo.</p>
      <div class="catalogo">
        ${cat.map((s) => `<div class="row-card slim" data-id="${s.id}"><span class="grow">${esc(s.nombre)}</span><span class="muted small">costo ${money(s.costo)}</span><strong>${money(s.precio)}</strong></div>`).join("") || `<p class="muted">Sin servicios.</p>`}
      </div>
    </div>

    <div class="card">
      <h3 class="card-h">Respaldo y exportación</h3>
      ${DEMO_MODE ? `<p class="notice">Modo demo: la información se guarda solo en este dispositivo. Haz un respaldo de vez en cuando.</p>` : ""}
      <div class="form-actions wrap">
        <button class="btn btn-ghost" id="btn-respaldo">📥 Descargar respaldo</button>
        <button class="btn btn-ghost" id="btn-restaurar">📤 Restaurar respaldo</button>
        <button class="btn btn-ghost" id="btn-csv">📊 Exportar órdenes a Excel</button>
        <button class="btn btn-ghost" id="btn-instalar" hidden>📲 Instalar app</button>
      </div>
      <input type="file" id="file-restaurar" accept=".json,application/json" hidden />
    </div>

    ${DEMO_MODE ? `
    <div class="card">
      <h3 class="card-h">Datos de ejemplo</h3>
      <p class="muted small">Carga clientes y órdenes ficticias para ver la app llena, o borra todo para empezar desde cero.</p>
      <div class="form-actions wrap">
        <button class="btn btn-ghost" id="btn-ejemplo">✨ Cargar ejemplos</button>
        <button class="btn btn-danger" id="btn-borrar">Borrar todos los datos</button>
      </div>
    </div>` : ""}
  `;

  $("#f-negocio", container).onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    await store.save("ajustes", { ...a, ...f, id: "config", ivaPct: num(f.ivaPct), vigenciaDias: num(f.vigenciaDias) || 15 });
    toast("Datos guardados");
  };

  $("#nuevo-serv", container).onclick = () => formServicio();
  container.querySelectorAll(".catalogo [data-id]").forEach((n) => (n.onclick = () => formServicio(store.get("servicios", n.dataset.id))));

  $("#btn-respaldo", container).onclick = () => {
    descargar(`respaldo-juan-soria-${hoyISO()}.json`, JSON.stringify(store.exportarTodo(), null, 2));
    toast("Respaldo descargado");
  };
  const fileIn = $("#file-restaurar", container);
  $("#btn-restaurar", container).onclick = () => fileIn.click();
  fileIn.onchange = async () => {
    const file = fileIn.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== "juan-soria-laminado") throw new Error("Archivo no reconocido");
      if (!(await confirmar("Se agregarán/actualizarán los datos del respaldo. ¿Continuar?", "Restaurar"))) return;
      await store.importarTodo(data);
      toast("Respaldo restaurado");
    } catch (err) {
      alert("No se pudo restaurar: " + err.message);
    } finally { fileIn.value = ""; }
  };
  $("#btn-csv", container).onclick = exportarCSV;

  const inst = $("#btn-instalar", container);
  if (window.__installPrompt) {
    inst.hidden = false;
    inst.onclick = async () => { window.__installPrompt.prompt(); window.__installPrompt = null; inst.hidden = true; };
  }

  if (DEMO_MODE) {
    $("#btn-ejemplo", container).onclick = cargarEjemplos;
    $("#btn-borrar", container).onclick = async () => {
      if (!(await confirmar("¿Borrar TODOS los datos de este dispositivo? Haz un respaldo antes.", "Borrar todo"))) return;
      for (const col of ["clientes", "ordenes", "cotizaciones", "gastos"]) {
        for (const x of [...store.all(col)]) await store.remove(col, x.id);
      }
      toast("Datos borrados");
    };
  }
}

function formServicio(s = {}) {
  const body = openModal(s.id ? "Editar servicio" : "Nuevo servicio", `
    <form id="f-serv" class="form">
      <label class="field"><span>Nombre *</span><input class="input" name="nombre" required value="${esc(s.nombre || "")}" /></label>
      <div class="cols-2">
        <label class="field"><span>Precio al cliente</span><input class="input" name="precio" type="number" inputmode="decimal" step="0.01" value="${esc(s.precio ?? "")}" /></label>
        <label class="field"><span>Costo de material</span><input class="input" name="costo" type="number" inputmode="decimal" step="0.01" value="${esc(s.costo ?? "")}" /></label>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary grow" type="submit">Guardar</button>
        ${s.id ? `<button class="btn btn-danger" type="button" data-del>Eliminar</button>` : ""}
      </div>
    </form>`);
  $("#f-serv", body).onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    await store.save("servicios", { ...s, nombre: f.nombre.trim(), precio: num(f.precio), costo: num(f.costo) });
    closeModal();
  };
  const del = $("[data-del]", body);
  if (del) del.onclick = async () => { await store.remove("servicios", s.id); closeModal(); };
}

function exportarCSV() {
  const rows = [["Folio", "Fecha ingreso", "Cliente", "Teléfono", "Vehículo", "Placas", "Servicios", "Estado", "Total", "Pagado", "Saldo", "Costo materiales"]];
  store.all("ordenes").sort((a, b) => a.folio - b.folio).forEach((o) => {
    const t = totales(o);
    rows.push([o.folio, o.fechaIngreso, o.clienteNombre, o.telefono, vehiculoTxt({ ...o.vehiculo, placas: "" }), o.vehiculo?.placas || "",
      (o.servicios || []).map((s) => s.descripcion).join(" | "), ESTADOS[o.estado], t.total.toFixed(2), t.pagado.toFixed(2), t.saldo.toFixed(2), t.costo.toFixed(2)]);
  });
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  // BOM para que Excel respete acentos.
  descargar(`ordenes-${hoyISO()}.csv`, "﻿" + csv, "text/csv;charset=utf-8");
}

async function cargarEjemplos() {
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
  const ej = [
    ["María López", "8711234567", { marca: "Nissan", modelo: "Versa", anio: "2019", color: "Blanco", placas: "FRT-123" }, [["Laminado de puerta", 1, 1800, 300], ["Pintura por pieza", 1, 1800, 600]], "EN_PROCESO", -3, 2, [1800]],
    ["Carlos Ramírez", "8719876543", { marca: "Chevrolet", modelo: "Aveo", anio: "2017", color: "Gris", placas: "GHK-908" }, [["Laminado de defensa", 1, 1500, 250], ["Pulido y encerado", 1, 900, 150]], "LISTO", -6, 0, [1000]],
    ["Transportes del Norte", "8715550000", { marca: "Ford", modelo: "Ranger", anio: "2021", color: "Rojo", placas: "TN-4521" }, [["Laminado de salpicadera", 2, 1600, 250], ["Pintura por pieza", 2, 1800, 600]], "RECIBIDO", -1, 6, []],
    ["Ana Torres", "8712223344", { marca: "Volkswagen", modelo: "Jetta", anio: "2015", color: "Negro", placas: "LMN-332" }, [["Reparación de rayón", 1, 700, 120]], "ENTREGADO", -12, -9, [700]]
  ];
  let folio = store.siguienteFolio("ordenes");
  for (const [nombre, tel, vehiculo, lineas, estado, ingreso, entrega, pagos] of ej) {
    const c = await store.save("clientes", { nombre, telefono: tel });
    await store.save("ordenes", {
      folio: folio++, clienteId: c.id, clienteNombre: nombre, telefono: tel, tipo: "PARTICULAR", vehiculo,
      servicios: lineas.map(([descripcion, cantidad, precio, costo]) => ({ descripcion, cantidad, precio, costo })),
      descuento: 0, conIva: false, ivaPct: 16, estado, fechaIngreso: d(ingreso), fechaEntrega: d(entrega),
      pagos: pagos.map((monto) => ({ monto, metodo: "Efectivo", fecha: d(ingreso) })), notas: "", garantia: store.ajustes().garantia
    });
  }
  await store.save("cotizaciones", {
    folio: store.siguienteFolio("cotizaciones"), fecha: d(-2), estado: "ABIERTA", clienteNombre: "Luis Hernández", telefono: "8713334455",
    vehiculo: { marca: "Toyota", modelo: "Corolla", anio: "2020", color: "Plata", placas: "" },
    servicios: [{ descripcion: "Laminado de cofre", cantidad: 1, precio: 2200, costo: 350 }, { descripcion: "Pintura por pieza", cantidad: 1, precio: 1800, costo: 600 }],
    descuento: 200, conIva: false, ivaPct: 16, vigenciaDias: 15, notas: ""
  });
  await store.save("gastos", { concepto: "Galón de primer y lijas", monto: 1350, fecha: d(-4), categoria: "Pintura y materiales" });
  await store.save("gastos", { concepto: "Renta del taller", monto: 6000, fecha: d(0), categoria: "Renta" });
  toast("Ejemplos cargados");
}
