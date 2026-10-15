'use strict';

// ---------------------------------------------------------------------------
// Gestión: clientes, presupuestos, albaranes, facturas y balance mensual.
// Usa utilidades de app.js ($, aviso, descargar, pintarCabecera…) y de
// presupuesto.js (calcular, fmtEuro, fmtCant, escapar, IVA).
// ---------------------------------------------------------------------------
const CLAVE_CLIENTES = 'planosCocina.clientes';
const CLAVE_DOCS = 'planosCocina.documentos';
const CLAVE_EMPRESA = 'planosCocina.empresa';

const TIPOS_DOC = {
  presupuesto: { nombre: 'Presupuesto', plural: 'Presupuestos', prefijo: 'P', titulo: 'PRESUPUESTO',
    estados: ['Pendiente', 'Aceptado', 'Rechazado'] },
  albaran: { nombre: 'Albarán', plural: 'Albaranes', prefijo: 'A', titulo: 'ALBARÁN',
    estados: ['Pendiente de facturar', 'Facturado'] },
  factura: { nombre: 'Factura', plural: 'Facturas', prefijo: 'F', titulo: 'FACTURA',
    estados: ['Pendiente de cobro', 'Cobrada', 'Anulada'] },
};
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// ---------------------------------------------------------------------------
// Almacenamiento
// ---------------------------------------------------------------------------
function leerJSON(clave, defecto) {
  try {
    const v = JSON.parse(localStorage.getItem(clave));
    return v ?? defecto;
  } catch {
    return defecto;
  }
}
// Lectura rápida SOLO para consultar (cálculos, listas, Inicio): si los datos no han cambiado
// se reutilizan ya leídos en vez de volver a descifrarlos. No modificar lo que devuelve.
const cacheLectura = new Map();
function leerRapido(clave, defecto) {
  let crudo = null;
  try { crudo = localStorage.getItem(clave); } catch { /* sin almacenamiento */ }
  const c = cacheLectura.get(clave);
  if (c && c.crudo === crudo) return c.valor;
  let valor = defecto;
  try { valor = JSON.parse(crudo) ?? defecto; } catch { /* dañado */ }
  cacheLectura.set(clave, { crudo, valor });
  return valor;
}

function escribirJSON(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch {
    aviso('No se pudo guardar en este dispositivo');
    return false;
  }
}
const leerClientes = () => leerJSON(CLAVE_CLIENTES, []);
const leerDocs = () => leerJSON(CLAVE_DOCS, []);
const leerEmpresa = () => leerJSON(CLAVE_EMPRESA, {});

function guardarCliente(cli) {
  cli.modificado = Date.now();
  const lista = leerClientes();
  const i = lista.findIndex((c) => c.id === cli.id);
  if (i >= 0) lista[i] = cli; else lista.push(cli);
  escribirJSON(CLAVE_CLIENTES, lista);
}

function guardarDoc(doc) {
  doc.modificado = Date.now();
  const lista = leerDocs();
  const i = lista.findIndex((d) => d.id === doc.id);
  if (i >= 0) lista[i] = doc; else lista.push(doc);
  escribirJSON(CLAVE_DOCS, lista);
  // el seguimiento de la cocina avanza solo: aceptado → entregado (albarán) → cobrado
  if (doc.trabajoId) {
    const meta = doc.tipo === 'presupuesto' && doc.estado === 'Aceptado' ? 'Aceptado'
      : doc.tipo === 'albaran' ? 'Colocado'
        : doc.tipo === 'factura' && doc.estado === 'Cobrada' && !doc.rectifica ? 'Cobrado' : '';
    if (meta) avanzarTrabajo(doc.trabajoId, meta);
  }
}

function avanzarTrabajo(id, meta) {
  const nivel = (e) => ESTADOS_TRABAJO.indexOf(e || 'Medido');
  if (trabajo && trabajo.id === id) {
    if (nivel(meta) <= nivel(trabajo.datos.estado)) return;
    trabajo.datos.estado = meta;
    const sel = document.querySelector('#planos [name="estado"]');
    if (sel) sel.value = meta;
    sucio = true;
    guardar();
    return;
  }
  const lista = leerTrabajos();
  const t = lista.find((x) => x.id === id);
  if (!t || nivel(meta) <= nivel(t.datos.estado)) return;
  t.datos.estado = meta;
  t.modificado = Date.now();
  escribirTrabajos(lista);
}

// redondeo a céntimos, simétrico para negativos (rectificativas) y sin errores de coma flotante
const redondear = (n) => Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-7) / 100;
const anioDe = (fecha) => Number(String(fecha || hoy()).slice(0, 4));

function totales(doc) {
  const base = redondear(doc.lineas.reduce((s, l) => s + redondear((Number(l.cantidad) || 0) * (Number(l.precio) || 0)), 0));
  const iva = doc.conIva ? redondear(base * IVA) : 0;
  return { base, iva, total: redondear(base + iva) };
}

// Número correlativo por tipo y año: F2026-001, F2026-002…
// Las facturas rectificativas llevan su propia serie: R2026-001…
function siguienteNumero(tipo, fecha, serie) {
  const anio = anioDe(fecha);
  const prefijo = `${serie || TIPOS_DOC[tipo].prefijo}${anio}-`;
  const usados = leerDocs()
    .filter((d) => d.tipo === tipo && String(d.numero).startsWith(prefijo))
    .map((d) => Number(String(d.numero).slice(prefijo.length)) || 0);
  return prefijo + String(Math.max(0, ...usados) + 1).padStart(3, '0');
}

function nuevoDoc(tipo, base = {}) {
  const fecha = base.fecha || hoy();
  return {
    id: nuevoId(), tipo, fecha, numero: siguienteNumero(tipo, fecha, base.rectifica ? 'R' : ''),
    estado: TIPOS_DOC[tipo].estados[0], clienteId: base.clienteId || '',
    lineas: base.lineas || [], conIva: base.conIva !== false, pago: base.pago || '',
    notas: base.notas || '', origen: base.origen || null, trabajoId: base.trabajoId || '',
    rectifica: base.rectifica || null,
    creado: Date.now(), modificado: Date.now(),
  };
}

const clientePorId = (id) => leerClientes().find((c) => c.id === id) || null;

// ---------------------------------------------------------------------------
// Clientes desde la ficha del plano
// ---------------------------------------------------------------------------
// Busca el cliente del trabajo (por nombre o teléfono) y si no existe lo crea.
function clienteDeTrabajo(t) {
  const d = t.datos;
  const nombre = (d.cliente || '').trim();
  if (!nombre) return null;
  const lista = leerClientes();
  const propio = lista.find((c) => c.id === t.clienteId);
  // el cliente creado solo desde este trabajo se actualiza con la ficha (así no se crean
  // clientes a medias mientras se escribe el nombre)
  if (propio && propio.autoTrabajo === t.id && !lista.some((c) => c.id !== propio.id && normalizar(c.nombre) === normalizar(nombre))) {
    Object.assign(propio, { nombre, telefono: d.telefono || propio.telefono, direccion: d.direccion || propio.direccion });
    guardarCliente(propio);
    return propio;
  }
  let cli = (propio && normalizar(propio.nombre) === normalizar(nombre) && propio) ||
    lista.find((c) => normalizar(c.nombre) === normalizar(nombre)) ||
    (d.telefono && lista.find((c) => c.telefono && c.telefono.replace(/\D/g, '') === d.telefono.replace(/\D/g, '')));
  if (!cli) {
    cli = { id: nuevoId(), nombre, nif: '', telefono: d.telefono || '', email: '', direccion: d.direccion || '', poblacion: '', notas: '', autoTrabajo: t.id };
    guardarCliente(cli);
  } else {
    // completa lo que falte con los datos de la ficha
    let cambiado = false;
    for (const [k, v] of [['telefono', d.telefono], ['direccion', d.direccion]]) {
      if (!cli[k] && v) { cli[k] = v; cambiado = true; }
    }
    if (cambiado) guardarCliente(cli);
  }
  t.clienteId = cli.id;
  return cli;
}

// Sugerencias de clientes guardados en el campo «Cliente» de la ficha.
function llenarSugerenciasClientes() {
  let dl = $('#listaClientesFicha');
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = 'listaClientesFicha';
    document.body.appendChild(dl);
    form.querySelector('[name="cliente"]').setAttribute('list', dl.id);
  }
  dl.replaceChildren(...leerClientes().map((c) => new Option(c.nombre, c.nombre)));
}

// Al elegir un cliente guardado se rellenan teléfono y dirección si están vacíos.
form.querySelector('[name="cliente"]').addEventListener('change', (e) => {
  const cli = leerClientes().find((c) => normalizar(c.nombre) === normalizar(e.target.value));
  if (!cli) return;
  trabajo.clienteId = cli.id;
  const d = trabajo.datos;
  if (!d.telefono && cli.telefono) d.telefono = cli.telefono;
  if (!d.direccion && cli.direccion) d.direccion = [cli.direccion, cli.poblacion].filter(Boolean).join(', ');
  volcarFormulario();
  cambio();
});

// ---------------------------------------------------------------------------
// Del plano a Gestión
// ---------------------------------------------------------------------------
// Crea o actualiza el presupuesto del trabajo en Gestión. Devuelve el documento o null.
// silencioso: llamado al guardar el trabajo, sin avisos.
function sincronizarPresupuesto(silencioso = false) {
  const r = calcular(trabajo);
  const nombre = (trabajo.datos.cliente || '').trim();
  if (!r.lineas.length || !nombre) {
    if (!silencioso) aviso(!nombre ? 'Pon el nombre del cliente en la ficha' : 'El presupuesto está vacío: añade piezas primero');
    return null;
  }
  const previo = leerDocs().find((d) => d.id === trabajo.presupuestoId && d.tipo === 'presupuesto');
  // se borró en Gestión: no se vuelve a crear solo, solo al pedirlo
  if (trabajo.presupuestoId && !previo && silencioso) return null;
  // aceptado o rechazado: ya no se toca
  if (previo && previo.estado !== 'Pendiente') return previo;
  // retocado a mano en Gestión (precios, descuentos…): se respeta
  if (previo && previo.lineasAuto && JSON.stringify(previo.lineas) !== previo.lineasAuto) return previo;
  const cli = clienteDeTrabajo(trabajo);
  const lineas = lineasDeTrabajo(r);
  const notas = trabajo.datos.referencia ? `Ref. ${trabajo.datos.referencia}` : '';
  let doc;
  if (previo) {
    const igual = previo.clienteId === cli.id && previo.conIva === r.conIva && JSON.stringify(previo.lineas) === JSON.stringify(lineas);
    if (igual) return previo;
    doc = Object.assign(previo, { clienteId: cli.id, lineas, conIva: r.conIva, notas: previo.notas || notas });
  } else {
    doc = nuevoDoc('presupuesto', { clienteId: cli.id, lineas, conIva: r.conIva, trabajoId: trabajo.id, notas });
  }
  doc.lineasAuto = JSON.stringify(lineas);
  guardarDoc(doc);
  if (!trabajo.datos.estado || trabajo.datos.estado === 'Medido') {
    trabajo.datos.estado = 'Presupuestado';
    sucio = true;
    const sel = document.querySelector('#planos [name="estado"]');
    if (sel) sel.value = 'Presupuestado';
  }
  if (trabajo.presupuestoId !== doc.id) {
    trabajo.presupuestoId = doc.id;
    sucio = true;
  }
  return doc;
}

// Todas las líneas del presupuesto del plano (material, bancadas, cantos, huecos, extras…)
function lineasDeTrabajo(r) {
  const material = r.material ? etiquetaMaterial(r.material) : trabajo.datos.material;
  return [
    ...(material ? [{ concepto: `Material: ${material}`, cantidad: '', unidad: '', precio: '' }] : []),
    ...r.lineas.map((l) => ({ concepto: l.concepto, cantidad: l.cantidad, unidad: l.unidad, precio: l.precio })),
  ];
}

$('#btnPresuGestion').addEventListener('click', () => {
  const doc = sincronizarPresupuesto();
  if (!doc) return;
  guardar();
  abrirGestion('documentos');
  editarDoc(doc);
});

// Albarán o factura directos desde el plano: un toque y se abre listo para imprimir o compartir.
for (const [id, tipo] of [['#btnPresuAlbaran', 'albaran'], ['#btnPresuFactura', 'factura']]) {
  $(id).addEventListener('click', () => {
    const doc = sincronizarPresupuesto();
    if (!doc) return;
    guardar();
    // pasa TODO lo que hay ahora en el plano (aunque el presupuesto ya estuviera aceptado);
    // solo si el presupuesto se retocó a mano en Gestión se respetan esos retoques
    const retocado = doc.lineasAuto && JSON.stringify(doc.lineas) !== doc.lineasAuto;
    convertir(doc, tipo, retocado ? null : lineasDeTrabajo(calcular(trabajo)));
  });
}

// ---------------------------------------------------------------------------
// Vista de Gestión
// ---------------------------------------------------------------------------
const vistaGestion = $('#gestion');
const vistaPlanos = $('#planos');

function abrirGestion(pestana = 'documentos') {
  guardar();
  if (typeof salirDeInicio === 'function') salirDeInicio();
  vistaPlanos.hidden = true;
  vistaGestion.hidden = false;
  $('#btnGestion').classList.add('active');
  $('#btnVistaPlanos').classList.remove('active');
  $('#btnNuevo').hidden = true;
  $('#btnGuardar').hidden = true;
  mostrarPestana(pestana);
  window.scrollTo({ top: 0 });
}

function cerrarGestion() {
  vistaGestion.hidden = true;
  vistaPlanos.hidden = false;
  $('#btnGestion').classList.remove('active');
  $('#btnVistaPlanos').classList.add('active');
  $('#btnNuevo').hidden = false;
  $('#btnGuardar').hidden = false;
  llenarSugerenciasClientes();
  ajustarLienzo();
}

$('#btnGestion').addEventListener('click', () => { if (vistaGestion.hidden) abrirGestion(); });
$('#btnVistaPlanos').addEventListener('click', () => { if (!vistaGestion.hidden) cerrarGestion(); });

function mostrarPestana(nombre) {
  $$('.pestanas [data-pestana]').forEach((b) => b.classList.toggle('active', b.dataset.pestana === nombre));
  const paneles = { documentos: '#pDocumentos', agenda: '#pAgenda', clientes: '#pClientes', almacen: '#pAlmacen', conformidades: '#pConformidades', gastos: '#pGastos', impuestos: '#pImpuestos', balance: '#pBalance', empresa: '#pEmpresa' };
  for (const [k, sel] of Object.entries(paneles)) $(sel).hidden = k !== nombre;
  if (nombre === 'documentos') pintarDocs();
  if (nombre === 'clientes') pintarClientes();
  if (nombre === 'balance') pintarBalance();
  if (nombre === 'gastos' && typeof pintarGastos === 'function') pintarGastos();
  if (nombre === 'impuestos' && typeof pintarImpuestos === 'function') pintarImpuestos();
  if (nombre === 'empresa') volcarEmpresa();
  if (nombre === 'agenda' && typeof pintarAgenda === 'function') pintarAgenda();
  if (nombre === 'almacen' && typeof pintarAlmacen === 'function') pintarAlmacen();
  if (nombre === 'conformidades' && typeof pintarConformidades === 'function') pintarConformidades();
}
$$('.pestanas [data-pestana]').forEach((b) => b.addEventListener('click', () => mostrarPestana(b.dataset.pestana)));

// ---------------------------------------------------------------------------
// Lista de documentos
// ---------------------------------------------------------------------------
function llenarAnios(select, docs) {
  const actual = anioDe(hoy());
  const anios = [...new Set([actual, ...docs.map((d) => anioDe(d.fecha))])].sort((a, b) => b - a);
  const elegido = select.value || String(actual);
  select.replaceChildren(...anios.map((a) => new Option(String(a), String(a))));
  if (select.id === 'filtroAnio') select.prepend(new Option('Todos los años', 'todos'));
  select.value = [...select.options].some((o) => o.value === elegido) ? elegido : String(actual);
}

function claseEstado(estado) {
  if (/cobrada|aceptado|facturado/i.test(estado)) return 'ok';
  if (/anulada|rechazado/i.test(estado)) return 'mal';
  return 'pendiente';
}

let limiteDocs = 120;
let docsFiltrados = [];
function pintarDocs() {
  const docs = leerDocs();
  llenarAnios($('#filtroAnio'), docs);
  const tipo = $('#filtroTipo').value;
  const anio = $('#filtroAnio').value;
  const texto = normalizar($('#filtroTexto').value);
  const clientes = Object.fromEntries(leerClientes().map((c) => [c.id, c]));
  const lista = docs
    .filter((d) => !tipo || d.tipo === tipo)
    .filter((d) => anio === 'todos' || String(anioDe(d.fecha)) === anio)
    .filter((d) => !texto || normalizar(`${d.numero} ${(clientes[d.clienteId] || {}).nombre || ''}`).includes(texto))
    .sort((a, b) => (b.fecha + b.numero).localeCompare(a.fecha + a.numero));
  const cont = $('#listaDocs');
  docsFiltrados = lista;
  if (!lista.length) {
    cont.innerHTML = '<p class="vacio">No hay documentos. Crea uno con «+ Nuevo» o desde el presupuesto de un plano con «Pasar a Gestión».</p>';
    return;
  }
  docsFiltrados = lista;
  const rectificadaPor = Object.fromEntries(docs.filter((x) => x.rectifica).map((x) => [x.rectifica.id, x.numero]));
  // con muchos documentos se enseñan por tandas (va mucho más rápido)
  cont.innerHTML = lista.slice(0, limiteDocs).map((d) => {
    const cli = clientes[d.clienteId];
    const acciones = [];
    if (d.tipo === 'presupuesto') {
      if (d.estado === 'Pendiente') acciones.push(['aceptar', 'Aceptar']);
      acciones.push(['albaran', '→ Albarán'], ['factura', '→ Factura']);
    }
    if (d.tipo === 'albaran' && d.estado !== 'Facturado') acciones.push(['factura', '→ Factura']);
    if (d.tipo === 'factura' && d.estado === 'Pendiente de cobro') acciones.push(['cobrar', 'Cobrada']);
    if (d.tipo === 'factura' && d.estado === 'Pendiente de cobro' && totales(d).total > 0) acciones.push(['whatsapp', 'Recordar por WhatsApp']);
    if (d.tipo === 'presupuesto' && d.estado === 'Pendiente') acciones.push(['whatsapp', 'Enviar por WhatsApp']);
    return `<div class="doc tipo-${d.rectifica ? 'rectificativa' : d.tipo}" data-id="${escapar(d.id)}">
      <div class="doc-info" data-accion="abrir" tabindex="0" role="button">
        <strong>${nombreTipoDoc(d)} ${escapar(d.numero)}</strong>
        <span>${escapar(cli ? cli.nombre : 'Sin cliente')} · ${fechaLegible(d.fecha)}${rectificadaPor[d.id] ? ` · rectificada por ${escapar(rectificadaPor[d.id])}` : ''}${d.rectifica ? ` · rectifica ${escapar(d.rectifica.numero)}` : ''}</span>
      </div>
      <span class="estado ${claseEstado(d.estado)}">${escapar(d.estado)}</span>
      <strong class="doc-total">${fmtEuro(totales(d).total)}</strong>
      <div class="doc-acciones">${acciones.map(([a, t]) => `<button type="button" data-accion="${a}">${t}</button>`).join('')}</div>
    </div>`;
  }).join('')
    + (lista.length > limiteDocs ? `<button type="button" class="ver-mas" data-accion="mas">Ver más (quedan ${lista.length - limiteDocs})</button>` : '');
}

const pintarDocsDesdeArriba = () => { limiteDocs = 120; pintarDocs(); };
['#filtroTipo', '#filtroAnio'].forEach((s) => $(s).addEventListener('change', pintarDocsDesdeArriba));
$('#filtroTexto').addEventListener('input', pintarDocsDesdeArriba);

$('#listaDocs').addEventListener('click', (e) => {
  const el = e.target.closest('[data-accion]');
  if (!el) return;
  if (el.dataset.accion === 'mas') { limiteDocs += 200; pintarDocs(); return; }
  const doc = leerDocs().find((d) => d.id === el.closest('.doc').dataset.id);
  if (!doc) return;
  const accion = el.dataset.accion;
  if (accion === 'abrir') editarDoc(doc);
  if (accion === 'aceptar') { doc.estado = 'Aceptado'; guardarDoc(doc); pintarDocs(); aviso(`Presupuesto ${doc.numero} aceptado`); }
  if (accion === 'cobrar') { doc.estado = 'Cobrada'; doc.fechaCobro = hoy(); guardarDoc(doc); pintarDocs(); aviso(`Factura ${doc.numero} cobrada`); }
  if (accion === 'albaran' || accion === 'factura') convertir(doc, accion);
  if (accion === 'whatsapp') abrirWhatsApp(doc);
});

// WhatsApp con el mensaje ya escrito: recordatorio de cobro o envío del presupuesto.
function telefonoWhatsApp(tel) {
  let n = String(tel || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
  if (/^[6789]\d{8}$/.test(n)) n = `34${n}`;   // móvil o fijo español sin prefijo
  return n.length >= 9 ? n : '';
}
function mensajeWhatsApp(doc) {
  const emp = leerEmpresa();
  const cli = clientePorId(doc.clienteId) || {};
  const saludo = `Hola${cli.nombre ? ` ${cli.nombre.split(' ')[0]}` : ''}`;
  const firma = [emp.nombre || nombreEmpresa(), emp.telefono].filter(Boolean).join(' · ');
  const total = fmtEuro(totales(doc).total);
  if (doc.tipo === 'factura') {
    return `${saludo}, le recordamos que está pendiente la factura ${doc.numero} del ${fechaLegible(doc.fecha)} por ${total}.`
      + (emp.iban ? ` Puede pagarla por transferencia a la cuenta ${emp.iban}.` : '')
      + ` Si ya la ha pagado, no haga caso de este mensaje. Muchas gracias.\n${firma}`;
  }
  return `${saludo}, le enviamos el presupuesto ${doc.numero} de su encimera: ${total}${doc.conIva !== false ? ' IVA incluido' : ''}.`
    + ` Quedamos a su disposición para cualquier duda.\n${firma}`;
}
function abrirWhatsApp(doc) {
  const tel = telefonoWhatsApp((clientePorId(doc.clienteId) || {}).telefono);
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensajeWhatsApp(doc))}`, '_blank', 'noopener');
  if (!tel) aviso('El cliente no tiene teléfono: elige el contacto en WhatsApp');
}

// Crea un albarán o una factura a partir de otro documento.
function convertir(origen, tipo, lineas = null) {
  const yaHecho = leerDocs().find((d) => d.origen && d.origen.id === origen.id && d.tipo === tipo && d.estado !== 'Anulada');
  if (yaHecho && !confirm(`Ya existe ${TIPOS_DOC[tipo].nombre.toLowerCase()} ${yaHecho.numero} de este documento. ¿Hacer otro?`)) return;
  const doc = nuevoDoc(tipo, {
    clienteId: origen.clienteId, lineas: lineas || structuredClone(origen.lineas), conIva: origen.conIva,
    pago: origen.pago, trabajoId: origen.trabajoId,
    notas: [origen.notas, `Según ${TIPOS_DOC[origen.tipo].nombre.toLowerCase()} ${origen.numero}`].filter(Boolean).join(' · '),
    origen: { id: origen.id, tipo: origen.tipo, numero: origen.numero },
  });
  guardarDoc(doc);
  if (origen.tipo === 'presupuesto' && origen.estado === 'Pendiente') origen.estado = 'Aceptado';
  if (origen.tipo === 'albaran' && tipo === 'factura') origen.estado = 'Facturado';
  guardarDoc(origen);
  pintarDocs();
  aviso(`${TIPOS_DOC[tipo].nombre} ${doc.numero} creado`);
  editarDoc(doc);
}

$('#btnNuevoDoc').addEventListener('click', async () => {
  const tipo = $('#filtroTipo').value || await elegirTipo();
  if (!tipo) return;
  const doc = nuevoDoc(tipo, { lineas: [{ concepto: '', cantidad: 1, unidad: 'ud', precio: '' }] });
  editarDoc(doc, true);
});

function elegirTipo() {
  const dlg = $('#dlgTipo');
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((ok) => {
    dlg.addEventListener('close', () => ok(TIPOS_DOC[dlg.returnValue] ? dlg.returnValue : null), { once: true });
  });
}

// Exporta los documentos que se ven (para el gestor), en formato para Excel.
$('#btnExportarCSV').addEventListener('click', () => {
  const clientes = Object.fromEntries(leerClientes().map((c) => [c.id, c]));
  const filas = docsFiltrados;   // todos los del filtro, aunque no se vean todos en pantalla
  if (!filas.length) { aviso('No hay documentos que exportar'); return; }
  const num = (n) => n.toFixed(2).replace('.', ',');
  const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lineas = [['Tipo', 'Número', 'Fecha', 'Cliente', 'NIF', 'Base', 'IVA', 'Total', 'Estado'].map(celda).join(';')];
  for (const d of filas) {
    const c = clientes[d.clienteId] || {};
    const t = totales(d);
    lineas.push([nombreTipoDoc(d), d.numero, fechaLegible(d.fecha), c.nombre, c.nif, num(t.base), num(t.iva), num(t.total), d.estado].map(celda).join(';'));
  }
  descargar(new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv' }), `documentos-${hoy()}.csv`);
});

// ---------------------------------------------------------------------------
// Editor de documento
// ---------------------------------------------------------------------------
const dlgDoc = $('#dlgDocumento');
// Para avisar si se cierra el documento con cambios sin guardar
let fotoEditor = '';
function leerEditorSinTocar() {
  return { f: $('#docFecha').value, e: $('#docEstado').value, c: $('#docCliente').value, p: $('#docPago').value,
    n: $('#docNotas').value, i: $('#docIva').checked, l: docEditado ? docEditado.lineas : [] };
}
function editorConCambios() {
  return dlgDoc.open && fotoEditor && JSON.stringify(leerEditorSinTocar()) !== fotoEditor;
}
dlgDoc.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]') && editorConCambios() && !confirm('Hay cambios sin guardar. ¿Cerrar sin guardar?')) {
    e.stopPropagation();
  }
}, true);
dlgDoc.addEventListener('cancel', (e) => {
  if (editorConCambios() && !confirm('Hay cambios sin guardar. ¿Cerrar sin guardar?')) e.preventDefault();
});
let docEditado = null;
let docEsNuevo = false;

function llenarSelectClientes(sel, elegido) {
  const lista = leerClientes().sort((a, b) => a.nombre.localeCompare(b.nombre));
  sel.replaceChildren(new Option('— Elegir cliente —', ''), ...lista.map((c) => new Option(c.nombre, c.id)));
  sel.value = elegido || '';
}

function infoCliente() {
  const cli = clientePorId($('#docCliente').value);
  $('#docClienteInfo').textContent = cli
    ? [cli.nif && `NIF ${cli.nif}`, cli.direccion, cli.poblacion, cli.telefono].filter(Boolean).join(' · ') || 'Sin datos fiscales: complétalos en Clientes.'
    : '';
}

function editarDoc(doc, nuevo = false) {
  docEditado = structuredClone(doc);
  docEsNuevo = nuevo;
  const tipoInfo = TIPOS_DOC[doc.tipo];
  $('#docTitulo').textContent = `${nombreTipoDoc(doc)} ${doc.numero}`;
  $('#docFecha').value = doc.fecha;
  $('#docEstado').replaceChildren(...tipoInfo.estados.map((e) => new Option(e, e)));
  $('#docEstado').value = doc.estado;
  llenarSelectClientes($('#docCliente'), doc.clienteId);
  infoCliente();
  $('#docPagoCampo').hidden = doc.tipo !== 'factura';
  $('#docPago').value = doc.pago || '';
  $('#docIva').checked = doc.conIva !== false;
  $('#docNotas').value = doc.notas || '';
  $('#btnDocBorrar').hidden = nuevo;
  const rectificada = leerDocs().some((x) => x.rectifica && x.rectifica.id === doc.id);
  $('#btnDocAnular').hidden = nuevo || doc.tipo !== 'factura' || doc.estado === 'Anulada' || rectificada;
  if (doc.tipo === 'factura' && !leerEmpresa().nif && leerEmpresa().qr !== 'no') aviso('Pon tu NIF en Gestión → Mi empresa para que salga el QR de Hacienda');
  $('#btnDocAlbaran').hidden = doc.tipo !== 'presupuesto';
  $('#btnDocFactura').hidden = doc.tipo === 'factura';
  $('#btnDocRectificar').hidden = nuevo || doc.tipo !== 'factura' || !!doc.rectifica || doc.estado === 'Anulada';
  pintarLineas();
  if (!dlgDoc.open) dlgDoc.showModal();
  fotoEditor = JSON.stringify(leerEditorSinTocar());
}

// Importe de una línea; en blanco si es solo texto (sin cantidad o sin precio).
function importeLinea(l) {
  if (l.cantidad === '' || l.precio === '' || l.cantidad == null || l.precio == null) return '';
  return fmtEuro(redondear((Number(l.cantidad) || 0) * (Number(l.precio) || 0)));
}

function pintarLineas() {
  $('#docLineas').innerHTML = docEditado.lineas.map((l, i) => `<tr data-i="${i}">
    <td><input data-k="concepto" placeholder="Concepto" value="${escapar(l.concepto ?? '')}" aria-label="Concepto"></td>
    <td><input data-k="cantidad" placeholder="Cant." type="number" step="any" inputmode="decimal" value="${l.cantidad ?? ''}" aria-label="Cantidad"></td>
    <td><input data-k="unidad" placeholder="Ud." value="${escapar(l.unidad ?? '')}" aria-label="Unidad"></td>
    <td><input data-k="precio" placeholder="Precio" type="number" step="any" inputmode="decimal" value="${l.precio ?? ''}" aria-label="Precio"></td>
    <td class="num importe">${importeLinea(l)}</td>
    <td><button type="button" class="quitar" aria-label="Quitar línea">✕</button></td>
  </tr>`).join('');
  pintarTotalesDoc();
}

function pintarTotalesDoc() {
  docEditado.conIva = $('#docIva').checked;
  const t = totales(docEditado);
  $('#docTotales').innerHTML = `<div>Base imponible <b>${fmtEuro(t.base)}</b></div>`
    + (docEditado.conIva ? `<div>IVA 21 % <b>${fmtEuro(t.iva)}</b></div>` : '')
    + `<div class="total">Total <b>${fmtEuro(t.total)}</b></div>`;
  if (typeof pintarRentabilidadDoc === 'function') pintarRentabilidadDoc(docEditado);
}

$('#docLineas').addEventListener('input', (e) => {
  const fila = e.target.closest('tr');
  const k = e.target.dataset.k;
  if (!fila || !k) return;
  const l = docEditado.lineas[Number(fila.dataset.i)];
  l[k] = e.target.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
  fila.querySelector('.importe').textContent = importeLinea(l);
  pintarTotalesDoc();
});
$('#docLineas').addEventListener('click', (e) => {
  const b = e.target.closest('.quitar');
  if (!b) return;
  docEditado.lineas.splice(Number(b.closest('tr').dataset.i), 1);
  pintarLineas();
});
$('#btnAnadirLinea').addEventListener('click', () => {
  docEditado.lineas.push({ concepto: '', cantidad: 1, unidad: 'ud', precio: '' });
  pintarLineas();
  $('#docLineas tr:last-child [data-k="concepto"]').focus();
});
$('#docIva').addEventListener('change', pintarTotalesDoc);
$('#docCliente').addEventListener('change', infoCliente);
$('#btnDocNuevoCliente').addEventListener('click', async () => {
  const cli = await editarCliente(null);
  if (cli) { llenarSelectClientes($('#docCliente'), cli.id); infoCliente(); }
});

function leerEditor() {
  const d = docEditado;
  const fechaNueva = $('#docFecha').value || hoy();
  // un documento nuevo que cambia de año toma el número de ese año
  if (docEsNuevo && anioDe(fechaNueva) !== anioDe(d.fecha)) d.numero = siguienteNumero(d.tipo, fechaNueva, d.rectifica ? 'R' : '');
  d.fecha = fechaNueva;
  d.estado = $('#docEstado').value;
  d.clienteId = $('#docCliente').value;
  d.pago = $('#docPago').value.trim();
  d.notas = $('#docNotas').value.trim();
  d.conIva = $('#docIva').checked;
  if (d.estado === 'Cobrada' && !d.fechaCobro) d.fechaCobro = hoy();
  return d;
}

function guardarEditor() {
  const d = leerEditor();
  if (d.tipo === 'factura' && !d.clienteId) { aviso('Una factura necesita un cliente'); return false; }
  // el número definitivo se da al guardar por primera vez (por si mientras tanto llegó otro de otro aparato)
  if (docEsNuevo && !leerDocs().some((x) => x.id === d.id)) d.numero = siguienteNumero(d.tipo, d.fecha, d.rectifica ? 'R' : '');
  guardarDoc(d);
  docEsNuevo = false;
  fotoEditor = JSON.stringify(leerEditorSinTocar());
  $('#btnDocBorrar').hidden = false;
  $('#btnDocAnular').hidden = d.tipo !== 'factura' || d.estado === 'Anulada';
  $('#docTitulo').textContent = `${nombreTipoDoc(d)} ${d.numero}`;
  pintarDocs();
  return true;
}

for (const [id, tipo] of [['#btnDocAlbaran', 'albaran'], ['#btnDocFactura', 'factura']]) {
  $(id).addEventListener('click', () => {
    if (!guardarEditor()) return;
    convertir(structuredClone(docEditado), tipo);
  });
}

// Factura rectificativa por diferencias: copia la factura con los importes en negativo.
// Se puede dejar entera (anula la original) o cambiar las líneas para corregir solo una parte.
$('#btnDocRectificar').addEventListener('click', () => {
  if (!guardarEditor()) return;
  const orig = structuredClone(docEditado);
  const ya = leerDocs().find((d) => d.rectifica && d.rectifica.id === orig.id);
  if (ya && !confirm(`La factura ${orig.numero} ya tiene la rectificativa ${ya.numero}. ¿Hacer otra?`)) return;
  const motivo = prompt(`Motivo de la rectificación de la factura ${orig.numero}:`, 'Error en el importe');
  if (motivo === null) return;
  const doc = nuevoDoc('factura', {
    clienteId: orig.clienteId, conIva: orig.conIva, pago: orig.pago, trabajoId: orig.trabajoId,
    lineas: orig.lineas.map((l) => ({ ...l, precio: l.precio === '' ? '' : -Number(l.precio) })),
    rectifica: { id: orig.id, numero: orig.numero, fecha: orig.fecha, motivo: motivo.trim() },
    notas: '',
  });
  guardarDoc(doc);
  pintarDocs();
  aviso(`Rectificativa ${doc.numero} creada: revisa las líneas`);
  editarDoc(doc);
});

$('#btnDocGuardar').addEventListener('click', () => {
  if (guardarEditor()) { aviso('Documento guardado'); dlgDoc.close(); }
});
$('#btnDocAnular').addEventListener('click', () => {
  const d = leerEditor();
  if (!confirm(`¿Anular la factura ${d.numero}? Se conserva con su número, marcada como anulada.`)) return;
  d.estado = 'Anulada';
  guardarDoc(d);
  dlgDoc.close();
  pintarDocs();
});
$('#btnDocBorrar').addEventListener('click', () => {
  const d = docEditado;
  const rect = leerDocs().find((x) => x.rectifica && x.rectifica.id === d.id);
  if (rect) { aviso(`No se puede borrar: la rectificativa ${rect.numero} hace referencia a esta factura`); return; }
  const nombre = `${nombreTipoDoc(d).toLowerCase()} ${d.numero}`;
  let pregunta = `¿Borrar ${nombre}? No se puede deshacer.`;
  if (d.tipo === 'factura') {
    // Hacienda pide numeración correlativa: si no es la última, queda un hueco
    const prefijo = String(d.numero).replace(/\d+$/, '');
    const posteriores = leerDocs().filter((x) => x.tipo === 'factura' && x.id !== d.id
      && String(x.numero).startsWith(prefijo)
      && Number(String(x.numero).slice(prefijo.length)) > Number(String(d.numero).slice(prefijo.length)));
    pregunta = posteriores.length
      ? `¿Borrar la factura ${d.numero}?\n\nOJO: hay facturas posteriores y quedará un hueco en la numeración, `
        + 'que Hacienda no admite. Si ya la has entregado al cliente, es mejor ANULARLA.\n\nNo se puede deshacer.'
      : `¿Borrar la factura ${d.numero}? Su número se volverá a usar en la siguiente factura.\n\n`
        + 'Si ya la has entregado al cliente, es mejor ANULARLA. No se puede deshacer.';
  }
  if (!confirm(pregunta)) return;
  const docs = leerDocs().filter((x) => x.id !== d.id);
  // el documento del que salió vuelve a quedar pendiente
  if (d.origen && d.estado !== 'Anulada') {
    const origen = docs.find((x) => x.id === d.origen.id);
    const otro = docs.some((x) => x.origen && x.origen.id === d.origen.id && x.tipo === d.tipo && x.estado !== 'Anulada');
    if (origen && !otro && origen.tipo === 'albaran' && d.tipo === 'factura') {
      origen.estado = 'Pendiente de facturar';
      origen.modificado = Date.now();
    }
  }
  escribirJSON(CLAVE_DOCS, docs);
  dlgDoc.close();
  pintarDocs();
  aviso(`${nombreTipoDoc(d)} ${d.numero} borrado`);
});

async function hojaDocBlob() {
  await logoListo();
  return hojasAPdf([componerDocumento(leerEditor())]);
}
const nombreDoc = (d) => `${nombreTipoDoc(d).toLowerCase().replace(/ /g, '-').normalize('NFD').replace(/[̀-ͯ]/g, '')}_${d.numero}.pdf`;

$('#btnDocImprimir').addEventListener('click', () => {
  if (!guardarEditor()) return;
  const d = structuredClone(docEditado);
  imprimirHoja(() => componerDocumento(d));
});
$('#btnDocDescargar').addEventListener('click', async () => {
  if (!guardarEditor()) return;
  descargar(await hojaDocBlob(), nombreDoc(docEditado));
});
$('#btnDocCompartir').addEventListener('click', async () => {
  if (!guardarEditor()) return;
  compartirArchivo(await hojaDocBlob(), nombreDoc(docEditado), `${TIPOS_DOC[docEditado.tipo].nombre} ${docEditado.numero}`);
});

// ---------------------------------------------------------------------------
// Hoja A4 del documento
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// QR tributario (Reglamento de sistemas de facturación, Orden HAC/1177/2024).
// Esta app no envía las facturas a Hacienda, así que usa el QR de los sistemas
// «No VERI*FACTU»: al escanearlo, el cliente puede consultar y comunicar la factura a la AEAT.
// ---------------------------------------------------------------------------
const URL_QR_AEAT = 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu';

function urlQrTributario(doc, emp) {
  if (doc.tipo !== 'factura' || emp.qr === 'no' || typeof qrcode !== 'function') return '';
  const nif = String(emp.nif || '').replace(/[\s.-]/g, '').toUpperCase();
  if (!nif || !doc.numero || !doc.fecha) return '';
  const [a, m, d] = String(doc.fecha).split('-');
  const p = new URLSearchParams({ nif, numserie: String(doc.numero), fecha: `${d}-${m}-${a}`, importe: totales(doc).total.toFixed(2) });
  return `${URL_QR_AEAT}?${p}`;
}

function pintarQr(c, url, x, y, lado) {
  const q = qrcode(0, 'M');   // nivel de corrección M, como pide la norma
  q.addData(url);
  q.make();
  const n = q.getModuleCount();
  const titulo = 34;
  const modulo = (lado - titulo) / (n + 2);   // con margen blanco de un módulo
  c.fillStyle = '#111';
  c.font = '600 24px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'top';
  c.fillText('QR tributario:', x + lado / 2, y);
  const x0 = x + (lado - modulo * n) / 2;
  const y0 = y + titulo + modulo;
  for (let f = 0; f < n; f++) {
    for (let k = 0; k < n; k++) {
      if (q.isDark(f, k)) c.fillRect(x0 + k * modulo, y0 + f * modulo, Math.ceil(modulo), Math.ceil(modulo));
    }
  }
  c.textAlign = 'left';
}

const nombreTipoDoc = (d) => (d.rectifica ? 'Factura rectificativa' : TIPOS_DOC[d.tipo].nombre);

function componerDocumento(doc) {
  const tipoInfo = TIPOS_DOC[doc.tipo];
  const emp = leerEmpresa();
  const cli = clientePorId(doc.clienteId) || {};
  const t = totales(doc);
  const M = 110;
  const hoja = document.createElement('canvas');
  hoja.width = W;
  hoja.height = HOJA_H;
  const c = hoja.getContext('2d');
  c.fillStyle = '#fff';
  c.fillRect(0, 0, W, HOJA_H);

  const cab = pintarCabecera(c, M, [`${doc.rectifica ? 'FACTURA RECTIFICATIVA' : tipoInfo.titulo} Nº ${doc.numero}`,
    `Fecha: ${fechaLegible(doc.fecha)}`, doc.estado === 'Anulada' ? 'ANULADA' : '']);
  let y = M + cab + 10;
  if (doc.rectifica) {
    // datos obligatorios de la rectificativa: factura que corrige y motivo
    const r = doc.rectifica;
    c.fillStyle = '#f6efe3';
    c.fillRect(M, y - 6, W - M * 2, 64);
    c.fillStyle = '#5a3f14';
    c.font = '600 26px system-ui, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(`Rectifica la factura ${r.numero} del ${fechaLegible(r.fecha)} (rectificación por diferencias, art. 15 RD 1619/2012)`
      + (r.motivo ? ` · Motivo: ${r.motivo}` : ''), M + 20, y + 26, W - M * 2 - 40);
    y += 80;
  }

  // datos del emisor y del cliente
  let anchoBloque = (W - M * 2 - 40) / 2;
  const bloque = (x, titulo, filas) => {
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillStyle = '#5f6b75';
    c.font = '600 24px system-ui, sans-serif';
    c.fillText(titulo, x + 20, y + 16);
    c.fillStyle = '#111';
    filas.filter(Boolean).forEach((f, i) => {
      c.font = `${i === 0 ? 700 : 400} 28px system-ui, sans-serif`;
      c.fillText(f, x + 20, y + 54 + i * 38, anchoBloque - 40);
    });
  };
  // QR tributario de las facturas: al principio de la factura, de 30 a 40 mm (unos 34 mm en A4)
  const qr = urlQrTributario(doc, emp);
  const ladoQr = 360;
  if (qr) anchoBloque = (W - M * 2 - 80 - ladoQr) / 2;
  const altoBloque = qr ? ladoQr + 40 : 54 + 5 * 38 + 16;
  if (qr) pintarQr(c, qr, W - M - ladoQr, y, ladoQr);
  c.strokeStyle = '#c9d0d6';
  c.lineWidth = 2;
  c.strokeRect(M, y, anchoBloque, altoBloque);
  c.strokeRect(M + anchoBloque + 40, y, anchoBloque, altoBloque);
  bloque(M, 'EMISOR', [emp.nombre || nombreEmpresa(), emp.nif && `NIF ${emp.nif}`, emp.direccion, emp.poblacion,
    [emp.telefono, emp.email].filter(Boolean).join(' · ')]);
  bloque(M + anchoBloque + 40, 'CLIENTE', [cli.nombre || '—', cli.nif && `NIF ${cli.nif}`, cli.direccion, cli.poblacion,
    [cli.telefono, cli.email].filter(Boolean).join(' · ')]);
  y += altoBloque + 40;

  // líneas: si hay muchas, las filas se estrechan para que quepan en la página
  const reservaPie = 420;
  const disponible = HOJA_H - M - reservaPie - y - 64;
  const filaH = Math.max(36, Math.min(60, disponible / Math.max(1, doc.lineas.length)));
  const tam = filaH < 48 ? 22 : 26;
  const xCant = W - M - 700;
  const xPrecio = W - M - 380;
  c.fillStyle = '#2f3b45';
  c.fillRect(M, y, W - M * 2, 60);
  c.fillStyle = '#fff';
  c.font = '600 26px system-ui, sans-serif';
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillText('Concepto', M + 20, y + 30);
  c.textAlign = 'right';
  c.fillText('Cantidad', xCant + 200, y + 30);
  c.fillText('Precio', xPrecio + 160, y + 30);
  c.fillText('Importe', W - M - 20, y + 30);
  y += 60;
  doc.lineas.forEach((l, i) => {
    if (i % 2) {
      c.fillStyle = '#f2f4f6';
      c.fillRect(M, y, W - M * 2, filaH);
    }
    const cant = Number(l.cantidad);
    const precio = Number(l.precio);
    const conImporte = l.cantidad !== '' && l.precio !== '' && Number.isFinite(cant) && Number.isFinite(precio);
    c.fillStyle = '#111';
    c.font = `400 ${tam}px system-ui, sans-serif`;
    c.textAlign = 'left';
    c.fillText(String(l.concepto || ''), M + 20, y + filaH / 2, xCant - M - 40);
    c.textAlign = 'right';
    if (conImporte) {
      c.fillText(fmtCant(cant, l.unidad || 'ud').trim(), xCant + 200, y + filaH / 2);
      c.fillText(fmtEuro(precio), xPrecio + 160, y + filaH / 2);
      c.fillText(fmtEuro(redondear(cant * precio)), W - M - 20, y + filaH / 2);
    }
    y += filaH;
  });
  c.strokeStyle = '#2f3b45';
  linea(c, [M, y], [W - M, y]);

  // totales
  y += 24;
  const fila = (texto, valor, fuerte) => {
    c.font = `${fuerte ? 700 : 400} ${fuerte ? 40 : 30}px system-ui, sans-serif`;
    c.fillStyle = '#111';
    c.textAlign = 'right';
    c.textBaseline = 'top';
    c.fillText(texto, W - M - 330, y);
    c.fillText(valor, W - M - 20, y);
    y += fuerte ? 64 : 48;
  };
  fila('Base imponible', fmtEuro(t.base));
  if (doc.conIva) fila('IVA 21 %', fmtEuro(t.iva));
  fila(doc.conIva ? 'TOTAL' : 'TOTAL (IVA no incluido)', fmtEuro(t.total), true);

  // pie: notas, forma de pago, firma del albarán y texto de la empresa
  c.textAlign = 'left';
  c.textBaseline = 'top';
  let yp = HOJA_H - M - reservaPie + 40;
  const textoPie = (txt, color = '#4a5058', tamPie = 26) => {
    c.font = `400 ${tamPie}px system-ui, sans-serif`;
    c.fillStyle = color;
    for (const l of partirTexto(c, txt, doc.tipo === 'albaran' ? W - M * 2 - 620 : W - M * 2)) {
      c.fillText(l, M, yp);
      yp += tamPie * 1.35;
    }
  };
  if (doc.notas) textoPie(`Notas: ${doc.notas}`);
  if (doc.tipo === 'factura') {
    if (doc.pago) textoPie(`Forma de pago: ${doc.pago}`);
    if (emp.iban) textoPie(`IBAN: ${emp.iban}`);
  }
  if (emp.pie) textoPie(emp.pie, '#5f6b75', 24);
  const redes = [emp.web, emp.instagram && `Instagram ${emp.instagram.startsWith('@') ? emp.instagram : `@${emp.instagram.replace(/^.*instagram\.com\//, '').replace(/\/$/, '')}`}`].filter(Boolean).join(' · ');
  if (redes) textoPie(redes, '#8c6a34', 24);
  if (doc.tipo === 'albaran') {
    const fx = W - M - 580;
    const fy = HOJA_H - M - reservaPie + 40;
    c.strokeStyle = '#c9d0d6';
    c.strokeRect(fx, fy, 580, 260);
    c.fillStyle = '#5f6b75';
    c.font = '600 24px system-ui, sans-serif';
    c.fillText('RECIBÍ CONFORME (firma y DNI)', fx + 20, fy + 16);
  }
  return hoja;
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------
function pintarClientes() {
  const texto = normalizar($('#buscarCliente').value);
  const docs = leerDocs();
  const lista = leerClientes()
    .filter((c) => !texto || normalizar(`${c.nombre} ${c.nif} ${c.telefono}`).includes(texto))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const cont = $('#listaClientes');
  if (!lista.length) {
    cont.innerHTML = '<p class="vacio">Todavía no hay clientes. Se crean solos al pasar un presupuesto a Gestión, o con «+ Nuevo cliente».</p>';
    return;
  }
  // lo facturado y lo pendiente de cada cliente, en una sola pasada
  const cifras = new Map();
  for (const d of docs) {
    if (d.tipo !== 'factura' || d.estado === 'Anulada') continue;
    const t = totales(d).total;
    const x = cifras.get(d.clienteId) || cifras.set(d.clienteId, { facturado: 0, pendiente: 0 }).get(d.clienteId);
    x.facturado += t;
    if (d.estado === 'Pendiente de cobro' && t > 0) x.pendiente += t;
  }
  cont.innerHTML = lista.map((c) => {
    const { facturado, pendiente } = cifras.get(c.id) || { facturado: 0, pendiente: 0 };
    return `<div class="doc" data-id="${escapar(c.id)}">
      <div class="doc-info" data-accion="editar" tabindex="0" role="button">
        <strong>${escapar(c.nombre)}</strong>
        <span>${escapar([c.nif, c.telefono, c.poblacion].filter(Boolean).join(' · ') || 'Sin datos')}</span>
      </div>
      <span class="cli-cifras">Facturado ${fmtEuro(facturado)}${pendiente ? ` · <b class="mal-txt">pendiente ${fmtEuro(pendiente)}</b>` : ''}</span>
      <div class="doc-acciones">
        <button type="button" data-accion="albaran">Albarán</button>
        <button type="button" data-accion="factura">Factura</button>
      </div>
    </div>`;
  }).join('');
}
$('#buscarCliente').addEventListener('input', pintarClientes);
$('#listaClientes').addEventListener('click', async (e) => {
  const el = e.target.closest('[data-accion]');
  if (!el) return;
  const cli = clientePorId(el.closest('.doc').dataset.id);
  if (!cli) return;
  if (el.dataset.accion === 'editar') {
    await editarCliente(cli);
    pintarClientes();
  } else {
    // albarán o factura rápida para este cliente
    abrirGestion('documentos');
    editarDoc(nuevoDoc(el.dataset.accion, { clienteId: cli.id, lineas: [{ concepto: '', cantidad: 1, unidad: 'ud', precio: '' }] }), true);
  }
});
$('#btnNuevoCliente').addEventListener('click', async () => {
  await editarCliente(null);
  pintarClientes();
});

const dlgCliente = $('#dlgCliente');
const formCliente = $('#formCliente');
const CAMPOS_CLIENTE = ['nombre', 'nif', 'telefono', 'email', 'direccion', 'poblacion', 'notas'];

let clienteEditadoId = null;
function editarCliente(cli) {
  const actual = cli ? { ...cli } : { id: nuevoId() };
  clienteEditadoId = cli ? cli.id : null;
  for (const k of CAMPOS_CLIENTE) formCliente.elements[k].value = actual[k] || '';
  $('#btnBorrarCliente').hidden = !cli;
  dlgCliente.returnValue = '';
  dlgCliente.showModal();
  formCliente.elements.nombre.focus();
  return new Promise((ok) => {
    dlgCliente.addEventListener('close', () => {
      if (dlgCliente.returnValue !== 'ok') return ok(null);
      for (const k of CAMPOS_CLIENTE) actual[k] = formCliente.elements[k].value.trim();
      if (!actual.nombre) return ok(null);
      guardarCliente(actual);
      aviso('Cliente guardado');
      ok(actual);
    }, { once: true });
  });
}

$('#btnBorrarCliente').addEventListener('click', () => {
  const lista = leerClientes();
  const cli = lista.find((c) => c.id === clienteEditadoId);
  if (!cli) return;
  if (leerDocs().some((d) => d.clienteId === cli.id)) {
    aviso('No se puede borrar: tiene documentos');
    return;
  }
  if (!confirm(`¿Borrar el cliente ${cli.nombre}?`)) return;
  escribirJSON(CLAVE_CLIENTES, lista.filter((c) => c.id !== cli.id));
  dlgCliente.close();
  pintarClientes();
});

// ---------------------------------------------------------------------------
// Balance mensual
// ---------------------------------------------------------------------------
function pintarBalance() {
  const docs = leerDocs();
  llenarAnios($('#balanceAnio'), docs);
  const anio = Number($('#balanceAnio').value);
  const meses = MESES.map((nombre) => ({ nombre, nFact: 0, base: 0, iva: 0, total: 0, cobrado: 0, pendiente: 0, presu: 0, aceptado: 0, gastos: 0 }));
  for (const g of (typeof leerGastos === 'function' ? leerGastos() : [])) {
    if (anioDe(g.fecha) !== anio || !g.deducible) continue;
    const m = meses[Number(g.fecha.slice(5, 7)) - 1];
    if (m) m.gastos += Number(g.base) || 0;
  }
  for (const d of docs) {
    if (anioDe(d.fecha) !== anio) continue;
    const m = meses[Number(d.fecha.slice(5, 7)) - 1];
    if (!m) continue;
    const t = totales(d);
    if (d.tipo === 'factura' && d.estado !== 'Anulada') {
      m.nFact++;
      m.base += t.base;
      m.iva += t.iva;
      m.total += t.total;
      if (d.estado === 'Cobrada' || t.total < 0) m.cobrado += t.total; else m.pendiente += t.total;
    }
    if (d.tipo === 'presupuesto') {
      m.presu++;
      if (d.estado === 'Aceptado') m.aceptado += t.total;
    }
  }
  const suma = meses.reduce((s, m) => {
    for (const k of Object.keys(m)) if (k !== 'nombre') s[k] = (s[k] || 0) + m[k];
    return s;
  }, { nombre: 'Total año' });
  const fila = (m, clase = '') => `<tr class="${clase}"><td>${m.nombre}</td><td class="num">${m.nFact}</td>`
    + `<td class="num">${fmtEuro(m.base)}</td><td class="num">${fmtEuro(m.iva)}</td><td class="num"><b>${fmtEuro(m.total)}</b></td>`
    + `<td class="num">${fmtEuro(m.cobrado)}</td><td class="num${m.pendiente ? ' mal-txt' : ''}">${fmtEuro(m.pendiente)}</td>`
    + `<td class="num">${fmtEuro(m.gastos)}</td><td class="num"><b>${fmtEuro(m.base - m.gastos)}</b></td>`
    + `<td class="num">${m.presu}</td><td class="num">${fmtEuro(m.aceptado)}</td></tr>`;
  $('#tablaBalance').innerHTML = `<div class="tabla-balance"><table>
    <thead><tr><th>Mes</th><th class="num">Facturas</th><th class="num">Base</th><th class="num">IVA</th><th class="num">Facturado</th>
      <th class="num">Cobrado</th><th class="num">Pendiente</th><th class="num">Gastos</th><th class="num">Beneficio*</th><th class="num">Presupuestos</th><th class="num">Aceptados</th></tr></thead>
    <tbody>${meses.map((m) => fila(m)).join('')}</tbody>
    <tfoot>${fila(suma, 'total')}</tfoot>
  </table></div>
  <p class="ayuda">Facturas anuladas no cuentan. «Aceptados» es el importe de los presupuestos aceptados ese mes.
    *Beneficio = base facturada − gastos deducibles (sin IVA y antes de IRPF). Más detalle en «Impuestos y beneficio».</p>`;
}
$('#balanceAnio').addEventListener('change', pintarBalance);

// ---------------------------------------------------------------------------
// Mi empresa
// ---------------------------------------------------------------------------
const formEmpresa = $('#formEmpresa');
function volcarEmpresa() {
  const e = leerEmpresa();
  for (const el of formEmpresa.elements) if (el.name) el.value = e[el.name] || '';
}
formEmpresa.addEventListener('input', () => {
  const e = {};
  for (const el of formEmpresa.elements) if (el.name) e[el.name] = el.value.trim();
  escribirJSON(CLAVE_EMPRESA, e);
});

// ---------------------------------------------------------------------------
// Copia de seguridad (la usa app.js)
// ---------------------------------------------------------------------------
function exportarGestion() {
  return { clientes: leerClientes(), documentos: leerDocs(), empresa: leerEmpresa(),
    gastos: typeof leerGastos === 'function' ? leerGastos() : [] };
}

function importarGestion(g) {
  if (!g) return 0;
  const unir = (actuales, nuevos) => {
    const lista = [...actuales];
    for (const n of nuevos || []) {
      if (!n || !n.id) continue;
      const i = lista.findIndex((x) => x.id === n.id);
      if (i < 0) lista.push(n);
      else if ((n.modificado || 0) >= (lista[i].modificado || 0)) lista[i] = n;
    }
    return lista;
  };
  escribirJSON(CLAVE_CLIENTES, unir(leerClientes(), g.clientes));
  escribirJSON(CLAVE_DOCS, unir(leerDocs(), g.documentos));
  if (g.gastos && typeof leerGastos === 'function') escribirJSON(CLAVE_GASTOS, unir(leerGastos(), g.gastos));
  if (g.empresa && !Object.values(leerEmpresa()).some(Boolean)) escribirJSON(CLAVE_EMPRESA, g.empresa);
  return (g.documentos || []).length;
}

// ---------------------------------------------------------------------------
llenarSugerenciasClientes();
