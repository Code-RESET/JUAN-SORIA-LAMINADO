// ============================================================
// modules/ajustes.js
// Datos del negocio (salen en las órdenes y cotizaciones),
// catálogo de servicios con precios, respaldo/restauración JSON,
// exportación a Excel (CSV) e instalación como app.
// ============================================================

import * as store from "../store.js";
import { DEMO_MODE, ENTORNO } from "../firebase-config.js";
import { reportarError, listarErrores, limpiarErrores, marcarVistos } from "../errores.js";
import { esc, money, num, toast, openModal, closeModal, confirmar, descargar, hoyISO, $ } from "../ui.js";
import { totales, lineaTxt } from "../lineas.js";
import { ESTADOS, obraTxt, UNIDADES } from "../documento.js";

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
        <label class="field"><span>Garantía (sale en el trabajo)</span><input class="input" name="garantia" value="${esc(a.garantia)}" /></label>
        <label class="field"><span>Condiciones (salen en la cotización)</span><input class="input" name="condiciones" value="${esc(a.condiciones)}" /></label>
        <label class="field"><span>Vigencia de cotización (días)</span><input class="input" name="vigenciaDias" type="number" value="${esc(a.vigenciaDias)}" /></label>
        <button class="btn btn-primary" type="submit">Guardar datos</button>
      </form>
    </div>

    <div class="card">
      <div class="card-h-row"><h3 class="card-h">Catálogo de servicios</h3><button class="btn btn-ghost btn-sm" id="nuevo-serv">+ Agregar</button></div>
      <p class="muted small">Al escribir un producto en un trabajo o cotización, se llenan solos la unidad y el precio.</p>
      <div class="catalogo">
        ${cat.map((s) => `<div class="row-card slim" data-id="${esc(s.id)}"><span class="grow">${esc(s.nombre)}</span><span class="muted small">costo ${money(s.costo)}</span><strong>${money(s.precio)} / ${UNIDADES[s.unidad] || ""}</strong></div>`).join("") || `<p class="muted">Sin servicios.</p>`}
      </div>
    </div>

    <div class="card">
      <h3 class="card-h">Respaldo y exportación</h3>
      ${DEMO_MODE ? `<p class="notice">Modo demo: la información se guarda solo en este dispositivo. Haz un respaldo de vez en cuando.</p>` : ""}
      <div class="form-actions wrap">
        <button class="btn btn-ghost" id="btn-respaldo">📥 Descargar respaldo</button>
        <button class="btn btn-ghost" id="btn-restaurar">📤 Restaurar respaldo</button>
        <button class="btn btn-ghost" id="btn-csv">📊 Exportar trabajos a Excel</button>
        <button class="btn btn-ghost" id="btn-instalar" hidden>📲 Instalar app</button>
      </div>
      <input type="file" id="file-restaurar" accept=".json,application/json" hidden />
    </div>

    <div class="card" id="errores">
      <div class="card-h-row"><h3 class="card-h">Errores registrados</h3>
        <span class="muted small">Entorno: <b>${ENTORNO === "prueba" ? "PRUEBA" : "PRODUCCIÓN"}</b>${DEMO_MODE ? " · demo local" : " · Firebase"}</span></div>
      ${erroresHTML()}
    </div>

    ${DEMO_MODE ? `
    <div class="card">
      <h3 class="card-h">Datos de ejemplo</h3>
      <p class="muted small">Carga clientes y trabajos ficticios para ver la app llena, o borra todo para empezar desde cero.</p>
      <div class="form-actions wrap">
        <button class="btn btn-ghost" id="btn-ejemplo">✨ Cargar ejemplos</button>
        <button class="btn btn-danger" id="btn-borrar">Borrar todos los datos</button>
      </div>
    </div>` : ""}
  `;

  bindErrores(container);

  $("#f-negocio", container).onsubmit = async (e) => {
    e.preventDefault();
    e.target.removeAttribute("data-dirty"); // ya se guarda: permitir repintar
    const f = Object.fromEntries(new FormData(e.target).entries());
    await store.save("ajustes", { ...store.ajustes(), ...f, id: "config", ivaPct: num(f.ivaPct), vigenciaDias: num(f.vigenciaDias) || 15 });
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
      if (!(await confirmar("Se agregarán los registros del respaldo. Lo que hoy esté más actualizado NO se reemplaza. ¿Continuar?", "Restaurar"))) return;
      const r = await store.importarTodo(data);
      toast(`Restaurado: ${r.nuevos} nuevos, ${r.actualizados} actualizados, ${r.omitidos} sin cambio`);
    } catch (err) {
      reportarError("restaurar respaldo", err);
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

// ---------- Panel de errores ----------
function erroresHTML() {
  const lista = listarErrores();
  if (!lista.length) return `<p class="muted small">✅ Sin errores registrados.</p>`;
  return `
    <p class="muted small">Si algo falló sin avisar, aparece aquí. Mándale esta lista al desarrollador.</p>
    <div class="err-list">
      ${lista.slice(0, 20).map((e) => `
        <details class="err-item ${e.visto ? "" : "nuevo"}">
          <summary><b>${esc(e.contexto)}</b> · ${esc(e.mensaje)}<span class="muted small"> · ${esc(new Date(e.fecha).toLocaleString("es-MX"))}</span></summary>
          <pre>${esc([e.codigo && "código: " + e.codigo, "ruta: " + e.ruta, e.stack].filter(Boolean).join("\n"))}</pre>
        </details>`).join("")}
    </div>
    <div class="form-actions wrap">
      <button class="btn btn-ghost btn-sm" id="err-copiar">📋 Copiar</button>
      <button class="btn btn-ghost btn-sm" id="err-descargar">📥 Descargar</button>
      <button class="btn btn-danger btn-sm" id="err-limpiar">Limpiar</button>
    </div>`;
}

function bindErrores(container) {
  marcarVistos();
  const texto = () => JSON.stringify(listarErrores(), null, 2);
  const c = $("#err-copiar", container);
  if (!c) return;
  c.onclick = async () => {
    try { await navigator.clipboard.writeText(texto()); toast("Errores copiados"); }
    catch { descargar(`errores-${hoyISO()}.json`, texto()); }
  };
  $("#err-descargar", container).onclick = () => descargar(`errores-${hoyISO()}.json`, texto());
  $("#err-limpiar", container).onclick = () => { limpiarErrores(); renderAjustes(container); };
}

function formServicio(s = {}) {
  const body = openModal(s.id ? "Editar servicio" : "Nuevo servicio", `
    <form id="f-serv" class="form">
      <label class="field"><span>Nombre *</span><input class="input" name="nombre" required value="${esc(s.nombre || "")}" /></label>
      <div class="cols-3">
        <label class="field"><span>Unidad</span><select class="input" name="unidad">${Object.entries(UNIDADES).map(([k, v]) => `<option value="${k}" ${(s.unidad || "m2") === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="field"><span>Precio al cliente</span><input class="input" name="precio" type="number" inputmode="decimal" step="0.01" value="${esc(s.precio ?? "")}" /></label>
        <label class="field"><span>Costo unitario</span><input class="input" name="costo" type="number" inputmode="decimal" step="0.01" value="${esc(s.costo ?? "")}" /></label>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary grow" type="submit">Guardar</button>
        ${s.id ? `<button class="btn btn-danger" type="button" data-del>Eliminar</button>` : ""}
      </div>
    </form>`);
  $("#f-serv", body).onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    await store.save("servicios", { ...s, nombre: f.nombre.trim(), unidad: f.unidad, precio: num(f.precio), costo: num(f.costo) });
    closeModal();
  };
  const del = $("[data-del]", body);
  if (del) del.onclick = async () => { await store.remove("servicios", s.id); closeModal(); };
}

function exportarCSV() {
  const rows = [["Folio", "Fecha alta", "Cliente", "Teléfono", "Obra", "m²", "Conceptos", "Estado", "Fecha instalación", "Total", "Pagado", "Saldo", "Costo material"]];
  store.all("ordenes").sort((a, b) => a.folio - b.folio).forEach((o) => {
    const t = totales(o);
    rows.push([o.folio, o.fechaIngreso, o.clienteNombre, o.telefono, obraTxt(o.obra), o.obra?.m2 || "",
      (o.servicios || []).map((s) => `${s.descripcion} (${lineaTxt(s)})`).join(" | "), ESTADOS[o.estado], o.fechaInstalacion || "",
      t.total.toFixed(2), t.pagado.toFixed(2), t.saldo.toFixed(2), t.costo.toFixed(2)]);
  });
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  // BOM para que Excel respete acentos.
  descargar(`trabajos-${hoyISO()}.csv`, "\uFEFF" + csv, "text/csv;charset=utf-8");
}

// DATOS FICTICIOS: nombres inventados y teléfonos 871-000-00xx que no
// existen. Nunca poner aquí (ni en el repo) datos de clientes reales.
async function cargarEjemplos() {
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
  const L = (descripcion, cantidad, unidad, precio, costo) => ({ descripcion, cantidad, unidad, precio, costo });
  const ej = [
    ["Cliente Ejemplo Uno", "8710000001", { direccion: "Calle Ficticia 101", colonia: "Col. Demo", espacio: "Sala y comedor", m2: 38 },
      [L("Piso laminado 12 mm", 42, "m2", 420, 290), L("Bajo piso / espuma", 42, "m2", 35, 18), L("Instalación de piso", 38, "m2", 120, 0), L("Zoclo PVC", 26, "ml", 95, 45)], "INSTALACION", -6, 0, [12000]],
    ["Cliente Ejemplo Dos", "8710000002", { direccion: "Av. Prueba 202", colonia: "Fracc. Ejemplo", espacio: "Recámara principal", m2: 6.5 },
      [L("Persiana enrollable blackout", 6.5, "m2", 950, 520), L("Instalación de persiana", 3, "pza", 250, 0)], "MATERIAL", -3, 4, [3500]],
    ["Oficinas Demo S.A.", "8710000003", { direccion: "Blvd. Imaginario 303", colonia: "Zona Centro", espacio: "Oficina y recepción", m2: 60 },
      [L("Piso SPC 5 mm (click)", 66, "m2", 480, 330), L("Instalación de piso", 60, "m2", 120, 0)], "MEDICION", -1, 9, []],
    ["Cliente Ejemplo Cuatro", "8710000004", { direccion: "Privada Muestra 404", colonia: "Col. Demo", espacio: "Muro de TV", m2: "" },
      [L("Panel decorativo WPC / ranurado", 6, "pza", 650, 380)], "TERMINADO", -12, -8, [3900]]
  ];
  for (const [nombre, tel, obra, servicios, estado, alta, inst, pagos] of ej) {
    const c = await store.save("clientes", { nombre, telefono: tel });
    await store.save("ordenes", {
      folio: await store.reservarFolio("ordenes"), clienteId: c.id, clienteNombre: nombre, telefono: tel, obra, servicios,
      descuento: 0, conIva: false, ivaPct: 16, estado, fechaIngreso: d(alta), fechaInstalacion: d(inst),
      pagos: pagos.map((monto) => ({ monto, metodo: "Transferencia", fecha: d(alta), nota: "Anticipo" })), notas: "", garantia: store.ajustes().garantia
    });
  }
  await store.save("cotizaciones", {
    folio: await store.reservarFolio("cotizaciones"), fecha: d(-2), estado: "ABIERTA", clienteNombre: "Cliente Ejemplo Cinco", telefono: "8710000005",
    obra: { direccion: "Calle Ficticia 505", colonia: "Col. Demo", espacio: "Toda la casa (planta baja)", m2: 72 },
    servicios: [L("Piso vinílico PVC autoadherible", 79, "m2", 260, 160), L("Instalación de piso", 72, "m2", 120, 0)],
    descuento: 500, conIva: false, ivaPct: 16, vigenciaDias: 15, notas: "Incluye retiro de muebles ligeros."
  });
  await store.save("gastos", { concepto: "Pegamento, cortadora y discos", monto: 1350, fecha: d(-4), categoria: "Herramienta" });
  await store.save("gastos", { concepto: "Flete de material", monto: 800, fecha: d(-2), categoria: "Fletes / gasolina" });
  await store.save("gastos", { concepto: "Renta de bodega", monto: 4500, fecha: d(0), categoria: "Renta" });
  toast("Ejemplos cargados");
}
