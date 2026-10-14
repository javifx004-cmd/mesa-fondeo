'use strict';

// ---------------------------------------------------------------------------
// Inicio: el negocio de un vistazo (cifras, gráfico del año, cobros, plazos…)
// ---------------------------------------------------------------------------
const vistaInicio = $('#inicio');
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const euroCorto = (n) => (Math.abs(n) >= 10000
  ? `${(n / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} mil €`
  : n.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €');
const diasEntre = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

function abrirInicio() {
  if (!vistaGestion.hidden) cerrarGestion();
  guardar();
  vistaPlanos.hidden = true;
  vistaInicio.hidden = false;
  $('#btnInicio').classList.add('active');
  $('#btnVistaPlanos').classList.remove('active');
  $('#btnGestion').classList.remove('active');
  $('#btnNuevo').hidden = true;
  $('#btnGuardar').hidden = true;
  pintarInicio();
  window.scrollTo({ top: 0 });
}

function salirDeInicio() {
  vistaInicio.hidden = true;
  $('#btnInicio').classList.remove('active');
}

// Próximo plazo de IVA (303) e IRPF (130): el trimestre recién cerrado.
function proximoPlazo(fecha = new Date()) {
  const a = fecha.getFullYear();
  const plazos = [
    { trim: 4, anio: a - 1, desde: new Date(a, 0, 1), hasta: new Date(a, 0, 30) },
    { trim: 1, anio: a, desde: new Date(a, 3, 1), hasta: new Date(a, 3, 20) },
    { trim: 2, anio: a, desde: new Date(a, 6, 1), hasta: new Date(a, 6, 20) },
    { trim: 3, anio: a, desde: new Date(a, 9, 1), hasta: new Date(a, 9, 20) },
    { trim: 4, anio: a, desde: new Date(a + 1, 0, 1), hasta: new Date(a + 1, 0, 30) },
  ];
  const hoyD = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  return plazos.find((p) => p.hasta >= hoyD);
}

function pintarInicio() {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = ahora.getMonth();
  const hoyIso = hoy();
  const emp = leerEmpresa();
  const docs = leerDocs();
  const gastos = leerGastos();
  const clientes = Object.fromEntries(leerClientes().map((c) => [c.id, c]));
  const facturas = docs.filter((d) => d.tipo === 'factura' && d.estado !== 'Anulada');
  const delAnio = facturas.filter((d) => anioDe(d.fecha) === anio);
  const mesDe = (f) => Number(String(f).slice(5, 7)) - 1;

  // --- saludo ---
  const h = ahora.getHours();
  const saludo = h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  $('#iniFecha').textContent = ahora.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#iniSaludo').textContent = `${saludo}, ${emp.nombre || nombreEmpresa()}`;

  // --- cifras ---
  const base = (lista) => redondear(lista.reduce((s, d) => s + totales(d).base, 0));
  const factMes = base(delAnio.filter((d) => mesDe(d.fecha) === mes));
  const mesAnt = mes === 0
    ? base(facturas.filter((d) => anioDe(d.fecha) === anio - 1 && mesDe(d.fecha) === 11))
    : base(delAnio.filter((d) => mesDe(d.fecha) === mes - 1));
  const factAnio = base(delAnio);
  const pendientes = facturas.filter((d) => d.estado === 'Pendiente de cobro' && totales(d).total > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pendiente = redondear(pendientes.reduce((s, d) => s + totales(d).total, 0));
  const vencidas = pendientes.filter((d) => diasEntre(d.fecha, hoyIso) > 30).length;
  const trim = trimDe(hoyIso);
  const iva = ivaTrimestre(anio, trim);
  const irpf = irpfTrimestre(anio, trim);
  const rend = rendimientoAcumulado(anio, 4);
  const limpioAnio = redondear(rend.ingresos - rend.gastos - Math.max(0, rend.rendimiento) * confFiscal().irpfMedio);
  const presus = docs.filter((d) => d.tipo === 'presupuesto' && d.estado === 'Pendiente')
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const gastosMes = redondear(gastos.filter((g) => anioDe(g.fecha) === anio && mesDe(g.fecha) === mes)
    .reduce((s, g) => s + (Number(g.base) || 0), 0));
  const trabajos = leerTrabajos();
  const trabajosMes = trabajos.filter((t) => new Date(t.creado || 0).getFullYear() === anio && new Date(t.creado || 0).getMonth() === mes).length;

  const variacion = mesAnt > 0 ? Math.round((factMes - mesAnt) / mesAnt * 100) : null;
  const kpi = (titulo, valor, detalle, clase = '', ir = '') => `
    <article class="kpi ${clase}" ${ir ? `data-ir="${ir}" tabindex="0" role="button"` : ''}>
      <span class="kpi-t">${titulo}</span>
      <strong class="kpi-v">${valor}</strong>
      <span class="kpi-d">${detalle}</span>
    </article>`;
  $('#iniKpis').innerHTML = [
    kpi(`Facturado en ${MESES[mes].toLowerCase()}`, euroCorto(factMes),
      variacion === null ? 'sin IVA' : `<b class="${variacion >= 0 ? 'sube' : 'baja'}">${variacion >= 0 ? '▲' : '▼'} ${Math.abs(variacion)} %</b> frente al mes pasado`, 'destacado', 'balance'),
    kpi(`Facturado en ${anio}`, euroCorto(factAnio), `${delAnio.length} facturas · sin IVA`, '', 'balance'),
    kpi('Pendiente de cobro', euroCorto(pendiente),
      pendientes.length ? `${pendientes.length} facturas${vencidas ? ` · <b class="baja">${vencidas} con más de 30 días</b>` : ''}` : 'todo cobrado', pendiente ? 'aviso' : '', 'cobros'),
    kpi(`IVA del ${trim}.º trimestre`, euroCorto(Math.max(0, iva.resultado)),
      iva.resultado < 0 ? `a compensar ${fmtEuro(-iva.resultado)}` : 'a pagar (modelo 303)', '', 'impuestos'),
    kpi(`IRPF del ${trim}.º trimestre`, euroCorto(irpf ? irpf.pago : 0), 'pago a cuenta (modelo 130)', '', 'impuestos'),
    kpi(`Te queda limpio en ${anio}`, euroCorto(limpioAnio), 'después de gastos e IRPF aprox.', 'oro', 'impuestos'),
    kpi('Presupuestos por aceptar', euroCorto(redondear(presus.reduce((s, d) => s + totales(d).base, 0))), `${presus.length} presupuestos`, '', 'presupuestos'),
    kpi(`Gastos de ${MESES[mes].toLowerCase()}`, euroCorto(gastosMes), `${trabajosMes} planos nuevos este mes`, '', 'gastos'),
  ].join('');

  $('#iniResumen').textContent = pendientes.length
    ? `Tienes ${pendientes.length} ${pendientes.length === 1 ? 'factura' : 'facturas'} por cobrar (${fmtEuro(pendiente)}) y ${presus.length} ${presus.length === 1 ? 'presupuesto' : 'presupuestos'} esperando respuesta.`
    : presus.length ? `Todo cobrado. ${presus.length} ${presus.length === 1 ? 'presupuesto espera' : 'presupuestos esperan'} respuesta.`
      : 'Todo al día. ¡A por la siguiente cocina!';

  pintarGraficoAnio(anio, delAnio, gastos);
  pintarPlazo();

  // --- listas ---
  const vacio = (txt) => `<li class="vacio">${txt}</li>`;
  const nombreCli = (id) => escapar((clientes[id] || {}).nombre || 'Sin cliente');
  $('#iniCobros').innerHTML = pendientes.slice(0, 6).map((d) => {
    const dias = diasEntre(d.fecha, hoyIso);
    return `<li data-doc="${d.id}"><span><b>${nombreCli(d.clienteId)}</b><small>${escapar(d.numero)} · hace ${dias} ${dias === 1 ? 'día' : 'días'}</small></span>
      <span class="ini-num ${dias > 30 ? 'baja' : ''}">${fmtEuro(totales(d).total)}</span></li>`;
  }).join('') || vacio('No hay nada pendiente de cobro');
  $('#iniPresus').innerHTML = presus.slice(0, 6).map((d) => `<li data-doc="${d.id}"><span><b>${nombreCli(d.clienteId)}</b>
    <small>${escapar(d.numero)} · ${fechaLegible(d.fecha)}</small></span><span class="ini-num">${fmtEuro(totales(d).total)}</span></li>`).join('')
    || vacio('No hay presupuestos pendientes');
  $('#iniTrabajos').innerHTML = trabajos.slice().sort((a, b) => (b.modificado || 0) - (a.modificado || 0)).slice(0, 6)
    .map((t) => `<li data-trabajo="${escapar(t.id)}"><span><b>${escapar(t.datos.cliente || 'Sin cliente')}</b>
      <small>${escapar([t.datos.material, t.datos.direccion].filter(Boolean).join(' · ') || 'Sin datos')}</small></span>
      <span class="ini-fecha">${new Date(t.modificado || t.creado || Date.now()).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span></li>`).join('')
    || vacio('Todavía no hay planos');

  // mejores clientes del año
  const porCliente = {};
  for (const d of delAnio) porCliente[d.clienteId] = (porCliente[d.clienteId] || 0) + totales(d).base;
  const top = Object.entries(porCliente).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  $('#iniClientes').innerHTML = top.map(([id, v], i) => `<li><span class="pos">${i + 1}</span><span><b>${nombreCli(id)}</b>
    <small>${Math.round(v / (factAnio || 1) * 100)} % de lo facturado</small></span><span class="ini-num">${fmtEuro(redondear(v))}</span></li>`).join('')
    || vacio('Aún no hay facturas este año');

  // gastos por categoría
  const porCat = {};
  for (const g of gastos.filter((x) => anioDe(x.fecha) === anio)) porCat[g.categoria || 'Otros'] = (porCat[g.categoria || 'Otros'] || 0) + (Number(g.base) || 0);
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCat = cats.length ? cats[0][1] : 1;
  $('#iniGastos').innerHTML = cats.map(([c, v]) => `<li><span><b>${escapar(c)}</b>
    <i class="barra"><i style="width:${Math.max(3, v / maxCat * 100)}%"></i></i></span><span class="ini-num">${fmtEuro(redondear(v))}</span></li>`).join('')
    || vacio('Aún no hay gastos apuntados este año');
}

// Barras por mes (facturado) con la línea de gastos, en SVG.
function pintarGraficoAnio(anio, facturas, gastos) {
  const fact = Array(12).fill(0);
  const gast = Array(12).fill(0);
  for (const d of facturas) fact[Number(d.fecha.slice(5, 7)) - 1] += totales(d).base;
  for (const g of gastos) if (anioDe(g.fecha) === anio) gast[Number(String(g.fecha).slice(5, 7)) - 1] += Number(g.base) || 0;
  const max = Math.max(100, ...fact, ...gast);
  const escala = Math.pow(10, Math.floor(Math.log10(max)));
  const tope = Math.ceil(max / escala) * escala;
  // en el móvil el dibujo es más estrecho para que los textos se lean bien
  const W2 = ($('#iniGrafico').clientWidth || 720) < 500 ? 400 : 720;
  const H2 = W2 < 500 ? 230 : 260;
  const iz = W2 < 500 ? 44 : 56;
  const ab = 30;
  const ar = 12;
  const ancho = (W2 - iz - 8) / 12;
  const y = (v) => ar + (H2 - ar - ab) * (1 - v / tope);
  const mesActual = new Date().getFullYear() === anio ? new Date().getMonth() : 11;
  let svg = `<svg viewBox="0 0 ${W2} ${H2}" role="img" aria-label="Facturación y gastos por mes">`;
  svg += '<defs><linearGradient id="gOro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9bd84"/><stop offset="1" stop-color="#9c7a43"/></linearGradient></defs>';
  for (let i = 0; i <= 4; i++) {
    const v = tope * i / 4;
    svg += `<line class="g-rejilla" x1="${iz}" x2="${W2 - 4}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text class="g-eje" x="${iz - 8}" y="${y(v) + 4}" text-anchor="end">${euroCorto(v).replace(' €', '')}</text>`;
  }
  fact.forEach((v, i) => {
    const x = iz + i * ancho + ancho * 0.18;
    const w = ancho * 0.64;
    const yy = y(v);
    svg += `<rect class="g-barra ${i === mesActual ? 'actual' : ''}" x="${x}" y="${yy}" width="${w}" height="${Math.max(0, H2 - ab - yy)}" rx="4"><title>${MESES[i]}: ${fmtEuro(redondear(v))}</title></rect>`;
    svg += `<text class="g-eje ${i === mesActual ? 'actual' : ''}" x="${x + w / 2}" y="${H2 - 10}" text-anchor="middle">${MESES_CORTOS[i]}</text>`;
  });
  // los meses que aún no han llegado no se dibujan
  const puntos = gast.slice(0, mesActual + 1).map((v, i) => `${iz + i * ancho + ancho / 2},${y(v)}`).join(' ');
  svg += `<polyline class="g-linea" points="${puntos}"/>`;
  gast.forEach((v, i) => { if (v && i <= mesActual) svg += `<circle class="g-punto" cx="${iz + i * ancho + ancho / 2}" cy="${y(v)}" r="4"><title>Gastos ${MESES[i]}: ${fmtEuro(redondear(v))}</title></circle>`; });
  svg += '</svg>';
  $('#iniGrafico').innerHTML = svg;
}

function pintarPlazo() {
  const p = proximoPlazo();
  const hoyD = new Date(new Date().toDateString());
  const enPlazo = hoyD >= p.desde;
  const dias = diasEntre(hoyD, enPlazo ? p.hasta : p.desde);
  const iva = ivaTrimestre(p.anio, p.trim);
  const irpf = irpfTrimestre(p.anio, p.trim);
  const fmt = (d) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
  $('#iniPlazo').innerHTML = `
    <div class="tarjeta-cab"><h3>Próximo pago a Hacienda</h3></div>
    <div class="cuenta-atras ${enPlazo && dias <= 7 ? 'urgente' : ''}">
      <strong>${dias}</strong><span>${dias === 1 ? 'día' : 'días'} ${enPlazo ? 'para que acabe el plazo' : 'para que empiece el plazo'}</span>
    </div>
    <p class="plazo-txt">${p.trim}.º trimestre de ${p.anio} · del ${fmt(p.desde)} al ${fmt(p.hasta)}</p>
    <table class="plazo-tabla">
      <tr><td>IVA · modelo 303</td><td class="num">${fmtEuro(Math.max(0, iva.resultado))}</td></tr>
      <tr><td>IRPF · modelo 130</td><td class="num">${fmtEuro(irpf ? irpf.pago : 0)}</td></tr>
      <tr class="total"><td>Total aproximado</td><td class="num">${fmtEuro(redondear(Math.max(0, iva.resultado) + (irpf ? irpf.pago : 0)))}</td></tr>
    </table>
    <button type="button" class="enlace" data-ir="impuestos">Ver el detalle</button>`;
}

// Navegación desde Inicio
vistaInicio.addEventListener('click', (e) => {
  const doc = e.target.closest('[data-doc]');
  if (doc) {
    const d = leerDocs().find((x) => x.id === doc.dataset.doc);
    if (d) { abrirGestion('documentos'); editarDoc(d); }
    return;
  }
  const tr = e.target.closest('[data-trabajo]');
  if (tr) {
    const t = leerTrabajos().find((x) => x.id === tr.dataset.trabajo);
    if (t) { irAPlanos(); abrir(t); }
    return;
  }
  const b = e.target.closest('[data-ir]');
  if (!b) return;
  const ir = b.dataset.ir;
  if (ir === 'plano') { irAPlanos(); abrir(trabajoVacio()); aviso('Nuevo plano'); }
  if (ir === 'trabajos') $('#btnTrabajos').click();
  if (ir === 'factura' || ir === 'presupuesto') {
    abrirGestion('documentos');
    editarDoc(nuevoDoc(ir, { lineas: [{ concepto: '', cantidad: 1, unidad: 'ud', precio: '' }] }), true);
  }
  if (ir === 'gasto') { abrirGestion('gastos'); editarGasto(null); }
  if (ir === 'cobros') { abrirGestion('documentos'); $('#filtroTipo').value = 'factura'; $('#filtroTipo').dispatchEvent(new Event('change')); }
  if (ir === 'presupuestos') { abrirGestion('documentos'); $('#filtroTipo').value = 'presupuesto'; $('#filtroTipo').dispatchEvent(new Event('change')); }
  if (['balance', 'impuestos', 'gastos'].includes(ir)) abrirGestion(ir);
});
vistaInicio.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-ir][role=button]')) { e.preventDefault(); e.target.click(); }
});

function irAPlanos() {
  salirDeInicio();
  if (!vistaGestion.hidden) cerrarGestion();
  vistaPlanos.hidden = false;
  $('#btnVistaPlanos').classList.add('active');
  $('#btnGestion').classList.remove('active');
  $('#btnNuevo').hidden = false;
  $('#btnGuardar').hidden = false;
  ajustarLienzo();
  window.scrollTo({ top: 0 });
}

$('#btnInicio').addEventListener('click', () => { if (vistaInicio.hidden) abrirInicio(); });
$('#btnVistaPlanos').addEventListener('click', () => { if (vistaPlanos.hidden) irAPlanos(); });
$('#btnGestion').addEventListener('click', salirDeInicio, { capture: true });

// La app se abre en Inicio
abrirInicio();
