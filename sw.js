// Guarda la aplicación para que funcione sin conexión.
const CACHE = 'planos-cocina-v29';
const ARCHIVOS = ['./', 'index.html', 'styles.css', 'tarifas.js', 'app.js', 'presupuesto.js', 'gestion.js', 'contabilidad.js', 'sync.js',
  'vendor/anthropic-sdk.js', 'vendor/qrcode.js', 'manifest.webmanifest', 'icon.svg', 'logo.svg',
  'Manual-Carbonell-Planos.pdf', 'iconos/icono-180.png', 'iconos/icono-192.png', 'iconos/icono-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS.map((a) => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero la red (para recibir actualizaciones); si no hay conexión, la copia guardada.
// 'no-cache' obliga a preguntar al servidor y evita la versión vieja de la caché del navegador.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((r) => {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
