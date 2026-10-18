'use strict';

// ---------------------------------------------------------------------------
// Sincronización entre dispositivos con Supabase (base de datos en la nube).
// Cada elemento (trabajo, cliente, documento, gasto) es una fila de la tabla «datos».
// Funciona sin conexión: los cambios se guardan en el dispositivo y se suben al volver.
// Conflictos: gana la versión modificada más tarde. Se usa la API REST de Supabase
// directamente (sin librerías).
// ---------------------------------------------------------------------------
const CLAVE_SYNC_CONF = 'marmolab.sync.conf';     // url, clave pública, sesión
const CLAVE_SYNC_ESTADO = 'marmolab.sync.estado'; // lo último subido/bajado de cada elemento
const CLAVE_SYNC_ULTIMO = 'marmolab.sync.ultimo'; // marca de tiempo del servidor de la última bajada
const CLAVE_SYNC_AJUSTES = 'marmolab.sync.ajustes'; // cuándo cambió aquí cada ajuste (empresa, logo, tarifas)

// Si la empresa tiene ya su proyecto, se puede dejar puesto aquí para no escribirlo en cada aparato.
const SUPABASE_URL_SERIE = MARMOLAB.supabaseUrl;
const SUPABASE_CLAVE_SERIE = MARMOLAB.supabaseClave;

// Listas de elementos con id
const COLECCIONES = {
  trabajos: 'marmolab.trabajos',
  clientes: 'marmolab.clientes',
  documentos: 'marmolab.documentos',
  gastos: 'marmolab.gastos',
  stock: 'marmolab.stock',
  recordatorios: 'marmolab.recordatorios',
};
// Ajustes que se comparten tal cual (texto guardado en el dispositivo)
const AJUSTES = { empresa: 'marmolab.empresa', logo: 'marmolab.logo', tarifas: 'marmolab.tarifas', colores: 'marmolab.coloresExtra' };

let sincronizando = false;
let pendiente = false;
let temporizadorSync = null;

const leerLS = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? def; } catch { return def; } };
const escribirLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* lleno */ } };

function confSync() {
  const c = leerLS(CLAVE_SYNC_CONF, {});
  return { url: (c.url || SUPABASE_URL_SERIE).replace(/\/+$/, ''), clave: c.clave || SUPABASE_CLAVE_SERIE, sesion: c.sesion || null };
}
function guardarConfSync(cambios) {
  escribirLS(CLAVE_SYNC_CONF, { ...leerLS(CLAVE_SYNC_CONF, {}), ...cambios });
}

// Huella corta de un valor para saber si ha cambiado desde la última sincronización.
function huella(v) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
}

// ---------------------------------------------------------------------------
// Llamadas a Supabase
// ---------------------------------------------------------------------------
class ErrorSync extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function pedir(ruta, { metodo = 'GET', cuerpo, token, cabeceras = {} } = {}) {
  const { url, clave } = confSync();
  if (!url || !clave) throw new ErrorSync(0, 'Falta configurar la nube');
  const resp = await fetch(url + ruta, {
    method: metodo,
    headers: {
      apikey: clave,
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...cabeceras,
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await resp.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  if (!resp.ok) {
    const msg = (datos && (datos.error_description || datos.msg || datos.message || datos.error)) || resp.statusText;
    throw new ErrorSync(resp.status, String(msg));
  }
  return datos;
}

function guardarSesion(d) {
  const sesion = {
    token: d.access_token, refresco: d.refresh_token,
    caduca: Date.now() + (Number(d.expires_in) || 3600) * 1000 - 60000,
    usuario: d.user ? { id: d.user.id, email: d.user.email } : (confSync().sesion || {}).usuario,
  };
  guardarConfSync({ sesion });
  return sesion;
}

async function entrar(email, contrasena) {
  return guardarSesion(await pedir('/auth/v1/token?grant_type=password', { metodo: 'POST', cuerpo: { email, password: contrasena } }));
}

async function crearCuenta(email, contrasena) {
  const d = await pedir('/auth/v1/signup', { metodo: 'POST', cuerpo: { email, password: contrasena } });
  if (d && d.access_token) return guardarSesion(d);
  return null;   // hay que confirmar el correo antes de entrar
}

async function tokenValido() {
  let { sesion } = confSync();
  if (!sesion) return null;
  if (Date.now() > sesion.caduca) {
    try {
      sesion = guardarSesion(await pedir('/auth/v1/token?grant_type=refresh_token', { metodo: 'POST', cuerpo: { refresh_token: sesion.refresco } }));
    } catch (err) {
      if (err.status === 400 || err.status === 401) guardarConfSync({ sesion: null });
      throw err;
    }
  }
  return sesion;
}

// ---------------------------------------------------------------------------
// Sincronizar: subir lo cambiado aquí, bajar lo cambiado en otros dispositivos
// ---------------------------------------------------------------------------
// Elementos locales de todas las colecciones: { 'trabajos/ID': { col, id, valor, modificado } }
function elementosLocales() {
  const res = {};
  for (const [col, clave] of Object.entries(COLECCIONES)) {
    for (const v of leerLS(clave, [])) if (v && v.id) res[`${col}/${v.id}`] = { col, id: String(v.id), valor: v, modificado: v.modificado || 0 };
  }
  // los ajustes no llevan fecha propia: se apunta aquí cuándo cambiaron por última vez
  const marcas = leerLS(CLAVE_SYNC_AJUSTES, {});
  let cambiadas = false;
  for (const [id, clave] of Object.entries(AJUSTES)) {
    let v = null;
    try { v = localStorage.getItem(clave); } catch { /* sin almacenamiento */ }
    if (v === null) continue;
    const h = huella(v);
    // la primera vez no se sabe su edad (t = 0): manda la de la nube; después, cada cambio lleva su hora
    if (!marcas[id] || marcas[id].h !== h) { marcas[id] = { h, t: marcas[id] ? Date.now() : 0 }; cambiadas = true; }
    res[`ajustes/${id}`] = { col: 'ajustes', id, valor: v, modificado: marcas[id].t };
  }
  if (cambiadas) escribirLS(CLAVE_SYNC_AJUSTES, marcas);
  return res;
}

async function subir(sesion, estado) {
  const locales = elementosLocales();
  const filas = [];
  for (const [k, e] of Object.entries(locales)) {
    const h = huella(e.valor);
    if (estado[k] && estado[k].h === h) continue;
    filas.push({ user_id: sesion.usuario.id, coleccion: e.col, id: e.id, valor: e.valor, modificado: e.modificado || Date.now(), borrado: false, _k: k, _h: h });
  }
  // borrados aquí: estaban sincronizados y ya no están
  for (const k of Object.keys(estado)) {
    if (locales[k] || estado[k].borrado) continue;
    const [coleccion, ...resto] = k.split('/');
    filas.push({ user_id: sesion.usuario.id, coleccion, id: resto.join('/'), valor: null, modificado: Date.now(), borrado: true, _k: k, _h: 'borrado' });
  }
  for (let i = 0; i < filas.length; i += 200) {
    const lote = filas.slice(i, i + 200);
    await pedir('/rest/v1/datos', {
      metodo: 'POST', token: sesion.token,
      cabeceras: { prefer: 'resolution=merge-duplicates,return=minimal' },
      cuerpo: lote.map(({ _k, _h, ...f }) => f),
    });
    for (const f of lote) estado[f._k] = { h: f._h, modificado: f.modificado, borrado: f.borrado };
    escribirLS(CLAVE_SYNC_ESTADO, estado);
  }
  return filas.length;
}

async function bajar(sesion, estado) {
  let ultimo = leerLS(CLAVE_SYNC_ULTIMO, '');
  // 1) se piden todas las filas nuevas (puede tardar: mientras, se sigue trabajando)
  const recibidas = [];
  for (;;) {
    const filtro = ultimo ? `&actualizado=gt.${encodeURIComponent(ultimo)}` : '';
    const filas = await pedir(`/rest/v1/datos?select=coleccion,id,valor,modificado,borrado,actualizado${filtro}&order=actualizado.asc&limit=500`, { token: sesion.token });
    recibidas.push(...filas);
    if (filas.length) ultimo = filas[filas.length - 1].actualizado;
    if (filas.length < 500) break;
  }
  // 2) se aplican de golpe sobre lo que haya guardado AHORA (sin esperas en medio)
  const locales = elementosLocales();
  const cambios = { colecciones: new Set(), trabajos: new Set(), n: 0 };
  const listas = Object.fromEntries(Object.entries(COLECCIONES).map(([col, clave]) => [col, leerLS(clave, [])]));
  const marcas = leerLS(CLAVE_SYNC_AJUSTES, {});
  for (const f of recibidas) {
    const k = `${f.coleccion}/${f.id}`;
    const local = locales[k];
    const cambiadoAqui = local && (!estado[k] || estado[k].h !== huella(local.valor));
    // si aquí hay una versión más nueva sin subir, se queda la de aquí
    if (cambiadoAqui && local.modificado > (f.modificado || 0)) continue;
    aplicarRemoto(f, listas, cambios);
    const h = f.borrado ? 'borrado' : huella(f.valor);
    estado[k] = { h, modificado: f.modificado, borrado: f.borrado };
    if (f.coleccion === 'ajustes') marcas[f.id] = { h, t: f.modificado || 0 };
  }
  for (const col of cambios.colecciones) if (COLECCIONES[col]) escribirLS(COLECCIONES[col], listas[col]);
  escribirLS(CLAVE_SYNC_AJUSTES, marcas);
  escribirLS(CLAVE_SYNC_ESTADO, estado);
  escribirLS(CLAVE_SYNC_ULTIMO, ultimo);
  return cambios;
}

function aplicarRemoto(f, listas, cambios) {
  cambios.n++;
  if (f.coleccion === 'ajustes') {
    const clave = AJUSTES[f.id];
    if (!clave) return;
    try {
      if (f.borrado || f.valor === null) localStorage.removeItem(clave); else localStorage.setItem(clave, f.valor);
    } catch { /* lleno */ }
    cambios.colecciones.add('ajustes');
    return;
  }
  const lista = listas[f.coleccion];
  if (!lista) return;
  const i = lista.findIndex((x) => String(x.id) === String(f.id));
  if (f.borrado) { if (i >= 0) lista.splice(i, 1); } else if (i >= 0) lista[i] = f.valor; else lista.push(f.valor);
  cambios.colecciones.add(f.coleccion);
  if (f.coleccion === 'trabajos') cambios.trabajos.add(String(f.id));
}

async function sincronizar({ silencioso = true } = {}) {
  if (sincronizando) { pendiente = true; return; }
  const { url, clave, sesion: s } = confSync();
  if (!url || !clave || !s) { pintarEstadoSync(); return; }
  if (!navigator.onLine) { pintarEstadoSync('sin-conexion'); return; }
  sincronizando = true;
  pintarEstadoSync('sincronizando');
  try {
    const sesion = await tokenValido();
    if (!sesion) { pintarEstadoSync(); return; }
    const estado = leerLS(CLAVE_SYNC_ESTADO, {});
    const cambios = await bajar(sesion, estado);
    const subidos = await subir(sesion, estado);
    guardarConfSync({ ultimaSync: Date.now() });
    if (cambios.n) refrescarTrasSync(cambios);
    pintarEstadoSync('ok');
    if (!silencioso) aviso(`Sincronizado: ${cambios.n} recibidos, ${subidos} enviados`);
  } catch (err) {
    pintarEstadoSync('error', err);
    if (!silencioso) aviso(mensajeErrorSync(err));
  } finally {
    sincronizando = false;
    if (pendiente) { pendiente = false; programarSync(1500); }
  }
}

function programarSync(ms = 3000) {
  clearTimeout(temporizadorSync);
  temporizadorSync = setTimeout(() => sincronizar(), ms);
}

// Tras recibir cambios: el trabajo abierto se recarga si no se estaba tocando aquí,
// y se repintan las listas visibles.
function refrescarTrasSync(cambios) {
  // el trabajo abierto se recarga solo si aquí no hay cambios a medio guardar
  if (cambios.trabajos.has(String(trabajo.id)) && !sucio && !(typeof generandoPdfConformidad !== 'undefined' && generandoPdfConformidad)) {
    const nuevo = leerTrabajos().find((t) => t.id === trabajo.id);
    if (nuevo) abrir(nuevo); else abrir(trabajoVacio());
  }
  if (cambios.colecciones.has('ajustes')) {
    if (typeof cargarLogo === 'function') cargarLogo();
    if (typeof tarifas !== 'undefined' && typeof leerTarifasGuardadas === 'function') {
      tarifas = leerTarifasGuardadas();
      llenarListas();
    }
  }
  if (typeof pintarResultado === 'function') pintarResultado();
  // no se repinta la pestaña si se está escribiendo en ella
  const escribiendo = document.activeElement && document.activeElement.closest('#gestion') && document.activeElement.matches('input, textarea, select');
  if (!$('#gestion').hidden && !escribiendo) {
    const activa = $('.pestanas [data-pestana].active');
    if (activa) mostrarPestana(activa.dataset.pestana);
  }
  if (!$('#inicio').hidden && typeof pintarInicio === 'function') pintarInicio();
  avisarNumerosRepetidos();
  if ($('#dlgTrabajos').open) pintarLista();
}

// Dos aparatos sin conexión pueden dar el mismo número a facturas distintas: se avisa.
function avisarNumerosRepetidos() {
  const vistos = {};
  const repes = new Set();
  for (const d of leerLS(COLECCIONES.documentos, [])) {
    if (d.tipo !== 'factura' && d.tipo !== 'albaran') continue;
    if (vistos[d.numero]) repes.add(d.numero); else vistos[d.numero] = true;
  }
  if (repes.size) aviso(`Atención: número repetido en ${[...repes].join(', ')}. Cambia la fecha o renumera una de ellas.`);
}

function mensajeErrorSync(err) {
  if (!err) return '';
  if (err.status === 0 && /Falta/.test(err.message)) return 'Falta poner la dirección y la clave de la nube.';
  if (err.status === 400 && /invalid login|invalid_grant|credentials/i.test(err.message)) return 'Correo o contraseña incorrectos.';
  if (err.status === 400 && /not confirmed/i.test(err.message)) return 'Falta confirmar el correo: abre el enlace que te ha llegado.';
  if (err.status === 401 || err.status === 403) return 'La sesión ha caducado o la clave no es válida: vuelve a entrar.';
  if (err.status === 404 || /relation .* does not exist|datos/i.test(err.message)) return 'Falta crear la tabla en Supabase (paso del SQL).';
  if (!err.status) return 'No se pudo conectar con la nube. Revisa la conexión.';
  return `Error de la nube (${err.status}): ${err.message}`;
}

// ---------------------------------------------------------------------------
// Pantalla: estado en la cabecera y ajustes en «Mi empresa»
// ---------------------------------------------------------------------------
let ultimoEstadoSync = '';
function pintarEstadoSync(estadoTxt, err) {
  if (estadoTxt === undefined) estadoTxt = ultimoEstadoSync; else ultimoEstadoSync = estadoTxt;
  const { url, clave, sesion } = confSync();
  const el = $('#estadoSync');
  const conectado = url && clave && sesion;
  el.hidden = !conectado;
  if (conectado) {
    const textos = {
      sincronizando: 'Sincronizando…', 'sin-conexion': 'Sin conexión', error: 'Error al sincronizar',
      ok: 'Sincronizado',
    };
    el.textContent = textos[estadoTxt] || 'Nube';
    el.className = `estado-sync ${estadoTxt || ''}`;
    el.title = err ? mensajeErrorSync(err) : `Cuenta: ${(sesion.usuario || {}).email || ''}`;
  }
  // panel de ajustes
  const panel = $('#panelSync');
  if (!panel) return;
  $('#syncUrl').value = $('#syncUrl').value || url;
  $('#syncClave').value = $('#syncClave').value || clave;
  $('#syncDentro').hidden = !conectado;
  $('#syncFuera').hidden = !!conectado;
  if (conectado) {
    const ultima = leerLS(CLAVE_SYNC_CONF, {}).ultimaSync;
    $('#syncCuenta').textContent = `Conectado como ${(sesion.usuario || {}).email || ''}`
      + (ultima ? ` · última sincronización ${new Date(ultima).toLocaleString('es-ES')}` : '');
  }
  if (estadoTxt === 'error' && err) $('#syncMensaje').textContent = mensajeErrorSync(err);
  else if (estadoTxt === 'ok') $('#syncMensaje').textContent = '';
}

async function accionCuenta(crear) {
  const url = $('#syncUrl').value.trim();
  const clave = $('#syncClave').value.trim();
  const email = $('#syncEmail').value.trim();
  const contrasena = $('#syncPass').value;
  const msg = $('#syncMensaje');
  if (!/^https:\/\/.+/.test(url) || !clave) { msg.textContent = 'Pon la dirección (https://….supabase.co) y la clave pública del proyecto.'; return; }
  if (!email || contrasena.length < 6) { msg.textContent = 'Pon el correo y una contraseña de al menos 6 caracteres.'; return; }
  guardarConfSync({ url, clave });
  msg.textContent = crear ? 'Creando la cuenta…' : 'Entrando…';
  try {
    const sesion = crear ? await crearCuenta(email, contrasena) : await entrar(email, contrasena);
    if (!sesion) {
      msg.textContent = 'Cuenta creada. Abre el correo de confirmación que te ha llegado y después pulsa «Entrar».';
      return;
    }
    $('#syncPass').value = '';
    msg.textContent = '';
    // primera vez en este dispositivo: se baja todo y se sube lo que haya aquí
    escribirLS(CLAVE_SYNC_ULTIMO, '');
    await sincronizar({ silencioso: false });
  } catch (err) {
    msg.textContent = mensajeErrorSync(err);
  }
  pintarEstadoSync();
}

$('#btnSyncEntrar').addEventListener('click', () => accionCuenta(false));
$('#btnSyncCrear').addEventListener('click', () => accionCuenta(true));
$('#btnSyncAhora').addEventListener('click', () => sincronizar({ silencioso: false }));
$('#btnSyncSalir').addEventListener('click', () => {
  if (!confirm('¿Cerrar la sesión de la nube en este dispositivo? Los datos se quedan guardados aquí y en la nube.')) return;
  guardarConfSync({ sesion: null });
  ultimoEstadoSync = '';
  escribirLS(CLAVE_SYNC_ESTADO, {});
  escribirLS(CLAVE_SYNC_AJUSTES, {});
  escribirLS(CLAVE_SYNC_ULTIMO, '');
  pintarEstadoSync();
});
$('#estadoSync').addEventListener('click', () => sincronizar({ silencioso: false }));

// Cuándo se sincroniza: al abrir, al volver a la app, al recuperar conexión,
// unos segundos después de cada cambio y cada minuto.
window.addEventListener('online', () => programarSync(500));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') programarSync(300); });
setInterval(() => sincronizar(), 60000);
// se engancha al guardado de trabajos de app.js
if (typeof escribirTrabajos === 'function') {
  const escribirTrabajosOriginal = escribirTrabajos;
  // eslint-disable-next-line no-global-assign
  escribirTrabajos = function escribirTrabajosConSync(lista) {
    const ok = escribirTrabajosOriginal(lista);
    programarSync(3000);
    return ok;
  };
}
// también al guardar gastos, documentos y clientes (escriben con escribirJSON)
if (typeof escribirJSON === 'function') {
  const escribirOriginal = escribirJSON;
  // eslint-disable-next-line no-global-assign
  escribirJSON = function escribirConSync(clave, valor) {
    const ok = escribirOriginal(clave, valor);
    programarSync(3000);
    return ok;
  };
}

if (SUPABASE_URL_SERIE && SUPABASE_CLAVE_SERIE) {
  $('#syncUrl').closest('label').hidden = true;
  $('#syncClave').closest('label').hidden = true;
}
pintarEstadoSync();
programarSync(800);
