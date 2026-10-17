# Mesa Fondeo

App móvil (PWA instalable) para gestionar tus **cuentas de fondeo** (FTMO, FundedNext, The5ers, Apex…).

## Qué hace

- **Cuentas**: empresa, tamaño, fase (Fase 1 / Fase 2 / Fondeada / Perdida / Retirada), plataforma, balance,
  objetivo, drawdown y profit split. Barras de progreso al objetivo y margen hasta el drawdown máximo.
- **Copiar credenciales**: botones para copiar login, servidor y contraseña, o todos los datos de una vez.
  Duplicar una cuenta para dar de alta otro challenge igual.
- **Finanzas**: registra gastos (challenge, reset, activación, VPS…) e ingresos (payouts, reembolsos).
  Neto, ROI, gráfico de 6 meses, desglose por empresa y exportación a CSV.
- **Copiador**: grupos maestra → esclavas con multiplicador o lote proporcional al tamaño. Calculadora de lotes
  y, si conectas tus cuentas MT4/MT5 con [MetaApi](https://metaapi.cloud), copia automática real (CopyFactory).
- **Conexión MetaApi** (opcional): conecta cuentas MT4/MT5, importa las que ya tengas y sincroniza balance/equity.
- **Copia de seguridad**: exportar/importar JSON para pasar los datos a otro móvil. Funciona sin conexión.

Los datos se guardan solo en el navegador del dispositivo (localStorage). Las contraseñas no van cifradas.

## Publicarla y ponerla en el móvil

1. En GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, elige la rama y la carpeta `/ (root)`.
2. Abre `https://javifx004-cmd.github.io/mesa-fondeo/` en el móvil.
3. **iPhone**: Safari → Compartir → *Añadir a pantalla de inicio*. **Android**: Chrome → ⋮ → *Instalar aplicación*.

## Desarrollo

Sin dependencias ni compilación: `python3 -m http.server` y abre `http://localhost:8000`.
