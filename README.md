# Planos Cocina

Aplicación web para marmolistas: ficha del trabajo + plano de la encimera.
Funciona en PC y en el móvil (se puede instalar como app y funciona sin conexión).

## Qué incluye

- **Ficha**: cliente, teléfono, dirección, referencia, fecha, material, tipo de canto y
  observaciones (con sugerencias habituales).
  - Vitrocerámica: tipo y medida.
  - Fregadero: tipo, medida, radio de esquinas, jabonera y ósmosis.
- **Plano** con herramientas:
  - Línea (se endereza sola en horizontal/vertical), lápiz a mano alzada, rectángulo.
  - Cota con medida escrita.
  - Texto.
  - Símbolos de vitrocerámica y fregadero (si el fregadero se dibuja ancho, sale de dos senos).
    Sus medidas y el radio van solo en la ficha, no en el plano; la jabonera y la ósmosis
    marcadas en la ficha salen como taladros detrás del fregadero.
  - Canto visto: se marca en azul a lo largo del canto y la hoja lleva su leyenda.
  - Cajas de luz / enchufes (con nota opcional), columnas o pilares (rayados, con la medida de cada lado que toca en pequeño) y
    descuadres, marcados con una raya roja discontinua fina encima del propio canto de la pieza
    (sin medida; la hoja lleva su leyenda).
  - Arista: toca una esquina y escribe la medida (ej. 5x5); la esquina se dibuja redondeada
    con «R 5x5» al lado.
  - Editar: toca un elemento para cambiar su medida o su texto (en la vitro y el fregadero
    te lleva a la ficha).
  - Mover y borrar elementos, deshacer/rehacer, rejilla e imán.
  - **Ampliar**: el plano a pantalla completa (en el móvil, mejor en horizontal).
- **Trabajos guardados** en el propio dispositivo (se guardan solos mientras trabajas),
  con buscador, duplicar y borrar.
- **Descargar imagen**, **Compartir** (WhatsApp, correo… desde el móvil) e
  **Imprimir / PDF** de la hoja completa en **A4 vertical**, con «MÁRMOLES CARBONELL» y el logo
  en la cabecera, los datos, el plano ampliado a lo dibujado y una franja pequeña de observaciones.
- **Logo**: el de Mármoles Carbonell va de serie (`logo.svg`, redibujado en vectorial); «Cambiar logo», al final de la página, permite usar otro en ese dispositivo.
- **Copia de seguridad**: exporta/restaura todos los trabajos en un archivo, útil para
  pasar los trabajos del móvil al PC.

## Presupuesto

Debajo del plano está el apartado **Presupuesto**, calculado con la tarifa (`tarifas.js`,
copia de `tarifas_carbonell_2025.csv`):

- **Material**: se elige de la tarifa en la ficha.
- **Piezas**: bancada, frontal o zócalo, con largo, fondo (o alto) y cantos vistos.
  - Bancada y frontal: por metro lineal si el fondo es menor de 75 cm; a partir de 75 cm, por m².
  - Zócalo: por metro lineal (precio de zócalo de la tarifa).
- **Cantos**: metros de los lados marcados como vistos × precio del tipo de canto de la ficha.
- **Huecos**: fregadero según su tipo, vitro (hueco sobre encimera), taladros de grifo, jabonera
  y ósmosis (hueco de grifo) y cajas de enchufe y columnas dibujadas en el plano (cada una al precio de «Cajas», 20 €).
- **Colocación**: de bancada (por trabajo) y de aplacado (por m² de frontales).
- **IVA 21 %**: se suma o no con una casilla.
- Se descarga, se comparte o se imprime como hoja A4 aparte (sin el plano).
- «Cambiar tarifas» carga otro CSV con el mismo formato.

### Asistente con IA

«Hacer presupuesto con IA» envía a la IA la imagen del plano, la ficha, lo que escribas y los
nombres de la tarifa, y rellena las piezas y los datos que falten. **Los precios los calcula
siempre la app**, no la IA. Necesita conexión. Se puede elegir la IA:

- **Gemini (Google) · gratis** (por defecto): clave gratuita en aistudio.google.com («Get API key»),
  sin tarjeta y con un límite de usos al día. Modelo `gemini-flash-latest`; si deja de existir,
  la app elige otro modelo «flash» disponible.
- **Claude (Anthropic) · de pago**: clave de console.anthropic.com con saldo. Modelo
  `claude-opus-5-5`, con la librería oficial (`@anthropic-ai/sdk` 0.128.0) incluida en `vendor/`.

Las claves se guardan solo en el dispositivo.

## Cómo usarla

Abrir `index.html` en el navegador basta para probarla. Para tenerla en el móvil y en el PC
con una dirección web, activar GitHub Pages: *Settings → Pages → Deploy from a branch →
`main` / root*. Después, desde el móvil, abrir la dirección y usar
«Añadir a pantalla de inicio».

Los trabajos se guardan en cada dispositivo por separado; para moverlos usa
«Copia de seguridad» y «Restaurar copia» en la ventana de Trabajos.
