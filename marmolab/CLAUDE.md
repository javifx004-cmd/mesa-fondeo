# MarmoLab

Versión comercial (marca blanca) del programa de planos y presupuestos para marmolistas. PWA estática sin
compilación; cuentas, licencias y datos en Supabase; cobro a mano por Bizum o PayPal.me (el administrador activa los meses en su panel) y, opcional, suscripción de PayPal con webhook (ver README).

## Reglas
- Textos en español de España, sencillos (los clientes son marmolistas).
- **Nada de datos de ninguna empresa concreta**: la marca de cada cliente sale de «Mi empresa» (nombre y logo);
  en los documentos nunca sale MarmoLab si el cliente ha puesto los suyos.
- Configuración del dueño en `config.js` (Supabase, PayPal, teléfono de Bizum, precio, días de prueba). Sin claves secretas
  en el repositorio (el secreto de PayPal va en los secretos de Supabase; si cambia la contraseña de administrador, actualizar su huella en `config.js` y en `supabase/functions/admin-licencias`).
- En cada versión publicada, subir a la vez `const VERSION` en `app.js` y `CACHE='marmolab-vN'` en `sw.js`;
  archivos nuevos también en `ARCHIVOS` de `sw.js` y en `index.html`.
- Orden de scripts: config, tarifas, app, presupuesto, vendor/qrcode, gestion, contabilidad, almacen, despiece,
  plantillas, conformidad, sync, inicio, bloqueo, licencia.
- Vive en la carpeta `marmolab/` del repositorio `mesa-fondeo` y se publica con GitHub Pages en
  https://javifx004-cmd.github.io/mesa-fondeo/marmolab/ (mismo dominio que la app de Carbonell): sus claves de
  `localStorage` empiezan por `marmolab.` y su `sw.js` solo borra cachés `marmolab-*`.
- Probar con Playwright (Chromium en `/opt/pw-browsers`) sirviendo la carpeta con `python3 -m http.server`.
- Actualizar `MANUAL.md` y regenerar `Manual-MarmoLab.pdf` cuando cambie algo visible.

## Mapa
- `licencia.js`: pantalla de acceso, prueba, pago y «Mi suscripción»; marca del cliente en la app.
- `supabase/esquema.sql`: tablas `datos` y `licencias` (la cuenta nueva queda pendiente de pago). funciones `paypal-webhook` y `admin-licencias`.
- El resto como en el programa original: `app.js` (plano, PDF), `presupuesto.js`, `gestion.js`, `contabilidad.js`,
  `despiece.js`, `plantillas.js`, `conformidad.js`, `almacen.js`, `inicio.js`, `bloqueo.js`, `sync.js`.

## Puesta en marcha pendiente (con el conector de Supabase)
1. Crear el proyecto «marmolab» en Supabase (región Europa, plan gratuito) y ejecutar `supabase/esquema.sql`.
2. Desplegar la función `admin-licencias` (con verificación JWT; la app manda la clave anon).
   `paypal-webhook` solo si se activa el PayPal automático.
3. Poner la Project URL y la clave anon en `config.js` (`supabaseUrl`, `supabaseClave`), subir VERSION/CACHE y publicar.
4. Crear la cuenta del dueño desde la app y dejarla gratis:
   `update licencias set estado = 'admin', activa_hasta = '2999-12-31' where email = '<su correo>';`
5. En Authentication → URL Configuration, poner como Site URL https://javifx004-cmd.github.io/mesa-fondeo/marmolab/
   (los correos de confirmación llevan ahí).
