'use strict';

// ---------------------------------------------------------------------------
// MarmoLab: cuenta obligatoria, prueba gratis y suscripción mensual.
// La licencia vive en Supabase (tabla «licencias», la actualiza Stripe con el webhook).
// El cliente solo puede leer la suya. Sin conexión se respeta la última fecha comprobada (+3 días).
// ---------------------------------------------------------------------------
const CLAVE_LICENCIA = 'marmolab.licencia';
const CLAVE_ADMIN = 'marmolab.admin';
const GRACIA_SIN_CONEXION = 3 * 86400000;
const configurado = !!(MARMOLAB.supabaseUrl && MARMOLAB.supabaseClave);
const pantallaAcceso = $('#acceso');

// --- la marca de cada cliente: su nombre y su logo en toda la app ---
function pintarMarca() {
  const emp = leerEmpresa();
  let logo = null;
  try { logo = localStorage.getItem(CLAVE_LOGO); } catch { /* nada */ }
  const nombre = (emp.nombre || '').trim();
  $('#marcaNombre').textContent = nombre || 'MarmoLab';
  $('.marca-txt span').textContent = nombre ? 'con MarmoLab' : 'Planos y presupuestos';
  for (const id of ['#bvNombre', '#bloqueoNombre']) { const el = $(id); if (el) el.textContent = (nombre || 'MarmoLab').toUpperCase(); }
  for (const id of ['#bvLogo', '#bloqueoLogo', '#accesoLogo']) { const el = $(id); if (el) el.src = logo || 'logo.svg'; }
  // el logo de serie es redondo: sin esquinas ni marco cuadrado
  for (const id of ['#bvLogo', '#bloqueoLogo', '#accesoLogo', '#logoApp']) { const el = $(id); if (el) el.classList.toggle('logo-serie', !logo); }
  document.title = nombre ? `${nombre} · MarmoLab` : 'MarmoLab · Planos y presupuestos';
}
const cargarLogoSinMarca = cargarLogo;
// eslint-disable-next-line no-global-assign
cargarLogo = function cargarLogoConMarca() { cargarLogoSinMarca(); pintarMarca(); };
$('#formEmpresa').addEventListener('input', () => setTimeout(pintarMarca, 50));

// --- administrador: entra gratis con su contraseña (en config.js solo está la huella) ---
const esAdmin = () => !!(MARMOLAB.admin && MARMOLAB.admin.huella && leerJSON(CLAVE_ADMIN, null) === MARMOLAB.admin.huella);
async function huellaAdmin(pass) {
  const a = MARMOLAB.admin;
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const sal = new Uint8Array(a.sal.match(/../g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: a.vueltas }, clave, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --- licencia ---
const licenciaGuardada = () => leerJSON(CLAVE_LICENCIA, null);
function licenciaVigente(l) {
  return !!(l && l.hasta && new Date(l.hasta).getTime() > Date.now());
}
async function comprobarLicencia() {
  const sesion = await tokenValido();
  if (!sesion) return null;
  const filas = await pedir('/rest/v1/licencias?select=estado,activa_hasta&limit=1', { token: sesion.token });
  const f = filas && filas[0];
  const l = { estado: f ? f.estado : 'sin licencia', hasta: f ? f.activa_hasta : null, comprobado: Date.now() };
  escribirJSON(CLAVE_LICENCIA, l);
  pintarSuscripcion();
  return l;
}

function mostrarAcceso(modo, mensaje = '') {
  pantallaAcceso.hidden = false;
  document.body.classList.add('sin-scroll');
  pantallaAcceso.dataset.modo = modo;
  const s = confSync().sesion;
  $('#accesoCuenta').textContent = s && s.usuario ? s.usuario.email : '';
  $('#accesoMensaje').textContent = mensaje;
  $('#accesoPrecio').textContent = `${MARMOLAB.diasPrueba} días gratis. Después, ${MARMOLAB.precio}. Sin permanencia.`;
}
function ocultarAcceso() {
  pantallaAcceso.hidden = true;
  document.body.classList.remove('sin-scroll');
}

async function revisarAcceso() {
  if (esAdmin()) { ocultarAcceso(); pintarSuscripcion(); return; }
  // sin Supabase todavía: se ve la pantalla de acceso, pero solo entra el administrador
  if (!configurado) { if (pantallaAcceso.hidden) mostrarAcceso('entrar'); return; }
  const s = confSync().sesion;
  if (!s) { mostrarAcceso('entrar'); return; }
  const guardada = licenciaGuardada();
  if (licenciaVigente(guardada)) ocultarAcceso();
  try {
    const l = await comprobarLicencia();
    if (!l) { mostrarAcceso('entrar', 'La sesión ha caducado: vuelve a entrar.'); return; }
    if (licenciaVigente(l)) { ocultarAcceso(); return; }
    mostrarAcceso('pagar', l.estado === 'prueba' ? 'Tu prueba gratis ha terminado.' : 'Tu suscripción no está activa.');
  } catch {
    // sin conexión: vale la última comprobación unos días más
    if (guardada && guardada.hasta && new Date(guardada.hasta).getTime() + GRACIA_SIN_CONEXION > Date.now()) ocultarAcceso();
    else mostrarAcceso('pagar', 'No se pudo comprobar la suscripción. Conéctate a internet.');
  }
}

// --- formulario de entrada / alta ---
$('#accesoTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-modo]');
  if (b) mostrarAcceso(b.dataset.modo);
});
$('#formAcceso').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = $('#formAcceso').elements;
  const crear = pantallaAcceso.dataset.modo === 'crear';
  const email = f.email.value.trim();
  const pass = f.pass.value;
  if (!email || pass.length < 6) { $('#accesoMensaje').textContent = 'Pon tu correo y una contraseña de al menos 6 caracteres.'; return; }
  if (!configurado) { $('#accesoMensaje').textContent = `Las altas abren muy pronto.${MARMOLAB.soporte ? ` Escríbenos: ${MARMOLAB.soporte}` : ''}`; return; }
  if (crear && !f.empresa.value.trim()) { $('#accesoMensaje').textContent = 'Pon el nombre de tu empresa.'; return; }
  if (crear && !f.acepto.checked) { $('#accesoMensaje').textContent = 'Para crear la cuenta tienes que aceptar las condiciones y la privacidad.'; return; }
  $('#accesoMensaje').textContent = crear ? 'Creando tu cuenta…' : 'Entrando…';
  try {
    const sesion = crear ? await crearCuenta(email, pass) : await entrar(email, pass);
    if (!sesion) { $('#accesoMensaje').textContent = 'Te hemos enviado un correo: ábrelo para confirmar la cuenta y después entra.'; mostrarAcceso('entrar', $('#accesoMensaje').textContent); return; }
    if (crear) {
      const emp = leerEmpresa();
      escribirJSON(CLAVE_EMPRESA, { ...emp, nombre: f.empresa.value.trim(), email, condicionesAceptadas: new Date().toISOString() });
      pintarMarca();
    }
    f.pass.value = '';
    escribirJSON(CLAVE_SYNC_ULTIMO, '');
    await sincronizar({ silencioso: true });   // se bajan los datos de esta cuenta
    await revisarAcceso();
    if (pantallaAcceso.hidden) {
      aviso(crear ? `¡Bienvenido! Tienes ${MARMOLAB.diasPrueba} días gratis` : 'Sesión iniciada');
      if (crear) setTimeout(() => { abrirGestion('empresa'); aviso('Pon los datos y el logo de tu empresa: saldrán en tus documentos'); }, 600);
    }
  } catch (err) {
    $('#accesoMensaje').textContent = mensajeErrorSync(err);
  }
});
$('#btnPagar').addEventListener('click', () => {
  const s = confSync().sesion;
  if (!MARMOLAB.pagoUrl) { $('#accesoMensaje').textContent = 'El pago todavía no está activado. Escríbenos.'; return; }
  const url = new URL(MARMOLAB.pagoUrl);
  if (s && s.usuario) { url.searchParams.set('client_reference_id', s.usuario.id); url.searchParams.set('prefilled_email', s.usuario.email); }
  window.open(url.toString(), '_blank', 'noopener');
  $('#accesoMensaje').textContent = 'Cuando termines el pago, vuelve aquí y pulsa «Ya he pagado».';
});
$('#btnYaPague').addEventListener('click', async () => {
  $('#accesoMensaje').textContent = 'Comprobando…';
  await revisarAcceso();
  if (!pantallaAcceso.hidden) $('#accesoMensaje').textContent = 'Todavía no nos consta el pago. Espera un minuto y vuelve a probar.';
});
$('#btnAdmin').addEventListener('click', () => {
  const f = $('#formAdmin');
  f.hidden = !f.hidden;
  if (!f.hidden) f.elements.pass.focus();
});
$('#formAdmin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const campo = $('#formAdmin').elements.pass;
  if (!campo.value) return;
  $('#accesoMensaje').textContent = 'Comprobando…';
  let ok = false;
  try { ok = (await huellaAdmin(campo.value)) === MARMOLAB.admin.huella; } catch { /* navegador sin cifrado */ }
  campo.value = '';
  if (!ok) { $('#accesoMensaje').textContent = 'Contraseña de administrador incorrecta.'; return; }
  escribirJSON(CLAVE_ADMIN, MARMOLAB.admin.huella);
  $('#formAdmin').hidden = true;
  $('#accesoMensaje').textContent = '';
  await revisarAcceso();
  aviso('Has entrado como administrador');
});
$('#btnAdminSalir').addEventListener('click', () => {
  escribirJSON(CLAVE_ADMIN, null);
  aviso('Has salido del modo administrador');
  revisarAcceso();
});
$('#btnAccesoSalir').addEventListener('click', () => {
  guardarConfSync({ sesion: null });
  escribirJSON(CLAVE_LICENCIA, null);
  mostrarAcceso('entrar');
});

// --- «Mi suscripción» en Mi empresa ---
function pintarSuscripcion() {
  const caja = $('#panelSuscripcion');
  if (!caja) return;
  const admin = esAdmin();
  caja.hidden = !configurado && !admin;
  $('#btnAdminSalir').hidden = !admin;
  if (admin && !configurado) {
    $('#suscripcionEstado').textContent = 'Administrador: acceso gratis.';
    $('#btnPortal').hidden = true;
    $('#btnSuscribirse').hidden = true;
    return;
  }
  const l = licenciaGuardada();
  const hasta = l && l.hasta ? new Date(l.hasta).toLocaleDateString('es-ES') : '—';
  const textos = { prueba: `Prueba gratis hasta el ${hasta}`, activa: `Suscripción activa (renueva el ${hasta})`, cancelada: `Cancelada: puedes usarla hasta el ${hasta}`, admin: 'Administrador: acceso gratis' };
  $('#suscripcionEstado').textContent = l ? (textos[l.estado] || `Estado: ${l.estado} · hasta ${hasta}`) : 'Sin comprobar';
  $('#btnPortal').hidden = !MARMOLAB.portalUrl;
  $('#btnSuscribirse').hidden = !(l && l.estado === 'prueba');
  if (admin) $('#suscripcionEstado').textContent = 'Administrador: acceso gratis.';
  $('#suscripcionSoporte').textContent = MARMOLAB.soporte ? `Soporte: ${MARMOLAB.soporte}` : '';
}
$('#btnPortal').addEventListener('click', () => window.open(MARMOLAB.portalUrl, '_blank', 'noopener'));
$('#btnSuscribirse').addEventListener('click', () => $('#btnPagar').click());
$$('.pestanas [data-pestana="empresa"]').forEach((b) => b.addEventListener('click', pintarSuscripcion));

// La licencia se revisa al abrir, al volver a la app y cada 6 horas
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisarAcceso(); });
setInterval(revisarAcceso, 6 * 3600000);
if (!configurado) document.body.classList.add('modo-local');
// con MarmoLab configurado la cuenta es la de la suscripción: se entra desde la pantalla de acceso
if (configurado) {
  $('#syncFuera').hidden = true;
  $('#btnSyncSalir').addEventListener('click', () => setTimeout(revisarAcceso, 50));
}
// Sin facturas: fuera botones, pestañas y opciones de facturación
if (SIN_FACTURAS) {
  document.body.classList.add('sin-facturas');
  $$('#filtroTipo option[value="factura"], #dlgTipo [value="factura"]').forEach((el) => el.remove());
  const qr = $('#formEmpresa [name="qr"]');
  if (qr) qr.closest('label').remove();
}
pintarMarca();
pintarSuscripcion();
revisarAcceso();
