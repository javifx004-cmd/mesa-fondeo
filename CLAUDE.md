# Mármoles Carbonell · Planos y presupuestos

PWA estática (HTML + JS sin librerías ni compilación) para un taller de mármol: planos de encimeras, presupuestos
con la tarifa, presupuestos/albaranes/facturas, gastos, impuestos y sincronización con Supabase.
Publicada con GitHub Pages desde la rama `claude/sharp-tesla-woj8m2`: https://javifx004-cmd.github.io/mesa-fondeo/

## Reglas
- Interfaz y textos en **español de España**, sencillos (el usuario es marmolista, no informático).
- En cada cambio publicado, subir **a la vez** `const VERSION` en `app.js` y `CACHE='planos-cocina-vN'` en `sw.js`.
  Si se añade un archivo, ponerlo también en `ARCHIVOS` de `sw.js` y en `index.html`.
- Scripts clásicos que comparten el ámbito global, en este orden: tarifas, app, presupuesto, vendor/qrcode,
  gestion, contabilidad, despiece, plantillas, sync, inicio. Ojo con nombres repetidos.
- Los datos viven en `localStorage` (`planosCocina.*`) y se sincronizan con `sync.js`. Si se crea una clave nueva
  que deba ir a todos los aparatos, añadirla a `COLECCIONES` o `AJUSTES` de `sync.js` y a la copia de seguridad.
- Los precios los calcula siempre la app con la tarifa (`calcular` en `presupuesto.js`); la IA es opcional.
- Nunca guardar claves de API del usuario en el repositorio.
- Probar con Playwright (Chromium en `/opt/pw-browsers`) sirviendo la carpeta con `python3 -m http.server`.
- Actualizar `MANUAL.md` (y regenerar `Manual-Carbonell-Planos.pdf`) cuando cambie algo que vea el usuario.

## Mapa
- `app.js`: plano (lienzo lógico 2000×1400), herramientas, hoja A4 (2000×2829), PDF (`hojasAPdf`), trabajos, copia.
- `presupuesto.js`: tarifa CSV, colores y grupos, cálculo, piezas, asistente IA opcional.
- `gestion.js`: documentos (series P/A/F/R por año), QR tributario, clientes, balance, WhatsApp.
- `contabilidad.js`: gastos, IVA (303), IRPF (130), beneficio por cocina, libros registro.
- `despiece.js`: tablas necesarias (MaxRects). `plantillas.js`: cocinas tipo y piezas desde el plano.
- `inicio.js`: panel de Inicio. `sync.js`: Supabase (tabla `datos`, ver README).
