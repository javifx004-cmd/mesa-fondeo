# Mesa Fondeo

App móvil (PWA instalable) para gestionar tus **cuentas de fondeo** (FTMO, FundedNext, The5ers, Apex…).

## Qué hace

Pensada para cuentas de **futuros** (Apex, Topstep, Tradeify, Take Profit Trader, MFFU, Lucid…) con
Quantower, NinjaTrader, Tradovate, TradingView, R|Trader Pro… y conexión Rithmic, Tradovate, dxFeed o CQG.

- **Cuentas**: estado (Evaluación / Fondeada (PA) / Live / Perdida / Retirada), objetivo y drawdown en dólares,
  drawdown trailing intradía, EOD o estático, nivel donde se detiene el trailing, pérdida diaria y máx. contratos.
  Muestra el nivel de liquidación y el margen que te queda, y avisa en Inicio si una cuenta está cerca.
- **Copiar credenciales**: ID de cuenta, usuario, contraseña, sistema Rithmic y gateway con un toque, o todo junto.
  Actualización rápida del balance y del pico. Duplicar cuenta para dar de alta otra igual.
- **Finanzas**: gastos/compras (evaluación, reset, activación PA, cuota mensual, datos, licencia de plataforma,
  copiador/VPS) y retiros (payouts, reembolsos), cada uno con su **factura adjunta** (foto o PDF; las fotos se
  comprimen). Filtro «Sin factura», neto, ROI, gráfico de 6 meses, desglose por empresa, CSV y registro de todas
  las cuotas mensuales del mes con un botón.
- **Copiador**: grupos líder → seguidoras con ratio fijo o proporcional al tamaño, en minis o micros, respetando el
  máximo de contratos de cada cuenta. La app no envía órdenes: la copia en tiempo real la hace el copiador de tu
  plataforma; aquí calculas contratos y copias IDs y ratios para configurarlo.
- **Cierre de día**: guarda el balance de cierre de cada cuenta, calcula el P/L del día y el **nuevo balance mínimo**
  (liquidación) según el drawdown. Inicio muestra qué cuentas faltan por cerrar hoy.
- **Días mínimos y retiros**: cuenta los días operados desde el último retiro (opcionalmente solo los días con una
  ganancia mínima) frente a los días que exige la empresa, y el número y total de retiros de cada cuenta. Historial
  por cuenta con cierres, retiros y gastos.
- **Sincronización automática** entre PC, móvil y tablet: los datos se guardan en cada dispositivo y se suben cifrados
  (AES-GCM, con tu contraseña) a un gist secreto de tu cuenta de GitHub; las facturas, también cifradas, a un
  segundo gist. Se sincroniza al abrir la app, tras cada
  cambio y cada minuto.
- **Pasar datos por archivo** (sin nube): archivo cifrado por WhatsApp, AirDrop, correo… que se combina al recibirlo.

Los datos se guardan en el navegador de cada dispositivo (localStorage, sin cifrar) y, si activas la sincronización, cifrados en tu GitHub.

## Publicarla y ponerla en el móvil

1. En GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, elige la rama y la carpeta `/ (root)`.
2. Abre `https://javifx004-cmd.github.io/mesa-fondeo/` en el móvil.
3. **iPhone**: Safari → Compartir → *Añadir a pantalla de inicio*. **Android**: Chrome → ⋮ → *Instalar aplicación*.

## Desarrollo

Sin dependencias ni compilación: `python3 -m http.server` y abre `http://localhost:8000`.
