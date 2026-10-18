'use strict';

// ---------------------------------------------------------------------------
// Bloqueo de la app con PIN y, si el aparato lo tiene, Face ID / huella (WebAuthn).
// Se guarda solo en este aparato (no se sincroniza). El PIN se guarda cifrado (SHA-256 con sal).
// ---------------------------------------------------------------------------
const CLAVE_BLOQUEO = 'marmolab.bloqueo';   // { sal, hash, largo, bio: id de credencial, minutos }
const pantallaBloqueo = $('#bloqueo');
let pinEscrito = '';
let fallos = 0;
let esperaHasta = 0;
let ocultoDesde = 0;

const confBloqueo = () => leerJSON(CLAVE_BLOQUEO, {});
function guardarConfBloqueo(c) {
  try { localStorage.setItem(CLAVE_BLOQUEO, JSON.stringify(c)); } catch { aviso('No se pudo guardar'); }
}
const aHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const deHex = (hex) => new Uint8Array((hex.match(/../g) || []).map((h) => parseInt(h, 16)));
async function cifrarPin(pin, sal) {
  return aHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${sal}:${pin}`)));
}
async function bioDisponible() {
  try {
    return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}

// --- pantalla de bloqueo ---
function bloquear() {
  const c = confBloqueo();
  if (!c.hash) return;
  pinEscrito = '';
  pintarPuntos();
  $('#bloqueoTexto').textContent = 'Introduce tu PIN';
  $('#btnBio').style.visibility = c.bio ? 'visible' : 'hidden';
  $('#btnOlvidePin').hidden = !(typeof confSync === 'function' && confSync().sesion);
  // nada de lo de detrás se puede tocar ni alcanzar con el teclado
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  document.querySelectorAll('body > header, body > main, body > .contenido, .barra-movil, #pie-app').forEach((el) => { el.inert = true; });
  pantallaBloqueo.hidden = false;
  document.body.classList.add('sin-scroll');
  // con Face ID / huella se pide nada más bloquear (tras la bienvenida)
  if (c.bio) {
    const pedir = () => { if (!pantallaBloqueo.hidden) desbloquearBio(); };
    if ($('#bienvenida') && !$('#bienvenida').classList.contains('fuera')) document.addEventListener('bienvenida-fuera', () => setTimeout(pedir, 400), { once: true });
    else setTimeout(pedir, 300);
  }
}
function desbloquear() {
  document.querySelectorAll('[inert]').forEach((el) => { el.inert = false; });
  pantallaBloqueo.hidden = true;
  document.body.classList.remove('sin-scroll');
  fallos = 0;
}
function pintarPuntos() {
  const largo = confBloqueo().largo || 4;
  $('#pinPuntos').innerHTML = Array.from({ length: largo }, (_, i) => `<i class="${i < pinEscrito.length ? 'lleno' : ''}"></i>`).join('');
}
async function comprobarPin() {
  const c = confBloqueo();
  if (await cifrarPin(pinEscrito, c.sal) === c.hash) { desbloquear(); return; }
  fallos++;
  pinEscrito = '';
  pintarPuntos();
  $('#pinPuntos').classList.remove('mal');
  void $('#pinPuntos').offsetWidth;
  $('#pinPuntos').classList.add('mal');
  if (fallos >= 5) {
    esperaHasta = Date.now() + 30000;
    $('#bloqueoTexto').textContent = 'Demasiados intentos. Espera 30 segundos.';
    setTimeout(() => { if (Date.now() >= esperaHasta) $('#bloqueoTexto').textContent = 'Introduce tu PIN'; }, 30000);
  } else {
    $('#bloqueoTexto').textContent = 'PIN incorrecto';
  }
}
$('#tecladoPin').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || Date.now() < esperaHasta) return;
  if (b.dataset.tecla === 'bio') { desbloquearBio(); return; }
  if (b.dataset.tecla === 'borrar') { pinEscrito = pinEscrito.slice(0, -1); pintarPuntos(); return; }
  const largo = confBloqueo().largo || 4;
  if (pinEscrito.length >= largo) return;
  pinEscrito += b.textContent.trim();
  pintarPuntos();
  if (pinEscrito.length === largo) setTimeout(comprobarPin, 120);
});
// teclado físico en el PC
document.addEventListener('keydown', (e) => {
  if (pantallaBloqueo.hidden) return;
  if (/^\d$/.test(e.key)) { [...$('#tecladoPin').children].find((b) => b.textContent.trim() === e.key)?.click(); e.preventDefault(); }
  if (e.key === 'Backspace') { $('#tecladoPin [data-tecla="borrar"]').click(); e.preventDefault(); }
});

async function desbloquearBio() {
  const c = confBloqueo();
  if (!c.bio) return;
  try {
    await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: deHex(c.bio) }],
      userVerification: 'required', timeout: 60000,
    } });
    desbloquear();
  } catch {
    $('#bloqueoTexto').textContent = 'Introduce tu PIN';
  }
}

// Olvidé el PIN: se quita entrando con la contraseña de la cuenta de la nube
$('#btnOlvidePin').addEventListener('click', async () => {
  const s = confSync().sesion;
  if (!s || !s.usuario) return;
  const pass = prompt(`Contraseña de la cuenta de la nube (${s.usuario.email}) para quitar el PIN:`);
  if (!pass) return;
  try {
    await entrar(s.usuario.email, pass);
    guardarConfBloqueo({});
    desbloquear();
    aviso('PIN quitado. Puedes poner otro en Gestión → Mi empresa.');
  } catch (err) {
    $('#bloqueoTexto').textContent = typeof mensajeErrorSync === 'function' ? mensajeErrorSync(err) : 'No se pudo comprobar la contraseña';
  }
});

// --- ajustes en Mi empresa ---
async function pintarAjustesBloqueo() {
  const c = confBloqueo();
  const bio = await bioDisponible();
  $('#bloqueoEstado').innerHTML = c.hash
    ? `<span>Bloqueo con PIN <b>activado</b></span>${c.bio ? '<span>Face ID / huella <b>activado</b></span>' : ''}`
    : '<span>Sin bloqueo</span>';
  $('#btnPonerPin').textContent = c.hash ? 'Cambiar PIN' : 'Poner PIN';
  $('#btnPonerBio').hidden = !c.hash || !bio;
  $('#btnPonerBio').textContent = c.bio ? 'Quitar Face ID / huella' : 'Activar Face ID / huella';
  $('#btnQuitarPin').hidden = !c.hash;
  $('#bloqueoMinutos').value = String(c.minutos || 0);
  $('#bloqueoMinutos').closest('label').hidden = !c.hash;
}
$('#btnPonerPin').addEventListener('click', () => {
  $('#formPin').reset();
  $('#dlgPin').showModal();
});
$('#formPin').addEventListener('submit', async (e) => {
  if (!e.submitter || e.submitter.value !== 'ok') return;
  const f = $('#formPin').elements;
  const pin = f.pin1.value.trim();
  if (!/^\d{4,6}$/.test(pin)) { e.preventDefault(); aviso('El PIN tiene que tener de 4 a 6 números'); return; }
  if (f.pin2.value.trim() !== pin) { e.preventDefault(); aviso('Los PIN no coinciden'); return; }
  const sal = aHex(crypto.getRandomValues(new Uint8Array(16)));
  guardarConfBloqueo({ ...confBloqueo(), sal, hash: await cifrarPin(pin, sal), largo: pin.length });
  aviso('PIN guardado: se pedirá al abrir la app');
  pintarAjustesBloqueo();
});
$('#btnPonerBio').addEventListener('click', async () => {
  const c = confBloqueo();
  if (c.bio) { delete c.bio; guardarConfBloqueo(c); pintarAjustesBloqueo(); return; }
  try {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'MarmoLab' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'marmolab', displayName: 'MarmoLab' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
    } });
    c.bio = aHex(cred.rawId);
    guardarConfBloqueo(c);
    aviso('Face ID / huella activado');
  } catch {
    aviso('No se pudo activar. Comprueba que el móvil tiene Face ID o huella configurados.');
  }
  pintarAjustesBloqueo();
});
$('#btnQuitarPin').addEventListener('click', () => {
  if (!confirm('¿Quitar el bloqueo de la app en este aparato?')) return;
  guardarConfBloqueo({});
  pintarAjustesBloqueo();
});
$('#bloqueoMinutos').addEventListener('change', (e) => guardarConfBloqueo({ ...confBloqueo(), minutos: Number(e.target.value) }));
$('#btnGestion').addEventListener('click', () => setTimeout(pintarAjustesBloqueo, 50));
$$('.pestanas [data-pestana="empresa"]').forEach((b) => b.addEventListener('click', pintarAjustesBloqueo));

// Bloquear al volver a la app tras un rato fuera
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { ocultoDesde = Date.now(); return; }
  const c = confBloqueo();
  if (c.hash && c.minutos && ocultoDesde && Date.now() - ocultoDesde >= c.minutos * 60000) bloquear();
});

pintarAjustesBloqueo();
bloquear();
