# MarmoPro

Programa web (PWA) para marmolistas: plano de la encimera, presupuesto con su tarifa, despiece de tablas,
albaranes (sin facturas), clientes, calendario, almacén, conformidades, impuestos y sincronización entre aparatos.
Cada empresa lo personaliza con **su nombre y su logo**: en sus documentos no sale nada de MarmoPro.

Suscripción: **49,99 € al mes** con 14 días de prueba (Stripe + Supabase).

## Puesta en marcha (una sola vez)

1. **Supabase** (base de datos y cuentas): crea un proyecto nuevo «marmopro» en supabase.com (región Europa).
   - SQL Editor → pega `supabase/esquema.sql` → Run.
   - Authentication → Sign In / Providers → Email: deja «Confirm email» activado (recomendado para clientes).
   - Project Settings → API: copia la **Project URL** y la clave **anon public** en `config.js`.
2. **Stripe** (cobros): crea la cuenta en stripe.com y actívala con los datos de tu empresa.
   - Productos → nuevo producto «MarmoPro» con precio **recurrente mensual de 49,99 €** (IVA según tu gestor).
   - Payment Links → crea el enlace de pago de ese precio → copia la URL en `config.js` (`pagoUrl`).
   - Settings → Billing → Customer portal → actívalo y copia el enlace en `config.js` (`portalUrl`).
3. **Webhook** (para que la suscripción se active y se corte sola):
   - Instala la CLI de Supabase y en esta carpeta: `supabase functions deploy stripe-webhook --no-verify-jwt`
   - `supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_...`
   - En Stripe → Developers → Webhooks → añade el endpoint
     `https://TU-PROYECTO.supabase.co/functions/v1/stripe-webhook` con los eventos
     `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
     `customer.subscription.updated` y `customer.subscription.deleted`. Copia su «Signing secret» (whsec_…).
4. **Publicar la web**: ya está publicada con GitHub Pages, igual que la app de planos de Carbonell, en la carpeta
   `marmopro/` del repositorio `mesa-fondeo`: https://javifx004-cmd.github.io/mesa-fondeo/marmopro/
   (si más adelante se compra un dominio propio, se puede apuntar a esta carpeta).

Mientras falten los datos de Supabase en `config.js`, se ve la pantalla de acceso pero las altas salen como
«abren muy pronto»: solo entra el administrador.

## Administrador (entrar gratis)
- En la pantalla de acceso, abajo, **Administrador** → contraseña de administrador. Queda recordado en ese aparato;
  se sale en Mi empresa → «Salir de administrador».
- En `config.js` solo está la huella de la contraseña (`admin`), nunca la contraseña. Para cambiarla hay que generar
  otra huella (PBKDF2-SHA256, 200 000 vueltas, sal en hexadecimal).
- Con Supabase activo, para que tu propia cuenta sea gratis también en la nube, en el SQL Editor:
  `update licencias set estado = 'admin', activa_hasta = '2999-12-31' where email = 'TU CORREO';`

## Avisos legales antes de vender
- **Verifactu**: esta versión **no emite facturas** (`facturas: false` en `config.js`): el albarán es el documento de
  entrega y cobro. No actives las facturas para vender sin un software certificado y la declaración responsable
  de productor (RD 1007/2023 y Orden HAC/1177/2024).
- **RGPD y condiciones**: ya vienen en `legal.html` (aviso legal, privacidad, condiciones de la suscripción y contrato
  de encargado del tratamiento). Rellena `titular` en `config.js` (nombre, NIF, domicilio, correo) y se completan solos.
  Al crear la cuenta el cliente tiene que marcar que los acepta (se guarda la fecha). En Stripe pon la dirección de
  `legal.html#condiciones` en los términos del enlace de pago y `legal.html#privacidad` en la política de privacidad.
- La comprobación de la licencia se hace en la app; los datos en la nube solo los ve cada cuenta (RLS).
