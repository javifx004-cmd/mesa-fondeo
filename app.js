'use strict';

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------
const W = 2000;            // ancho lógico del plano
const H = 1400;            // alto lógico del plano
const REJILLA = 50;        // separación de la rejilla
const PASO_IMAN = 25;      // los puntos se ajustan a este paso con el imán
const TOL_TOQUE = 22;      // distancia para seleccionar un elemento
const TAM_LUZ = 56;        // lado del símbolo de caja de luz
const CLAVE = 'planosCocina.trabajos';
const CLAVE_ACTUAL = 'planosCocina.actual';
const VERSION = '20';   // cambiar junto con CACHE en sw.js
const CAMPOS = ['cliente', 'telefono', 'direccion', 'referencia', 'fecha', 'material',
  'canto', 'vitro', 'vitroMedida', 'fregadero', 'fregaMedida', 'fregaRadio', 'grifo', 'jabonera',
  'osmosis', 'observaciones'];
const ROJO = '#c62828';
const AZUL_CANTO = '#1e88e5';
const VERDE_PULIDO = '#2e7d32';
const ETIQUETAS = {
  cliente: 'Cliente', telefono: 'Teléfono', direccion: 'Dirección', referencia: 'Referencia',
  fecha: 'Fecha', material: 'Material', canto: 'Tipo de canto', vitro: 'Vitrocerámica',
  fregadero: 'Fregadero', observaciones: 'Observaciones',
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// ---------------------------------------------------------------------------
// Almacenamiento
// ---------------------------------------------------------------------------
function leerTrabajos() {
  try { return JSON.parse(localStorage.getItem(CLAVE)) || []; } catch { return []; }
}
function escribirTrabajos(lista) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista));
    return true;
  } catch {
    aviso('No se pudo guardar en este dispositivo');
    return false;
  }
}
function nuevoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function hoy() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
let trabajo = trabajoVacio();
let historial = [];
let rehacer = [];
let herramienta = 'linea';
let enCurso = null;        // elemento que se está dibujando
let arrastre = null;       // { obj, ultimo } al mover
let punteroActivo = null;

function trabajoVacio() {
  const datos = Object.fromEntries(CAMPOS.map((c) => [c, '']));
  datos.fecha = hoy();
  return {
    id: nuevoId(), datos, objetos: [], piezas: [],
    extras: { colocBancada: false, colocAplacado: false, iva: true },
    creado: Date.now(), modificado: Date.now(),
  };
}

function tieneContenido(t) {
  return t.objetos.length > 0 || (t.piezas || []).length > 0 ||
    CAMPOS.some((c) => c !== 'fecha' && (t.datos[c] || '').trim() !== '');
}

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------
const form = $('.ficha');

function volcarFormulario() {
  for (const c of CAMPOS) {
    const el = form.querySelector(`[name="${c}"]`);
    const v = trabajo.datos[c] || '';
    if (el.type === 'checkbox') {
      el.checked = !!v;
    } else {
      // en las listas se conserva un valor antiguo que ya no esté entre las opciones
      if (el.tagName === 'SELECT' && v && ![...el.options].some((o) => o.value === v)) el.add(new Option(v, v));
      el.value = v;
    }
  }
}

// Las casillas se guardan como 'sí' o '' para que todos los datos sean texto.
form.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.name) return;
  trabajo.datos[el.name] = el.type === 'checkbox' ? (el.checked ? 'sí' : '') : el.value;
  dibujar();   // los símbolos muestran las medidas de la ficha
  cambio();
});

// Texto completo de la vitro y del fregadero para la hoja.
function textoVitro(d) {
  return [d.vitro, d.vitroMedida && `Medida ${d.vitroMedida}`].filter(Boolean).join(' · ');
}
function textoFregadero(d) {
  return [
    d.fregadero,
    d.fregaMedida && `Medida ${d.fregaMedida}`,
    d.fregaRadio && `Radio ${d.fregaRadio}`,
    d.jabonera && 'Con jabonera',
    d.osmosis && 'Con ósmosis',
  ].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------
// Guardado automático
// ---------------------------------------------------------------------------
let temporizador = null;
function cambio() {
  // el presupuesto (presupuesto.js) depende de la ficha, las piezas y las cajas del plano
  if (typeof pintarResultado === 'function') pintarResultado();
  clearTimeout(temporizador);
  temporizador = setTimeout(guardar, 600);
}

function guardar(manual = false) {
  clearTimeout(temporizador);
  if (!tieneContenido(trabajo)) {
    if (manual) aviso('No hay nada que guardar todavía');
    return;
  }
  trabajo.modificado = Date.now();
  const lista = leerTrabajos();
  const i = lista.findIndex((t) => t.id === trabajo.id);
  if (i >= 0) lista[i] = trabajo; else lista.push(trabajo);
  if (escribirTrabajos(lista)) {
    try { localStorage.setItem(CLAVE_ACTUAL, trabajo.id); } catch { /* sin almacenamiento */ }
    if (manual) aviso('Trabajo guardado');
  }
}

function abrir(t) {
  trabajo = structuredClone(t);
  for (const c of CAMPOS) if (!(c in trabajo.datos)) trabajo.datos[c] = '';
  trabajo.objetos.forEach(migrarColumna);
  historial = [];
  rehacer = [];
  volcarFormulario();
  dibujar();
  if (typeof pintarPresupuesto === 'function') pintarPresupuesto();
  try { localStorage.setItem(CLAVE_ACTUAL, trabajo.id); } catch { /* sin almacenamiento */ }
}

// Las columnas antiguas guardaban sus medidas en un solo texto ("4,5X10X5" o "300 × 250").
// Se pasan a una medida por lado suponiendo la columna contra la pared de arriba:
// tres medidas = izquierda, abajo, derecha; dos = abajo y los dos laterales. Se corrigen con Editar.
function migrarColumna(o) {
  if (o.tipo !== 'columna' || o.lados || !o.texto) return;
  const m = o.texto.split(/\s*[x×*]\s*/i).filter(Boolean);
  if (m.length >= 3) o.lados = { arriba: '', izq: m[0], abajo: m[1], der: m[2] };
  else if (m.length === 2) o.lados = { arriba: '', izq: m[1], abajo: m[0], der: m[1] };
  else o.lados = { arriba: '', izq: '', abajo: m[0] || '', der: '' };
  delete o.texto;
}

// ---------------------------------------------------------------------------
// Lienzo
// ---------------------------------------------------------------------------
const lienzo = $('#lienzo');
const ctx = lienzo.getContext('2d');
const seccionPlano = $('.plano');
let escala = 1;

function ajustarLienzo() {
  const area = $('.lienzo-area');
  let anchoCss;
  if (seccionPlano.classList.contains('maximizado')) {
    // ocupa todo el hueco libre manteniendo la proporción
    anchoCss = Math.min(area.clientWidth - 2, (area.clientHeight - 2) * W / H);
  } else {
    anchoCss = area.clientWidth - 2;
  }
  anchoCss = Math.max(100, anchoCss);
  const altoCss = anchoCss * H / W;
  lienzo.style.width = anchoCss + 'px';
  lienzo.style.height = altoCss + 'px';
  const dpr = window.devicePixelRatio || 1;
  lienzo.width = Math.round(anchoCss * dpr);
  lienzo.height = Math.round(altoCss * dpr);
  escala = lienzo.width / W;
  dibujar();
}

function opciones() {
  return {
    color: $('#optColor').value,
    w: Number($('#optGrosor').value),
  };
}

function aLogico(e) {
  const r = lienzo.getBoundingClientRect();
  return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height];
}

function iman(p) {
  if (!$('#optIman').checked) return p;
  return [Math.round(p[0] / PASO_IMAN) * PASO_IMAN, Math.round(p[1] / PASO_IMAN) * PASO_IMAN];
}

// Endereza las líneas casi horizontales o verticales.
function enderezar(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
  if (ang < 7 || ang > 173) return [b[0], a[1]];
  if (Math.abs(ang - 90) < 7) return [a[0], b[1]];
  return b;
}

// ---------------------------------------------------------------------------
// Dibujo
// ---------------------------------------------------------------------------
function dibujar() {
  pintarPlano(ctx, escala, $('#optRejilla').checked);
}

function pintarPlano(c, s, conRejilla, ox = 0, oy = 0) {
  c.setTransform(s, 0, 0, s, ox, oy);
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, W, H);
  if (conRejilla) pintarRejilla(c);
  // las aristas se pintan las últimas para que redondeen las esquinas ya dibujadas
  for (const o of trabajo.objetos) if (o.tipo !== 'arista') pintarObjeto(c, o);
  for (const o of trabajo.objetos) if (o.tipo === 'arista') pintarObjeto(c, o);
  if (enCurso) pintarObjeto(c, enCurso);
}

function pintarRejilla(c) {
  c.lineWidth = 1;
  for (let x = REJILLA; x < W; x += REJILLA) {
    c.strokeStyle = x % (REJILLA * 4) === 0 ? '#d3dae0' : '#eef1f4';
    linea(c, [x, 0], [x, H]);
  }
  for (let y = REJILLA; y < H; y += REJILLA) {
    c.strokeStyle = y % (REJILLA * 4) === 0 ? '#d3dae0' : '#eef1f4';
    linea(c, [0, y], [W, y]);
  }
}

function linea(c, a, b) {
  c.beginPath();
  c.moveTo(a[0], a[1]);
  c.lineTo(b[0], b[1]);
  c.stroke();
}

function caja(o) {
  const x = Math.min(o.a[0], o.b[0]);
  const y = Math.min(o.a[1], o.b[1]);
  return { x, y, w: Math.abs(o.b[0] - o.a[0]), h: Math.abs(o.b[1] - o.a[1]) };
}

function rectRedondeado(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function tamTexto(o) {
  return 30 + o.w * 2;
}

function pintarObjeto(c, o) {
  c.strokeStyle = o.color;
  c.fillStyle = o.color;
  c.lineWidth = o.w;
  c.lineCap = 'round';
  c.lineJoin = 'round';

  switch (o.tipo) {
    case 'lapiz': {
      c.beginPath();
      c.moveTo(o.pts[0][0], o.pts[0][1]);
      for (const p of o.pts) c.lineTo(p[0], p[1]);
      c.stroke();
      break;
    }
    case 'linea':
      linea(c, o.a, o.b);
      break;
    case 'rect': {
      const { x, y, w, h } = caja(o);
      c.strokeRect(x, y, w, h);
      break;
    }
    case 'cota':
      pintarCota(c, o);
      break;
    case 'texto': {
      c.font = `600 ${tamTexto(o)}px system-ui, sans-serif`;
      c.textBaseline = 'top';
      c.textAlign = 'left';
      o.texto.split('\n').forEach((l, i) => c.fillText(l, o.p[0], o.p[1] + i * tamTexto(o) * 1.2));
      break;
    }
    case 'vitro': {
      const { x, y, w, h } = caja(o);
      c.lineWidth = Math.max(2, o.w * 0.7);
      rectRedondeado(c, x, y, w, h, Math.min(w, h) * 0.06);
      c.stroke();
      // cuatro fuegos: dos grandes y dos pequeños
      const m = Math.min(w / 2, h / 2);
      const fuegos = [
        [x + w * 0.27, y + h * 0.3, m * 0.38], [x + w * 0.73, y + h * 0.3, m * 0.28],
        [x + w * 0.27, y + h * 0.72, m * 0.28], [x + w * 0.73, y + h * 0.72, m * 0.38],
      ];
      for (const [cx, cy, r] of fuegos) {
        c.beginPath();
        c.arc(cx, cy, Math.max(2, r), 0, Math.PI * 2);
        c.stroke();
      }
      break;
    }
    case 'frega': {
      const { x, y, w, h } = caja(o);
      c.lineWidth = Math.max(2, o.w * 0.7);
      rectRedondeado(c, x, y, w, h, Math.min(w, h) * 0.12);
      c.stroke();
      const dos = w > h * 1.9;   // fregadero ancho → dos senos
      const mx = Math.min(w, h) * 0.1;
      const senos = dos
        ? [[x + mx, y + mx, w / 2 - mx * 1.5, h - mx * 2], [x + w / 2 + mx / 2, y + mx, w / 2 - mx * 1.5, h - mx * 2]]
        : [[x + mx, y + mx, w - mx * 2, h - mx * 2]];
      for (const [sx, sy, sw, sh] of senos) {
        rectRedondeado(c, sx, sy, sw, sh, Math.min(sw, sh) * 0.15);
        c.stroke();
        c.beginPath();
        c.arc(sx + sw / 2, sy + sh / 2, Math.max(2, Math.min(sw, sh) * 0.08), 0, Math.PI * 2);
        c.stroke();
      }
      // jabonera y ósmosis (de la ficha): taladros detrás del fregadero; las medidas solo van en la ficha
      const d = trabajo.datos;
      const extras = [d.jabonera && 'J', d.osmosis && 'Ó'].filter(Boolean);
      extras.forEach((letra, i) => {
        const cx = x + w - 30 - i * 80;
        const cy = y - 34;
        c.lineWidth = Math.max(2, o.w * 0.6);
        c.beginPath();
        c.arc(cx, cy, 16, 0, Math.PI * 2);
        c.stroke();
        c.font = '700 24px system-ui, sans-serif';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(letra, cx + 22, cy + 1);
      });
      break;
    }
    case 'luz': {
      // caja de luz / enchufe: cuadrado con un rayo
      const t = TAM_LUZ;
      const [x, y] = o.p;
      c.lineWidth = Math.max(2, o.w * 0.6);
      c.fillStyle = '#ffffff';
      rectRedondeado(c, x - t / 2, y - t / 2, t, t, 8);
      c.fill();
      c.stroke();
      c.fillStyle = o.color;
      c.beginPath();
      c.moveTo(x + 5, y - t * 0.36);
      c.lineTo(x - t * 0.2, y + 3);
      c.lineTo(x - 1, y + 3);
      c.lineTo(x - 5, y + t * 0.36);
      c.lineTo(x + t * 0.2, y - 3);
      c.lineTo(x + 1, y - 3);
      c.closePath();
      c.fill();
      if (o.texto) {
        c.font = '600 26px system-ui, sans-serif';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(o.texto, x + t / 2 + 10, y);
      }
      break;
    }
    case 'columna': {
      // pilar: rectángulo rayado
      const { x, y, w, h } = caja(o);
      c.save();
      c.fillStyle = '#e6e6e6';
      c.fillRect(x, y, w, h);
      c.beginPath();
      c.rect(x, y, w, h);
      c.clip();
      c.lineWidth = 2;
      for (let d = -h; d < w; d += 22) linea(c, [x + d, y + h], [x + d + h, y]);
      c.restore();
      c.strokeStyle = o.color;
      c.lineWidth = o.w;
      c.strokeRect(x, y, w, h);
      if (o.lados) pintarLadosColumna(c, o, x, y, w, h);
      break;
    }
    case 'descuadre':
      pintarDescuadre(c, o);
      break;
    case 'arista':
      pintarArista(c, o);
      break;
    case 'canto':
      c.save();
      c.globalAlpha = 0.6;
      c.strokeStyle = AZUL_CANTO;
      c.lineWidth = 16;
      c.lineCap = 'butt';
      linea(c, o.a, o.b);
      c.restore();
      break;
    case 'inglete':
      pintarInglete(c, o);
      break;
    case 'pulido':
      pintarPulido(c, o);
      break;
  }
}

// Dirección del tramo y normal a su izquierda (hacia donde van el símbolo y el texto).
function ejes(o) {
  const lon = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) || 1;
  const u = [(o.b[0] - o.a[0]) / lon, (o.b[1] - o.a[1]) / lon];
  return { u, n: [u[1], -u[0]], m: [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2], lon };
}

// Bajada a inglete: un solo triángulo sobre el canto y la altura en cm.
function triangulo(c, m, u, n, lado) {
  const h = lado * 0.87;
  c.beginPath();
  c.moveTo(m[0] - u[0] * lado / 2, m[1] - u[1] * lado / 2);
  c.lineTo(m[0] + u[0] * lado / 2, m[1] + u[1] * lado / 2);
  c.lineTo(m[0] + n[0] * h, m[1] + n[1] * h);
  c.closePath();
  c.fill();
}

function pintarInglete(c, o) {
  const { u, n, m } = ejes(o);
  c.save();
  c.fillStyle = o.color;
  triangulo(c, m, u, n, 34);
  if (o.texto) {
    c.font = '700 26px system-ui, sans-serif';
    c.textAlign = n[0] > 0.5 ? 'left' : n[0] < -0.5 ? 'right' : 'center';
    c.textBaseline = n[1] > 0.5 ? 'top' : n[1] < -0.5 ? 'bottom' : 'middle';
    c.fillText(`${o.texto} cm`, m[0] + n[0] * 40, m[1] + n[1] * 40);
  }
  c.restore();
}

// Pulido por detrás: línea verde fina junto al canto y los cm.
function pintarPulido(c, o) {
  const { u, n, m } = ejes(o);
  const d = 12;
  c.save();
  c.strokeStyle = VERDE_PULIDO;
  c.lineWidth = 3;
  c.setLineDash([18, 6, 4, 6]);
  linea(c, [o.a[0] + n[0] * d, o.a[1] + n[1] * d], [o.b[0] + n[0] * d, o.b[1] + n[1] * d]);
  c.setLineDash([]);
  if (o.texto) {
    let ang = Math.atan2(u[1], u[0]);
    if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
    const txt = `Pulido detrás ${o.texto} cm`;
    c.translate(m[0] + n[0] * (d + 24), m[1] + n[1] * (d + 24));
    c.rotate(ang);
    c.font = '700 24px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const ancho = c.measureText(txt).width;
    c.fillStyle = '#ffffff';
    c.fillRect(-ancho / 2 - 4, -14, ancho + 8, 28);
    c.fillStyle = VERDE_PULIDO;
    c.fillText(txt, 0, 1);
  }
  c.restore();
}

// Medida pequeña pegada a cada lado de la columna (solo los lados que la tienen).
function pintarLadosColumna(c, o, x, y, w, h) {
  const tam = 22;
  const sep = 6;
  // [texto, centro x, centro y, giro, desplazamiento hacia fuera]
  const lados = [
    [o.lados.arriba, x + w / 2, y, 0, -1],
    [o.lados.abajo, x + w / 2, y + h, 0, 1],
    [o.lados.izq, x, y + h / 2, -Math.PI / 2, -1],
    [o.lados.der, x + w, y + h / 2, -Math.PI / 2, 1],
  ];
  c.font = `600 ${tam}px system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (const [txt, cx, cy, giro, fuera] of lados) {
    if (!txt) continue;
    const ancho = c.measureText(txt).width;
    const d = (tam / 2 + sep) * fuera;   // separación del lado hacia fuera
    c.save();
    if (giro) {
      c.translate(cx + d, cy);
      c.rotate(giro);
    } else {
      c.translate(cx, cy + d);
    }
    c.fillStyle = '#ffffff';
    c.fillRect(-ancho / 2 - 4, -tam / 2 - 2, ancho + 8, tam + 4);
    c.fillStyle = o.color;
    c.fillText(txt, 0, 1);
    c.restore();
  }
}

// Arista redondeada: tapa la esquina en blanco, dibuja el arco y escribe la medida (ej. R 5x5).
const RADIO_ARISTA = 36;
function pintarArista(c, o) {
  const [cx, cy] = o.p;
  const r = RADIO_ARISTA;
  c.save();
  if (o.u1 && o.u2) {
    const t1 = [cx + o.u1[0] * r, cy + o.u1[1] * r];
    const t2 = [cx + o.u2[0] * r, cy + o.u2[1] * r];
    // tapa la esquina viva
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(cx - (o.u1[0] + o.u2[0]) * 10, cy - (o.u1[1] + o.u2[1]) * 10);
    c.lineTo(cx + o.u1[0] * (r + 2) - o.u2[0] * 12, cy + o.u1[1] * (r + 2) - o.u2[1] * 12);
    c.lineTo(...t1);
    c.arcTo(cx, cy, t2[0], t2[1], r);
    c.lineTo(cx + o.u2[0] * (r + 2) - o.u1[0] * 12, cy + o.u2[1] * (r + 2) - o.u1[1] * 12);
    c.closePath();
    c.fill();
    c.strokeStyle = o.color;
    c.lineWidth = o.w;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(...t1);
    c.arcTo(cx, cy, t2[0], t2[1], r);
    c.lineTo(...t2);
    c.stroke();
  } else {
    c.strokeStyle = o.color;
    c.lineWidth = 3;
    c.beginPath();
    c.arc(cx, cy, 14, 0, Math.PI * 2);
    c.stroke();
  }
  if (o.texto) {
    // la medida va por fuera de la esquina
    let dx = -1;
    let dy = -1;
    if (o.u1 && o.u2) {
      dx = -(o.u1[0] + o.u2[0]);
      dy = -(o.u1[1] + o.u2[1]);
    }
    const n = Math.hypot(dx, dy) || 1;
    const tx = cx + dx / n * 34;
    const ty = cy + dy / n * 34;
    const txt = `R ${o.texto}`;
    c.font = '700 24px system-ui, sans-serif';
    c.textAlign = dx > 0.3 ? 'left' : dx < -0.3 ? 'right' : 'center';
    c.textBaseline = dy > 0.3 ? 'top' : dy < -0.3 ? 'bottom' : 'middle';
    c.fillStyle = o.color;
    c.fillText(txt, tx, ty);
  }
  c.restore();
}

// Busca los dos cantos que forman la esquina tocada: direcciones desde la esquina.
function esquinaEn(p) {
  const tramos = [];
  for (const o of trabajo.objetos) {
    if (o.tipo === 'linea' || o.tipo === 'canto') tramos.push([o.a, o.b]);
    if (o.tipo === 'rect') {
      const { x, y, w, h } = caja(o);
      const e = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      e.forEach((q, i) => tramos.push([q, e[(i + 1) % 4]]));
    }
  }
  const dirs = [];
  let suma = [0, 0];
  for (const [a, b] of tramos) {
    for (const [ext, otro] of [[a, b], [b, a]]) {
      if (Math.hypot(ext[0] - p[0], ext[1] - p[1]) > 30) continue;
      const lon = Math.hypot(otro[0] - ext[0], otro[1] - ext[1]);
      if (lon < 20) continue;
      dirs.push([(otro[0] - ext[0]) / lon, (otro[1] - ext[1]) / lon]);
      suma = [suma[0] + ext[0], suma[1] + ext[1]];
    }
  }
  // el par de direcciones más cercano a 90°
  let mejor = null;
  for (let i = 0; i < dirs.length; i++) {
    for (let j = i + 1; j < dirs.length; j++) {
      const cos = Math.abs(dirs[i][0] * dirs[j][0] + dirs[i][1] * dirs[j][1]);
      if (cos < 0.9 && (!mejor || cos < mejor.cos)) mejor = { cos, u1: dirs[i], u2: dirs[j] };
    }
  }
  if (!mejor) return { p, u1: null, u2: null };
  return { p: [suma[0] / dirs.length, suma[1] / dirs.length], u1: mejor.u1, u2: mejor.u2 };
}

// Descuadre: raya roja discontinua encima del propio canto de la pieza, sin medida.
function pintarDescuadre(c, o) {
  const [ax, ay] = o.a;
  const [bx, by] = o.b;
  const ang = Math.atan2(by - ay, bx - ax);
  const lon = Math.hypot(bx - ax, by - ay);
  c.save();
  c.translate(ax, ay);
  c.rotate(ang);
  c.strokeStyle = ROJO;
  c.lineCap = 'butt';
  c.lineWidth = 3;
  c.setLineDash([14, 8]);
  linea(c, [0, 0], [lon, 0]);
  c.setLineDash([]);
  c.lineWidth = 2.5;
  linea(c, [0, -12], [0, 12]);
  linea(c, [lon, -12], [lon, 12]);
  c.restore();
}

function pintarCota(c, o) {
  const [ax, ay] = o.a;
  const [bx, by] = o.b;
  const ang = Math.atan2(by - ay, bx - ax);
  const lon = Math.hypot(bx - ax, by - ay);
  const t = 14;  // tamaño de las marcas de los extremos
  c.lineWidth = Math.max(2, o.w * 0.6);

  c.save();
  c.translate(ax, ay);
  c.rotate(ang);
  linea(c, [0, 0], [lon, 0]);
  // flechas
  c.beginPath();
  c.moveTo(0, 0); c.lineTo(t * 1.6, -t * 0.6); c.lineTo(t * 1.6, t * 0.6); c.closePath();
  c.moveTo(lon, 0); c.lineTo(lon - t * 1.6, -t * 0.6); c.lineTo(lon - t * 1.6, t * 0.6); c.closePath();
  c.fill();
  // líneas de referencia
  linea(c, [0, -t * 1.4], [0, t * 1.4]);
  linea(c, [lon, -t * 1.4], [lon, t * 1.4]);
  c.restore();

  if (!o.texto) return;
  // texto centrado y siempre legible
  let angTexto = ang;
  if (angTexto > Math.PI / 2 || angTexto < -Math.PI / 2) angTexto += Math.PI;
  const tam = tamTexto(o);
  c.save();
  c.translate((ax + bx) / 2, (ay + by) / 2);
  c.rotate(angTexto);
  c.font = `700 ${tam}px system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'bottom';
  const ancho = c.measureText(o.texto).width;
  c.fillStyle = '#ffffff';
  c.fillRect(-ancho / 2 - 6, -tam - 10, ancho + 12, tam + 2);
  c.fillStyle = o.color;
  c.fillText(o.texto, 0, -10);
  c.restore();
}

// ---------------------------------------------------------------------------
// Selección de elementos (para mover y borrar)
// ---------------------------------------------------------------------------
function distSegmento(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function distancia(o, p) {
  switch (o.tipo) {
    case 'lapiz': {
      let d = Infinity;
      for (let i = 1; i < o.pts.length; i++) d = Math.min(d, distSegmento(p, o.pts[i - 1], o.pts[i]));
      return o.pts.length === 1 ? Math.hypot(p[0] - o.pts[0][0], p[1] - o.pts[0][1]) : d;
    }
    case 'linea':
    case 'cota':
    case 'descuadre':
    case 'canto':
    case 'pulido':
      return distSegmento(p, o.a, o.b);
    case 'inglete':
      return Math.hypot(p[0] - (o.a[0] + o.b[0]) / 2, p[1] - (o.a[1] + o.b[1]) / 2) <= 40 ? 0 : Infinity;
    case 'luz':
      return Math.max(Math.abs(p[0] - o.p[0]), Math.abs(p[1] - o.p[1])) <= TAM_LUZ / 2 ? 0 : Infinity;
    case 'arista':
      return Math.hypot(p[0] - o.p[0], p[1] - o.p[1]) <= 40 ? 0 : Infinity;
    case 'rect': {
      const { x, y, w, h } = caja(o);
      const esq = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      return Math.min(...esq.map((e, i) => distSegmento(p, e, esq[(i + 1) % 4])));
    }
    case 'vitro':
    case 'frega':
    case 'columna': {
      const { x, y, w, h } = caja(o);
      const dentro = p[0] >= x && p[0] <= x + w && p[1] >= y && p[1] <= y + h;
      return dentro ? 0 : Infinity;
    }
    case 'texto': {
      ctx.save();
      ctx.font = `600 ${tamTexto(o)}px system-ui, sans-serif`;
      const lineas = o.texto.split('\n');
      const ancho = Math.max(...lineas.map((l) => ctx.measureText(l).width));
      ctx.restore();
      const alto = lineas.length * tamTexto(o) * 1.2;
      const dentro = p[0] >= o.p[0] - 8 && p[0] <= o.p[0] + ancho + 8 &&
        p[1] >= o.p[1] - 8 && p[1] <= o.p[1] + alto + 8;
      return dentro ? 0 : Infinity;
    }
  }
  return Infinity;
}

function elementoEn(p) {
  for (let i = trabajo.objetos.length - 1; i >= 0; i--) {
    if (distancia(trabajo.objetos[i], p) <= TOL_TOQUE) return trabajo.objetos[i];
  }
  return null;
}

function desplazar(o, dx, dy) {
  const mv = (q) => { q[0] += dx; q[1] += dy; };
  if (o.pts) o.pts.forEach(mv);
  if (o.a) { mv(o.a); mv(o.b); }
  if (o.p) mv(o.p);
}

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------
function memorizar() {
  historial.push(JSON.stringify(trabajo.objetos));
  if (historial.length > 100) historial.shift();
  rehacer = [];
}

function deshacer() {
  if (!historial.length) return;
  rehacer.push(JSON.stringify(trabajo.objetos));
  trabajo.objetos = JSON.parse(historial.pop());
  dibujar();
  cambio();
}

function volverAHacer() {
  if (!rehacer.length) return;
  historial.push(JSON.stringify(trabajo.objetos));
  trabajo.objetos = JSON.parse(rehacer.pop());
  dibujar();
  cambio();
}

function anadir(o) {
  memorizar();
  trabajo.objetos.push(o);
  dibujar();
  cambio();
}

// ---------------------------------------------------------------------------
// Eventos del puntero (ratón, dedo o lápiz)
// ---------------------------------------------------------------------------
lienzo.addEventListener('pointerdown', async (e) => {
  if (punteroActivo !== null) return;   // ignora el segundo dedo
  if (e.button && e.button !== 0) return;
  e.preventDefault();
  const crudo = aLogico(e);
  const p = iman(crudo);
  const { color, w } = opciones();

  switch (herramienta) {
    case 'lapiz':
      enCurso = { tipo: 'lapiz', pts: [crudo], color, w };
      break;
    case 'linea':
    case 'rect':
    case 'cota':
    case 'vitro':
    case 'frega':
    case 'columna':
    case 'descuadre':
    case 'canto':
    case 'inglete':
    case 'pulido':
      enCurso = { tipo: herramienta, a: p, b: [...p], color, w };
      break;
    case 'luz':
      anadir({ tipo: 'luz', p, color, w });
      return;
    case 'arista': {
      const esq = esquinaEn(p);
      const o = { tipo: 'arista', ...esq, color, w };
      enCurso = o;
      dibujar();
      o.texto = await pedirTexto('Medida de la arista redondeada (ej. 5x5)', '', true);
      enCurso = null;
      if (o.texto === null) { dibujar(); return; }
      anadir(o);
      return;
    }
    case 'editar': {
      const obj = elementoEn(crudo);
      if (obj) await editar(obj);
      return;
    }
    case 'texto': {
      const texto = await pedirTexto('Texto', '');
      if (texto) anadir({ tipo: 'texto', p: crudo, texto, color, w });
      return;
    }
    case 'mover': {
      const obj = elementoEn(crudo);
      if (!obj) return;
      memorizar();
      arrastre = { obj, ultimo: p };
      break;
    }
    case 'borrar': {
      const obj = elementoEn(crudo);
      if (!obj) return;
      memorizar();
      trabajo.objetos.splice(trabajo.objetos.indexOf(obj), 1);
      dibujar();
      cambio();
      return;
    }
  }
  punteroActivo = e.pointerId;
  lienzo.setPointerCapture(e.pointerId);
  dibujar();
});

lienzo.addEventListener('pointermove', (e) => {
  if (e.pointerId !== punteroActivo) return;
  const crudo = aLogico(e);
  if (enCurso) {
    if (enCurso.tipo === 'lapiz') {
      enCurso.pts.push(crudo);
    } else {
      const p = iman(crudo);
      const recta = ['linea', 'cota', 'descuadre', 'canto', 'inglete', 'pulido'].includes(enCurso.tipo);
      enCurso.b = recta ? enderezar(enCurso.a, p) : p;
    }
    dibujar();
  } else if (arrastre) {
    const p = iman(crudo);
    desplazar(arrastre.obj, p[0] - arrastre.ultimo[0], p[1] - arrastre.ultimo[1]);
    arrastre.ultimo = p;
    dibujar();
  }
});

async function terminarTrazo(e) {
  if (e.pointerId !== punteroActivo) return;
  punteroActivo = null;
  if (arrastre) {
    arrastre = null;
    cambio();
    return;
  }
  const o = enCurso;
  enCurso = null;
  if (!o) return;

  if (o.tipo === 'lapiz') {
    if (o.pts.length > 1) anadir(o); else dibujar();
    return;
  }
  const lon = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]);
  if (lon < 10) { dibujar(); return; }
  if (o.tipo === 'cota') {
    enCurso = o;          // se sigue viendo mientras se escribe la medida
    dibujar();
    o.texto = await pedirTexto('Medida (ej. 2450)', '');
    enCurso = null;
    if (o.texto === null) { dibujar(); return; }
  } else if (o.tipo === 'columna') {
    enCurso = o;
    dibujar();
    const ok = await pedirLadosColumna(o);
    enCurso = null;
    if (!ok) { dibujar(); return; }
  } else if (o.tipo === 'inglete' || o.tipo === 'pulido') {
    enCurso = o;
    dibujar();
    const deFicha = (/^ingletado\s*([\d,.]+)/i.exec(trabajo.datos.canto || '') || [])[1];
    o.texto = await pedirTexto(PREGUNTAS[o.tipo], o.tipo === 'inglete' ? (deFicha || ultimoInglete) : '');
    enCurso = null;
    if (o.texto === null) { dibujar(); return; }
    o.texto = o.texto.replace(/\s*cm$/i, '');
    if (o.tipo === 'inglete') ultimoInglete = o.texto;
  }
  anadir(o);
}

const PREGUNTAS = {
  inglete: 'Altura de la bajada a inglete en cm (3, 4, 5, 6…)',
  pulido: 'Centímetros pulidos por detrás',
};
let ultimoInglete = '6';   // se propone la última altura usada

async function editar(o) {
  const copia = JSON.stringify(trabajo.objetos);
  let ok = false;
  if (o.tipo === 'vitro' || o.tipo === 'frega') {
    // sus datos están en la ficha: se lleva allí al usuario
    if (seccionPlano.classList.contains('maximizado')) $('#btnAmpliar').click();
    const campo = form.querySelector(`[name="${o.tipo === 'vitro' ? 'vitroMedida' : 'fregaMedida'}"]`);
    campo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    campo.focus({ preventScroll: true });
    aviso('Las medidas se cambian aquí, en la ficha');
    return;
  } else if (o.tipo === 'columna') {
    ok = await pedirLadosColumna(o);
  } else if (['cota', 'texto', 'luz', 'arista', 'inglete', 'pulido'].includes(o.tipo)) {
    const etiquetas = {
      cota: 'Medida', texto: 'Texto', luz: 'Nota de la caja de luz (ej. 2 enchufes)',
      arista: 'Medida de la arista redondeada (ej. 5x5)', ...PREGUNTAS,
    };
    const texto = await pedirTexto(etiquetas[o.tipo], o.texto || '', o.tipo !== 'texto');
    if (texto !== null) {
      if (o.tipo === 'texto' && !texto) return;
      o.texto = texto;
      ok = true;
    }
  } else {
    aviso('Este elemento no tiene datos que editar');
    return;
  }
  if (!ok) return;
  historial.push(copia);
  rehacer = [];
  dibujar();
  cambio();
}

lienzo.addEventListener('pointerup', terminarTrazo);
lienzo.addEventListener('pointercancel', terminarTrazo);

// ---------------------------------------------------------------------------
// Barra de herramientas
// ---------------------------------------------------------------------------
$$('.tools [data-tool]').forEach((b) => b.addEventListener('click', () => {
  herramienta = b.dataset.tool;
  $$('.tools [data-tool]').forEach((x) => x.classList.toggle('active', x === b));
  lienzo.style.cursor = { mover: 'move', borrar: 'not-allowed', editar: 'pointer' }[herramienta] || 'crosshair';
}));

$('#optRejilla').addEventListener('change', dibujar);
$('#btnDeshacer').addEventListener('click', deshacer);
$('#btnRehacer').addEventListener('click', volverAHacer);
$('#btnLimpiar').addEventListener('click', () => {
  if (!trabajo.objetos.length) return;
  if (!confirm('¿Borrar todo el plano?')) return;
  memorizar();
  trabajo.objetos = [];
  dibujar();
  cambio();
});
$('#btnAmpliar').addEventListener('click', () => {
  const max = seccionPlano.classList.toggle('maximizado');
  document.body.classList.toggle('sin-scroll', max);
  $('#btnAmpliar').textContent = max ? 'Reducir' : 'Ampliar';
  ajustarLienzo();
});

document.addEventListener('keydown', (e) => {
  const enCampo = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !enCampo) {
    e.preventDefault();
    if (e.shiftKey) volverAHacer(); else deshacer();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !enCampo) {
    e.preventDefault();
    volverAHacer();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    guardar(true);
  } else if (e.key === 'Escape' && seccionPlano.classList.contains('maximizado')) {
    $('#btnAmpliar').click();
  }
});

// ---------------------------------------------------------------------------
// Diálogo de texto
// ---------------------------------------------------------------------------
function pedirTexto(etiqueta, valor, permitirVacio = false) {
  const dlg = $('#dlgTexto');
  const input = $('#dlgTextoInput');
  $('#dlgTextoLabel').firstChild.textContent = etiqueta;
  input.value = valor;
  dlg.returnValue = '';
  dlg.showModal();
  input.focus();
  return new Promise((ok) => {
    dlg.addEventListener('close', () => {
      const v = input.value.trim();
      ok(dlg.returnValue === 'ok' && (v || permitirVacio) ? v : null);
    }, { once: true });
  });
}

// Medidas de cada lado de una columna. Devuelve true si se acepta.
function pedirLadosColumna(o) {
  const dlg = $('#dlgColumna');
  const campos = { arriba: '#colArriba', abajo: '#colAbajo', izq: '#colIzq', der: '#colDer' };
  const lados = o.lados || {};
  for (const [k, sel] of Object.entries(campos)) $(sel).value = lados[k] || '';
  dlg.returnValue = '';
  dlg.showModal();
  $('#colArriba').focus();
  return new Promise((ok) => {
    dlg.addEventListener('close', () => {
      if (dlg.returnValue !== 'ok') return ok(false);
      o.lados = Object.fromEntries(Object.entries(campos).map(([k, sel]) => [k, $(sel).value.trim()]));
      delete o.texto;   // formato antiguo (una sola medida)
      ok(true);
    }, { once: true });
  });
}

// ---------------------------------------------------------------------------
// Hoja completa (datos + plano) para imagen, compartir e imprimir
// ---------------------------------------------------------------------------
function partirTexto(c, texto, ancho) {
  const lineas = [];
  for (const parrafo of String(texto).split('\n')) {
    let actual = '';
    for (const palabra of parrafo.split(' ')) {
      const prueba = actual ? actual + ' ' + palabra : palabra;
      if (c.measureText(prueba).width > ancho && actual) {
        lineas.push(actual);
        actual = palabra;
      } else {
        actual = prueba;
      }
    }
    lineas.push(actual);
  }
  return lineas;
}

function fechaLegible(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

// La hoja sale en A4 vertical (210 × 297 mm).
const HOJA_H = Math.round(W * 297 / 210);

// Cabecera común de las hojas (ficha y presupuesto): logo y nombre de la empresa.
// Devuelve la altura que ocupa.
const EMPRESA = 'MÁRMOLES CARBONELL';
const CLAVE_LOGO = 'planosCocina.logo';
const logoImg = new Image();

function cargarLogo() {
  let datos = null;
  try { datos = localStorage.getItem(CLAVE_LOGO); } catch { /* sin almacenamiento */ }
  logoImg.src = datos || 'logo.svg';   // logo de Mármoles Carbonell de serie
  $('#logoApp').src = logoImg.src;
}

// Espera a que el logo esté cargado antes de componer una hoja (como mucho 4 s).
function logoListo() {
  if (logoImg.complete) return Promise.resolve();
  return Promise.race([
    new Promise((ok) => {
      logoImg.addEventListener('load', ok, { once: true });
      logoImg.addEventListener('error', ok, { once: true });
    }),
    new Promise((ok) => setTimeout(ok, 4000)),
  ]);
}

// Nombre de la empresa: el de «Mi empresa» en Gestión, o el de serie.
function nombreEmpresa() {
  try {
    const e = JSON.parse(localStorage.getItem('planosCocina.empresa'));
    if (e && e.nombre) return e.nombre.toUpperCase();
  } catch { /* sin datos */ }
  return EMPRESA;
}

function pintarCabecera(c, M, derecha) {
  const altoLogo = 150;
  let x = M;
  if (logoImg.complete && logoImg.naturalWidth) {
    const ancho = Math.min(360, altoLogo * logoImg.naturalWidth / logoImg.naturalHeight);
    const alto = ancho * logoImg.naturalHeight / logoImg.naturalWidth;
    c.drawImage(logoImg, x, M + (altoLogo - alto) / 2, ancho, alto);
    x += ancho + 28;
  }
  c.fillStyle = '#2f3b45';
  c.font = '800 54px system-ui, sans-serif';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText(nombreEmpresa(), x, M + altoLogo / 2, W - M - x - 420);
  c.font = '400 28px system-ui, sans-serif';
  c.fillStyle = '#5f6b75';
  c.textAlign = 'right';
  derecha.filter(Boolean).forEach((t, i, lista) => {
    c.fillText(t, W - M, M + altoLogo / 2 + (i - (lista.length - 1) / 2) * 38);
  });
  c.textAlign = 'left';
  c.textBaseline = 'top';
  c.strokeStyle = '#2f3b45';
  c.lineWidth = 3;
  linea(c, [M, M + altoLogo + 16], [W - M, M + altoLogo + 16]);
  return altoLogo + 40;
}

// Zona del lienzo con dibujo, para ampliarla en la hoja.
function cajaDibujo() {
  const pts = [];
  ctx.save();
  for (const o of trabajo.objetos) {
    if (o.pts) pts.push(...o.pts);
    if (o.a) pts.push(o.a, o.b);
    if (o.tipo === 'arista') {
      // la medida va por fuera de la esquina
      pts.push([o.p[0] - 140, o.p[1] - 70], [o.p[0] + 140, o.p[1] + 70]);
    }
    if (o.p) {
      pts.push(o.p);
      if (o.texto && (o.tipo === 'texto' || o.tipo === 'luz')) {
        ctx.font = `600 ${o.tipo === 'texto' ? tamTexto(o) : 26}px system-ui, sans-serif`;
        const ancho = Math.max(...o.texto.split('\n').map((l) => ctx.measureText(l).width));
        const lineas = o.texto.split('\n').length;
        pts.push([o.p[0] + ancho + (o.tipo === 'luz' ? TAM_LUZ : 0), o.p[1] + lineas * tamTexto(o) * 1.2]);
      }
    }
  }
  ctx.restore();
  if (!pts.length) return { x: 0, y: 0, w: W, h: H };
  const margen = 80;
  let x0 = Math.min(...pts.map((q) => q[0])) - margen;
  let y0 = Math.min(...pts.map((q) => q[1])) - margen;
  let x1 = Math.max(...pts.map((q) => q[0])) + margen;
  let y1 = Math.max(...pts.map((q) => q[1])) + margen;
  // tamaño mínimo para que un dibujo pequeño no salga gigante
  if (x1 - x0 < 800) { const m = (x0 + x1) / 2; x0 = m - 400; x1 = m + 400; }
  if (y1 - y0 < 560) { const m = (y0 + y1) / 2; y0 = m - 280; y1 = m + 280; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function componerHoja() {
  const M = 70;                     // margen (unos 7 mm)
  const colW = (W - M * 3) / 2;     // dos columnas de datos
  const tamEt = 24;
  const tamVal = 30;
  const alto = tamVal * 1.25;
  const medir = document.createElement('canvas').getContext('2d');
  medir.font = `400 ${tamVal}px system-ui, sans-serif`;

  const d = {
    ...trabajo.datos,
    fecha: fechaLegible(trabajo.datos.fecha),
    vitro: textoVitro(trabajo.datos),
    fregadero: textoFregadero(trabajo.datos),
  };
  const pares = [
    ['cliente', 'telefono'], ['direccion', 'referencia'], ['material', 'fecha'],
    ['canto', 'vitro'], ['fregadero', null],
  ];
  // calcula el alto de cada fila
  const filas = pares.map((par) => {
    const celdas = par.map((c) => c && {
      etiqueta: ETIQUETAS[c],
      lineas: partirTexto(medir, d[c] || '—', colW - 20),
    });
    const n = Math.max(...celdas.filter(Boolean).map((x) => x.lineas.length));
    return { celdas, h: tamEt + 10 + n * alto + 14 };
  });

  const hoja = document.createElement('canvas');
  hoja.width = W;
  hoja.height = HOJA_H;
  const c = hoja.getContext('2d');
  c.fillStyle = '#fff';
  c.fillRect(0, 0, hoja.width, hoja.height);

  const cabecera = pintarCabecera(c, M, [d.referencia && `Ref. ${d.referencia}`, d.fecha]);

  let y = M + cabecera;
  c.strokeStyle = '#c9d0d6';
  c.lineWidth = 2;
  const celda = (x, yy, w, h, cel) => {
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.strokeStyle = '#c9d0d6';
    c.lineWidth = 2;
    c.strokeRect(x, yy, w, h);
    c.fillStyle = '#5f6b75';
    c.font = `600 ${tamEt}px system-ui, sans-serif`;
    c.fillText(cel.etiqueta.toUpperCase(), x + 10, yy + 8);
    c.fillStyle = '#111';
    c.font = `400 ${tamVal}px system-ui, sans-serif`;
    cel.lineas.forEach((l, i) => c.fillText(l, x + 10, yy + tamEt + 14 + i * alto));
  };
  for (const f of filas) {
    f.celdas.forEach((cel, i) => {
      if (cel) celda(M + i * (colW + M), y, colW, f.h - 8, cel);
    });
    y += f.h;
  }

  // leyenda de cantos vistos y descuadres (debajo del plano)
  const leyenda = [];
  if (trabajo.objetos.some((o) => o.tipo === 'canto')) {
    leyenda.push({ txt: 'Canto visto' + (trabajo.datos.canto ? ` (${trabajo.datos.canto})` : ''), tipo: 'canto' });
  }
  if (trabajo.objetos.some((o) => o.tipo === 'descuadre')) leyenda.push({ txt: 'Descuadre', tipo: 'descuadre' });
  if (trabajo.objetos.some((o) => o.tipo === 'inglete')) leyenda.push({ txt: 'Bajada a inglete', tipo: 'inglete' });
  if (trabajo.objetos.some((o) => o.tipo === 'pulido')) leyenda.push({ txt: 'Pulido por detrás', tipo: 'pulido' });
  const hLeyenda = leyenda.length ? 56 : 0;

  // observaciones: una franja pequeña, solo si hay texto
  const obs = (d.observaciones || '').trim();
  const lineasObs = obs ? partirTexto(medir, obs, W - M * 2 - 20).slice(0, 3) : [];
  const hObs = obs ? tamEt + 10 + lineasObs.length * alto + 14 : 0;

  // plano: se recorta a lo dibujado y se amplía para llenar todo el hueco libre
  const marco = { x: M, y: y + 4, w: W - M * 2 };
  marco.h = HOJA_H - M - (hObs ? hObs + 16 : 0) - hLeyenda - marco.y;
  const caja = cajaDibujo();
  const escala = Math.min(marco.w / caja.w, marco.h / caja.h, 1.5);
  const ox = marco.x + (marco.w - caja.w * escala) / 2 - caja.x * escala;
  const oy = marco.y + (marco.h - caja.h * escala) / 2 - caja.y * escala;
  c.save();
  c.beginPath();
  c.rect(marco.x, marco.y, marco.w, marco.h);
  c.clip();
  pintarPlano(c, escala, false, ox, oy);
  c.restore();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.strokeStyle = '#2f3b45';
  c.lineWidth = 3;
  c.strokeRect(marco.x, marco.y, marco.w, marco.h);

  let lx = M + 10;
  const ly = marco.y + marco.h + hLeyenda / 2;
  c.font = '600 26px system-ui, sans-serif';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  for (const { txt, tipo } of leyenda) {
    const ancho = 90 + c.measureText(txt).width;
    c.save();
    if (tipo === 'canto') {
      c.globalAlpha = 0.6;
      c.strokeStyle = AZUL_CANTO;
      c.lineWidth = 16;
    } else if (tipo === 'pulido') {
      c.strokeStyle = VERDE_PULIDO;
      c.lineWidth = 3;
      c.setLineDash([18, 6, 4, 6]);
    } else {
      c.strokeStyle = ROJO;
      c.lineWidth = 3;
      c.setLineDash([14, 8]);
    }
    if (tipo === 'inglete') {
      c.fillStyle = '#111';
      triangulo(c, [lx + 35, ly + 12], [1, 0], [0, -1], 30);
    } else {
      linea(c, [lx, ly], [lx + 70, ly]);
    }
    c.restore();
    c.fillStyle = '#111';
    c.fillText(txt, lx + 84, ly);
    lx += ancho + 40;
  }

  if (obs) celda(M, HOJA_H - M - hObs, W - M * 2, hObs, { etiqueta: ETIQUETAS.observaciones, lineas: lineasObs });
  return hoja;
}

function nombreArchivo() {
  const partes = [trabajo.datos.cliente, trabajo.datos.referencia].filter(Boolean).join('_') || 'plano';
  return 'plano_' + partes.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60) + '.png';
}

async function hojaComoBlob() {
  await logoListo();
  return new Promise((ok) => componerHoja().toBlob(ok, 'image/png'));
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

$('#btnImagen').addEventListener('click', async () => {
  descargar(await hojaComoBlob(), nombreArchivo());
});

$('#btnCompartir').addEventListener('click', async () => {
  const blob = await hojaComoBlob();
  const archivo = new File([blob], nombreArchivo(), { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: 'Plano ' + (trabajo.datos.cliente || '') });
    } catch { /* cancelado */ }
  } else {
    descargar(blob, archivo.name);
    aviso('Este navegador no permite compartir: se ha descargado la imagen');
  }
});

// Por defecto se imprime la hoja del plano; el presupuesto pasa su propia hoja.
let hojaAImprimir = null;
function prepararImpresion() {
  $('#imgImpresion').src = (hojaAImprimir || componerHoja()).toDataURL('image/png');
}
// componer: función que crea la hoja (null = la del plano)
async function imprimirHoja(componer) {
  await logoListo();
  hojaAImprimir = componer ? componer() : null;
  prepararImpresion();
  setTimeout(() => window.print(), 50);
}
window.addEventListener('beforeprint', prepararImpresion);
window.addEventListener('afterprint', () => { hojaAImprimir = null; });
$('#btnImprimir').addEventListener('click', () => imprimirHoja(null));

// ---------------------------------------------------------------------------
// Trabajos guardados
// ---------------------------------------------------------------------------
const dlgTrabajos = $('#dlgTrabajos');

function pintarLista() {
  const filtro = $('#buscar').value.trim().toLowerCase();
  const ul = $('#listaTrabajos');
  ul.innerHTML = '';
  const lista = leerTrabajos()
    .filter((t) => !filtro || CAMPOS.some((c) => (t.datos[c] || '').toLowerCase().includes(filtro)))
    .sort((a, b) => b.modificado - a.modificado);
  if (!lista.length) {
    const li = document.createElement('li');
    li.className = 'vacio';
    li.textContent = filtro ? 'Sin resultados' : 'Todavía no hay trabajos guardados';
    ul.appendChild(li);
    return;
  }
  for (const t of lista) {
    const li = document.createElement('li');
    const info = document.createElement('div');
    info.className = 'info';
    const titulo = document.createElement('strong');
    titulo.textContent = [t.datos.cliente || 'Sin cliente', t.datos.referencia].filter(Boolean).join(' · ');
    const sub = document.createElement('small');
    sub.textContent = [t.datos.telefono, t.datos.direccion, fechaLegible(t.datos.fecha)].filter(Boolean).join(' · ');
    info.append(titulo, sub);
    info.addEventListener('click', () => {
      guardar();
      abrir(t);
      dlgTrabajos.close();
    });

    const dup = document.createElement('button');
    dup.type = 'button';
    dup.textContent = 'Copiar';
    dup.title = 'Duplicar trabajo';
    dup.addEventListener('click', () => {
      const copia = structuredClone(t);
      copia.id = nuevoId();
      copia.datos.referencia = (copia.datos.referencia || '') + ' (copia)';
      copia.creado = copia.modificado = Date.now();
      escribirTrabajos([...leerTrabajos(), copia]);
      pintarLista();
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = 'Borrar';
    del.addEventListener('click', () => {
      if (!confirm(`¿Borrar el trabajo de "${t.datos.cliente || 'sin cliente'}"?`)) return;
      escribirTrabajos(leerTrabajos().filter((x) => x.id !== t.id));
      if (t.id === trabajo.id) {
        trabajo = trabajoVacio();
        abrir(trabajo);
      }
      pintarLista();
    });
    li.append(info, dup, del);
    ul.appendChild(li);
  }
}

$('#btnTrabajos').addEventListener('click', () => {
  guardar();
  $('#buscar').value = '';
  pintarLista();
  dlgTrabajos.showModal();
});
$('#buscar').addEventListener('input', pintarLista);
$$('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

$('#btnNuevo').addEventListener('click', () => {
  guardar();
  abrir(trabajoVacio());
  window.scrollTo({ top: 0, behavior: 'smooth' });
  aviso('Nuevo trabajo');
});
$('#btnGuardar').addEventListener('click', () => guardar(true));

$('#btnExportar').addEventListener('click', () => {
  guardar();
  // copia completa: trabajos y, si existe, la gestión (clientes, documentos, empresa)
  const copia = { version: 2, trabajos: leerTrabajos(), gestion: typeof exportarGestion === 'function' ? exportarGestion() : null };
  const blob = new Blob([JSON.stringify(copia, null, 1)], { type: 'application/json' });
  descargar(blob, `planos-cocina-copia-${hoy()}.json`);
});

$('#fileImportar').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const datos = JSON.parse(await f.text());
    // formato antiguo: solo la lista de trabajos; nuevo: { trabajos, gestion }
    const entrada = Array.isArray(datos) ? datos : datos.trabajos;
    if (!Array.isArray(entrada)) throw new Error();
    const nDocs = !Array.isArray(datos) && typeof importarGestion === 'function' ? importarGestion(datos.gestion) : 0;
    const lista = leerTrabajos();
    let n = 0;
    for (const t of entrada) {
      if (!t || !t.id || !t.datos || !Array.isArray(t.objetos)) continue;
      const i = lista.findIndex((x) => x.id === t.id);
      if (i >= 0) {
        if ((t.modificado || 0) > (lista[i].modificado || 0)) lista[i] = t;
      } else {
        lista.push(t);
      }
      n++;
    }
    escribirTrabajos(lista);
    pintarLista();
    aviso(`${n} trabajos restaurados` + (nDocs ? ` y ${nDocs} documentos` : ''));
  } catch {
    aviso('El archivo no es una copia válida');
  }
});

// ---------------------------------------------------------------------------
// Logo de la empresa (se reduce y se guarda en el dispositivo)
// ---------------------------------------------------------------------------
$('#fileLogo').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const img = new Image();
    img.src = URL.createObjectURL(f);
    await img.decode();
    const escalaLogo = Math.min(1, 600 / img.naturalWidth, 300 / img.naturalHeight);
    const lc = document.createElement('canvas');
    lc.width = Math.round(img.naturalWidth * escalaLogo);
    lc.height = Math.round(img.naturalHeight * escalaLogo);
    lc.getContext('2d').drawImage(img, 0, 0, lc.width, lc.height);
    URL.revokeObjectURL(img.src);
    localStorage.setItem(CLAVE_LOGO, lc.toDataURL('image/png'));
    cargarLogo();
    aviso('Logo guardado: saldrá en la ficha y en el presupuesto');
  } catch {
    aviso('No se pudo cargar esa imagen');
  }
});
$('#btnQuitarLogo').addEventListener('click', () => {
  try { localStorage.removeItem(CLAVE_LOGO); } catch { /* sin almacenamiento */ }
  cargarLogo();
  aviso('Se vuelve a usar el logo de Mármoles Carbonell');
});

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------
let tempAviso = null;
function aviso(texto) {
  const el = $('#aviso');
  el.textContent = texto;
  el.classList.add('visible');
  clearTimeout(tempAviso);
  tempAviso = setTimeout(() => el.classList.remove('visible'), 2200);
}

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------
(function iniciar() {
  let idActual = null;
  try { idActual = localStorage.getItem(CLAVE_ACTUAL); } catch { /* sin almacenamiento */ }
  const previo = leerTrabajos().find((t) => t.id === idActual);
  abrir(previo || trabajoVacio());
  ajustarLienzo();
  window.addEventListener('resize', ajustarLienzo);
  window.addEventListener('pagehide', () => guardar());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') guardar();
  });

  $('#version').textContent = `Planos Cocina · versión ${VERSION}`;
  cargarLogo();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo sin conexión */ });
  }
})();
