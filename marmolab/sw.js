// Guarda la aplicación para que funcione sin conexión.
const CACHE = 'marmolab-v1.5';
const ARCHIVOS = ['./', 'index.html', 'styles.css', 'tarifas.js', 'app.js', 'presupuesto.js', 'gestion.js', 'contabilidad.js', 'almacen.js', 'despiece.js', 'plantillas.js', 'conformidad.js', 'sync.js', 'inicio.js', 'bloqueo.js',
  'vendor/anthropic-sdk.js', 'vendor/qrcode.js', 'fuentes/cormorant-garamond-latin-600-normal.woff2',
  'fuentes/cormorant-garamond-latin-700-normal.woff2', 'fuentes/manrope-latin-wght-normal.woff2', 'manifest.webmanifest', 'icon.svg', 'logo.svg',
  'Manual-MarmoLab.pdf', 'config.js', 'licencia.js', 'legal.html', 'iconos/icono-180.png', 'iconos/icono-192.png', 'iconos/icono-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS.map((a) => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((claves) => Promise.all(claves.filter((k) => k.startsWith('marmolab-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero la red (para recibir actualizaciones); si no hay conexión, la copia guardada.
// 'no-cache' obliga a preguntar al servidor y evita la versión vieja de la caché del navegador.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((r) => {
        // solo se guardan respuestas buenas (un error durante una actualización no se queda guardado)
        if (r.ok) {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
          return r;
        }
        return caches.match(e.request).then((g) => g || r);
      })
      .catch(() => caches.match(e.request).then((r) => r || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
