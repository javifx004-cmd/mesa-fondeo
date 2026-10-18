# MarmoLab

Programa web (PWA) para marmolistas: plano de la encimera, presupuesto con su tarifa, despiece de tablas,
albaranes (sin facturas), clientes, calendario, almacén, conformidades, impuestos y sincronización entre aparatos.
Cada empresa lo personaliza con **su nombre y su logo**: en sus documentos no sale nada de MarmoLab.

Suscripción: **49,99 € al mes** con 14 días de prueba. Se paga mes a mes por **Bizum** o **PayPal** (opcional: renovación automática con PayPal Business).

## Puesta en marcha (una sola vez)

1. **Supabase** (base de datos y cuentas): crea un proyecto nuevo «marmolab» en supabase.com (región Europa).
   - SQL Editor → pega `supabase/esquema.sql` → Run.
   - Authentication → Sign In / Providers → Email: deja «Confirm email» activado (recomendado para clientes).
   - Project Settings → API: copia la **Project URL** y la clave **anon public** en `config.js`.
2. **PayPal**: por defecto se paga a mano a tu **paypal.me** (`paypalMe` en `config.js`), igual que Bizum: el cliente
   pone su correo en el concepto y tú activas el mes en «Clientes de MarmoLab».
   - Opcional, renovación automática (necesita PayPal Business): developer.paypal.com → Apps & Credentials → **Live** →
     Create App → **Client ID** en `paypalClienteId`; en PayPal → Suscripciones, plan de 49,99 €/mes → **ID del plan**
     (`P-…`) en `paypalPlanId`. Con los dos rellenos, la app muestra el botón de suscripción de PayPal.
3. **Bizum**: pon en `config.js` (`bizum`) el teléfono al que te envían el pago. Bizum no se renueva solo: cuando
   llegue uno, en la app (modo administrador) → Mi empresa → **Clientes de MarmoLab** → «+1 mes (Bizum)».
4. **Funciones de Supabase** (Edge Functions → Deploy a new function → Via Editor; o con la CLI
   `supabase functions deploy`):
   - `admin-licencias` (pega `supabase/functions/admin-licencias/index.ts`): hace falta siempre.
   - `paypal-webhook` (pega `supabase/functions/paypal-webhook/index.ts`) con **Enforce JWT verification desactivado**:
     solo si usas la renovación automática de PayPal.
   - La clave del panel «Clientes de MarmoLab» es la contraseña de administrador de la app (la función lleva su huella).
   - Solo con PayPal automático: Edge Functions → Secrets `PAYPAL_CLIENTE_ID`, `PAYPAL_SECRETO`, `PAYPAL_WEBHOOK_ID`
     (y `PAYPAL_MODO=pruebas` mientras uses el sandbox).
   - En developer.paypal.com → tu app → **Webhooks** → Add webhook con la dirección
     `https://TU-PROYECTO.supabase.co/functions/v1/paypal-webhook` y los eventos `BILLING.SUBSCRIPTION.ACTIVATED`,
     `BILLING.SUBSCRIPTION.RE-ACTIVATED`, `BILLING.SUBSCRIPTION.UPDATED`, `BILLING.SUBSCRIPTION.CANCELLED`,
     `BILLING.SUBSCRIPTION.EXPIRED`, `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.PAYMENT.FAILED` y
     `PAYMENT.SALE.COMPLETED`. Copia su **Webhook ID** en el secreto `PAYPAL_WEBHOOK_ID`.
5. **Publicar la web**: ya está publicada con GitHub Pages, igual que la app de planos de Carbonell, en la carpeta
   `marmolab/` del repositorio `mesa-fondeo`: https://javifx004-cmd.github.io/mesa-fondeo/marmolab/
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
  Al crear la cuenta el cliente tiene que marcar que los acepta (se guarda la fecha). En PayPal (perfil de empresa) pon la dirección de `legal.html#condiciones` y `legal.html#privacidad`.
- La comprobación de la licencia se hace en la app; los datos en la nube solo los ve cada cuenta (RLS).
