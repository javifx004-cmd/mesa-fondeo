# MarmoPro

Versión comercial (marca blanca) del programa de planos y presupuestos para marmolistas. PWA estática sin
compilación; cuentas, licencias y datos en Supabase; cobro con Stripe (ver README).

## Reglas
- Textos en español de España, sencillos (los clientes son marmolistas).
- **Nada de datos de ninguna empresa concreta**: la marca de cada cliente sale de «Mi empresa» (nombre y logo);
  en los documentos nunca sale MarmoPro si el cliente ha puesto los suyos.
- Configuración del dueño en `config.js` (Supabase, enlaces de Stripe, precio, días de prueba). Sin claves secretas
  en el repositorio (la clave secreta de Stripe va en los secretos de Supabase).
- En cada versión publicada, subir a la vez `const VERSION` en `app.js` y `CACHE='marmopro-vN'` en `sw.js`;
  archivos nuevos también en `ARCHIVOS` de `sw.js` y en `index.html`.
- Orden de scripts: config, tarifas, app, presupuesto, vendor/qrcode, gestion, contabilidad, almacen, despiece,
  plantillas, conformidad, sync, inicio, bloqueo, licencia.
- Vive en la carpeta `marmopro/` del repositorio `mesa-fondeo` y se publica con GitHub Pages en
  https://javifx004-cmd.github.io/mesa-fondeo/marmopro/ (mismo dominio que la app de Carbonell): sus claves de
  `localStorage` empiezan por `marmopro.` y su `sw.js` solo borra cachés `marmopro-*`.
- Probar con Playwright (Chromium en `/opt/pw-browsers`) sirviendo la carpeta con `python3 -m http.server`.
- Actualizar `MANUAL.md` y regenerar `Manual-MarmoPro.pdf` cuando cambie algo visible.

## Mapa
- `licencia.js`: pantalla de acceso, prueba, pago y «Mi suscripción»; marca del cliente en la app.
- `supabase/esquema.sql`: tablas `datos` y `licencias` (+ prueba de 14 días). `supabase/functions/stripe-webhook`.
- El resto como en el programa original: `app.js` (plano, PDF), `presupuesto.js`, `gestion.js`, `contabilidad.js`,
  `despiece.js`, `plantillas.js`, `conformidad.js`, `almacen.js`, `inicio.js`, `bloqueo.js`, `sync.js`.
