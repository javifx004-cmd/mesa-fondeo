'use strict';

// ---------------------------------------------------------------------------
// Parte de conformidad de cada cocina: nombre, DNI, fecha, texto, incidencias y firma del cliente.
// Se guarda en el trabajo (trabajo.conformidad) y sale en PDF con el plano en la segunda página.
// ---------------------------------------------------------------------------
const dlgConformidad = $('#dlgConformidad');
const formConf = $('#formConformidad');
const lienzoFirma = $('#lienzoFirma');
const ctxFirma = lienzoFirma.getContext('2d');
let firmaTrazada = false;
let firmaPrevia = null;   // imagen de la firma ya guardada

const TEXTO_CONFORMIDAD = 'El cliente abajo firmante declara que el trabajo de encimera descrito ha sido fabricado e '
  + 'instalado a su entera satisfacción, conforme a lo presupuestado y acordado, y que lo recibe en buen estado, '
  + 'sin daños, golpes ni defectos visibles. Las incidencias, si las hay, se indican en este parte.';

// DNI (8 números + letra) o NIE (X/Y/Z + 7 números + letra): se comprueba la letra
function dniValido(v) {
  const t = String(v || '').toUpperCase().replace(/[\s.-]/g, '');
  const m = /^([XYZ]?)(\d{7,8})([A-Z])$/.exec(t);
  if (!m) return false;
  const num = Number(({ X: '0', Y: '1', Z: '2' }[m[1]] || '') + m[2]);
  return 'TRWAGMYFPDXBNJZSQVHLCKE'[num % 23] === m[3];
}

// --- firma con el dedo o el ratón ---
function limpiarFirma() {
  ctxFirma.fillStyle = '#ffffff';
  ctxFirma.fillRect(0, 0, lienzoFirma.width, lienzoFirma.height);
  ctxFirma.strokeStyle = '#d9d2c3';
  ctxFirma.lineWidth = 2;
  ctxFirma.beginPath();
  ctxFirma.moveTo(60, lienzoFirma.height - 70);
  ctxFirma.lineTo(lienzoFirma.width - 60, lienzoFirma.height - 70);
  ctxFirma.stroke();
  firmaTrazada = false;
  firmaPrevia = null;
}
let trazoFirma = null;
const puntoFirma = (e) => {
  const r = lienzoFirma.getBoundingClientRect();
  return [(e.clientX - r.left) * lienzoFirma.width / r.width, (e.clientY - r.top) * lienzoFirma.height / r.height];
};
lienzoFirma.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  lienzoFirma.setPointerCapture(e.pointerId);
  trazoFirma = puntoFirma(e);
});
lienzoFirma.addEventListener('pointermove', (e) => {
  if (!trazoFirma) return;
  const p = puntoFirma(e);
  ctxFirma.strokeStyle = '#10213f';
  ctxFirma.lineWidth = e.pressure && e.pointerType === 'pen' ? 3 + e.pressure * 5 : 5;
  ctxFirma.lineCap = 'round';
  ctxFirma.lineJoin = 'round';
  ctxFirma.beginPath();
  ctxFirma.moveTo(...trazoFirma);
  ctxFirma.lineTo(...p);
  ctxFirma.stroke();
  trazoFirma = p;
  firmaTrazada = true;
});
['pointerup', 'pointercancel'].forEach((t) => lienzoFirma.addEventListener(t, () => { trazoFirma = null; }));
$('#btnBorrarFirma').addEventListener('click', limpiarFirma);

// La firma se guarda recortada y pequeña (para que ocupe poco y se sincronice rápido)
function firmaComoImagen() {
  if (!firmaTrazada) return firmaPrevia;
  const d = ctxFirma.getImageData(0, 0, lienzoFirma.width, lienzoFirma.height).data;
  let x0 = lienzoFirma.width; let y0 = lienzoFirma.height; let x1 = 0; let y1 = 0;
  for (let y = 0; y < lienzoFirma.height; y += 2) {
    for (let x = 0; x < lienzoFirma.width; x += 2) {
      const i = (y * lienzoFirma.width + x) * 4;
      if (d[i] < 120 && d[i + 2] > d[i]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
  }
  if (x1 <= x0) return null;
  const m = 12;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(lienzoFirma.width, x1 + m); y1 = Math.min(lienzoFirma.height, y1 + m);
  const esc = Math.min(1, 600 / (x1 - x0));
  const c = document.createElement('canvas');
  c.width = Math.round((x1 - x0) * esc);
  c.height = Math.round((y1 - y0) * esc);
  const cc = c.getContext('2d');
  cc.fillStyle = '#fff';
  cc.fillRect(0, 0, c.width, c.height);
  cc.drawImage(lienzoFirma, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

// --- ventana ---
function abrirConformidad() {
  guardar();
  const c = trabajo.conformidad || {};
  const emp = leerEmpresa();
  const f = formConf.elements;
  f.nombre.value = c.nombre || trabajo.datos.cliente || '';
  f.dni.value = c.dni || ((typeof clientePorId === 'function' && trabajo.clienteId && (clientePorId(trabajo.clienteId) || {}).nif) || '');
  f.fecha.value = c.fecha || trabajo.datos.colocacion || hoy();
  f.instalador.value = c.instalador || '';
  f.texto.value = c.texto || emp.textoConformidad || TEXTO_CONFORMIDAD;
  f.incidencias.value = c.incidencias || '';
  $('#confTrabajo').textContent = [trabajo.datos.cliente, trabajo.datos.direccion, trabajo.datos.material].filter(Boolean).join(' · ')
    || 'Trabajo sin datos todavía';
  $('#btnConfQuitar').hidden = !trabajo.conformidad;
  avisoDni();
  limpiarFirma();
  if (c.firma) {
    // la firma guardada se enseña en el recuadro
    const img = new Image();
    img.onload = () => {
      const esc = Math.min((lienzoFirma.width - 120) / img.width, (lienzoFirma.height - 100) / img.height, 2);
      ctxFirma.drawImage(img, (lienzoFirma.width - img.width * esc) / 2, (lienzoFirma.height - 70 - img.height * esc), img.width * esc, img.height * esc);
      firmaPrevia = c.firma;
    };
    img.src = c.firma;
  }
  dlgConformidad.returnValue = '';
  dlgConformidad.showModal();
}
function avisoDni() {
  const v = formConf.elements.dni.value.trim();
  $('#confDniAviso').textContent = v && !dniValido(v) ? 'Revisa el DNI: la letra no cuadra' : v ? '✓ DNI correcto' : '';
  $('#confDniAviso').classList.toggle('ok', !!v && dniValido(v));
}
formConf.elements.dni.addEventListener('input', avisoDni);

function leerConformidad() {
  const f = formConf.elements;
  return {
    nombre: f.nombre.value.trim(), dni: f.dni.value.trim().toUpperCase(), fecha: f.fecha.value,
    instalador: f.instalador.value.trim(), texto: f.texto.value.trim(), incidencias: f.incidencias.value.trim(),
    firma: firmaComoImagen(),
  };
}
function validarConformidad(c) {
  if (!c.nombre || !c.dni || !c.fecha) return 'Faltan el nombre, el DNI o la fecha';
  if (!c.firma) return 'Falta la firma del cliente';
  return '';
}
formConf.addEventListener('submit', (e) => {
  if (!e.submitter || e.submitter.value !== 'ok') return;
  const c = leerConformidad();
  const error = validarConformidad(c);
  if (error) { e.preventDefault(); aviso(error); return; }
  if (!dniValido(c.dni) && !confirm('La letra del DNI no cuadra. ¿Guardar igualmente?')) { e.preventDefault(); return; }
  trabajo.conformidad = { ...c, firmado: Date.now() };
  sucio = true;
  guardar();
  pintarEstadoConformidad();
  aviso('Parte de conformidad firmado y guardado');
});
$('#btnConfQuitar').addEventListener('click', () => {
  if (!confirm('¿Quitar el parte de conformidad firmado de este trabajo?')) return;
  delete trabajo.conformidad;
  sucio = true;
  guardar();
  dlgConformidad.close();
  pintarEstadoConformidad();
});

// --- hoja A4 del parte ---
function componerConformidad(c) {
  const emp = leerEmpresa();
  const M = 110;
  const hoja = document.createElement('canvas');
  hoja.width = W;
  hoja.height = HOJA_H;
  const g = hoja.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, HOJA_H);
  const cab = pintarCabecera(g, M, ['PARTE DE CONFORMIDAD', `Fecha: ${fechaLegible(c.fecha)}`, trabajo.datos.referencia ? `Ref. ${trabajo.datos.referencia}` : '']);
  let y = M + cab + 20;
  g.textAlign = 'left';
  g.textBaseline = 'top';
  // datos de la obra
  const filas = [
    ['Cliente', c.nombre], ['DNI / NIE', c.dni], ['Dirección de la obra', trabajo.datos.direccion],
    ['Material', trabajo.datos.material], ['Canto', trabajo.datos.canto], ['Instalado por', c.instalador],
  ].filter(([, v]) => v);
  g.strokeStyle = '#c9d0d6';
  g.lineWidth = 2;
  const altoFila = 58;
  g.strokeRect(M, y, W - M * 2, altoFila * filas.length + 20);
  filas.forEach(([k, v], i) => {
    g.fillStyle = '#5f6b75';
    g.font = '600 26px system-ui, sans-serif';
    g.fillText(k.toUpperCase(), M + 26, y + 22 + i * altoFila);
    g.fillStyle = '#111';
    g.font = '400 32px system-ui, sans-serif';
    g.fillText(v, M + 440, y + 18 + i * altoFila, W - M * 2 - 470);
  });
  y += altoFila * filas.length + 70;
  // texto de conformidad
  g.fillStyle = '#111';
  g.font = '400 32px system-ui, sans-serif';
  for (const l of partirTexto(g, c.texto, W - M * 2)) { g.fillText(l, M, y); y += 46; }
  y += 30;
  g.font = '700 30px system-ui, sans-serif';
  g.fillText('Incidencias u observaciones', M, y);
  y += 46;
  g.font = '400 30px system-ui, sans-serif';
  g.fillStyle = c.incidencias ? '#111' : '#5f6b75';
  for (const l of partirTexto(g, c.incidencias || 'Ninguna.', W - M * 2)) { g.fillText(l, M, y); y += 42; }
  // firmas
  const yf = Math.max(y + 80, HOJA_H - M - 560);
  const anchoF = (W - M * 2 - 80) / 2;
  const caja = (x, titulo, nombre) => {
    g.strokeStyle = '#9aa5ae';
    g.lineWidth = 2;
    g.strokeRect(x, yf, anchoF, 380);
    g.fillStyle = '#5f6b75';
    g.font = '600 26px system-ui, sans-serif';
    g.fillText(titulo, x + 24, yf + 20);
    g.fillStyle = '#111';
    g.font = '400 28px system-ui, sans-serif';
    g.fillText(nombre || '', x + 24, yf + 380 - 50, anchoF - 48);
  };
  caja(M, 'FIRMA DEL CLIENTE', `${c.nombre}${c.dni ? ` · DNI ${c.dni}` : ''}`);
  caja(M + anchoF + 80, `POR ${(emp.nombre || nombreEmpresa()).toUpperCase()}`, c.instalador || emp.nombre || '');
  if (c.firmaImg && c.firmaImg.complete && c.firmaImg.naturalWidth) {
    const img = c.firmaImg;
    const esc = Math.min((anchoF - 60) / img.width, 250 / img.height);
    g.drawImage(img, M + (anchoF - img.width * esc) / 2, yf + 64 + (250 - img.height * esc) / 2, img.width * esc, img.height * esc);
  }
  g.fillStyle = '#5f6b75';
  g.font = '400 22px system-ui, sans-serif';
  const firmado = c.firmado ? new Date(c.firmado).toLocaleString('es-ES') : new Date().toLocaleString('es-ES');
  g.fillText(`Firmado en la aplicación de ${emp.nombre || nombreEmpresa()} el ${firmado}.`, M, yf + 400);
  return hoja;
}

async function pdfConformidad() {
  const c = { ...leerConformidad(), firmado: (trabajo.conformidad || {}).firmado };
  const error = validarConformidad(c);
  if (error) { aviso(error); return null; }
  await logoListo();
  c.firmaImg = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = c.firma; });
  const hojas = [componerConformidad(c)];
  if (trabajo.objetos.length) hojas.push(componerHoja());   // el plano de lo que se entrega
  return hojasAPdf(hojas);
}
const nombreConformidad = () => nombreArchivo().replace(/^plano_/, 'conformidad_');
$('#btnConfPdf').addEventListener('click', async () => {
  const pdf = await pdfConformidad();
  if (pdf) descargar(pdf, nombreConformidad());
});
$('#btnConfCompartir').addEventListener('click', async () => {
  const pdf = await pdfConformidad();
  if (pdf) compartirArchivo(pdf, nombreConformidad(), `Parte de conformidad ${trabajo.datos.cliente || ''}`);
});
$('#btnConformidad').addEventListener('click', abrirConformidad);

function pintarEstadoConformidad() {
  const c = trabajo && trabajo.conformidad;
  $('#estadoConformidad').innerHTML = c ? `<span class="estado ok">✓ Firmado por ${escapar(c.nombre)} el ${fechaLegible(c.fecha)}</span>` : '';
}
// al abrir otro trabajo se pone al día el estado
const abrirSinConformidad = abrir;
// eslint-disable-next-line no-global-assign
abrir = function abrirConConformidad(t) {
  abrirSinConformidad(t);
  pintarEstadoConformidad();
};
pintarEstadoConformidad();
