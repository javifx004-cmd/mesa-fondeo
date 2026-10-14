# Mármoles Carbonell · Planos y presupuestos

Aplicación web para marmolistas: ficha del trabajo + plano de la encimera.
Funciona en PC y en el móvil (se puede instalar como app y funciona sin conexión).

## Qué incluye

- **Inicio**: panel con lo facturado, lo pendiente de cobro, IVA e IRPF del trimestre, beneficio del año,
  gráfico mensual, próximo pago a Hacienda, cobros, presupuestos, últimos planos, mejores clientes y gastos
  por categoría.
- **PDF**: planos, presupuestos, albaranes y facturas se descargan y comparten en PDF (generado en el
  navegador, sin librerías).
- **Facturas rectificativas** (serie R) y **QR tributario** en las facturas.
- Estilo de lujo: negro, marfil y oro, con tipografías Cormorant Garamond y Manrope incluidas en `fuentes/`
  (licencia SIL OFL).

- **Ficha**: cliente, teléfono, dirección, referencia, fecha, material, tipo de canto y
  observaciones (con sugerencias habituales).
  - Vitrocerámica: tipo y medida.
  - Fregadero: tipo, medida, radio de esquinas, jabonera y ósmosis.
- **Plano** con herramientas:
  - Línea (se endereza sola en horizontal/vertical), lápiz a mano alzada, rectángulo.
  - Cota con medida escrita.
  - Texto.
  - Símbolos de vitrocerámica y fregadero (si el fregadero se dibuja ancho, sale de dos senos).
    Si se dibujan en un tramo vertical (en L) salen girados; «Girar» los gira de 90 en 90°.
    Los taladros de grifo (G), jabonera (J) y ósmosis (Ó) van siempre detrás, en el lado de la pared.
    Sus medidas y el radio van solo en la ficha, no en el plano; la jabonera y la ósmosis
    marcadas en la ficha salen como taladros detrás del fregadero.
  - Canto visto: se marca en azul a lo largo del canto y la hoja lleva su leyenda.
  - Cajas de luz / enchufes (con nota opcional), columnas o pilares (rayados, con la medida de cada lado que toca en pequeño) y
    descuadres, marcados con una raya roja discontinua fina encima del propio canto de la pieza
    (sin medida; la hoja lleva su leyenda).
  - Inglete: arrastra a lo largo del canto de una bajada; se marca con un solo triángulo y la
    altura en cm (3, 4, 5, 6… se propone la última usada).
  - Pulido detrás: arrastra a lo largo del canto; línea verde con «Pulido detrás X cm».
  - Arista: toca una esquina y escribe la medida (ej. 5x5); la esquina se dibuja redondeada
    con «R 5x5» al lado.
  - Editar: toca un elemento para cambiar su medida o su texto (en la vitro y el fregadero
    te lleva a la ficha).
  - Mover y borrar elementos, deshacer/rehacer, rejilla e imán.
  - **Ampliar**: el plano a pantalla completa (en el móvil, mejor en horizontal).
- **Trabajos guardados** en el propio dispositivo (se guardan solos mientras trabajas),
  con buscador, duplicar y borrar.
- **Descargar PDF**, **Compartir PDF** (WhatsApp, correo… desde el móvil) e
  **Imprimir / PDF** de la hoja completa en **A4 vertical**, con «MÁRMOLES CARBONELL» y el logo
  en la cabecera, los datos, el plano ampliado a lo dibujado y una franja pequeña de observaciones.
- **Logo**: el de Mármoles Carbonell va de serie (`logo.svg`, redibujado en vectorial); «Cambiar logo», al final de la página, permite usar otro en ese dispositivo.
- **Protección de datos**: la app pide al navegador que no borre sus datos y avisa si hace más
  de 7 días de la última copia de seguridad.
- **Copia de seguridad**: exporta/restaura todos los trabajos en un archivo, útil para
  pasar los trabajos del móvil al PC.

## Presupuesto

Debajo del plano está el apartado **Presupuesto**, calculado con la tarifa (`tarifas.js`,
copia de `tarifas_carbonell_2025.csv`):

- **Material**: se elige de la tarifa en la ficha.
- **Piezas**: bancada, frontal o zócalo, con largo, fondo (o alto) y cantos vistos.
  - Bancada y frontal: por metro lineal si el fondo es menor de 75 cm; a partir de 75 cm, por m².
  - Zócalo: por metro lineal (precio de zócalo de la tarifa).
- **Cantos**: en la ficha se elige sencillo (1,2 o 2 cm) o ingletado (2 a 9 cm), o cualquier otro
  canto de la tarifa. Metros de los lados vistos × precio: sencillo = «Canto recto»; ingletado de
  cualquier altura = «Canto ingletado» de la tarifa.
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

## Gestión (presupuestos, albaranes, facturas)

Botón **«Gestión»** arriba. Todo se guarda en el dispositivo y entra en la copia de seguridad.

- **Documentos**: presupuestos (P2026-001…), albaranes (A…) y facturas (F…), con numeración
  correlativa por año, líneas editables, IVA opcional, estado y hoja A4 con los datos del emisor y
  del cliente (imprimir/PDF, descargar o compartir).
  - El presupuesto de un plano pasa solo a Gestión (y se actualiza mientras está pendiente) en
    cuanto tiene cliente y piezas; el cliente también se guarda solo.
  - En el presupuesto del plano, «Hacer albarán» y «Hacer factura» crean el documento con un toque y
    lo abren listo para imprimir o compartir. En la ventana del documento hay «→ Albarán» y «→ Factura».
  - Presupuesto → «Aceptar», «→ Albarán» o «→ Factura»; albarán → «→ Factura»; factura →
    «Cobrada». Las facturas no se borran: se anulan y conservan su número.
  - «Exportar CSV» de los documentos que se ven, para el gestor.
- **Clientes**: se crean solos al pasar un presupuesto; se pueden completar (NIF, dirección…) y
  hacer un albarán o una factura rápida. En la ficha del plano, el campo Cliente sugiere los guardados.
- **Gastos**: compras y pagos con su IVA, generales o asignados a una cocina; «Repetir el mes que viene».
- **Impuestos y beneficio**: IVA trimestral (303), pago a cuenta de IRPF (130, con 5 % de gastos de difícil
  justificación hasta 2.000 €), resumen del año y beneficio limpio por cocina (estimaciones para estimación
  directa simplificada).
- **Balance**: por meses del año, facturas, base, IVA, facturado, cobrado, pendiente y presupuestos.
- **Mi empresa**: nombre, NIF, dirección, IBAN y texto de pie para los documentos.
- Aviso: no es un programa certificado Verifactu (obligatorio desde 2027).

## Cómo usarla

Abrir `index.html` en el navegador basta para probarla. Para tenerla en el móvil y en el PC
con una dirección web, activar GitHub Pages: *Settings → Pages → Deploy from a branch →
`main` / root*. Después, desde el móvil, abrir la dirección y usar
«Añadir a pantalla de inicio».

Sin cuenta, los datos se guardan en cada dispositivo por separado; para moverlos usa
«Copia de seguridad» y «Restaurar copia» en la ventana de Trabajos.

## Sincronización entre dispositivos (Supabase, gratis)

Trabajos, clientes, documentos, gastos, datos de la empresa, logo y tarifas se sincronizan con una base de
datos de Supabase (plan gratuito). Funciona sin conexión; si se cambia lo mismo en dos aparatos, gana el
último cambio. Los datos de cada cuenta solo los ve esa cuenta (seguridad a nivel de fila).

1. Crear una cuenta y un proyecto en <https://supabase.com> (región Europa).
2. En *SQL Editor → New query*, pegar y ejecutar:

   ```sql
   create table public.datos (
     user_id uuid not null default auth.uid() references auth.users on delete cascade,
     coleccion text not null,
     id text not null,
     valor jsonb,
     modificado bigint not null default 0,
     borrado boolean not null default false,
     actualizado timestamptz not null default now(),
     primary key (user_id, coleccion, id)
   );
   alter table public.datos enable row level security;
   create policy "cada uno sus datos" on public.datos for all
     using (auth.uid() = user_id) with check (auth.uid() = user_id);
   create or replace function public.tocar_actualizado() returns trigger language plpgsql as $$
   begin new.actualizado = now(); return new; end $$;
   create trigger datos_actualizado before insert or update on public.datos
     for each row execute function public.tocar_actualizado();
   ```

3. (Opcional) *Authentication → Sign In / Providers → Email*: desactivar «Confirm email» para no tener que
   confirmar el correo.
4. En *Project Settings → API* (o *Data API*), copiar la **Project URL** y la clave **anon public**
   (no la *service_role*).
5. En la app: *Gestión → Mi empresa → Sincronización entre dispositivos*, pegarlas; en el aparato que ya
   tiene los datos, **Crear cuenta**; en los demás, **Entrar** con el mismo correo y contraseña.

Para no tener que pegar la dirección y la clave en cada aparato, pueden dejarse en
`SUPABASE_URL_SERIE` y `SUPABASE_CLAVE_SERIE` al principio de `sync.js` (la clave anon es pública).
