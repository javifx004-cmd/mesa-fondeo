'use strict';

// ---------------------------------------------------------------------------
// Almacén: brocas, discos, lijas, disolventes, siliconas… con aviso de stock bajo
// ---------------------------------------------------------------------------
const CLAVE_STOCK = 'planosCocina.stock';
const CATEGORIAS_STOCK = ['Brocas', 'Discos', 'Lijas y pulido', 'Disolventes y químicos', 'Siliconas y colas',
  'Herramienta', 'Fregaderos y accesorios', 'Embalaje y protección', 'Otros'];
const leerStock = () => leerJSON(CLAVE_STOCK, []);
const stockBajo = (a) => (Number(a.cantidad) || 0) <= (Number(a.minimo) || 0);
const numTxt = (n) => (Number(n) || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 });

function guardarArticulo(a) {
  a.modificado = Date.now();
  const lista = leerStock();
  const i = lista.findIndex((x) => x.id === a.id);
  if (i >= 0) lista[i] = a; else lista.push(a);
  escribirJSON(CLAVE_STOCK, lista);
}

$('#almCategoria').append(...CATEGORIAS_STOCK.map((c) => new Option(c, c)));
formArticuloCategorias();
function formArticuloCategorias() {
  $('#formArticulo').elements.categoria.replaceChildren(...CATEGORIAS_STOCK.map((c) => new Option(c, c)));
}

function pintarAlmacen() {
  const cat = $('#almCategoria').value;
  const q = normalizar($('#almBuscar').value);
  const soloBajo = $('#almBajo').checked;
  const todos = leerStock();
  const lista = todos.filter((a) => (!cat || a.categoria === cat) && (!q || normalizar(`${a.nombre} ${a.proveedor} ${a.notas}`).includes(q))
    && (!soloBajo || stockBajo(a)))
    .sort((a, b) => (stockBajo(b) - stockBajo(a)) || String(a.categoria).localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre));
  const bajos = todos.filter(stockBajo).length;
  const valor = todos.reduce((s, a) => s + (Number(a.cantidad) || 0) * (Number(a.precio) || 0), 0);
  $('#almResumen').innerHTML = `<span><b>${todos.length}</b> artículos</span><span>Valor del almacén <b>${fmtEuro(redondear(valor))}</b></span>`
    + (bajos ? `<span class="mal-txt"><b>${bajos}</b> con poco stock</span>` : '');
  $('#listaAlmacen').innerHTML = lista.map((a) => `<div class="articulo${stockBajo(a) ? ' bajo' : ''}" data-id="${a.id}">
      <div class="doc-info" data-accion="editar" tabindex="0" role="button">
        <strong>${escapar(a.nombre)}</strong>
        <span>${escapar(a.categoria || '')}${a.proveedor ? ` · ${escapar(a.proveedor)}` : ''}${a.notas ? ` · ${escapar(a.notas)}` : ''}</span>
      </div>
      <div class="contador">
        <button type="button" data-accion="menos" aria-label="Quitar uno">−</button>
        <span><b>${numTxt(a.cantidad)}</b> ${escapar(a.unidad || 'ud')}${stockBajo(a) ? `<small>mínimo ${numTxt(a.minimo)}</small>` : ''}</span>
        <button type="button" data-accion="mas" aria-label="Añadir uno">+</button>
      </div>
    </div>`).join('') || '<p class="vacio">No hay artículos. Añádelos con «+ Artículo»: brocas, discos, lijas, disolvente, siliconas…</p>';
}

$('#almCategoria').addEventListener('change', pintarAlmacen);
$('#almBuscar').addEventListener('input', pintarAlmacen);
$('#almBajo').addEventListener('change', pintarAlmacen);
$('#listaAlmacen').addEventListener('click', (e) => {
  const el = e.target.closest('[data-accion]');
  if (!el) return;
  const a = leerStock().find((x) => x.id === el.closest('.articulo').dataset.id);
  if (!a) return;
  if (el.dataset.accion === 'editar') { editarArticulo(a); return; }
  a.cantidad = Math.max(0, (Number(a.cantidad) || 0) + (el.dataset.accion === 'mas' ? 1 : -1));
  guardarArticulo(a);
  pintarAlmacen();
  if (el.dataset.accion === 'menos' && stockBajo(a)) aviso(`Queda poco: ${a.nombre} (${numTxt(a.cantidad)} ${a.unidad || 'ud'})`);
});

const dlgArticulo = $('#dlgArticulo');
let articuloEditado = null;
function editarArticulo(a) {
  articuloEditado = a ? { ...a } : { id: nuevoId(), categoria: $('#almCategoria').value || CATEGORIAS_STOCK[0], unidad: 'ud', cantidad: 0, minimo: 1 };
  const f = $('#formArticulo').elements;
  for (const k of ['nombre', 'categoria', 'unidad', 'cantidad', 'minimo', 'precio', 'proveedor', 'notas']) f[k].value = articuloEditado[k] ?? '';
  $('#btnBorrarArticulo').hidden = !a;
  dlgArticulo.returnValue = '';
  dlgArticulo.showModal();
}
$('#btnNuevoArticulo').addEventListener('click', () => editarArticulo(null));
$('#formArticulo').addEventListener('submit', (e) => {
  if (!e.submitter || e.submitter.value !== 'ok') return;
  const f = $('#formArticulo').elements;
  const n = (v) => (v === '' ? '' : Number(String(v).replace(',', '.')) || 0);
  Object.assign(articuloEditado, {
    nombre: f.nombre.value.trim(), categoria: f.categoria.value, unidad: f.unidad.value.trim() || 'ud',
    cantidad: n(f.cantidad.value) || 0, minimo: n(f.minimo.value) || 0, precio: n(f.precio.value),
    proveedor: f.proveedor.value.trim(), notas: f.notas.value.trim(),
  });
  guardarArticulo(articuloEditado);
  pintarAlmacen();
});
$('#btnBorrarArticulo').addEventListener('click', () => {
  if (!confirm(`¿Borrar «${articuloEditado.nombre}» del almacén?`)) return;
  escribirJSON(CLAVE_STOCK, leerStock().filter((x) => x.id !== articuloEditado.id));
  dlgArticulo.close();
  pintarAlmacen();
});
// Lista de la compra: lo que está bajo mínimos, por proveedor, para mandarla por WhatsApp
$('#btnListaCompra').addEventListener('click', () => {
  const bajos = leerStock().filter(stockBajo);
  if (!bajos.length) { aviso('No falta nada: todo está por encima del mínimo'); return; }
  const porProv = {};
  for (const a of bajos) (porProv[a.proveedor || 'Sin proveedor'] ||= []).push(a);
  const texto = `Lista de la compra · ${nombreEmpresa()}\n` + Object.entries(porProv).map(([p, l]) => `\n${p}:\n`
    + l.map((a) => `- ${a.nombre}: quedan ${numTxt(a.cantidad)} ${a.unidad || 'ud'} (mínimo ${numTxt(a.minimo)})`).join('\n')).join('\n');
  if (navigator.share) navigator.share({ text: texto }).catch(() => {});
  else window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
});

// ---------------------------------------------------------------------------
// Calendario con recordatorios
// ---------------------------------------------------------------------------
const CLAVE_RECORDATORIOS = 'planosCocina.recordatorios';
const CLAVE_AVISADOS = 'planosCocina.avisados';
const leerRecordatorios = () => leerJSON(CLAVE_RECORDATORIOS, []);
const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
let mesVisto = new Date();
mesVisto.setDate(1);
let diaElegido = hoy();

// ¿Cae este recordatorio en el día? (con repeticiones)
function caeEn(r, dia) {
  if (!r.fecha || dia < r.fecha) return false;
  if (dia === r.fecha) return true;
  const a = new Date(`${r.fecha}T12:00`);
  const b = new Date(`${dia}T12:00`);
  if (r.repetir === 'semanal') return Math.round((b - a) / 86400000) % 7 === 0;
  if (r.repetir === 'mensual') return a.getDate() === b.getDate();
  if (r.repetir === 'anual') return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
  return false;
}

// Todo lo que pasa un día: recordatorios, colocaciones, plazos de Hacienda y cobros atrasados
function eventosDelDia(dia) {
  const ev = [];
  for (const r of leerRapido(CLAVE_RECORDATORIOS, [])) {
    if (caeEn(r, dia)) ev.push({ tipo: 'recordatorio', hora: r.hora || '', titulo: r.titulo, sub: r.notas, ref: r.id, hecho: (r.hechos || []).includes(dia) });
  }
  for (const t of leerRapido(CLAVE, [])) {
    if (t.datos.colocacion === dia) ev.push({ tipo: 'colocacion', titulo: `Colocación · ${t.datos.cliente || 'Sin cliente'}`, sub: t.datos.direccion || t.datos.material || '', ref: t.id, mapa: urlMapa(t.datos) });
  }
  // plazos de Hacienda: último día y aviso una semana antes
  const [y, m, d] = dia.split('-').map(Number);
  const plazo = { 4: [1, 20], 7: [2, 20], 10: [3, 20], 1: [4, 30] }[m];
  if (plazo) {
    const [trim, ultimo] = plazo;
    const anioT = m === 1 ? y - 1 : y;
    if (d === ultimo) ev.push({ tipo: 'hacienda', titulo: `Último día: IVA (303) e IRPF (130) del ${trim}.º trimestre`, sub: `Trimestre de ${anioT}` });
    if (d === ultimo - 7) ev.push({ tipo: 'hacienda', titulo: `Quedan 7 días: IVA e IRPF del ${trim}.º trimestre`, sub: `Trimestre de ${anioT}` });
  }
  const clientes = Object.fromEntries(leerRapido(CLAVE_CLIENTES, []).map((c) => [c.id, c.nombre]));
  for (const f of leerRapido(CLAVE_DOCS, [])) {
    if (f.tipo !== 'factura' || f.estado !== 'Pendiente de cobro' || totales(f).total <= 0) continue;
    const v = new Date(`${f.fecha}T12:00`);
    v.setDate(v.getDate() + 30);
    if (isoDia(v) === dia) ev.push({ tipo: 'cobro', titulo: `Cobrar ${f.numero} · ${clientes[f.clienteId] || ''}`, sub: fmtEuro(totales(f).total), ref: f.id });
  }
  return ev.sort((a, b) => (a.hora || '99').localeCompare(b.hora || '99'));
}

function pintarAgenda() {
  const y = mesVisto.getFullYear();
  const m = mesVisto.getMonth();
  $('#mesTitulo').textContent = `${MESES[m]} ${y}`;
  const primero = new Date(y, m, 1);
  const inicio = new Date(primero);
  inicio.setDate(1 - ((primero.getDay() + 6) % 7));   // lunes
  const hoyIso = hoy();
  let html = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<span class="cal-cab">${d}</span>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    const iso = isoDia(d);
    const ev = eventosDelDia(iso);
    const tipos = [...new Set(ev.map((e) => e.tipo))];
    html += `<button type="button" class="cal-dia${d.getMonth() !== m ? ' fuera' : ''}${iso === hoyIso ? ' hoy' : ''}${iso === diaElegido ? ' elegido' : ''}" data-dia="${iso}">
      <b>${d.getDate()}</b><span class="puntos">${tipos.map((t) => `<i class="p-${t}"></i>`).join('')}</span>
      ${ev.length ? `<small>${escapar(ev[0].titulo)}</small>` : ''}</button>`;
    if (i === 34 && d.getMonth() !== m) break;
  }
  $('#calendario').innerHTML = html;
  pintarDia();
}

function pintarDia() {
  const d = new Date(`${diaElegido}T12:00`);
  $('#diaTitulo').textContent = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const ev = eventosDelDia(diaElegido);
  const icono = { recordatorio: '🔔', colocacion: '🛠', hacienda: '🏛', cobro: '€' };
  $('#diaLista').innerHTML = ev.map((e) => `<li class="ev ev-${e.tipo}${e.hecho ? ' hecho' : ''}" data-tipo="${e.tipo}" data-ref="${escapar(e.ref || '')}" tabindex="0" role="button">
      <span class="ev-ico">${icono[e.tipo]}</span>
      <span><b>${e.hora ? `${e.hora} · ` : ''}${escapar(e.titulo)}</b><small>${escapar(e.sub || '')}</small></span>
      ${e.tipo === 'recordatorio' ? `<button type="button" class="mini" data-hecho="${escapar(e.ref)}">${e.hecho ? 'Hecho ✓' : 'Hecho'}</button>` : ''}
      ${e.mapa ? `<a class="btn-ir" href="${escapar(e.mapa)}" target="_blank" rel="noopener">Ir</a>` : ''}</li>`).join('')
    || '<li class="vacio">Nada para este día. Añade un recordatorio con «+ Recordatorio».</li>';
}

$('#calendario').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dia]');
  if (!b) return;
  diaElegido = b.dataset.dia;
  pintarAgenda();
});
$('#mesAnt').addEventListener('click', () => { mesVisto.setMonth(mesVisto.getMonth() - 1); pintarAgenda(); });
$('#mesSig').addEventListener('click', () => { mesVisto.setMonth(mesVisto.getMonth() + 1); pintarAgenda(); });
$('#mesHoy').addEventListener('click', () => { mesVisto = new Date(); mesVisto.setDate(1); diaElegido = hoy(); pintarAgenda(); });
$('#diaLista').addEventListener('click', (e) => {
  if (e.target.closest('.btn-ir')) return;
  const hecho = e.target.closest('[data-hecho]');
  if (hecho) {
    const lista = leerRecordatorios();
    const r = lista.find((x) => x.id === hecho.dataset.hecho);
    if (r) {
      r.hechos = r.hechos || [];
      r.hechos = r.hechos.includes(diaElegido) ? r.hechos.filter((x) => x !== diaElegido) : [...r.hechos, diaElegido];
      r.modificado = Date.now();
      escribirJSON(CLAVE_RECORDATORIOS, lista);
      pintarDia();
    }
    return;
  }
  const li = e.target.closest('[data-tipo]');
  if (!li) return;
  if (li.dataset.tipo === 'recordatorio') editarRecordatorio(leerRecordatorios().find((x) => x.id === li.dataset.ref));
  if (li.dataset.tipo === 'colocacion') { const t = leerTrabajos().find((x) => x.id === li.dataset.ref); if (t) { irAPlanos(); abrir(t); } }
  if (li.dataset.tipo === 'cobro') { const f = leerDocs().find((x) => x.id === li.dataset.ref); if (f) { mostrarPestana('documentos'); editarDoc(f); } }
  if (li.dataset.tipo === 'hacienda') mostrarPestana('impuestos');
});

const dlgRecordatorio = $('#dlgRecordatorio');
let recordatorioEditado = null;
function editarRecordatorio(r) {
  recordatorioEditado = r ? { ...r } : { id: nuevoId(), fecha: diaElegido, hora: '09:00', repetir: '', antes: '0' };
  const f = $('#formRecordatorio').elements;
  for (const k of ['titulo', 'fecha', 'hora', 'repetir', 'antes', 'notas']) f[k].value = recordatorioEditado[k] ?? '';
  $('#btnBorrarRecordatorio').hidden = !r;
  dlgRecordatorio.returnValue = '';
  dlgRecordatorio.showModal();
}
$('#btnNuevoRecordatorio').addEventListener('click', () => editarRecordatorio(null));
$('#formRecordatorio').addEventListener('submit', (e) => {
  if (!e.submitter || e.submitter.value !== 'ok') return;
  const f = $('#formRecordatorio').elements;
  Object.assign(recordatorioEditado, {
    titulo: f.titulo.value.trim(), fecha: f.fecha.value, hora: f.hora.value, repetir: f.repetir.value,
    antes: f.antes.value, notas: f.notas.value.trim(), modificado: Date.now(),
  });
  const lista = leerRecordatorios();
  const i = lista.findIndex((x) => x.id === recordatorioEditado.id);
  if (i >= 0) lista[i] = recordatorioEditado; else lista.push(recordatorioEditado);
  escribirJSON(CLAVE_RECORDATORIOS, lista);
  diaElegido = recordatorioEditado.fecha;
  mesVisto = new Date(`${diaElegido}T12:00`);
  mesVisto.setDate(1);
  pintarAgenda();
  aviso('Recordatorio guardado');
});
$('#btnBorrarRecordatorio').addEventListener('click', () => {
  if (!confirm('¿Borrar este recordatorio?')) return;
  escribirJSON(CLAVE_RECORDATORIOS, leerRecordatorios().filter((x) => x.id !== recordatorioEditado.id));
  dlgRecordatorio.close();
  pintarAgenda();
});
// Archivo .ics para meterlo en el calendario del móvil (avisa aunque la app esté cerrada)
$('#btnIcsRecordatorio').addEventListener('click', () => {
  const f = $('#formRecordatorio').elements;
  if (!f.titulo.value.trim() || !f.fecha.value) { aviso('Pon qué hay que hacer y el día'); return; }
  const fecha = f.fecha.value.replace(/-/g, '');
  const hora = (f.hora.value || '09:00').replace(':', '') + '00';
  const rrule = { semanal: 'WEEKLY', mensual: 'MONTHLY', anual: 'YEARLY' }[f.repetir.value];
  const esc = (t) => t.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Carbonell//Planos//ES', 'BEGIN:VEVENT',
    `UID:${recordatorioEditado.id}@carbonell`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${fecha}T${hora}`, `DURATION:PT1H`, `SUMMARY:${esc(f.titulo.value.trim())}`,
    f.notas.value ? `DESCRIPTION:${esc(f.notas.value)}` : '', rrule ? `RRULE:FREQ=${rrule}` : '',
    'BEGIN:VALARM', `TRIGGER:-PT${Number(f.antes.value) || 0}M`, 'ACTION:DISPLAY', `DESCRIPTION:${esc(f.titulo.value.trim())}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  descargar(new Blob([ics], { type: 'text/calendar' }), `recordatorio-${fecha}.ics`);
});

// Avisos: al abrir la app y cada minuto, de los recordatorios que ya tocan
$('#btnAvisos').addEventListener('click', async () => {
  if (!('Notification' in window)) { aviso('Este navegador no permite avisos'); return; }
  const p = await Notification.requestPermission();
  aviso(p === 'granted' ? 'Avisos activados' : 'Avisos no permitidos: actívalos en los ajustes del navegador');
  pintarBotonAvisos();
});
function pintarBotonAvisos() {
  const ok = 'Notification' in window && Notification.permission === 'granted';
  $('#btnAvisos').textContent = ok ? 'Avisos activados ✓' : 'Activar avisos';
}
pintarBotonAvisos();

function revisarRecordatorios() {
  const ahora = new Date();
  const avisados = leerJSON(CLAVE_AVISADOS, {});
  const dias = [isoDia(ahora)];
  const manana = new Date(ahora);
  manana.setDate(manana.getDate() + 1);
  dias.push(isoDia(manana));   // para los que avisan un día antes
  for (const r of leerRecordatorios()) {
    for (const dia of dias) {
      if (!caeEn(r, dia) || (r.hechos || []).includes(dia)) continue;
      const cuando = new Date(`${dia}T${r.hora || '09:00'}`);
      cuando.setMinutes(cuando.getMinutes() - (Number(r.antes) || 0));
      const clave = `${r.id}|${dia}`;
      if (cuando > ahora || avisados[clave]) continue;
      avisados[clave] = Date.now();
      const texto = `${r.hora ? `${r.hora} · ` : ''}${r.titulo}`;
      aviso(`🔔 ${texto}`);
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('Mármoles Carbonell', { body: texto, icon: 'iconos/icono-192.png', tag: clave }); } catch { /* móvil sin soporte directo */ }
      }
    }
  }
  // se limpian avisos de hace más de 40 días
  for (const [k, t] of Object.entries(avisados)) if (Date.now() - t > 40 * 86400000) delete avisados[k];
  try { localStorage.setItem(CLAVE_AVISADOS, JSON.stringify(avisados)); } catch { /* lleno */ }
}
setInterval(revisarRecordatorios, 60000);
setTimeout(revisarRecordatorios, 2500);
