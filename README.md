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
- **Finanzas**: gastos (evaluación, reset, activación PA, cuota mensual, datos, licencia de plataforma, copiador/VPS)
  e ingresos (payouts, reembolsos). Neto, ROI, gráfico de 6 meses, desglose por empresa, CSV y registro de todas
  las cuotas mensuales del mes con un botón.
- **Copiador**: grupos líder → seguidoras con ratio fijo o proporcional al tamaño, en minis o micros, respetando el
  máximo de contratos de cada cuenta. La app no envía órdenes: la copia en tiempo real la hace el copiador de tu
  plataforma; aquí calculas contratos y copias IDs y ratios para configurarlo.
- **Copia de seguridad**: exportar/importar JSON para pasar los datos a otro móvil. Funciona sin conexión.

Los datos se guardan solo en el navegador del dispositivo (localStorage). Las contraseñas no van cifradas.

## Publicarla y ponerla en el móvil

1. En GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, elige la rama y la carpeta `/ (root)`.
2. Abre `https://javifx004-cmd.github.io/mesa-fondeo/` en el móvil.
3. **iPhone**: Safari → Compartir → *Añadir a pantalla de inicio*. **Android**: Chrome → ⋮ → *Instalar aplicación*.

## Desarrollo

Sin dependencias ni compilación: `python3 -m http.server` y abre `http://localhost:8000`.
