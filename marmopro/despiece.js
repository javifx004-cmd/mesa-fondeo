'use strict';

// ---------------------------------------------------------------------------
// Despiece: cuántas tablas hacen falta y cómo se cortan las piezas.
// Algoritmo MaxRects (mejor ajuste por el lado corto), con el grosor del disco
// y un margen en el borde de la tabla. Las piezas más largas que la tabla se parten.
// ---------------------------------------------------------------------------
const FORMATOS_TABLA = [
  { id: '3000x1400', nombre: '300 × 140 · Silestone estándar', l: 3000, a: 1400 },
  { id: '3250x1590', nombre: '325 × 159 · Silestone jumbo', l: 3250, a: 1590 },
  { id: '3200x1440', nombre: '320 × 144 · Dekton', l: 3200, a: 1440 },
  { id: '3200x1600', nombre: '320 × 160 · Neolith / porcelánico', l: 3200, a: 1600 },
  { id: '3050x1440', nombre: '305 × 144 · Compac', l: 3050, a: 1440 },
  { id: '3000x1800', nombre: '300 × 180 · Granito (aprox.)', l: 3000, a: 1800 },
  { id: 'otro', nombre: 'Otra medida…', l: 0, a: 0 },
];
const DISCO = 5;      // mm que se come cada corte
const MARGEN = 10;    // mm de borde que se sanea en la tabla
const MEDIA_BANDA = 800; // media tabla: banda de todo el largo y 80 cm de alto (325 × 80 en Silestone)
const cm = (mm) => String(Math.round(mm) / 10).replace('.', ',');

function formatoPorMaterial(material) {
  const m = String(material || '').toLowerCase();
  if (m.includes('dekton')) return '3200x1440';
  if (m.includes('neolith') || m.includes('porcel')) return '3200x1600';
  if (m.includes('compac')) return '3050x1440';
  if (m.includes('silestone')) return '3250x1590';
  if (m.includes('granit')) return '3000x1800';
  return '3200x1600';
}

function confDespiece(t) {
  const c = (t.extras && t.extras.tabla) || {};
  const id = c.formato || formatoPorMaterial(t.datos.material);
  const f = FORMATOS_TABLA.find((x) => x.id === id) || FORMATOS_TABLA[3];
  const l = id === 'otro' ? Number(c.largo) || 0 : f.l;
  const a = id === 'otro' ? Number(c.ancho) || 0 : f.a;
  return { id, l, a, veta: !!c.veta, zocalo: Number(c.zocalo) || 50 };
}

// Piezas a cortar: bancadas, frontales, zócalos y tiras de los ingletes.
function piezasACortar(t, conf) {
  const res = [];
  const ingl = /ingletado\s*(\d+)/i.exec(t.datos.canto || '');
  const altoIngl = ingl ? Number(ingl[1]) * 10 : 0;
  const util = Math.max(conf.l, conf.a) - 2 * MARGEN;
  const avisos = [];
  const poner = (nombre, l, a) => {
    if (!(l > 0 && a > 0)) return;
    // más larga que la tabla: se parte en trozos iguales (con junta)
    const largoMax = conf.veta ? conf.l - 2 * MARGEN : util;
    const n = l > largoMax ? Math.ceil(l / largoMax) : 1;
    if (n > 1) avisos.push(`${nombre} (${cm(l)} cm) no cabe entera: va en ${n} trozos con junta.`);
    for (let k = 0; k < n; k++) res.push({ nombre: n > 1 ? `${nombre} (${k + 1}/${n})` : nombre, l: Math.ceil(l / n), a });
  };
  (t.piezas || []).forEach((p, i) => {
    const largo = Number(p.largo) || 0;
    const fondo = Number(p.fondo) || 0;
    const ref = { bancada: 'B', frontal: 'F', zocalo: 'Z' }[p.tipo] || 'P';
    if (p.tipo === 'zocalo') poner(`${ref}${i + 1}`, largo, conf.zocalo);
    else {
      poner(`${ref}${i + 1}`, largo, fondo);
      if (altoIngl && p.tipo === 'bancada') {
        if (p.frente) poner(`I${i + 1}`, largo, altoIngl);
        if (p.izq) poner(`I${i + 1}`, fondo, altoIngl);
        if (p.der) poner(`I${i + 1}`, fondo, altoIngl);
      }
    }
  });
  return { piezas: res, avisos };
}

// Una tabla con sus huecos libres (MaxRects)
function nuevaTabla(L, A) {
  return { libres: [{ x: 0, y: 0, w: L, h: A }], puestas: [] };
}

// Reglas para elegir hueco: lado corto (bssf), área (baf) o lo más arriba posible (arriba),
// que deja libre la parte de abajo y permite usar media tabla (banda horizontal).
function buscarHueco(tabla, w, h, girar, regla = 'bssf') {
  let mejor = null;
  for (const r of tabla.libres) {
    for (const [pw, ph, rot] of girar ? [[w, h, false], [h, w, true]] : [[w, h, false]]) {
      if (pw > r.w || ph > r.h) continue;
      const corto = Math.min(r.w - pw, r.h - ph);
      const largo = Math.max(r.w - pw, r.h - ph);
      const puntos = regla === 'arriba' ? [r.y + ph, r.x + pw]
        : regla === 'baf' ? [r.w * r.h - pw * ph, corto] : regla === 'blsf' ? [largo, corto] : [corto, largo];
      if (!mejor || puntos[0] < mejor.p[0] || (puntos[0] === mejor.p[0] && puntos[1] < mejor.p[1])) {
        mejor = { x: r.x, y: r.y, w: pw, h: ph, rot, p: puntos };
      }
    }
  }
  return mejor;
}

function colocar(tabla, p) {
  const nuevos = [];
  for (const r of tabla.libres) {
    if (p.x >= r.x + r.w || p.x + p.w <= r.x || p.y >= r.y + r.h || p.y + p.h <= r.y) { nuevos.push(r); continue; }
    if (p.x > r.x) nuevos.push({ x: r.x, y: r.y, w: p.x - r.x, h: r.h });
    if (p.x + p.w < r.x + r.w) nuevos.push({ x: p.x + p.w, y: r.y, w: r.x + r.w - p.x - p.w, h: r.h });
    if (p.y > r.y) nuevos.push({ x: r.x, y: r.y, w: r.w, h: p.y - r.y });
    if (p.y + p.h < r.y + r.h) nuevos.push({ x: r.x, y: p.y + p.h, w: r.w, h: r.y + r.h - p.y - p.h });
  }
  // fuera los huecos contenidos en otros
  tabla.libres = nuevos.filter((a, i) => !nuevos.some((b, j) => j !== i
    && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h
    && (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h || j < i)));
}

// Coloca las piezas en el orden dado con una regla; devuelve las tablas usadas.
function empaquetar(orden, regla, L, A, girar) {
  const tablas = [];
  const fuera = [];
  for (const p of orden) {
    const w = p.l + DISCO;
    const h = p.a + DISCO;
    let sitio = null;
    let tabla = null;
    for (const tb of tablas) {
      sitio = buscarHueco(tb, w, h, girar, regla);
      if (sitio) { tabla = tb; break; }
    }
    if (!sitio) {
      tabla = nuevaTabla(L, A);
      sitio = buscarHueco(tabla, w, h, girar, regla);
      if (!sitio) { fuera.push(p); continue; }
      tablas.push(tabla);
    }
    colocar(tabla, sitio);
    tabla.puestas.push({ ...p, x: sitio.x + MARGEN, y: sitio.y + MARGEN, w: sitio.w - DISCO, h: sitio.h - DISCO, rot: sitio.rot });
  }
  return { tablas, fuera };
}

// Ancho de tabla que hace falta en la última, de arriba abajo (para saber si basta media tabla)
const altoUsado = (tabla) => Math.max(0, ...tabla.puestas.map((p) => p.y + p.h)) + DISCO;

// Mismo trabajo y mismas opciones → mismo resultado: no se vuelve a calcular
let memoriaDespiece = { clave: '', valor: null };
function calcularDespiece(t) {
  const clave = JSON.stringify([t.piezas, t.extras && t.extras.tabla, t.datos.canto, t.datos.material]);
  if (memoriaDespiece.clave === clave) return memoriaDespiece.valor;
  const valor = calcularDespieceSinMemoria(t);
  memoriaDespiece = { clave, valor };
  return valor;
}
function calcularDespieceSinMemoria(t) {
  const conf = confDespiece(t);
  if (!conf.l || !conf.a) return { conf, tablas: [], avisos: ['Pon la medida de la tabla.'], piezas: [] };
  const { piezas, avisos } = piezasACortar(t, conf);
  // se trabaja con las piezas engordadas con el disco, en la zona útil de la tabla
  const L = conf.l - 2 * MARGEN + DISCO;
  const A = conf.a - 2 * MARGEN + DISCO;
  const girar = !conf.veta;
  // Búsqueda: muchas combinaciones de orden y regla, y después mejora local (intercambios del mejor orden).
  // Se queda la que usa menos tablas; a igualdad, la que permite media tabla, la que menos alto usa de la
  // última y la que deja el recorte aprovechable más grande.
  const ordenes = [
    (a, b) => Math.max(b.l, b.a) - Math.max(a.l, a.a) || b.l * b.a - a.l * a.a,
    (a, b) => b.l * b.a - a.l * a.a,
    (a, b) => b.l - a.l || b.a - a.a,
    (a, b) => b.a - a.a || b.l - a.l,
    (a, b) => (b.l + b.a) - (a.l + a.a),
  ].map((f) => piezas.map((p) => ({ ...p })).sort(f));
  let semilla = 7;   // siempre las mismas mezclas, para que el resultado no cambie entre aparatos
  const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
  const reglas = ['bssf', 'baf', 'blsf', 'arriba'];
  const bandaMax = Math.min(MEDIA_BANDA, conf.a);
  const valorar = (r) => {
    const ultimo = r.tablas.length ? altoUsado(r.tablas[r.tablas.length - 1]) : 0;
    let recorte = 0;
    for (const tb of r.tablas) for (const f of tb.libres) if (Math.min(f.w, f.h) >= 300) recorte = Math.max(recorte, f.w * f.h);
    return [r.fuera.length, r.tablas.length, ultimo <= bandaMax ? 0 : 1, Math.round(ultimo / 10), -recorte];
  };
  const mejorQue = (a, b) => { const k = a.findIndex((v, i) => v !== b[i]); return k >= 0 && a[k] < b[k]; };
  let mejor = null;
  const probar = (orden) => {
    for (const regla of reglas) {
      const r = empaquetar(orden, regla, L, A, girar);
      const nota = valorar(r);
      if (!mejor || mejorQue(nota, mejor.nota)) mejor = { ...r, nota, orden };
    }
  };
  ordenes.forEach(probar);
  // número fijo de vueltas (mismo resultado en el PC y en el móvil), con un tope de tiempo por seguridad
  const maxVueltas = piezas.length <= 12 ? 700 : piezas.length <= 25 ? 350 : 120;
  const limite = performance.now() + 1500;
  let vueltas = 0;
  while (vueltas < maxVueltas && performance.now() < limite && piezas.length > 1) {
    vueltas++;
    // a veces una mezcla nueva, casi siempre retocar la mejor encontrada
    const base = vueltas % 5 === 0 ? ordenes[vueltas % ordenes.length] : mejor.orden;
    const o = base.map((p) => ({ ...p }));
    const cambios = 1 + Math.floor(azar() * 3);
    for (let c = 0; c < cambios; c++) {
      const a = Math.floor(azar() * o.length);
      const b = Math.floor(azar() * o.length);
      [o[a], o[b]] = [o[b], o[a]];
    }
    probar(o);
  }
  const tablas = mejor ? mejor.tablas : [];
  for (const p of (mejor ? mejor.fuera : [])) avisos.push(`${p.nombre} (${cm(p.l)} × ${cm(p.a)} cm) no cabe en la tabla.`);
  // la última tabla: ¿basta media?
  const usadoUltima = tablas.length ? altoUsado(tablas[tablas.length - 1]) : 0;
  const fraccion = conf.a ? usadoUltima / conf.a : 0;
  const media = tablas.length > 0 && usadoUltima <= Math.min(MEDIA_BANDA, conf.a);
  const areaPiezas = piezas.reduce((s, p) => s + p.l * p.a, 0);
  const tablasPedir = tablas.length ? tablas.length - 1 + (media ? Math.min(MEDIA_BANDA, conf.a) / conf.a : 1) : 0;
  const areaTablas = tablasPedir * conf.l * conf.a;
  // el trozo sobrante más grande (para aprovecharlo en otra obra)
  let sobrante = null;
  if (tablas.length) {
    for (const r of tablas[tablas.length - 1].libres) {
      const w = r.w - DISCO;
      const h = r.h - DISCO;
      if (w > 0 && h > 0 && (!sobrante || w * h > sobrante.w * sobrante.h)) sobrante = { w, h };
    }
  }
  // Desperdicio: lo que se paga y no va en piezas. De ello, los recortes de al menos 30 × 30 cm se pueden
  // aprovechar en otra obra (se cuentan sin solaparse, en una cuadrícula de 1 cm).
  let recortes = 0;
  const listaRecortes = [];
  tablas.forEach((tb, n) => {
    const altoTabla = media && n === tablas.length - 1 ? bandaMax : conf.a;
    const cols = Math.ceil(conf.l / 10);
    const filas = Math.ceil(altoTabla / 10);
    const ocupado = new Uint8Array(cols * filas);
    const marcar = (x, y, w, h, v) => {
      let nuevas = 0;
      for (let fy = Math.max(0, Math.floor(y / 10)); fy < Math.min(filas, Math.ceil((y + h) / 10)); fy++) {
        for (let fx = Math.max(0, Math.floor(x / 10)); fx < Math.min(cols, Math.ceil((x + w) / 10)); fx++) {
          if (!ocupado[fy * cols + fx]) { nuevas++; if (v) ocupado[fy * cols + fx] = 1; }
        }
      }
      return nuevas;
    };
    for (const p of tb.puestas) marcar(p.x - DISCO / 2, p.y - DISCO / 2, p.w + DISCO, p.h + DISCO, true);
    const libres = tb.libres.map((f) => ({ x: f.x + MARGEN, y: f.y + MARGEN, w: f.w - DISCO, h: Math.min(f.h - DISCO, altoTabla - MARGEN - f.y) }))
      .filter((f) => Math.min(f.w, f.h) >= 300).sort((p, q) => q.w * q.h - p.w * p.h);
    for (const f of libres) {
      const nuevas = marcar(f.x, f.y, f.w, f.h, false);
      if (nuevas * 100 >= f.w * f.h * 0.85) {
        marcar(f.x, f.y, f.w, f.h, true);
        recortes += nuevas * 100;
        listaRecortes.push({ tabla: n + 1, w: f.w, h: f.h });
      }
    }
  });
  const desperdicio = areaTablas ? Math.max(0, areaTablas - areaPiezas) / areaTablas : 0;
  const aprovechable = areaTablas ? Math.min(recortes, Math.max(0, areaTablas - areaPiezas)) / areaTablas : 0;
  return {
    conf, tablas, avisos, piezas, m2: areaPiezas / 1e6, sobrante, desperdicio, aprovechable, listaRecortes, vueltas,
    aprovechamiento: areaTablas ? areaPiezas / areaTablas : 0,
    media, fraccion, usadoUltima, tablasPedir, equivalente: conf.l * conf.a ? areaPiezas / (conf.l * conf.a) : 0,
  };
}

// «1 tabla y media», «2 tablas», «media tabla»…
function textoTablas(d) {
  const n = d.tablas.length;
  if (!n) return '';
  const enteras = d.media ? n - 1 : n;
  if (d.media && enteras === 0) return 'Media tabla';
  if (d.media) return `${enteras} ${enteras === 1 ? 'tabla' : 'tablas'} y media`;
  return `${enteras} ${enteras === 1 ? 'tabla' : 'tablas'}`;
}

// ---------------------------------------------------------------------------
// Dibujo de una tabla
// ---------------------------------------------------------------------------
function dibujarTabla(c, tabla, conf, x0, y0, ancho, numero, media = false) {
  const esc = ancho / conf.l;
  const alto = conf.a * esc;
  // tabla con vetas suaves
  c.save();
  c.fillStyle = '#f1ece2';
  c.fillRect(x0, y0, ancho, alto);
  c.strokeStyle = 'rgba(140, 120, 90, .18)';
  c.lineWidth = Math.max(1, ancho / 600);
  for (let k = 0; k < 5; k++) {
    c.beginPath();
    const yy = y0 + alto * (0.15 + k * 0.18);
    c.moveTo(x0, yy);
    c.bezierCurveTo(x0 + ancho * 0.3, yy - alto * 0.12, x0 + ancho * 0.6, yy + alto * 0.14, x0 + ancho, yy - alto * 0.05);
    c.stroke();
  }
  c.strokeStyle = '#6f6455';
  c.lineWidth = Math.max(1.5, ancho / 500);
  c.strokeRect(x0, y0, ancho, alto);
  // piezas
  const tamLetra = Math.max(10, Math.min(30, ancho / 45));
  for (const p of tabla.puestas) {
    const px = x0 + p.x * esc;
    const py = y0 + p.y * esc;
    const pw = p.w * esc;
    const ph = p.h * esc;
    const g = c.createLinearGradient(px, py, px + pw, py + ph);
    g.addColorStop(0, '#e7d2a2');
    g.addColorStop(1, '#c8a865');
    c.fillStyle = p.nombre.startsWith('I') ? '#d9c9a6' : p.nombre.startsWith('Z') ? '#dccaa0' : g;
    c.fillRect(px, py, pw, ph);
    c.strokeStyle = '#5a4520';
    c.lineWidth = Math.max(1, ancho / 700);
    c.strokeRect(px, py, pw, ph);
    // etiqueta: nombre y medida
    const medida = `${cm(p.l)} × ${cm(p.a)}`;
    c.fillStyle = '#2a2116';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const cabe = (txt, tam) => { c.font = `700 ${tam}px system-ui, sans-serif`; return c.measureText(txt).width < pw - 6 && tam < ph - 4; };
    if (cabe(p.nombre, tamLetra) && ph > tamLetra * 2.4) {
      c.font = `700 ${tamLetra}px system-ui, sans-serif`;
      c.fillText(p.nombre, px + pw / 2, py + ph / 2 - tamLetra * 0.6);
      c.font = `400 ${tamLetra * 0.85}px system-ui, sans-serif`;
      c.fillText(medida, px + pw / 2, py + ph / 2 + tamLetra * 0.6);
    } else {
      const tam = Math.max(8, Math.min(tamLetra, ph * 0.7));
      const txt = cabe(`${p.nombre} · ${medida}`, tam) ? `${p.nombre} · ${medida}` : p.nombre;
      c.font = `700 ${tam}px system-ui, sans-serif`;
      if (c.measureText(txt).width < pw - 4) c.fillText(txt, px + pw / 2, py + ph / 2);
    }
  }
  // número de tabla
  c.fillStyle = '#1c1915';
  c.font = `700 ${tamLetra}px system-ui, sans-serif`;
  c.textAlign = 'left';
  c.textBaseline = 'bottom';
  c.fillText(media ? `Tabla ${numero} · media tabla` : `Tabla ${numero}`, x0, y0 - 6);
  if (media) {
    // media tabla: banda de arriba de hasta 80 cm; lo de abajo no hace falta
    const ym = y0 + Math.min(MEDIA_BANDA, conf.a) * esc;
    c.fillStyle = 'rgba(255, 255, 255, .6)';
    c.fillRect(x0, ym, ancho, y0 + alto - ym);
    c.setLineDash([Math.max(6, ancho / 90), Math.max(4, ancho / 140)]);
    c.strokeStyle = '#b4442f';
    c.lineWidth = Math.max(1.5, ancho / 450);
    c.beginPath(); c.moveTo(x0 - 4, ym); c.lineTo(x0 + ancho + 4, ym); c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#b4442f';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `600 ${tamLetra * 0.9}px system-ui, sans-serif`;
    if (y0 + alto - ym > tamLetra * 1.6) c.fillText(`No hace falta: media tabla de ${cm(conf.l)} × 80 cm`, x0 + ancho / 2, (ym + y0 + alto) / 2, ancho - 20);
  }
  c.restore();
  return alto;
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------
const selFormato = $('#formatoTabla');
selFormato.replaceChildren(...FORMATOS_TABLA.map((f) => new Option(f.nombre, f.id)));
let temporizadorDespiece = null;

function guardarConfDespiece(cambios) {
  asegurarDatos();
  trabajo.extras.tabla = { ...(trabajo.extras.tabla || {}), ...cambios };
  cambio();
}

function pintarDespiece() {
  asegurarDatos();
  const d = calcularDespiece(trabajo);
  selFormato.value = d.conf.id;
  $('#tablaMedidaOtra').hidden = d.conf.id !== 'otro';
  $('#tablaLargo').value = d.conf.id === 'otro' && d.conf.l ? d.conf.l / 10 : '';
  $('#tablaAncho').value = d.conf.id === 'otro' && d.conf.a ? d.conf.a / 10 : '';
  $('#respetarVeta').checked = d.conf.veta;
  $('#altoZocalo').value = d.conf.zocalo / 10;
  const res = $('#despieceRes');
  const dib = $('#despieceDibujo');
  $('#btnDespiecePdf').hidden = !d.tablas.length;
  if (!d.piezas.length) {
    res.innerHTML = '<span class="vacio">Añade piezas y aquí verás cuántas tablas hacen falta y cómo cortarlas.</span>';
    dib.replaceChildren();
    $('#avisosDespiece').replaceChildren();
    return;
  }
  const n = d.tablas.length;
  res.innerHTML = `<b class="despiece-n">${textoTablas(d)}</b> <span>de ${cm(d.conf.l)} × ${cm(d.conf.a)} cm</span>
    <span class="despiece-dato">${n > 1 || d.media ? `En la ${n > 1 ? 'última' : ''} tabla se usan <b>${cm(d.usadoUltima)} cm</b> de alto`
      + `${d.media ? ` · <b>basta media tabla</b> (${cm(d.conf.l)} × 80 cm)` : ''}` : ''}</span>
    <span class="despiece-dato">${d.piezas.length} piezas · ${d.m2.toLocaleString('es-ES', { maximumFractionDigits: 2 })} m²</span>
    <span class="despiece-dato">Aprovechamiento <b>${Math.round(d.aprovechamiento * 100)} %</b></span>
    <span class="despiece-dato">Desperdicio <b class="${d.desperdicio > 0.35 ? 'mal-txt' : ''}">${Math.round(d.desperdicio * 100)} %</b>${d.aprovechable > 0.005
      ? ` (de él, <b>${Math.round(d.aprovechable * 100)} %</b> son recortes aprovechables)` : ''}</span>
    ${d.sobrante ? `<span class="despiece-dato">Sobrante mayor ${cm(d.sobrante.w)} × ${cm(d.sobrante.h)} cm</span>` : ''}`;
  $('#avisosDespiece').replaceChildren(...d.avisos.map((a) => Object.assign(document.createElement('li'), { textContent: a })));
  // dibujo
  const ancho = Math.max(280, dib.clientWidth || 600);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  dib.replaceChildren(...d.tablas.map((tb, i) => {
    const cv = document.createElement('canvas');
    const alto = ancho * d.conf.a / d.conf.l;
    cv.width = Math.round(ancho * dpr);
    cv.height = Math.round((alto + 30) * dpr);
    cv.style.width = `${ancho}px`;
    cv.style.height = `${alto + 30}px`;
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    dibujarTabla(c, tb, d.conf, 1, 28, ancho - 2, i + 1, d.media && i === d.tablas.length - 1);
    return cv;
  }));
}

let despiecePendiente = false;
let anchoDespiece = 0;
function programarDespiece() {
  clearTimeout(temporizadorDespiece);
  // si el plano no se está viendo, se deja para cuando se abra
  if ($('#planos').hidden) { despiecePendiente = true; return; }
  temporizadorDespiece = setTimeout(pintarDespiece, 150);
}
new MutationObserver(() => { if (despiecePendiente && !$('#planos').hidden) { despiecePendiente = false; programarDespiece(); } })
  .observe($('#planos'), { attributes: true, attributeFilter: ['hidden'] });

// Hoja A4 del despiece para el taller (hasta 3 tablas por página)
function componerDespiece() {
  const d = calcularDespiece(trabajo);
  const hojas = [];
  const M = 90;
  for (let i = 0; i < d.tablas.length || (i === 0 && !hojas.length); i += 3) {
    const hoja = document.createElement('canvas');
    hoja.width = W;
    hoja.height = HOJA_H;
    const c = hoja.getContext('2d');
    c.fillStyle = '#fff';
    c.fillRect(0, 0, W, HOJA_H);
    const cab = pintarCabecera(c, M, ['DESPIECE DE TABLAS', trabajo.datos.cliente || '', fechaLegible(trabajo.datos.fecha)]);
    let y = M + cab + 10;
    c.fillStyle = '#111';
    c.font = '600 30px system-ui, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillText(`${trabajo.datos.material || 'Material sin elegir'} · ${textoTablas(d).toLowerCase()} de ${cm(d.conf.l)} × ${cm(d.conf.a)} cm`, M, y, W - M * 2);
    y += 44;
    c.font = '400 26px system-ui, sans-serif';
    c.fillStyle = '#5f6b75';
    c.fillText(`Aprovechamiento ${Math.round(d.aprovechamiento * 100)} % · desperdicio ${Math.round(d.desperdicio * 100)} %`
      + `${d.aprovechable > 0.005 ? ` (recortes aprovechables ${Math.round(d.aprovechable * 100)} %)` : ''} · disco ${DISCO / 10} cm · margen ${MARGEN / 10} cm`
      + `${d.conf.veta ? ' · respetando la veta' : ''} · B bancada, F frontal, Z zócalo, I tira de inglete`, M, y, W - M * 2);
    y += 70;
    for (const [k, tb] of d.tablas.slice(i, i + 3).entries()) {
      y += dibujarTabla(c, tb, d.conf, M, y + 36, W - M * 2, i + k + 1, d.media && i + k === d.tablas.length - 1) + 90;
    }
    if (d.avisos.length && i + 3 >= d.tablas.length) {
      c.fillStyle = '#a35a00';
      c.font = '400 26px system-ui, sans-serif';
      c.textBaseline = 'top';
      d.avisos.slice(0, 6).forEach((a, j) => c.fillText(`• ${a}`, M, Math.min(y, HOJA_H - M - 6 * 36) + j * 36, W - M * 2));
    }
    hojas.push(hoja);
  }
  return hojas;
}

selFormato.addEventListener('change', () => guardarConfDespiece({ formato: selFormato.value }));
$('#tablaLargo').addEventListener('change', (e) => guardarConfDespiece({ formato: 'otro', largo: Math.round(Number(e.target.value) * 10) || 0 }));
$('#tablaAncho').addEventListener('change', (e) => guardarConfDespiece({ formato: 'otro', ancho: Math.round(Number(e.target.value) * 10) || 0 }));
$('#respetarVeta').addEventListener('change', (e) => guardarConfDespiece({ veta: e.target.checked }));
$('#altoZocalo').addEventListener('change', (e) => guardarConfDespiece({ zocalo: Math.round(Number(e.target.value) * 10) || 50 }));
$('#btnDespiecePdf').addEventListener('click', async () => {
  await logoListo();
  const nombre = nombreArchivo().replace(/^plano_/, 'despiece_');
  compartirOdescargar(await hojasAPdf(componerDespiece()), nombre, 'Despiece ' + (trabajo.datos.cliente || ''));
});
// en el móvil se comparte (WhatsApp al taller); en el PC se descarga
async function compartirOdescargar(blob, nombre, titulo) {
  if (navigator.canShare && navigator.canShare({ files: [new File([blob], nombre, { type: blob.type })] }) && matchMedia('(pointer: coarse)').matches) {
    compartirArchivo(blob, nombre, titulo);
  } else descargar(blob, nombre);
}

// se recalcula cada vez que cambia el presupuesto
const pintarResultadoSinDespiece = pintarResultado;
// eslint-disable-next-line no-global-assign
pintarResultado = function pintarResultadoConDespiece() {
  pintarResultadoSinDespiece();
  programarDespiece();
};
// al girar el móvil o cambiar el ancho (no al abrir el teclado, que solo cambia el alto)
window.addEventListener('resize', () => {
  const w = $('#despieceDibujo').clientWidth;
  if (w && w !== anchoDespiece) { anchoDespiece = w; programarDespiece(); }
});
programarDespiece();
