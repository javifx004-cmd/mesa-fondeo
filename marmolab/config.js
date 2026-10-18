'use strict';

// ---------------------------------------------------------------------------
// Configuración de MarmoLab (la rellena el dueño del programa, no los clientes)
// ---------------------------------------------------------------------------
const MARMOLAB = {
  // Proyecto de Supabase de MarmoLab (Project Settings → API): dirección y clave «anon public»
  supabaseUrl: '',
  supabaseClave: '',
  // PayPal.me: usuario de paypal.me al que te mandan el pago del mes (se activa a mano, como Bizum)
  paypalMe: 'jcfx1',
  // PayPal con renovación automática (opcional, necesita PayPal Business): Client ID de la app y el ID del plan «P-…».
  // Si están rellenos, se usa esto en lugar de PayPal.me.
  paypalClienteId: '',
  paypalPlanId: '',
  // Bizum: teléfono al que te mandan el pago. No se renueva solo: el mes lo activas tú en «Clientes de MarmoLab».
  bizum: '685 426 211',
  precio: '49,99 € al mes',
  // false: sin facturas (el albarán es el documento de cobro). Activar solo con el software certificado Verifactu.
  facturas: false,
  diasPrueba: 14,
  // Titular de MarmoLab (salen en el aviso legal, la privacidad y las condiciones)
  titular: {
    nombre: '',        // nombre y apellidos o razón social
    nif: '',
    domicilio: '',     // dirección completa
    email: 'grupolab@proton.me',   // correo de contacto y para ejercer derechos de privacidad
  },
  // Contacto de soporte que ven los clientes (correo o WhatsApp)
  soporte: 'grupolab@proton.me',
  // Acceso de administrador (gratis). Solo se guarda la huella de la contraseña (PBKDF2), nunca la contraseña.
  admin: { sal: 'f9487cfb5c9dc8366572385dde1eaf67', huella: '4e3109362eb33862958e3ac45d0bc176d2386ac7ebcb5accbafba4fd3056d12d', vueltas: 200000 },
};
