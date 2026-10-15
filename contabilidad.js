'use strict';

// ---------------------------------------------------------------------------
// Gastos, impuestos (IVA trimestral y pago a cuenta de IRPF) y beneficio por cocina.
// Para autónomos en estimación directa simplificada. Son estimaciones orientativas:
// la liquidación real la confirma el gestor.
// Usa gestion.js (leerDocs, totales, leerJSON…) y app.js ($, aviso, hoy…).
// ---------------------------------------------------------------------------
const CLAVE_GASTOS = 'planosCocina.gastos';
const CATEGORIAS_GASTO = [
  'Material (tablas, encimeras)', 'Fregaderos y accesorios', 'Transporte y portes', 'Herramienta y maquinaria',
  'Vehículo y gasoil', 'Cuota de autónomos', 'Seguros', 'Alquiler / nave', 'Suministros (luz, agua, teléfono)',
  'Gestoría y asesoría', 'Publicidad', 'Otros',
];
const DIFICIL_JUSTIFICACION = 0.05;   // 5 % del rendimiento neto positivo…
const DIFICIL_JUSTIFICACION_MAX = 2000; // …con un máximo de 2.000 € al año
// plazo de presentación de cada trimestre (modelos 303 y 130)
const PLAZOS = { 1: '1 al 20 de abril', 2: '1 al 20 de julio', 3: '1 al 20 de octubre', 4: '1 al 30 de enero' };

const leerGastos = () => leerJSON(CLAVE_GASTOS, []);

function guardarGasto(g) {
  g.modificado = Date.now();
  const lista = leerGastos();
  const i = lista.findIndex((x) => x.id === g.id);
  if (i >= 0) lista[i] = g; else lista.push(g);
  escribirJSON(CLAVE_GASTOS, lista);
}

const trimDe = (fecha) => Math.floor((Number(String(fecha).slice(5, 7)) - 1) / 3) + 1;
const ivaGasto = (g) => redondear((Number(g.base) || 0) * (Number(g.tipoIva) || 0) / 100);

function confFiscal() {
  const e = leerEmpresa();
  const num = (v, def) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : def) / 100;
  return { irpfMedio: num(e.irpfMedio, 20), irpf130: num(e.irpf130, 20) };
}

// Facturas válidas (no anuladas) de un año, opcionalmente hasta un trimestre.
function facturasDe(anio, hastaTrim = 4, soloTrim = null) {
  return leerRapido(CLAVE_DOCS, []).filter((d) => d.tipo === 'factura' && d.estado !== 'Anulada' && anioDe(d.fecha) === anio
    && (soloTrim ? trimDe(d.fecha) === soloTrim : trimDe(d.fecha) <= hastaTrim));
}
function gastosDe(anio, hastaTrim = 4, soloTrim = null) {
  return leerRapido(CLAVE_GASTOS, []).filter((g) => g.deducible && anioDe(g.fecha) === anio
    && (soloTrim ? trimDe(g.fecha) === soloTrim : trimDe(g.fecha) <= hastaTrim));
}

// IVA del trimestre (modelo 303): repercutido en facturas − soportado en gastos deducibles.
function ivaTrimestre(anio, trim) {
  const repercutido = redondear(facturasDe(anio, 4, trim).reduce((s, d) => s + totales(d).iva, 0));
  const soportado = redondear(gastosDe(anio, 4, trim).reduce((s, g) => s + ivaGasto(g), 0));
  return { repercutido, soportado, resultado: redondear(repercutido - soportado) };
}

// Rendimiento acumulado del 1 de enero al final de un trimestre (estimación directa simplificada).
function rendimientoAcumulado(anio, trim) {
  const ingresos = redondear(facturasDe(anio, trim).reduce((s, d) => s + totales(d).base, 0));
  const gastos = redondear(gastosDe(anio, trim).reduce((s, g) => s + (Number(g.base) || 0), 0));
  const previo = ingresos - gastos;
  const dificil = previo > 0 ? redondear(Math.min(previo * DIFICIL_JUSTIFICACION, DIFICIL_JUSTIFICACION_MAX)) : 0;
  return { ingresos, gastos, dificil, rendimiento: redondear(previo - dificil) };
}

// Pago fraccionado de IRPF (modelo 130): % del rendimiento acumulado − pagos anteriores del año.
function irpfTrimestre(anio, trim) {
  const { irpf130 } = confFiscal();
  let pagado = 0;
  let res = null;
  for (let t = 1; t <= trim; t++) {
    const r = rendimientoAcumulado(anio, t);
    const cuota = redondear(Math.max(0, r.rendimiento) * irpf130);
    const pago = redondear(Math.max(0, cuota - pagado));
    res = { ...r, cuota, anteriores: pagado, pago };
    pagado = redondear(pagado + pago);
  }
  return res;
}

// Gastos asignados a una cocina: los apuntados a la factura, a sus documentos de origen
// (presupuesto, albarán) o a cualquier documento del mismo trabajo.
// Índices para no recorrer todo en cada cocina (se rehacen solo si cambian los datos)
let indiceCocinas = null;
function indicesCocinas() {
  const docs = leerRapido(CLAVE_DOCS, []);
  const gastos = leerRapido(CLAVE_GASTOS, []);
  const conf = JSON.stringify(confFiscal());
  if (indiceCocinas && indiceCocinas.docs === docs && indiceCocinas.gastos === gastos && indiceCocinas.conf === conf) return indiceCocinas;
  const porId = new Map(docs.map((d) => [d.id, d]));
  const porTrabajo = new Map();
  for (const d of docs) if (d.trabajoId) (porTrabajo.get(d.trabajoId) || porTrabajo.set(d.trabajoId, []).get(d.trabajoId)).push(d);
  const gastosPorDoc = new Map();
  for (const g of gastos) if (g.docId) (gastosPorDoc.get(g.docId) || gastosPorDoc.set(g.docId, []).get(g.docId)).push(g);
  indiceCocinas = { docs, gastos, conf, porId, porTrabajo, gastosPorDoc, anual: new Map() };
  return indiceCocinas;
}
function gastosDeCocina(doc) {
  const ix = indicesCocinas();
  const ids = new Set([doc.id]);
  let o = doc.origen;
  while (o && !ids.has(o.id)) {
    ids.add(o.id);
    o = (ix.porId.get(o.id) || {}).origen;
  }
  if (doc.trabajoId) for (const d of ix.porTrabajo.get(doc.trabajoId) || []) ids.add(d.id);
  return [...ids].flatMap((id) => ix.gastosPorDoc.get(id) || []);
}

// Beneficio aproximado de una cocina (factura o presupuesto):
// base − gastos propios − parte de los gastos generales del año (en proporción a lo facturado) − IRPF medio.
function beneficioCocina(doc) {
  const anio = anioDe(doc.fecha);
  const base = totales(doc).base;
  // una rectificativa no vuelve a restar los gastos de la cocina (ya los resta la factura original)
  const directos = doc.rectifica ? 0 : redondear(gastosDeCocina(doc).filter((g) => g.deducible).reduce((s, g) => s + (Number(g.base) || 0), 0));
  // datos del año: se calculan una vez y sirven para todas las cocinas
  const ix = indicesCocinas();
  if (!ix.anual.has(anio)) {
    ix.anual.set(anio, {
      facturado: facturasDe(anio).reduce((s, d) => s + totales(d).base, 0),
      generales: gastosDe(anio).filter((g) => !g.docId).reduce((s, g) => s + (Number(g.base) || 0), 0),
      rend: rendimientoAcumulado(anio, 4),
    });
  }
  const { facturado, generales: generalesAnio, rend: anual } = ix.anual.get(anio);
  // un presupuesto aún no facturado cuenta como si se sumara a lo facturado
  const totalBase = doc.tipo === 'factura' ? facturado : facturado + base;
  const generales = totalBase > 0 ? redondear(generalesAnio * base / totalBase) : 0;
  const antes = redondear(base - directos - generales);
  // el IRPF se calcula sobre el rendimiento neto (con el 5 % de difícil justificación),
  // repartido igual que en el resumen del año para que las cifras cuadren
  const beneficioAnual = anual.ingresos - anual.gastos;
  const factor = beneficioAnual > 0 ? Math.max(0, anual.rendimiento) / beneficioAnual : 1;
  const irpf = redondear(Math.max(0, antes) * confFiscal().irpfMedio * factor);
  const limpio = redondear(antes - irpf);
  return { base, directos, generales, antes, irpf, limpio, margen: base > 0 ? limpio / base : 0 };
}

// ---------------------------------------------------------------------------
// Pestaña Gastos
// ---------------------------------------------------------------------------
function opcionesCocina(sel, elegido) {
  const clientes = Object.fromEntries(leerClientes().map((c) => [c.id, c.nombre]));
  const docs = leerDocs().filter((d) => d.tipo !== 'albaran' && d.estado !== 'Anulada')
    .sort((a, b) => (b.fecha + b.numero).localeCompare(a.fecha + a.numero)).slice(0, 200);
  sel.replaceChildren(new Option('— Gasto general (no es de una cocina) —', ''),
    ...docs.map((d) => new Option(`${TIPOS_DOC[d.tipo].nombre} ${d.numero} · ${clientes[d.clienteId] || 'Sin cliente'}`, d.id)));
  sel.value = elegido || '';
}

let limiteGastos = 150;
function pintarGastos() {
  const gastos = leerGastos();
  llenarAnios($('#gastosAnio'), gastos);
  const anio = Number($('#gastosAnio').value);
  const trim = Number($('#gastosTrim').value) || null;
  const texto = normalizar($('#gastosTexto').value);
  const docs = Object.fromEntries(leerDocs().map((d) => [d.id, d]));
  const lista = gastos
    .filter((g) => anioDe(g.fecha) === anio && (!trim || trimDe(g.fecha) === trim))
    .filter((g) => !texto || normalizar(`${g.proveedor} ${g.concepto} ${g.categoria}`).includes(texto))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const deducibles = lista.filter((g) => g.deducible);
  const base = deducibles.reduce((s, g) => s + (Number(g.base) || 0), 0);
  const iva = deducibles.reduce((s, g) => s + ivaGasto(g), 0);
  $('#resumenGastos').innerHTML = `<span>${lista.length} gastos</span>`
    + `<span>Base deducible <b>${fmtEuro(base)}</b></span><span>IVA soportado <b>${fmtEuro(iva)}</b></span>`;
  const cont = $('#listaGastos');
  if (!lista.length) {
    cont.innerHTML = '<p class="vacio">No hay gastos en este periodo. Apunta las compras de tablas, el gasoil, la cuota de autónomos, la gestoría…</p>';
    return;
  }
  cont.innerHTML = lista.slice(0, limiteGastos).map((g) => {
    const doc = docs[g.docId];
    return `<div class="doc" data-id="${g.id}">
      <div class="doc-info" data-accion="editar" tabindex="0" role="button">
        <strong>${escapar(g.concepto || g.categoria)}</strong>
        <span>${escapar([g.proveedor, g.categoria, fechaLegible(g.fecha)].filter(Boolean).join(' · '))}</span>
      </div>
      <span class="estado ${g.deducible ? 'ok' : 'mal'}">${doc ? `${TIPOS_DOC[doc.tipo].nombre} ${escapar(doc.numero)}` : g.deducible ? 'General' : 'No deducible'}</span>
      <strong class="doc-total">${fmtEuro(redondear((Number(g.base) || 0) + ivaGasto(g)))}</strong>
    </div>`;
  }).join('')
    + (lista.length > limiteGastos ? `<button type="button" class="ver-mas" data-mas-gastos>Ver más (quedan ${lista.length - limiteGastos})</button>` : '');
}
const pintarGastosDesdeArriba = () => { limiteGastos = 150; pintarGastos(); };
['#gastosAnio', '#gastosTrim'].forEach((s) => $(s).addEventListener('change', pintarGastosDesdeArriba));
$('#gastosTexto').addEventListener('input', pintarGastosDesdeArriba);
$('#listaGastos').addEventListener('click', (e) => {
  if (e.target.closest('[data-mas-gastos]')) { limiteGastos += 300; pintarGastos(); return; }
  const el = e.target.closest('[data-accion]');
  if (!el) return;
  const g = leerGastos().find((x) => x.id === el.closest('.doc').dataset.id);
  if (g) editarGasto(g);
});
$('#btnNuevoGasto').addEventListener('click', () => editarGasto(null));

const dlgGasto = $('#dlgGasto');
const formGasto = $('#formGasto');
let gastoEditado = null;
formGasto.elements.categoria.replaceChildren(...CATEGORIAS_GASTO.map((c) => new Option(c, c)));

function totalGastoForm() {
  const base = Number(formGasto.elements.base.value) || 0;
  const iva = redondear(base * Number(formGasto.elements.tipoIva.value) / 100);
  $('#gastoTotal').textContent = `IVA ${fmtEuro(iva)} · Total ${fmtEuro(redondear(base + iva))}`;
}

function editarGasto(g, docId = '') {
  gastoEditado = g ? { ...g } : { id: nuevoId(), fecha: hoy(), categoria: CATEGORIAS_GASTO[0], tipoIva: 21, deducible: true, docId };
  const f = formGasto.elements;
  for (const k of ['fecha', 'proveedor', 'concepto', 'categoria', 'base']) f[k].value = gastoEditado[k] ?? '';
  f.tipoIva.value = String(gastoEditado.tipoIva ?? 21);
  f.deducible.checked = gastoEditado.deducible !== false;
  opcionesCocina(f.docId, gastoEditado.docId);
  $('#listaProveedores').replaceChildren(...[...new Set(leerGastos().map((x) => x.proveedor).filter(Boolean))].map((p) => new Option(p, p)));
  $('#btnBorrarGasto').hidden = !g;
  $('#btnDuplicarGasto').hidden = !g;
  totalGastoForm();
  dlgGasto.returnValue = '';
  dlgGasto.showModal();
}

function leerFormGasto() {
  const f = formGasto.elements;
  Object.assign(gastoEditado, {
    fecha: f.fecha.value || hoy(), proveedor: f.proveedor.value.trim(), concepto: f.concepto.value.trim(),
    categoria: f.categoria.value, base: f.base.value === '' ? 0 : redondear(Number(f.base.value)),
    tipoIva: Number(f.tipoIva.value), deducible: f.deducible.checked, docId: f.docId.value,
  });
  return gastoEditado;
}

formGasto.addEventListener('input', totalGastoForm);
// la cuota de autónomos no lleva IVA
formGasto.elements.categoria.addEventListener('change', (e) => {
  if (/autónomos|seguros/i.test(e.target.value)) { formGasto.elements.tipoIva.value = '0'; totalGastoForm(); }
});
dlgGasto.addEventListener('close', () => {
  if (dlgGasto.returnValue !== 'ok' || !gastoEditado) return;
  const g = leerFormGasto();
  if (!g.base) { aviso('Falta el importe del gasto'); return; }
  guardarGasto(g);
  aviso('Gasto guardado');
  refrescarContabilidad();
});
$('#btnBorrarGasto').addEventListener('click', () => {
  if (!confirm('¿Borrar este gasto?')) return;
  escribirJSON(CLAVE_GASTOS, leerGastos().filter((x) => x.id !== gastoEditado.id));
  gastoEditado = null;
  dlgGasto.close();
  refrescarContabilidad();
});
// copia el gasto al mes siguiente (cuota de autónomos, alquiler, gestoría…)
$('#btnDuplicarGasto').addEventListener('click', () => {
  const g = leerFormGasto();
  guardarGasto(g);
  const d = new Date(`${g.fecha}T12:00:00`);
  d.setMonth(d.getMonth() + 1);
  const copia = { ...g, id: nuevoId(), fecha: d.toISOString().slice(0, 10) };
  guardarGasto(copia);
  gastoEditado = null;
  dlgGasto.close();
  aviso(`Gasto repetido el ${fechaLegible(copia.fecha)}`);
  refrescarContabilidad();
});

function refrescarContabilidad() {
  if (!$('#pGastos').hidden) pintarGastos();
  if (!$('#pImpuestos').hidden) pintarImpuestos();
  if (dlgDoc.open && docEditado) pintarRentabilidadDoc(docEditado);
}

// ---------------------------------------------------------------------------
// Pestaña Impuestos y beneficio
// ---------------------------------------------------------------------------
function pintarImpuestos() {
  const docs = leerDocs();
  llenarAnios($('#impAnio'), docs);
  if (!$('#impTrim').dataset.listo) {
    $('#impTrim').value = String(trimDe(hoy()));
    $('#impTrim').dataset.listo = '1';
  }
  const anio = Number($('#impAnio').value);
  const trim = Number($('#impTrim').value);
  const conf = confFiscal();
  const iva = ivaTrimestre(anio, trim);
  const irpf = irpfTrimestre(anio, trim);
  const anual = rendimientoAcumulado(anio, 4);
  const irpfAnual = redondear(Math.max(0, anual.rendimiento) * conf.irpfMedio);
  const ivaAnual = [1, 2, 3, 4].map((t) => ivaTrimestre(anio, t).resultado).reduce((s, v) => s + v, 0);
  const plazoAnio = trim === 4 ? anio + 1 : anio;
  const fila = (txt, val, clase = '') => `<tr class="${clase}"><td>${txt}</td><td class="num">${val}</td></tr>`;
  const pct = (v) => `${(v * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;

  const cocinas = facturasDe(anio).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const clientes = Object.fromEntries(leerClientes().map((c) => [c.id, c.nombre]));
  const filasCocina = cocinas.map((d) => {
    const b = beneficioCocina(d);
    return `<tr><td>${escapar(d.numero)}</td><td>${escapar(clientes[d.clienteId] || '')}</td>`
      + `<td class="num">${fmtEuro(b.base)}</td><td class="num">${fmtEuro(b.directos)}</td><td class="num">${fmtEuro(b.generales)}</td>`
      + `<td class="num">${fmtEuro(b.irpf)}</td><td class="num"><b class="${b.limpio < 0 ? 'mal-txt' : ''}">${fmtEuro(b.limpio)}</b></td>`
      + `<td class="num">${pct(b.margen)}</td></tr>`;
  }).join('');
  const sumaLimpio = cocinas.reduce((s, d) => s + beneficioCocina(d).limpio, 0);

  $('#impuestos').innerHTML = `
    <div class="bloques-imp">
      <div class="bloque-imp">
        <h3>IVA · ${trim}.º trimestre ${anio} <small>(modelo 303)</small></h3>
        <table>${fila('IVA de tus facturas (repercutido)', fmtEuro(iva.repercutido))}
          ${fila('IVA de tus gastos (soportado)', '− ' + fmtEuro(iva.soportado))}
          ${fila(iva.resultado >= 0 ? 'A pagar' : 'A compensar en el siguiente', fmtEuro(Math.abs(iva.resultado)), 'total')}</table>
        <p class="ayuda">Plazo: del ${PLAZOS[trim]} de ${plazoAnio}.</p>
      </div>
      <div class="bloque-imp">
        <h3>IRPF · ${trim}.º trimestre ${anio} <small>(modelo 130)</small></h3>
        <table>${fila('Ingresos del 1 de enero al fin del trimestre', fmtEuro(irpf.ingresos))}
          ${fila('Gastos deducibles', '− ' + fmtEuro(irpf.gastos))}
          ${fila('Gastos de difícil justificación (5 %)', '− ' + fmtEuro(irpf.dificil))}
          ${fila('Rendimiento neto', fmtEuro(irpf.rendimiento))}
          ${fila(`${pct(conf.irpf130)} del rendimiento`, fmtEuro(irpf.cuota))}
          ${fila('Ya pagado en trimestres anteriores', '− ' + fmtEuro(irpf.anteriores))}
          ${fila('A pagar', fmtEuro(irpf.pago), 'total')}</table>
        <p class="ayuda">Plazo: del ${PLAZOS[trim]} de ${plazoAnio}. Si tus clientes te retienen IRPF en las facturas, se resta.</p>
      </div>
      <div class="bloque-imp">
        <h3>Resumen del año ${anio}</h3>
        <table>${fila('Facturado (sin IVA)', fmtEuro(anual.ingresos))}
          ${fila('Gastos deducibles', '− ' + fmtEuro(anual.gastos))}
          ${fila('Beneficio (antes de IRPF)', fmtEuro(redondear(anual.ingresos - anual.gastos)))}
          ${fila(`IRPF aproximado (${pct(conf.irpfMedio)} de ${fmtEuro(anual.rendimiento)} de rendimiento neto)`, '− ' + fmtEuro(irpfAnual))}
          ${fila('Te queda limpio aprox.', fmtEuro(redondear(anual.ingresos - anual.gastos - irpfAnual)), 'total')}
          ${fila('IVA a ingresar en el año', fmtEuro(redondear(ivaAnual)))}</table>
        <p class="ayuda">El IVA no es tuyo: lo cobras al cliente y se lo pagas a Hacienda. La cuota de autónomos se apunta como gasto.</p>
      </div>
    </div>
    <h3>Beneficio por cocina (${anio})</h3>
    ${cocinas.length ? `<div class="tabla-balance"><table>
      <thead><tr><th>Factura</th><th>Cliente</th><th class="num">Facturado</th><th class="num">Sus gastos</th><th class="num">Parte gastos generales</th>
        <th class="num">IRPF aprox.</th><th class="num">Limpio</th><th class="num">Margen</th></tr></thead>
      <tbody>${filasCocina}</tbody>
      <tfoot><tr class="total"><td colspan="6">Total limpio aprox.</td><td class="num">${fmtEuro(redondear(sumaLimpio))}</td><td></td></tr></tfoot>
    </table></div>` : '<p class="vacio">Todavía no hay facturas este año.</p>'}
    <p class="ayuda">«Sus gastos» son los gastos asignados a esa cocina (tablas, fregadero, portes…). Los gastos generales
      (gasoil, cuota, gestoría…) se reparten entre las cocinas según lo facturado. Son cálculos orientativos para
      estimación directa simplificada: el importe exacto de cada modelo lo confirma tu gestor.</p>`;
}
['#impAnio', '#impTrim'].forEach((s) => $(s).addEventListener('change', pintarImpuestos));

// ---------------------------------------------------------------------------
// Rentabilidad en la ventana de presupuestos y facturas
// ---------------------------------------------------------------------------
function pintarRentabilidadDoc(doc) {
  const p = $('#docRentabilidad');
  if (!doc || doc.tipo === 'albaran') { p.hidden = true; return; }
  const b = beneficioCocina(doc);
  const nGastos = gastosDeCocina(doc).length;
  p.hidden = false;
  p.innerHTML = `<b>Te queda limpio aprox. ${fmtEuro(b.limpio)}</b> (${(b.margen * 100).toFixed(0)} %) · `
    + `sus gastos ${fmtEuro(b.directos)}${nGastos ? ` (${nGastos})` : ''} · parte de generales ${fmtEuro(b.generales)} · IRPF ${fmtEuro(b.irpf)} `
    + `<button type="button" class="enlace" id="btnGastoDoc">+ Apuntar un gasto de esta cocina</button>`;
  $('#btnGastoDoc').onclick = () => {
    if (docEsNuevo && !guardarEditor()) return;
    editarGasto(null, doc.id);
  };
}

// ---------------------------------------------------------------------------
// Libros registro de ingresos y de gastos (estimación directa), en CSV para Excel o el gestor
// ---------------------------------------------------------------------------
function exportarLibro(tipo) {
  const anio = Number($('#impAnio').value) || new Date().getFullYear();
  const trim = $('#libroAnio').checked ? null : Number($('#impTrim').value);
  const enPeriodo = (f) => anioDe(f) === anio && (!trim || trimDe(f) === trim);
  const num = (n) => (Number(n) || 0).toFixed(2).replace('.', ',');
  const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lineas = [];
  if (tipo === 'ingresos') {
    const clientes = Object.fromEntries(leerClientes().map((c) => [c.id, c]));
    lineas.push(['Número', 'Fecha', 'Cliente', 'NIF cliente', 'Base imponible', 'Tipo IVA', 'Cuota IVA', 'Total', 'Rectifica a', 'Estado', 'Fecha de cobro']);
    leerDocs().filter((d) => d.tipo === 'factura' && enPeriodo(d.fecha))
      .sort((a, b) => (a.fecha + a.numero).localeCompare(b.fecha + b.numero))
      .forEach((d) => {
        const c = clientes[d.clienteId] || {};
        const t = totales(d);
        lineas.push([d.numero, fechaLegible(d.fecha), c.nombre, c.nif, num(t.base), d.conIva ? '21 %' : 'Sin IVA', num(t.iva), num(t.total),
          d.rectifica ? d.rectifica.numero : '', d.estado, d.fechaCobro ? fechaLegible(d.fechaCobro) : '']);
      });
  } else {
    const docs = Object.fromEntries(leerDocs().map((d) => [d.id, d]));
    lineas.push(['Fecha', 'Proveedor', 'Concepto', 'Categoría', 'Base imponible', 'Tipo IVA', 'Cuota IVA', 'Total', 'Deducible', 'Cocina']);
    leerGastos().filter((g) => enPeriodo(g.fecha)).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
      .forEach((g) => {
        const base = Number(g.base) || 0;
        const iva = ivaGasto(g);
        lineas.push([fechaLegible(g.fecha), g.proveedor, g.concepto, g.categoria, num(base), `${Number(g.tipoIva) || 0} %`, num(iva), num(base + iva),
          g.deducible ? 'Sí' : 'No', docs[g.docId] ? docs[g.docId].numero : '']);
      });
  }
  if (lineas.length === 1) { aviso('No hay nada en ese periodo'); return; }
  const periodo = trim ? `${anio}-T${trim}` : String(anio);
  descargar(new Blob(['\ufeff' + lineas.map((l) => l.map(celda).join(';')).join('\r\n')], { type: 'text/csv' }), `libro-${tipo}-${periodo}.csv`);
  aviso(`Libro de ${tipo} ${trim ? `del ${trim}.º trimestre` : 'del año'} descargado`);
}
$$('[data-libro]').forEach((b) => b.addEventListener('click', () => exportarLibro(b.dataset.libro)));
