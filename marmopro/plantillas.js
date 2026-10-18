'use strict';

// ---------------------------------------------------------------------------
// Plantillas de cocina: lineal, en L, en U, con isla o con península.
// Con las medidas de cada tramo dibuja el plano (piezas, cotas, cantos vistos,
// fregadero y vitro) y rellena las piezas del presupuesto.
// ---------------------------------------------------------------------------
const dlgPlantilla = $('#dlgPlantilla');
const formPlantilla = $('#formPlantilla');

const FORMAS = {
  lineal: { campos: ['a'], dibujo: 'M10 18h44v10H10z' },
  l: { campos: ['a', 'b'], dibujo: 'M10 10h44v10H20v34H10z' },
  u: { campos: ['a', 'b', 'c'], dibujo: 'M10 10h44v34H44V20H20v24H10z' },
  isla: { campos: ['a', 'isla'], dibujo: 'M10 10h44v9H10zM20 32h24v12H20z' },
  peninsula: { campos: ['a', 'b', 'pen'], dibujo: 'M10 10h44v9H20v35H10zM28 34h26v9H28z' },
};

// Piezas en milímetros (x, y desde la esquina de la pared; y crece hacia el frente)
function geometriaPlantilla(v) {
  const F = v.fondo;
  const p = [];   // { x, y, w, h, frente: 'abajo'|'derecha'|'izquierda'|'todo', pared }
  if (v.forma === 'lineal' || v.forma === 'isla') {
    p.push({ x: 0, y: 0, w: v.a, h: F, frente: 'abajo', cota: 'arriba', largo: v.a });
  }
  if (v.forma === 'l' || v.forma === 'peninsula') {
    p.push({ x: 0, y: 0, w: v.a, h: F, frente: 'abajo', cota: 'arriba', largo: v.a });
    p.push({ x: 0, y: F, w: F, h: v.b - F, frente: 'derecha', cota: 'izquierda', largo: v.b - F, cotaTotal: v.b });
  }
  if (v.forma === 'u') {
    p.push({ x: 0, y: 0, w: v.a, h: F, frente: 'abajo', cota: 'arriba', largo: v.a });
    p.push({ x: 0, y: F, w: F, h: v.b - F, frente: 'derecha', cota: 'izquierda', largo: v.b - F, cotaTotal: v.b });
    p.push({ x: v.a - F, y: F, w: F, h: v.c - F, frente: 'izquierda', cota: 'derecha', largo: v.c - F, cotaTotal: v.c });
  }
  if (v.forma === 'isla') {
    const sep = 1000;   // paso entre la bancada y la isla
    p.push({ x: Math.max(0, (v.a - v.islaL) / 2), y: F + sep, w: v.islaL, h: v.islaF, frente: 'todo', cota: 'abajo', largo: v.islaL, isla: true });
  }
  if (v.forma === 'peninsula') {
    // sale del final del tramo de la pared izquierda, hacia la derecha
    p.push({ x: F, y: v.b - v.penF, w: v.penL, h: v.penF, frente: 'todo-menos-izq', cota: 'abajo', largo: v.penL, isla: true });
  }
  return p;
}

const cmTxt = (mm) => String(Math.round(mm) / 10).replace('.', ',');

function aplicarPlantilla(v) {
  const piezasMm = geometriaPlantilla(v);
  const maxX = Math.max(...piezasMm.map((q) => q.x + q.w));
  const maxY = Math.max(...piezasMm.map((q) => q.y + q.h));
  // cabe en el lienzo con margen para las cotas
  const margen = 230;
  const esc = Math.min((W - margen * 2) / maxX, (H - margen * 2) / maxY);
  const ox = (W - maxX * esc) / 2;
  const oy = (H - maxY * esc) / 2;
  const P = (x, y) => [Math.round(ox + x * esc), Math.round(oy + y * esc)];
  const color = '#111111';
  const w = 3;
  const objetos = [];
  const sep = 70;   // distancia de la cota a la pieza

  for (const q of piezasMm) {
    objetos.push({ tipo: 'rect', a: P(q.x, q.y), b: P(q.x + q.w, q.y + q.h), color, w });
    // cantos vistos
    const lados = {
      abajo: [P(q.x, q.y + q.h), P(q.x + q.w, q.y + q.h)],
      arriba: [P(q.x, q.y), P(q.x + q.w, q.y)],
      izquierda: [P(q.x, q.y), P(q.x, q.y + q.h)],
      derecha: [P(q.x + q.w, q.y), P(q.x + q.w, q.y + q.h)],
    };
    const vistos = q.frente === 'todo' ? ['abajo', 'arriba', 'izquierda', 'derecha']
      : q.frente === 'todo-menos-izq' ? ['abajo', 'arriba', 'derecha'] : [q.frente];
    if (v.canto) for (const l of vistos) objetos.push({ tipo: 'canto', a: lados[l][0], b: lados[l][1], color, w });
    // cotas
    if (q.cota === 'arriba') objetos.push({ tipo: 'cota', a: P(q.x, q.y).map((n, i) => n - (i ? sep : 0)), b: P(q.x + q.w, q.y).map((n, i) => n - (i ? sep : 0)), texto: cmTxt(q.largo), unidad: 'cm', color, w: 2 });
    if (q.cota === 'abajo') objetos.push({ tipo: 'cota', a: P(q.x, q.y + q.h).map((n, i) => n + (i ? sep : 0)), b: P(q.x + q.w, q.y + q.h).map((n, i) => n + (i ? sep : 0)), texto: cmTxt(q.largo), unidad: 'cm', color, w: 2 });
    if (q.cota === 'izquierda') objetos.push({ tipo: 'cota', a: P(q.x, 0).map((n, i) => n - (i ? 0 : sep)), b: P(q.x, q.y + q.h).map((n, i) => n - (i ? 0 : sep)), texto: cmTxt(q.cotaTotal), unidad: 'cm', color, w: 2 });
    if (q.cota === 'derecha') objetos.push({ tipo: 'cota', a: P(q.x + q.w, 0).map((n, i) => n + (i ? 0 : sep)), b: P(q.x + q.w, q.y + q.h).map((n, i) => n + (i ? 0 : sep)), texto: cmTxt(q.cotaTotal), unidad: 'cm', color, w: 2 });
    if (q.isla) {
      // fondo de la isla o península
      objetos.push({ tipo: 'cota', a: P(q.x + q.w, q.y).map((n, i) => n + (i ? 0 : sep)), b: P(q.x + q.w, q.y + q.h).map((n, i) => n + (i ? 0 : sep)), texto: cmTxt(q.h), unidad: 'cm', color, w: 2 });
    }
  }
  // fondo de la bancada
  const b0 = piezasMm[0];
  objetos.push({ tipo: 'cota', a: P(b0.x + b0.w, b0.y).map((n, i) => n + (i ? 0 : sep)), b: P(b0.x + b0.w, b0.y + b0.h).map((n, i) => n + (i ? 0 : sep)), texto: cmTxt(b0.h), unidad: 'cm', color, w: 2 });

  // fregadero y vitro: el fregadero en el primer tramo (o en la isla), la vitro en el siguiente
  if (v.elementos) {
    const hueco = (q, frac, ancho, prof, tipo) => {
      const vertical = q.h > q.w;
      const largo = vertical ? q.h : q.w;
      const centro = largo * frac;
      const fondo = vertical ? q.w : q.h;
      const pw = Math.min(ancho, largo * 0.6);
      const ph = Math.min(prof, fondo * 0.8);
      const o = vertical
        // girado con la trasera (taladros) hacia la pared de ese tramo
        ? { tipo, a: P(q.x + (fondo - ph) / 2, q.y + centro - pw / 2), b: P(q.x + (fondo + ph) / 2, q.y + centro + pw / 2), color, w, rot: q.cota === 'izquierda' ? 270 : 90 }
        : { tipo, a: P(q.x + centro - pw / 2, q.y + (fondo - ph) / 2), b: P(q.x + centro + pw / 2, q.y + (fondo + ph) / 2), color, w };
      objetos.push(o);
    };
    const tramos = piezasMm.filter((q) => !q.isla);
    if (v.forma === 'lineal' || v.forma === 'isla') {
      hueco(tramos[0], 0.3, 800, 450, 'frega');
      hueco(tramos[0], 0.72, 600, 510, 'vitro');
    } else {
      hueco(tramos[0], 0.55, 800, 450, 'frega');
      hueco(tramos[1], 0.55, 600, 510, 'vitro');
    }
  }

  // piezas del presupuesto
  const piezas = piezasMm.map((q) => {
    const vertical = q.h > q.w && !q.isla;
    const largo = Math.round(q.largo);
    const fondo = Math.round(vertical ? q.w : q.h);
    const todo = q.frente.startsWith('todo');
    return {
      tipo: 'bancada', largo, fondo,
      frente: v.canto, trasera: v.canto && todo,
      izq: v.canto && q.frente === 'todo', der: v.canto && todo,
    };
  });
  if (v.zocalo) {
    // zócalo a lo largo de las paredes
    for (const q of piezasMm.filter((x) => !x.isla)) piezas.push({ tipo: 'zocalo', largo: Math.round(q.h > q.w ? q.h : q.w) });
  }
  return { objetos, piezas };
}

// ---------------------------------------------------------------------------
// Ventana
// ---------------------------------------------------------------------------
function pintarFormasPlantilla() {
  $('#formasPlantilla').innerHTML = Object.entries(FORMAS).map(([id, f]) => `
    <label class="forma"><input type="radio" name="forma" value="${id}" ${id === 'l' ? 'checked' : ''}>
      <svg viewBox="0 0 64 54"><path d="${f.dibujo}"/></svg>
      <span>${{ lineal: 'Lineal', l: 'En L', u: 'En U', isla: 'Con isla', peninsula: 'Península' }[id]}</span></label>`).join('');
}
pintarFormasPlantilla();

function camposVisibles() {
  const forma = formPlantilla.elements.forma.value;
  const campos = FORMAS[forma].campos;
  for (const el of formPlantilla.querySelectorAll('[data-campo]')) el.hidden = !campos.includes(el.dataset.campo);
}
formPlantilla.addEventListener('change', camposVisibles);

$('#btnPlantilla').addEventListener('click', () => {
  if (seccionPlano.classList.contains('maximizado')) $('#btnAmpliar').click();
  camposVisibles();
  dlgPlantilla.returnValue = '';
  dlgPlantilla.showModal();
});

formPlantilla.addEventListener('submit', (e) => {
  if (e.submitter && e.submitter.value === 'cancel') return;
  const f = formPlantilla.elements;
  // se escribe en centímetros y se trabaja en milímetros
  const n = (k) => Math.round((Number(String(f[k].value).replace(',', '.')) || 0) * 10);
  const v = {
    forma: f.forma.value, a: n('a'), b: n('b'), c: n('c'), fondo: n('fondo') || 620,
    islaL: n('islaL'), islaF: n('islaF') || 900, penL: n('penL'), penF: n('penF') || 900,
    canto: f.canto.checked, elementos: f.elementos.checked, zocalo: f.zocalo.checked,
  };
  const falta = FORMAS[v.forma].campos.some((c) => (c === 'isla' ? !v.islaL : c === 'pen' ? !v.penL : !v[c]));
  const corto = (v.forma === 'l' || v.forma === 'u' || v.forma === 'peninsula') && v.b <= v.fondo
    || (v.forma === 'u' && v.c <= v.fondo);
  if (falta || corto) {
    e.preventDefault();
    aviso(falta ? 'Faltan medidas de algún tramo' : 'Los tramos laterales tienen que medir más que el fondo');
    return;
  }
  if ((trabajo.objetos.length || trabajo.piezas.length) && !confirm('Se sustituyen el plano y las piezas actuales. ¿Seguir?')) {
    e.preventDefault();
    return;
  }
  const r = aplicarPlantilla(v);
  memorizar();
  trabajo.objetos = r.objetos;
  trabajo.piezas = r.piezas;
  dibujar();
  pintarPresupuesto();
  cambio();
  aviso('Plano y piezas listos: revisa y añade lo que falte');
});

// ---------------------------------------------------------------------------
// Sacar piezas del plano dibujado (sin IA): cada rectángulo es una pieza.
// Las medidas salen de las cotas: la que va pegada a un lado da su medida exacta;
// si no, se usa la escala media de todas las cotas. Los cantos vistos marcados
// en el plano pasan a la pieza, y en las esquinas en L no se cuenta dos veces el solape.
// ---------------------------------------------------------------------------
function piezasDesdePlano(objetos) {
  const rects = objetos.filter((o) => o.tipo === 'rect').map((o) => ({ ...caja(o), mmW: o.mmW, mmH: o.mmH })).filter((r) => r.w > 8 && r.h > 8);
  const cotas = objetos.filter((o) => o.tipo === 'cota' && parseFloat(String(o.texto).replace(',', '.')) > 0)
    .map((o) => ({ a: o.a, b: o.b, mm: parseFloat(String(o.texto).replace(',', '.')) * (o.unidad === 'cm' ? 10 : 1), lon: Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) }))
    .filter((c) => c.lon > 5);
  if (!rects.length) return { error: 'No hay piezas dibujadas: dibuja cada pieza con «Rect.» (o usa una plantilla).' };
  // escala: de las cotas y de las piezas con medidas
  const escalas = [...cotas.map((c) => c.mm / c.lon), ...rects.flatMap((r) => [r.mmW && r.mmW / r.w, r.mmH && r.mmH / r.h]).filter(Boolean)]
    .sort((x, y) => x - y);
  if (!escalas.length) return { error: 'Pon las medidas a las piezas (toca la pieza con «Editar») o al menos una cota.' };
  const escala = escalas[Math.floor(escalas.length / 2)];
  const redondea = (mm) => Math.round(mm / 5) * 5;
  const piezas = rects.map((r) => {
    const horizontal = r.w >= r.h;
    // cada lado se mide por la cota pegada a él (arriba o abajo, izquierda o derecha) o por la escala
    const mmW = r.mmW || (cotaCerca(r, 'h') ?? r.w * escala);
    const mmH = r.mmH || (cotaCerca(r, 'v') ?? r.h * escala);
    return { r, horizontal, largo: redondea(horizontal ? mmW : mmH), fondo: redondea(horizontal ? mmH : mmW) };
  });
  function cotaCerca(r, eje) {
    const a = eje === 'h' ? medirLado(r.x, r.y, r.x + r.w, r.y) : medirLado(r.x, r.y, r.x, r.y + r.h);
    const b = eje === 'h' ? medirLado(r.x, r.y + r.h, r.x + r.w, r.y + r.h) : medirLado(r.x + r.w, r.y, r.x + r.w, r.y + r.h);
    return a ?? b;
  }
  // cota paralela al lado, de longitud parecida y cerca de él
  function medirLado(x1, y1, x2, y2) {
    const horizontal = Math.abs(y2 - y1) < Math.abs(x2 - x1);
    const lon = Math.hypot(x2 - x1, y2 - y1);
    let mejor = null;
    for (const c of cotas) {
      const ch = Math.abs(c.b[1] - c.a[1]) < Math.abs(c.b[0] - c.a[0]);
      if (ch !== horizontal || Math.abs(c.lon - lon) > lon * 0.08 + 6) continue;
      const dist = horizontal
        ? Math.abs((c.a[1] + c.b[1]) / 2 - y1) + Math.abs(Math.min(c.a[0], c.b[0]) - Math.min(x1, x2))
        : Math.abs((c.a[0] + c.b[0]) / 2 - x1) + Math.abs(Math.min(c.a[1], c.b[1]) - Math.min(y1, y2));
      if (dist < 200 && (!mejor || dist < mejor.dist)) mejor = { dist, mm: c.mm };
    }
    return mejor ? mejor.mm : null;
  }
  // esquinas: si dos piezas se solapan, a la más corta se le quita el trozo solapado
  for (let i = 0; i < piezas.length; i++) {
    for (let j = i + 1; j < piezas.length; j++) {
      const A = piezas[i].r;
      const B = piezas[j].r;
      const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
      const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
      if (ox <= 4 || oy <= 4) continue;
      const corta = piezas[i].largo <= piezas[j].largo ? piezas[i] : piezas[j];
      const solape = corta.horizontal ? ox : oy;
      corta.largo = redondea(corta.largo - solape * escala);
    }
  }
  // cantos vistos marcados en el plano
  const cantos = objetos.filter((o) => o.tipo === 'canto');
  const sobre = (c, x1, y1, x2, y2) => {
    const horizontal = Math.abs(y2 - y1) < 1;
    const ch = Math.abs(c.b[1] - c.a[1]) < Math.abs(c.b[0] - c.a[0]);
    if (ch !== horizontal) return false;
    if (horizontal) {
      const ov = Math.min(Math.max(c.a[0], c.b[0]), x2) - Math.max(Math.min(c.a[0], c.b[0]), x1);
      // el canto tiene que ser de este lado (no el de la pieza vecina que pasa por al lado)
      return Math.abs((c.a[1] + c.b[1]) / 2 - y1) < 22 && ov > (x2 - x1) * 0.3 && ov > Math.abs(c.b[0] - c.a[0]) * 0.5;
    }
    const ov = Math.min(Math.max(c.a[1], c.b[1]), y2) - Math.max(Math.min(c.a[1], c.b[1]), y1);
    return Math.abs((c.a[0] + c.b[0]) / 2 - x1) < 22 && ov > (y2 - y1) * 0.3 && ov > Math.abs(c.b[1] - c.a[1]) * 0.5;
  };
  return {
    piezas: piezas.filter((p) => p.largo > 0 && p.fondo > 0).map((p) => {
      const { x, y, w, h } = p.r;
      const lado = {
        arriba: cantos.some((c) => sobre(c, x, y, x + w, y)), abajo: cantos.some((c) => sobre(c, x, y + h, x + w, y + h)),
        izq: cantos.some((c) => sobre(c, x, y, x, y + h)), der: cantos.some((c) => sobre(c, x + w, y, x + w, y + h)),
      };
      // en horizontal el frente es el lado de abajo; en vertical, el lado largo con canto
      const largos = p.horizontal ? [lado.abajo, lado.arriba] : [lado.der || lado.izq, lado.der && lado.izq];
      const cortos = p.horizontal ? [lado.izq, lado.der] : [lado.arriba, lado.abajo];
      const tipo = p.fondo <= 150 ? 'zocalo' : 'bancada';
      return tipo === 'zocalo' ? { tipo, largo: p.largo }
        : { tipo, largo: p.largo, fondo: p.fondo, frente: largos[0], trasera: largos[1], izq: cortos[0], der: cortos[1] };
    }),
    escala,
  };
}

$('#btnPlantilla2').addEventListener('click', () => $('#btnPlantilla').click());
$('#btnPiezasPlano').addEventListener('click', () => {
  const r = piezasDesdePlano(trabajo.objetos);
  if (r.error) { aviso(r.error); return; }
  if (trabajo.piezas.length && !confirm(`Se sustituyen las ${trabajo.piezas.length} piezas actuales por las ${r.piezas.length} del plano. ¿Seguir?`)) return;
  trabajo.piezas = r.piezas;
  pintarPresupuesto();
  cambio();
  aviso(`${r.piezas.length} ${r.piezas.length === 1 ? 'pieza sacada' : 'piezas sacadas'} del plano: revisa medidas y cantos`);
  $('#listaPiezas').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
