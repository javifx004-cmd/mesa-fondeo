'use strict';

// ---------------------------------------------------------------------------
// Configuración de MarmoPro (la rellena el dueño del programa, no los clientes)
// ---------------------------------------------------------------------------
const MARMOPRO = {
  // Proyecto de Supabase de MarmoPro (Project Settings → API): dirección y clave «anon public»
  supabaseUrl: '',
  supabaseClave: '',
  // Enlace de pago de Stripe de la suscripción (Payment Link) y portal del cliente para darse de baja
  pagoUrl: '',
  portalUrl: '',
  precio: '49,99 € al mes',
  // false: sin facturas (el albarán es el documento de cobro). Activar solo con el software certificado Verifactu.
  facturas: false,
  diasPrueba: 14,
  // Titular de MarmoPro (salen en el aviso legal, la privacidad y las condiciones)
  titular: {
    nombre: '',        // nombre y apellidos o razón social
    nif: '',
    domicilio: '',     // dirección completa
    email: '',         // correo de contacto y para ejercer derechos de privacidad
  },
  // Contacto de soporte que ven los clientes (correo o WhatsApp)
  soporte: '',
};
