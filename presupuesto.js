'use strict';

// ---------------------------------------------------------------------------
// Presupuesto: piezas, cálculo con las tarifas y asistente con IA.
// Usa el estado y las utilidades de app.js (trabajo, cambio, aviso, $…).
// ---------------------------------------------------------------------------
const CLAVE_TARIFAS = 'planosCocina.tarifas';
const CLAVE_IA = 'planosCocina.claveIA';
const IVA = 0.21;
const FONDO_M2 = 750;   // a partir de este fondo (mm) la pieza se cobra por m²
const MODELO_IA = 'claude-opus-5-5';
const TIPOS_PIEZA = { bancada: 'Bancada', frontal: 'Frontal', zocalo: 'Zócalo' };

// ---------------------------------------------------------------------------
// Tarifas
// ---------------------------------------------------------------------------
function numero(texto) {
  const n = parseFloat(String(texto || '').trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Formato: tabla de materiales (Marca;Grupo;Material;Espesor;€ m/l;€ m2;Zócalo € m/l),
// una línea vacía y tabla de conceptos (Categoría;Concepto;€).
function parsearTarifas(texto) {
  const materiales = [];
  const conceptos = [];
  let seccion = null;
  for (const bruta of texto.replace(/^﻿/, '').split(/\r?\n/)) {
    const linea = bruta.trim();
    if (!linea) continue;
    const c = linea.split(';').map((x) => x.trim());
    const cabecera = c[0].toLowerCase();
    if (cabecera === 'marca') { seccion = 'materiales'; continue; }
    if (cabecera === 'categoría' || cabecera === 'categoria') { seccion = 'conceptos'; continue; }
    if (seccion === 'materiales' && c.length >= 6) {
      materiales.push({
        marca: c[0], grupo: c[1], material: c[2], espesor: c[3],
        ml: numero(c[4]), m2: numero(c[5]), zocalo: numero(c[6]),
      });
    } else if (seccion === 'conceptos' && c.length >= 3) {
      conceptos.push({ categoria: c[0], concepto: c[1], precio: numero(c[2]) });
    }
  }
  if (!materiales.length || !conceptos.length) throw new Error('Formato de tarifas no reconocido');
  return { materiales, conceptos };
}

function leerTarifasGuardadas() {
  try {
    const t = JSON.parse(localStorage.getItem(CLAVE_TARIFAS));
    if (t && t.csv) return { nombre: t.nombre, ...parsearTarifas(t.csv) };
  } catch { /* se usan las de serie */ }
  return { nombre: 'tarifas_carbonell_2025', ...parsearTarifas(TARIFAS_CSV) };
}

let tarifas = leerTarifasGuardadas();

function etiquetaMaterial(m) {
  return [`${m.marca} ${m.material}`, m.grupo, m.espesor].filter(Boolean).join(' · ');
}

const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

function buscarMaterial(texto) {
  const t = normalizar(texto);
  if (!t) return null;
  const exacto = tarifas.materiales.find((m) => normalizar(etiquetaMaterial(m)) === t);
  if (exacto) return exacto;
  // "Silestone Blanco Zeus" o solo "Blanco Zeus": vale si solo hay uno que encaje
  const candidatos = tarifas.materiales.filter((m) => {
    const nombre = normalizar(m.material);
    return t === nombre || t === normalizar(`${m.marca} ${m.material}`) || t.includes(normalizar(`${m.marca} ${m.material}`));
  });
  return candidatos.length === 1 ? candidatos[0] : null;
}

function buscarConcepto(nombre) {
  const t = normalizar(nombre);
  return tarifas.conceptos.find((c) => normalizar(c.concepto) === t) || null;
}

function cantos() {
  return tarifas.conceptos.filter((c) => normalizar(c.categoria) === 'cantos');
}

// Tipos de fregadero = huecos de la tarifa ("Hueco bajo encimera" → "Bajo encimera")
function tiposFregadero() {
  return tarifas.conceptos
    .filter((c) => /^hueco /i.test(c.concepto) && !/grifo/i.test(c.concepto))
    .map((c) => {
      const t = c.concepto.replace(/^hueco /i, '');
      return t.charAt(0).toUpperCase() + t.slice(1);
    });
}

function llenarListas() {
  const opciones = (lista) => lista.map((v) => {
    const o = document.createElement('option');
    o.value = v;
    return o;
  });
  $('#listaMateriales').replaceChildren(...opciones(tarifas.materiales.map(etiquetaMaterial)));
  $('#listaCantos').replaceChildren(...opciones(cantos().map((c) => c.concepto)));
  $('#listaFregadero').replaceChildren(...opciones([...tiposFregadero(), 'Sin fregadero']));
  $('#nombreTarifa').textContent = tarifas.nombre;
}

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------
const fmtEuro = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fmtCant = (n, u) => (u === 'ud' ? String(n) : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + ' ' + u;

function calcular(t) {
  const d = t.datos;
  const lineas = [];
  const avisos = [];
  const linea = (concepto, cantidad, unidad, precio) => {
    if (!cantidad) return;
    if (precio == null) {
      avisos.push(`Sin precio en la tarifa para «${concepto}».`);
      precio = 0;
    }
    lineas.push({ concepto, cantidad, unidad, precio, importe: Math.round(cantidad * precio * 100) / 100 });
  };

  const piezas = t.piezas || [];
  const material = buscarMaterial(d.material);
  if (piezas.length && !material) {
    avisos.push(d.material
      ? `El material «${d.material}» no está en la tarifa. Elígelo de la lista.`
      : 'Falta el material.');
  }

  let mlCanto = 0;
  let m2Frontal = 0;
  piezas.forEach((p, i) => {
    const largo = Number(p.largo) || 0;
    const fondo = Number(p.fondo) || 0;
    const nombre = `${TIPOS_PIEZA[p.tipo] || 'Pieza'} ${largo} × ${p.tipo === 'zocalo' ? '' : fondo}`.trim();
    if (!largo || (p.tipo !== 'zocalo' && !fondo)) {
      avisos.push(`Pieza ${i + 1}: faltan medidas.`);
      return;
    }
    if (material) {
      if (p.tipo === 'zocalo') {
        if (material.zocalo == null) avisos.push(`${material.material} no tiene precio de zócalo en la tarifa: el zócalo no se ha sumado.`);
        else linea(`Zócalo ${largo} mm`, largo / 1000, 'ml', material.zocalo);
      } else if (fondo >= FONDO_M2) {
        linea(`${nombre} (por m²)`, Math.round(largo * fondo / 1e4) / 100, 'm²', material.m2);
      } else {
        linea(nombre, largo / 1000, 'ml', material.ml);
      }
    }
    if (p.tipo === 'frontal') m2Frontal += largo * fondo / 1e6;
    if (p.tipo !== 'zocalo') {
      mlCanto += ((p.frente ? largo : 0) + (p.trasera ? largo : 0) + (p.izq ? fondo : 0) + (p.der ? fondo : 0)) / 1000;
    }
  });

  if (mlCanto) {
    const canto = buscarConcepto(d.canto);
    if (!canto) avisos.push(d.canto ? `El canto «${d.canto}» no está en la tarifa.` : 'Hay cantos vistos pero falta el tipo de canto.');
    linea(canto ? canto.concepto : 'Canto', Math.round(mlCanto * 100) / 100, 'ml', canto ? canto.precio : null);
  }

  // Huecos
  const frega = (d.fregadero || '').trim();
  if (frega && !/^sin\b/i.test(frega)) {
    const hueco = buscarConcepto(`Hueco ${frega}`);
    if (hueco) linea(`${hueco.concepto} (fregadero)`, 1, 'ud', hueco.precio);
    else avisos.push(`El fregadero «${frega}» no corresponde a ningún hueco de la tarifa.`);
  }
  const vitro = (d.vitro || '').trim();
  if (vitro && !/^sin\b/i.test(vitro)) {
    const hueco = buscarConcepto('Hueco sobre encimera');
    linea('Hueco vitrocerámica', 1, 'ud', hueco && hueco.precio);
  }
  const taladros = [d.grifo, d.jabonera, d.osmosis].filter(Boolean).length;
  if (taladros) {
    const g = buscarConcepto('Hueco de grifo');
    const que = [d.grifo && 'grifo', d.jabonera && 'jabonera', d.osmosis && 'ósmosis'].filter(Boolean).join(', ');
    linea(`Hueco de grifo (${que})`, taladros, 'ud', g && g.precio);
  }
  const cajas = t.objetos.filter((o) => o.tipo === 'luz').length;
  if (cajas) {
    const c = buscarConcepto('Cajas');
    linea('Cajas de luz', cajas, 'ud', c && c.precio);
  }

  // Colocación
  const extras = t.extras || {};
  if (extras.colocBancada) {
    const c = buscarConcepto('Colocación de bancada');
    linea('Colocación de bancada', 1, 'ud', c && c.precio);
  }
  if (extras.colocAplacado) {
    const c = buscarConcepto('Colocación aplacado');
    if (m2Frontal) linea('Colocación aplacado', Math.round(m2Frontal * 100) / 100, 'm²', c && c.precio);
    else avisos.push('Colocación de aplacado marcada, pero no hay piezas frontales.');
  }

  const base = Math.round(lineas.reduce((s, l) => s + l.importe, 0) * 100) / 100;
  const conIva = extras.iva !== false;
  const iva = conIva ? Math.round(base * IVA * 100) / 100 : 0;
  return { lineas, avisos, base, iva, conIva, total: Math.round((base + iva) * 100) / 100, material };
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------
const seccionPresu = $('#presupuesto');

function asegurarDatos() {
  if (!Array.isArray(trabajo.piezas)) trabajo.piezas = [];
  if (!trabajo.extras) trabajo.extras = { colocBancada: false, colocAplacado: false, iva: true };
}

function pintarPresupuesto() {
  asegurarDatos();
  const cont = $('#listaPiezas');
  cont.replaceChildren();
  trabajo.piezas.forEach((p, i) => {
    const fila = document.createElement('div');
    fila.className = 'pieza';
    fila.dataset.i = i;
    const esZocalo = p.tipo === 'zocalo';
    fila.innerHTML = `
      <div class="pieza-medidas">
        <select data-k="tipo" aria-label="Tipo de pieza">
          ${Object.entries(TIPOS_PIEZA).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}
        </select>
        <label>Largo (mm)<input data-k="largo" type="number" inputmode="numeric" min="0"></label>
        <label${esZocalo ? ' hidden' : ''}>${p.tipo === 'frontal' ? 'Alto' : 'Fondo'} (mm)<input data-k="fondo" type="number" inputmode="numeric" min="0"></label>
        <button type="button" class="quitar" title="Quitar pieza" aria-label="Quitar pieza">✕</button>
      </div>
      <div class="pieza-cantos"${esZocalo ? ' hidden' : ''}>
        <span>Canto visto:</span>
        <label class="chk"><input type="checkbox" data-k="frente"> Frente</label>
        <label class="chk"><input type="checkbox" data-k="trasera"> Trasera</label>
        <label class="chk"><input type="checkbox" data-k="izq"> Lado izq.</label>
        <label class="chk"><input type="checkbox" data-k="der"> Lado der.</label>
      </div>`;
    fila.querySelector('[data-k="tipo"]').value = p.tipo || 'bancada';
    fila.querySelector('[data-k="largo"]').value = p.largo || '';
    fila.querySelector('[data-k="fondo"]').value = p.fondo || '';
    for (const k of ['frente', 'trasera', 'izq', 'der']) fila.querySelector(`[data-k="${k}"]`).checked = !!p[k];
    cont.appendChild(fila);
  });
  if (!trabajo.piezas.length) {
    const vacio = document.createElement('p');
    vacio.className = 'vacio';
    vacio.textContent = 'Añade las piezas o usa el asistente con IA.';
    cont.appendChild(vacio);
  }
  $('#colocBancada').checked = !!trabajo.extras.colocBancada;
  $('#colocAplacado').checked = !!trabajo.extras.colocAplacado;
  $('#conIva').checked = trabajo.extras.iva !== false;
  pintarResultado();
}

function pintarResultado() {
  asegurarDatos();
  const r = calcular(trabajo);
  const tabla = $('#tablaPresupuesto');
  if (!r.lineas.length) {
    tabla.innerHTML = '<p class="vacio">El presupuesto aparecerá aquí.</p>';
  } else {
    const filas = r.lineas.map((l) => `<tr><td>${escapar(l.concepto)}</td><td class="num">${fmtCant(l.cantidad, l.unidad)}</td>`
      + `<td class="num">${fmtEuro(l.precio)}</td><td class="num">${fmtEuro(l.importe)}</td></tr>`).join('');
    tabla.innerHTML = `<table>
      <thead><tr><th>Concepto</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot>
        <tr><td colspan="3">Base imponible</td><td class="num">${fmtEuro(r.base)}</td></tr>
        ${r.conIva ? `<tr><td colspan="3">IVA 21 %</td><td class="num">${fmtEuro(r.iva)}</td></tr>` : ''}
        <tr class="total"><td colspan="3">Total${r.conIva ? '' : ' (sin IVA)'}</td><td class="num">${fmtEuro(r.total)}</td></tr>
      </tfoot></table>`;
  }
  const av = $('#avisosPresupuesto');
  av.replaceChildren(...r.avisos.map((a) => {
    const li = document.createElement('li');
    li.textContent = a;
    return li;
  }));
}

function escapar(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

$('#listaPiezas').addEventListener('input', (e) => {
  const el = e.target;
  const fila = el.closest('.pieza');
  if (!fila || !el.dataset.k) return;
  const p = trabajo.piezas[Number(fila.dataset.i)];
  const k = el.dataset.k;
  p[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
  if (k === 'tipo') {
    if (p.tipo === 'frontal') { p.frente = p.trasera = p.izq = p.der = false; }
    pintarPresupuesto();
  } else {
    pintarResultado();
  }
  cambio();
});

$('#listaPiezas').addEventListener('click', (e) => {
  const b = e.target.closest('.quitar');
  if (!b) return;
  trabajo.piezas.splice(Number(b.closest('.pieza').dataset.i), 1);
  pintarPresupuesto();
  cambio();
});

$('#btnAnadirPieza').addEventListener('click', () => {
  asegurarDatos();
  trabajo.piezas.push({ tipo: 'bancada', largo: '', fondo: '', frente: true, trasera: false, izq: false, der: false });
  pintarPresupuesto();
  $('#listaPiezas .pieza:last-child [data-k="largo"]').focus();
  cambio();
});

for (const [id, k] of [['colocBancada', 'colocBancada'], ['colocAplacado', 'colocAplacado'], ['conIva', 'iva']]) {
  $('#' + id).addEventListener('change', (e) => {
    asegurarDatos();
    trabajo.extras[k] = e.target.checked;
    pintarResultado();
    cambio();
  });
}

// Cargar otras tarifas (mismo formato CSV)
$('#fileTarifas').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const csv = await f.text();
    const nuevas = parsearTarifas(csv);
    const nombre = f.name.replace(/\.csv$/i, '');
    localStorage.setItem(CLAVE_TARIFAS, JSON.stringify({ nombre, csv }));
    tarifas = { nombre, ...nuevas };
    llenarListas();
    pintarResultado();
    aviso(`Tarifas cargadas: ${nuevas.materiales.length} materiales`);
  } catch {
    aviso('No se pudieron leer las tarifas. Revisa el formato del CSV.');
  }
});

// ---------------------------------------------------------------------------
// Hoja de presupuesto (A4)
// ---------------------------------------------------------------------------
function componerPresupuesto() {
  const r = calcular(trabajo);
  const d = trabajo.datos;
  const M = 110;
  const hoja = document.createElement('canvas');
  hoja.width = W;
  hoja.height = HOJA_H;
  const c = hoja.getContext('2d');
  c.fillStyle = '#fff';
  c.fillRect(0, 0, W, HOJA_H);
  c.textBaseline = 'top';
  c.textAlign = 'left';

  c.fillStyle = '#2f3b45';
  c.font = '700 64px system-ui, sans-serif';
  c.fillText('Presupuesto', M, M);
  c.font = '400 32px system-ui, sans-serif';
  c.fillStyle = '#5f6b75';
  c.textAlign = 'right';
  c.fillText([d.referencia && `Ref. ${d.referencia}`, fechaLegible(d.fecha)].filter(Boolean).join('   ·   '), W - M, M + 24);
  c.textAlign = 'left';

  // datos del cliente
  let y = M + 130;
  c.font = '600 34px system-ui, sans-serif';
  c.fillStyle = '#111';
  c.fillText(d.cliente || 'Cliente', M, y);
  c.font = '400 30px system-ui, sans-serif';
  c.fillStyle = '#4a5058';
  for (const l of [d.direccion, d.telefono && `Tel. ${d.telefono}`].filter(Boolean)) {
    y += 46;
    c.fillText(l, M, y);
  }
  y += 70;
  c.fillStyle = '#111';
  c.font = '600 30px system-ui, sans-serif';
  c.fillText('Material: ', M, y);
  const anchoEt = c.measureText('Material: ').width;
  c.font = '400 30px system-ui, sans-serif';
  c.fillText(r.material ? etiquetaMaterial(r.material) : (d.material || '—'), M + anchoEt, y);
  y += 90;

  // tabla
  const cols = [M, W - M - 760, W - M - 440, W - M];   // concepto | cantidad | precio | importe (borde derecho)
  const filaH = 64;
  c.fillStyle = '#2f3b45';
  c.fillRect(M, y, W - M * 2, filaH);
  c.fillStyle = '#fff';
  c.font = '600 28px system-ui, sans-serif';
  c.textBaseline = 'middle';
  c.fillText('Concepto', M + 20, y + filaH / 2);
  c.textAlign = 'right';
  c.fillText('Cantidad', cols[1] + 220, y + filaH / 2);
  c.fillText('Precio', cols[2] + 200, y + filaH / 2);
  c.fillText('Importe', cols[3] - 20, y + filaH / 2);
  y += filaH;
  c.font = '400 28px system-ui, sans-serif';
  r.lineas.forEach((l, i) => {
    if (i % 2) {
      c.fillStyle = '#f2f4f6';
      c.fillRect(M, y, W - M * 2, filaH);
    }
    c.fillStyle = '#111';
    c.textAlign = 'left';
    c.fillText(l.concepto, M + 20, y + filaH / 2);
    c.textAlign = 'right';
    c.fillText(fmtCant(l.cantidad, l.unidad), cols[1] + 220, y + filaH / 2);
    c.fillText(fmtEuro(l.precio), cols[2] + 200, y + filaH / 2);
    c.fillText(fmtEuro(l.importe), cols[3] - 20, y + filaH / 2);
    y += filaH;
  });
  c.strokeStyle = '#2f3b45';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(M, y);
  c.lineTo(W - M, y);
  c.stroke();

  // totales
  y += 30;
  const total = (texto, valor, fuerte) => {
    c.font = `${fuerte ? 700 : 400} ${fuerte ? 40 : 30}px system-ui, sans-serif`;
    c.fillStyle = '#111';
    c.textAlign = 'right';
    c.fillText(texto, cols[2] + 200, y + 30);
    c.fillText(valor, cols[3] - 20, y + 30);
    y += fuerte ? 76 : 56;
  };
  total('Base imponible', fmtEuro(r.base));
  if (r.conIva) total('IVA 21 %', fmtEuro(r.iva));
  total(r.conIva ? 'TOTAL' : 'TOTAL (IVA no incluido)', fmtEuro(r.total), true);

  c.textAlign = 'left';
  c.textBaseline = 'top';
  c.font = '400 26px system-ui, sans-serif';
  c.fillStyle = '#5f6b75';
  const nota = [
    r.conIva ? 'IVA incluido en el total.' : 'Precios sin IVA.',
    'Medidas en milímetros; precios según tarifa vigente.',
  ];
  nota.forEach((t, i) => c.fillText(t, M, HOJA_H - M - 80 + i * 40));
  return hoja;
}

function nombrePresupuesto() {
  return nombreArchivo().replace(/^plano_/, 'presupuesto_');
}

function presupuestoComoBlob() {
  return new Promise((ok) => componerPresupuesto().toBlob(ok, 'image/png'));
}

function comprobarPresupuesto() {
  if (calcular(trabajo).lineas.length) return true;
  aviso('El presupuesto está vacío: añade piezas primero');
  return false;
}

$('#btnPresuImagen').addEventListener('click', async () => {
  if (comprobarPresupuesto()) descargar(await presupuestoComoBlob(), nombrePresupuesto());
});

$('#btnPresuCompartir').addEventListener('click', async () => {
  if (!comprobarPresupuesto()) return;
  const blob = await presupuestoComoBlob();
  const archivo = new File([blob], nombrePresupuesto(), { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: 'Presupuesto ' + (trabajo.datos.cliente || '') });
    } catch { /* cancelado */ }
  } else {
    descargar(blob, archivo.name);
    aviso('Este navegador no permite compartir: se ha descargado la imagen');
  }
});

$('#btnPresuImprimir').addEventListener('click', () => {
  if (!comprobarPresupuesto()) return;
  imprimirHoja(componerPresupuesto());
});

// ---------------------------------------------------------------------------
// Asistente con IA (Claude)
// ---------------------------------------------------------------------------
// La IA solo propone las piezas y los datos del trabajo; los precios los calcula
// siempre la app con la tarifa, para que nunca se inventen.
const ESQUEMA_IA = {
  type: 'object',
  additionalProperties: false,
  required: ['piezas', 'material', 'canto', 'fregadero', 'vitro', 'grifo', 'jabonera', 'osmosis',
    'colocacion_bancada', 'colocacion_aplacado', 'notas'],
  properties: {
    piezas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tipo', 'largo_mm', 'fondo_mm', 'canto_frente', 'canto_trasera', 'canto_izq', 'canto_der'],
        properties: {
          tipo: { type: 'string', enum: ['bancada', 'frontal', 'zocalo'] },
          largo_mm: { type: 'integer' },
          fondo_mm: { type: 'integer', description: 'Fondo de la bancada o alto del frontal. 0 en zócalos.' },
          canto_frente: { type: 'boolean' },
          canto_trasera: { type: 'boolean' },
          canto_izq: { type: 'boolean' },
          canto_der: { type: 'boolean' },
        },
      },
    },
    material: { type: 'string', description: 'Texto exacto de la lista de materiales, o "" si no se sabe.' },
    canto: { type: 'string', description: 'Nombre exacto de la lista de cantos, o "".' },
    fregadero: { type: 'string', description: 'Tipo exacto de la lista de fregaderos, o "".' },
    vitro: { type: 'boolean', description: 'true si lleva hueco de vitrocerámica.' },
    grifo: { type: 'boolean' },
    jabonera: { type: 'boolean' },
    osmosis: { type: 'boolean' },
    colocacion_bancada: { type: 'boolean' },
    colocacion_aplacado: { type: 'boolean' },
    notas: { type: 'string', description: 'Suposiciones y dudas, en español, en pocas frases.' },
  },
};

const SISTEMA_IA = `Eres el ayudante de un taller de marmolería que prepara presupuestos de encimeras de cocina.
A partir del plano (imagen), los datos de la ficha y la descripción del marmolista, devuelve las piezas a cortar y los datos del trabajo.

Cómo leer el plano:
- Las cotas están en milímetros. El dibujo no está a escala: fíate de las cotas, no de las proporciones.
- Las bandas azules son cantos vistos. Las rayas rojas discontinuas son descuadres de pared (no cambian las medidas).
- Los rectángulos rayados son columnas o pilares. Los cuadrados con un rayo son cajas de luz (la app las cuenta sola; no las incluyas).
- Una encimera en L o en U se divide en piezas rectangulares (bancadas). Que la suma de largos coincida con las cotas sin contar dos veces la esquina.

Piezas:
- "bancada": encimera horizontal. largo_mm y fondo_mm.
- "frontal": aplacado o frente vertical en la pared. largo_mm y fondo_mm = alto.
- "zocalo": tira de remate en la pared. largo_mm; fondo_mm = 0.
- Cantos: marca solo los lados vistos de cada pieza. Frente = el largo que da a la cocina; trasera = el largo contra la pared.

Reglas:
- Usa la descripción del marmolista por encima de todo, después el plano y después la ficha.
- Si falta un dato (por ejemplo, el fondo), usa el valor habitual (bancada 620 mm) y dilo en "notas".
- material, canto y fregadero deben copiarse literalmente de las listas que te paso; si no encaja ninguno, deja "".
- No calcules precios.`;

function leerClaveIA() {
  try { return localStorage.getItem(CLAVE_IA) || ''; } catch { return ''; }
}

async function pedirClaveIA() {
  const clave = await pedirTexto('Clave de la API de Claude (empieza por sk-ant-). Se saca en console.anthropic.com y se guarda solo en este dispositivo.', leerClaveIA(), true);
  if (clave === null) return null;
  if (clave && !clave.startsWith('sk-ant-')) {
    aviso('Esa no parece una clave de la API: debe empezar por sk-ant-');
    return null;
  }
  try {
    if (clave) localStorage.setItem(CLAVE_IA, clave); else localStorage.removeItem(CLAVE_IA);
  } catch { /* sin almacenamiento */ }
  return clave;
}

function imagenPlanoBase64() {
  const lienzoIA = document.createElement('canvas');
  const escalaIA = 1600 / W;
  lienzoIA.width = 1600;
  lienzoIA.height = Math.round(H * escalaIA);
  pintarPlano(lienzoIA.getContext('2d'), escalaIA, false);
  return lienzoIA.toDataURL('image/png').split(',')[1];
}

function textoParaIA(descripcion) {
  const d = trabajo.datos;
  const ficha = CAMPOS.filter((c) => d[c]).map((c) => `- ${ETIQUETAS[c] || c}: ${d[c]}`).join('\n') || '(vacía)';
  return `Ficha del trabajo:
${ficha}

Descripción del marmolista:
${descripcion || '(sin descripción)'}

Lista de cantos:
${cantos().map((c) => c.concepto).join('\n')}

Lista de fregaderos:
${tiposFregadero().join('\n')}

Lista de materiales:
${tarifas.materiales.map(etiquetaMaterial).join('\n')}`;
}

const AYUDA_CLAVE = 'Para usar la IA hace falta una clave de la API de Claude: entra en console.anthropic.com, '
  + 'crea una clave en «API Keys», añade saldo en «Billing» y pégala con el botón «Clave IA». '
  + '(La suscripción de claude.ai no sirve: la API es una cuenta aparte.)';

async function presupuestoConIA() {
  const estado = $('#estadoIA');
  if (location.protocol === 'file:') {
    estado.textContent = 'El asistente con IA no funciona abriendo la app desde el ZIP. '
      + 'Ábrela desde la dirección web (https://javifx004-cmd.github.io/mesa-fondeo/).';
    return;
  }
  if (!navigator.onLine) {
    estado.textContent = 'Sin conexión a internet: la IA necesita conexión.';
    return;
  }
  let clave = leerClaveIA();
  if (!clave) clave = await pedirClaveIA();
  if (!clave) {
    estado.textContent = AYUDA_CLAVE;
    return;
  }

  const boton = $('#btnIA');
  boton.disabled = true;
  estado.textContent = 'La IA está leyendo el plano…';
  let modulo;
  try {
    modulo = await import('./vendor/anthropic-sdk.js');
  } catch {
    estado.textContent = 'No se pudo cargar el asistente. Recarga la página y prueba otra vez.';
    boton.disabled = false;
    return;
  }
  try {
    const { Anthropic, jsonSchemaOutputFormat } = modulo;
    const client = new Anthropic({ apiKey: clave, dangerouslyAllowBrowser: true });
    const respuesta = await client.beta.messages.parse({
      model: MODELO_IA,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: jsonSchemaOutputFormat(ESQUEMA_IA) },
      system: SISTEMA_IA,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imagenPlanoBase64() } },
          { type: 'text', text: textoParaIA($('#descripcionIA').value.trim()) },
        ],
      }],
    });
    if (respuesta.stop_reason === 'refusal') throw new Error('La IA no ha podido procesar esta petición.');
    if (respuesta.stop_reason === 'max_tokens') throw new Error('La respuesta de la IA se ha cortado. Prueba otra vez.');
    const r = respuesta.parsed_output;
    if (!r || !Array.isArray(r.piezas)) throw new Error('La IA no ha devuelto piezas.');
    aplicarIA(r);
    estado.textContent = r.notas ? `Notas de la IA: ${r.notas}` : 'Presupuesto preparado. Revisa las piezas.';
  } catch (err) {
    estado.textContent = mensajeErrorIA(err);
  } finally {
    boton.disabled = false;
  }
}

function mensajeErrorIA(err) {
  const s = err && err.status;
  const texto = (err && err.message) || '';
  if (s === 401) return 'La clave de la API no es válida. Pulsa «Clave IA» y pégala otra vez. ' + AYUDA_CLAVE;
  if (/credit balance/i.test(texto)) return 'La cuenta de la API no tiene saldo. Añádelo en console.anthropic.com, en «Billing».';
  if (s === 403) return 'Esta clave no tiene permiso para usar la IA.';
  if (s === 429) return 'Demasiadas peticiones seguidas. Espera un momento y prueba otra vez.';
  if (s >= 500) return 'El servicio de IA no responde ahora mismo. Prueba en un rato.';
  if (!navigator.onLine) return 'Sin conexión a internet: la IA necesita conexión.';
  if (!s) return 'No se pudo conectar con la IA. Revisa la conexión y prueba otra vez.';
  return `No se pudo hacer el presupuesto con IA (error ${s}): ${texto || 'error desconocido'}`;
}

function aplicarIA(r) {
  asegurarDatos();
  trabajo.piezas = r.piezas.map((p) => ({
    tipo: TIPOS_PIEZA[p.tipo] ? p.tipo : 'bancada',
    largo: Math.max(0, Math.round(p.largo_mm)) || '',
    fondo: p.tipo === 'zocalo' ? '' : (Math.max(0, Math.round(p.fondo_mm)) || ''),
    frente: !!p.canto_frente, trasera: !!p.canto_trasera, izq: !!p.canto_izq, der: !!p.canto_der,
  }));
  const d = trabajo.datos;
  // los datos que ya estaban en la ficha se respetan
  if (r.material && !buscarMaterial(d.material) && buscarMaterial(r.material)) d.material = r.material;
  if (r.canto && !d.canto && buscarConcepto(r.canto)) d.canto = r.canto;
  if (r.fregadero && !d.fregadero) d.fregadero = r.fregadero;
  if (r.vitro && !d.vitro) d.vitro = 'Encastrada';
  for (const k of ['grifo', 'jabonera', 'osmosis']) if (r[k]) d[k] = 'sí';
  trabajo.extras.colocBancada = !!r.colocacion_bancada;
  trabajo.extras.colocAplacado = !!r.colocacion_aplacado;
  volcarFormulario();
  dibujar();
  pintarPresupuesto();
  cambio();
}

$('#btnIA').addEventListener('click', presupuestoConIA);
$('#btnClaveIA').addEventListener('click', async () => {
  const clave = await pedirClaveIA();
  if (clave !== null) aviso(clave ? 'Clave guardada en este dispositivo' : 'Clave borrada');
});

// ---------------------------------------------------------------------------
llenarListas();
pintarPresupuesto();
