# mesa-fondeo

Expert Advisor de **scalping para EURUSD en MetaTrader 5**, diseñado para cuentas de fondeo (prop firms) de **100k**.

> ⚠️ **Aviso importante:** ningún bot es rentable de forma garantizada. Este EA tiene una lógica razonable y, sobre todo, **protecciones estrictas para no violar las reglas de fondeo**, pero **antes de usarlo en un challenge real** tienes que hacer un backtest con *ticks reales* de tu bróker/prop firm y probarlo al menos 2–4 semanas en demo. Los resultados pasados no garantizan resultados futuros.

## Archivos

| Archivo | Qué es |
|---|---|
| `MQL5/Experts/FondeoScalperEURUSD.mq5` | Código del EA |
| `MQL5/Presets/FondeoScalper_Challenge_100k.set` | Ajustes para la fase de evaluación |
| `MQL5/Presets/FondeoScalper_Funded_100k.set` | Ajustes más conservadores para cuenta ya fondeada |
| `tools/montecarlo.py` | Simulador Monte Carlo con las reglas de fondeo y las protecciones del EA |
| `reports/` | Gráficos de la última simulación |

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

## Monte Carlo

`tools/montecarlo.py` simula miles de challenges o meses de cuenta fondeada aplicando las reglas de la prop firm (5% diario, 10% total, objetivos por fase, días mínimos) **y** las protecciones del EA (stop diario 4%, DD 8%, stop por beneficio diario, máx. operaciones, pérdidas seguidas y reducción de riesgo según el margen restante). Requiere `numpy` (y `matplotlib` para los gráficos).

```bash
# Con las operaciones reales de tu backtest (Probador → clic derecho → Informe → HTML)
python3 tools/montecarlo.py --report ReportTester.html --sample-risk 0.30 --max-days 250

# Sin backtest: tabla de escenarios según la tasa de acierto
python3 tools/montecarlo.py --scenarios

# Cuenta ya fondeada, 12 meses, con el preset conservador
python3 tools/montecarlo.py --winrate 0.48 --mode funded --risk 0.25 --ea-daily 3 --ea-dd 7 --ea-day-profit 1 --max-consec 2
```

`--sample-risk` debe ser el `InpRiskPct` con el que hiciste el backtest: las operaciones se convierten a múltiplos de R y se re-escalan al `--risk` que quieras simular. Ver `python3 tools/montecarlo.py -h` para todas las reglas configurables (`--phases 8` para 1 fase, `--trailing-dd`, `--max-days`…).

### Resultados con parámetros supuestos (aún sin backtest real)

RR 1.5, riesgo 0.4%, coste 0.08R/operación, 15% de cierres en break-even, ~2 operaciones/día, challenge de 2 fases (10% + 5%), 250 días máx. por fase:

| Winrate | Esperanza | Aprueba | Suspende (regla firma) | EA se para (cuenta salvada) | Días mediana |
|---|---|---|---|---|---|
| 40% | −0.07R | 0.9% | 0% | 88% | 160 |
| 42% | −0.03R | 5.5% | 0% | 70% | 188 |
| 45% | +0.03R | 40% | 0% | 33% | 187 |
| 48% | +0.10R | 84% | 0% | 8% | 152 |
| 50% | +0.14R | 96% | 0% | 2% | 122 |
| 55% | +0.25R | 100% | 0% | 0% | 75 |

Riesgo por operación con winrate 48%:

| Riesgo | Aprueba | EA se para | Días mediana |
|---|---|---|---|
| 0.3% | 78% | 3% | 201 |
| 0.4% | 84% | 8% | 150 |
| 0.6% | 77% | 21% | 95 |
| 0.8% | 68% | 32% | 62 |
| 1.0% | 58% | 42% | 44 |

Conclusiones:
- Las protecciones funcionan: en ningún escenario se viola una regla de la firma; en el peor caso el EA se detiene antes.
- **Lo que decide todo es el winrate real** con RR 1.5: por debajo de ~43% no hay ventaja tras costes; a partir de ~48% el challenge se aprueba con alta probabilidad, pero tarda meses con 0.4% de riesgo.
- Subir el riesgo acorta el tiempo pero aumenta mucho la probabilidad de quemar el intento. 0.4–0.6% es el punto de equilibrio.
- Limitaciones: asume operaciones independientes (no capta rachas por régimen de mercado), no modela gaps/slippage extremos ni el drawdown flotante dentro de una operación. Repite la simulación con **tu informe real** del backtest.
