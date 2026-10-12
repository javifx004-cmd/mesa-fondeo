# mesa-fondeo

Expert Advisor de **scalping para EURUSD en MetaTrader 5**, diseñado para cuentas de fondeo (prop firms) de **100k**.

> ⚠️ **Aviso importante:** ningún bot es rentable de forma garantizada. Este EA tiene una lógica razonable y, sobre todo, **protecciones estrictas para no violar las reglas de fondeo**, pero **antes de usarlo en un challenge real** tienes que hacer un backtest con *ticks reales* de tu bróker/prop firm y probarlo al menos 2–4 semanas en demo. Los resultados pasados no garantizan resultados futuros.

## Archivos

| Archivo | Qué es |
|---|---|
| `MQL5/Experts/FondeoScalperEURUSD.mq5` | Código del EA |
| `MQL5/Presets/FondeoScalper_Challenge_100k.set` | Ajustes para la fase de evaluación |
| `MQL5/Presets/FondeoScalper_Funded_100k.set` | Ajustes más conservadores para cuenta ya fondeada |

## Instalación

1. En MT5: **Archivo → Abrir carpeta de datos**.
2. Copia `FondeoScalperEURUSD.mq5` a `MQL5/Experts/` y los `.set` a `MQL5/Presets/`.
3. Abre MetaEditor, abre el archivo y pulsa **Compilar** (F7).
4. Arrastra el EA a un gráfico **EURUSD M5**, activa *Algo Trading* y carga el `.set` desde la pestaña *Entradas → Cargar*.
5. Recomendado: VPS cerca del servidor del bróker (baja latencia es clave en scalping).

## Estrategia

Scalping de **pullback a favor de tendencia**:

- **Tendencia (H1):** precio por encima/debajo de la EMA 200 y la EMA con pendiente en esa dirección.
- **Estructura (M5):** EMA 8 por encima de EMA 21 (compras) o por debajo (ventas).
- **Gatillo:** la vela cerrada toca la EMA 21 y cierra al otro lado con cuerpo a favor (rechazo), con el RSI girando en la dirección de la operación y fuera de zonas extremas.
- **Filtro de volatilidad:** solo opera si el ATR(14) de M5 está entre 2.5 y 15 pips.
- **Salidas:** SL = 1.5 × ATR (entre 4 y 12 pips), TP = 1.5R, break-even a 0.8R, trailing por ATR desde 1R y cierre por tiempo a los 120 min.
- Una sola posición a la vez.

## Protecciones de fondeo

| Protección | Valor por defecto | Por qué |
|---|---|---|
| Pérdida diaria máx. | 4% (regla habitual 5%) | Cierra todo y no opera más ese día. Incluye pérdidas flotantes. |
| Drawdown total máx. | 8% (regla habitual 10%) | Cierra todo y bloquea el EA permanentemente. Opción de DD *trailing*. |
| Riesgo por operación | 0.30% | Además nunca arriesga más de la mitad del margen diario restante. |
| Stop por beneficio diario | +1.5% | Protege días buenos y ayuda con reglas de consistencia. |
| Objetivo de la fase | off / 10% en el preset challenge | Para el EA al pasar la fase. |
| Máx. operaciones/día | 6 | Evita sobreoperar. |
| Pérdidas seguidas | 3 | Detiene el día tras una racha negativa. |
| Pausa tras pérdida | 30 min | Evita "revenge trading". |
| Spread máx. | 1.2 pips | No entra con spreads altos. |
| Horario | 9–19 h servidor | Londres + Nueva York (servidores GMT+2/+3). |
| Noticias | ±30 min alto impacto USD/EUR | Usa el calendario económico de MT5 (no funciona en backtest). |
| Viernes | sin entradas desde 16 h, cierre 20 h | Sin posiciones el fin de semana. |

El estado del día (equity inicial, bloqueos) se guarda en variables globales del terminal, así que **un reinicio del VPS no resetea los límites**. Si el EA se bloquea permanentemente (DD u objetivo alcanzado), para reactivarlo hay que borrar la variable global `FSE_<login>_<magic>_perm` (F3 en MT5).

**Revisa las reglas de tu prop firm** y ajusta:
- `InpAccountSize` al tamaño inicial real.
- Si la pérdida diaria se mide sobre el balance del inicio del día o el tamaño inicial (el EA usa el máximo de balance/equity al inicio del día menos `InpMaxDailyLossPct` × tamaño inicial).
- La hora de reseteo diario: el EA usa la medianoche del servidor (coincide con FTMO y la mayoría).
- Si el drawdown es estático o trailing (`InpTrailingDD`).
- Si la firma prohíbe operar en noticias o mantener el fin de semana.

## Cómo validarlo (obligatorio antes de ir a real)

1. **Probador de estrategias** → EURUSD, M5, modelo **"Cada tick basado en ticks reales"**, depósito 100000, al menos 2–3 años.
2. Configura comisión y spread reales de tu prop firm (o usa su servidor directamente).
3. Revisa: factor de beneficio > 1.3, DD máx. de equity < 5%, número de operaciones > 300.
4. **Optimización:** usa *Criterio personalizado máximo* (el EA incluye `OnTester` que premia beneficio/drawdown). Optimiza pocos parámetros (`InpSL_ATR`, `InpRR`, `InpStartHour`, `InpEndHour`, `InpTouchPips`) y valida con **forward test** (1/3 del periodo) para evitar sobreoptimización.
5. Demo 2–4 semanas con el mismo bróker antes del challenge.
