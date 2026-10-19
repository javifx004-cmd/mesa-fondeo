'use strict';

// ---------------------------------------------------------------------------
// MarmoLab: cuenta obligatoria y suscripción mensual (días gratis opcionales con MARMOLAB.diasPrueba).
// La licencia vive en Supabase (tabla «licencias»): la actualiza PayPal (webhook) o el administrador (Bizum).
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
  const filas = await pedir('/rest/v1/licencias?select=estado,activa_hasta,metodo&limit=1', { token: sesion.token });
  const f = filas && filas[0];
  const l = { estado: f ? f.estado : 'sin licencia', hasta: f ? f.activa_hasta : null, metodo: f ? f.metodo : null, comprobado: Date.now() };
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
  $('#accesoPrecio').textContent = MARMOLAB.diasPrueba > 0
    ? `${MARMOLAB.diasPrueba} días gratis. Después, ${MARMOLAB.precio}. Sin permanencia.`
    : `${MARMOLAB.precio[0].toUpperCase()}${MARMOLAB.precio.slice(1)}${MARMOLAB.precioAnual ? ` o ${MARMOLAB.precioAnual} al año` : ''}. Sin permanencia.`;
  $('#accesoContacto').textContent = MARMOLAB.soporte ? `Contacto: ${MARMOLAB.soporte}` : '';
  $('#btnAccesoVolver').hidden = !(modo === 'pagar' && (licenciaVigente(licenciaGuardada()) || esAdmin()));
  if (modo !== 'pagar') { $('#paypalBotones').hidden = true; $('#bizumInfo').hidden = true; }
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
    const motivo = { prueba: 'Tu prueba gratis ha terminado.', pendiente: 'Cuenta lista. Para empezar, paga el primer mes.' };
    mostrarAcceso('pagar', motivo[l.estado] || 'Tu suscripción no está activa.');
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
      aviso(crear ? '¡Bienvenido a MarmoLab!' : 'Sesión iniciada');
      if (crear) setTimeout(() => { abrirGestion('empresa'); aviso('Pon los datos y el logo de tu empresa: saldrán en tus documentos'); }, 600);
    }
  } catch (err) {
    $('#accesoMensaje').textContent = mensajeErrorSync(err);
  }
});
// --- pago: PayPal (suscripción que se renueva sola) o Bizum (mes a mes, lo activa el administrador) ---
const sinActivar = (que) => `El pago con ${que} todavía no está activado.${MARMOLAB.soporte ? ` Escríbenos: ${MARMOLAB.soporte}` : ''}`;
let sdkPayPal = null;
function cargarPayPal() {
  if (!sdkPayPal) {
    sdkPayPal = new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(MARMOLAB.paypalClienteId)}&vault=true&intent=subscription&currency=EUR&locale=es_ES`;
      s.onload = () => ok(window.paypal);
      s.onerror = () => { sdkPayPal = null; mal(new Error('sin PayPal')); };
      document.head.appendChild(s);
    });
  }
  return sdkPayPal;
}
async function esperarActivacion() {
  // PayPal avisa al servidor en unos segundos: se comprueba varias veces
  for (let i = 0; i < 8 && !pantallaAcceso.hidden; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    await revisarAcceso();
  }
  if (!pantallaAcceso.hidden) $('#accesoMensaje').textContent = 'Pago recibido. Si en un par de minutos no entra, pulsa «Ya he pagado».';
  else aviso('¡Gracias! Suscripción activada');
}
// plan elegido: mensual o anual (un año por adelantado con descuento)
let planPago = 'mes';
const anual = () => planPago === 'anual' && !!MARMOLAB.precioAnual;
$('#planMes').textContent = MARMOLAB.precio.replace(/ al mes$/, '');
$('#planAnual').textContent = MARMOLAB.precioAnual || '';
if (!MARMOLAB.precioAnual) $('#planesPago').hidden = true;
$('#planesPago').addEventListener('click', (e) => {
  const b = e.target.closest('[data-plan]');
  if (!b) return;
  planPago = b.dataset.plan;
  for (const x of $$('#planesPago [data-plan]')) { x.classList.toggle('activo', x === b); x.setAttribute('aria-checked', String(x === b)); }
  // si ya se estaban viendo las instrucciones, se rehacen con el importe nuevo
  if (!$('#bizumInfo').hidden) instruccionesPago($('#bizumInfo').dataset.via);
  else if (!$('#paypalBotones').hidden && anual()) instruccionesPago('paypal');
});
const paypalAutomatico = () => !!(MARMOLAB.paypalClienteId && MARMOLAB.paypalPlanId) && !anual();
$('#btnPayPal').addEventListener('click', async () => {
  $('#bizumInfo').hidden = true;
  const s = confSync().sesion;
  if (!paypalAutomatico()) { instruccionesPago('paypal'); return; }
  if (!s || !s.usuario) { mostrarAcceso('entrar', 'Entra con tu cuenta para pagar.'); return; }
  const caja = $('#paypalBotones');
  caja.hidden = false;
  if (caja.dataset.listo) return;
  $('#accesoMensaje').textContent = 'Cargando PayPal…';
  try {
    const paypal = await cargarPayPal();
    caja.innerHTML = '';
    await paypal.Buttons({
      style: { shape: 'pill', color: 'gold', label: 'subscribe', height: 45 },
      // custom_id lleva el id de la cuenta: así el aviso de PayPal sabe a quién activar
      createSubscription: (datos, acciones) => acciones.subscription.create({ plan_id: MARMOLAB.paypalPlanId, custom_id: s.usuario.id }),
      onApprove: () => { $('#accesoMensaje').textContent = 'Pago hecho. Activando tu suscripción…'; esperarActivacion(); },
      onCancel: () => { $('#accesoMensaje').textContent = 'Pago cancelado. Puedes volver a intentarlo cuando quieras.'; },
      onError: () => { $('#accesoMensaje').textContent = 'PayPal ha dado un error. Prueba otra vez o paga por Bizum.'; },
    }).render('#paypalBotones');
    caja.dataset.listo = '1';
    $('#accesoMensaje').textContent = '';
  } catch {
    caja.hidden = true;
    $('#accesoMensaje').textContent = 'No se pudo cargar PayPal. Revisa la conexión o paga por Bizum.';
  }
});
// Pago a mano (Bizum o PayPal.me): instrucciones con el correo como concepto; lo activa el administrador
function instruccionesPago(via) {
  $('#paypalBotones').hidden = true;
  const destino = via === 'bizum' ? MARMOLAB.bizum : MARMOLAB.paypalMe;
  if (!destino) { $('#accesoMensaje').textContent = sinActivar(via === 'bizum' ? 'Bizum' : 'PayPal'); return; }
  const s = confSync().sesion;
  const correo = s && s.usuario ? s.usuario.email : 'tu correo';
  const importe = anual() ? MARMOLAB.precioAnual : MARMOLAB.precio.replace(/ al mes$/, '');
  const periodo = anual() ? 'un año' : 'un mes';
  const nombreVia = via === 'bizum' ? 'Bizum' : 'PayPal';
  const caja = $('#bizumInfo');
  caja.dataset.via = via;
  caja.innerHTML = '';
  const t = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const p = (html) => { const el = document.createElement('p'); el.innerHTML = html; caja.appendChild(el); };
  const enlace = (href, texto, clase = 'enlace') => {
    const a = document.createElement('a'); a.className = clase; a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = texto; caja.appendChild(a);
  };
  if (via === 'bizum') {
    p(`Envía <b>${t(importe)}</b> (${periodo}) por Bizum al <b>${t(destino)}</b>.`);
  } else {
    p(`Envía <b>${t(importe)}</b> (${periodo}) por PayPal a <b>paypal.me/${t(destino)}</b>.`);
    const cantidad = importe.replace(/[^\d,]/g, '').replace(',', '.');
    enlace(`https://www.paypal.com/paypalme/${encodeURIComponent(destino)}/${cantidad}EUR`, 'Abrir PayPal y pagar', 'boton-pago');
  }
  p(`En el concepto pon tu correo${anual() ? ' y «anual»' : ''}: <b>${t(correo)}${anual() ? ' anual' : ''}</b>`);
  p(anual() ? 'Lo activamos en cuanto lo veamos (normalmente el mismo día) para 12 meses.'
    : 'Lo activamos en cuanto lo veamos (normalmente el mismo día). No se renueva solo: cada mes, repite el pago.');
  if (MARMOLAB.soporte) {
    enlace(`mailto:${MARMOLAB.soporte}?subject=${encodeURIComponent(`Pago MarmoLab ${anual() ? 'anual' : 'mensual'} (${nombreVia})`)}&body=${encodeURIComponent(`Hola, he enviado el pago ${anual() ? 'anual' : 'mensual'} de MarmoLab (${importe}) por ${nombreVia} desde la cuenta ${correo}.`)}`,
      `Avisar a ${MARMOLAB.soporte} de que ya lo he enviado`);
  }
  caja.hidden = false;
  $('#accesoMensaje').textContent = '';
}
$('#btnBizum').addEventListener('click', () => instruccionesPago('bizum'));
$('#btnAccesoVolver').addEventListener('click', ocultarAcceso);
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
  $('#panelAdmin').hidden = !admin;
  if (admin && !configurado) {
    $('#suscripcionEstado').textContent = 'Administrador: acceso gratis.';
    $('#btnPortal').hidden = true;
    $('#btnSuscribirse').hidden = true;
    return;
  }
  const l = licenciaGuardada();
  const hasta = l && l.hasta ? new Date(l.hasta).toLocaleDateString('es-ES') : '—';
  const bizum = l && (l.metodo === 'bizum' || l.metodo === 'manual');
  const textos = {
    prueba: `Prueba gratis hasta el ${hasta}`,
    activa: bizum ? `Pagado hasta el ${hasta}` : `Suscripción activa con PayPal (se renueva el ${hasta})`,
    cancelada: `Cancelada: puedes usarla hasta el ${hasta}`,
    suspendida: `PayPal no ha podido cobrar: puedes usarla hasta el ${hasta}`,
    admin: 'Administrador: acceso gratis',
  };
  $('#suscripcionEstado').textContent = l ? (textos[l.estado] || `Estado: ${l.estado} · hasta ${hasta}`) : 'Sin comprobar';
  $('#btnPortal').hidden = !(l && l.metodo === 'paypal');
  // con Bizum se paga cada mes: el botón aparece la última semana
  const quedaPoco = l && l.hasta && new Date(l.hasta).getTime() - Date.now() < 7 * 86400000;
  $('#btnSuscribirse').hidden = !(l && (l.estado === 'prueba' || l.estado === 'pendiente' || l.estado === 'suspendida' || (bizum && quedaPoco)));
  $('#btnSuscribirse').textContent = bizum ? 'Pagar el mes siguiente' : 'Suscribirme ya';
  if (admin) $('#suscripcionEstado').textContent = 'Administrador: acceso gratis.';
  $('#suscripcionSoporte').textContent = MARMOLAB.soporte ? `Soporte: ${MARMOLAB.soporte}` : '';
}
// los pagos automáticos de PayPal se cancelan desde la cuenta de PayPal del cliente
$('#btnPortal').addEventListener('click', () => window.open('https://www.paypal.com/myaccount/autopay/', '_blank', 'noopener'));
$('#btnSuscribirse').addEventListener('click', () => mostrarAcceso('pagar'));

// --- «Clientes de MarmoLab»: solo el administrador (la clave se comprueba en el servidor) ---
let claveAdmin = '';
async function panelAdmin(accion, extra = {}) {
  const c = confSync();
  const r = await fetch(`${c.url}/functions/v1/admin-licencias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: c.clave, Authorization: `Bearer ${c.clave}` },
    body: JSON.stringify({ clave: claveAdmin, accion, ...extra }),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || `Error ${r.status}`);
  return datos;
}
function pintarClientes(lista) {
  const caja = $('#adminLista');
  caja.innerHTML = '';
  if (!lista.length) { caja.textContent = 'Todavía no hay clientes.'; return; }
  const nombres = { prueba: 'Prueba', pendiente: 'Sin pagar', activa: 'Activa', cancelada: 'Cancelada', suspendida: 'Sin cobrar', admin: 'Gratis' };
  for (const c of lista) {
    const fila = document.createElement('div');
    fila.className = 'admin-fila';
    const vence = new Date(c.activa_hasta);
    const caducada = vence.getTime() < Date.now();
    const info = document.createElement('div');
    info.innerHTML = '<b></b><span></span>';
    info.querySelector('b').textContent = c.email || '(sin correo)';
    const metodos = { paypal: 'PayPal automático', bizum: 'Bizum', manual: 'Pago a mano' };
    info.querySelector('span').textContent = `${nombres[c.estado] || c.estado}${c.metodo ? ` · ${metodos[c.metodo] || c.metodo}` : ''} · ${caducada ? 'caducó' : 'hasta'} el ${vence.toLocaleDateString('es-ES')}`;
    if (caducada) info.classList.add('caducada');
    fila.appendChild(info);
    for (const meses of [1, 12]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = meses === 1 ? '+1 mes' : '+1 año';
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          const r = await panelAdmin('sumar', { email: c.email, meses });
          aviso(`${c.email}: pagado hasta el ${new Date(r.activa_hasta).toLocaleDateString('es-ES')}`);
          pintarClientes((await panelAdmin('listar')).clientes);
        } catch (err) { $('#adminMensaje').textContent = err.message; b.disabled = false; }
      });
      fila.appendChild(b);
    }
    caja.appendChild(fila);
  }
}
$('#formPanelAdmin').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!configurado) { $('#adminMensaje').textContent = 'Estará disponible cuando Supabase esté activado.'; return; }
  claveAdmin = $('#adminClave').value;
  $('#adminMensaje').textContent = 'Cargando…';
  try {
    pintarClientes((await panelAdmin('listar')).clientes);
    $('#adminMensaje').textContent = 'Cuando te llegue un pago, busca el correo del concepto y pulsa «+1 mes» (o «+1 año» si pone «anual»).';
  } catch (err) { $('#adminMensaje').textContent = err.message; }
});
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
