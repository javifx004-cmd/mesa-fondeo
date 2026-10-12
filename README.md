# mesa-fondeo

Expert Advisor de **scalping para EURUSD en MetaTrader 5**, diseñado para cuentas de fondeo (prop firms) de **100k**.

> 🛑 **Resultado del backtest con datos reales (2021–2025): la estrategia actual NO es rentable** (winrate 39.8%, −0.19R por operación tras costes). Ver la sección *Backtest con datos reales*. No la uses en un challenge tal cual.
>
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

### Modo rápido: 1.5% por operación y fases en 3 días

Presets: `FondeoScalper_Fase1_Rapida_1.5pct.set` (objetivo 10%) y `FondeoScalper_Fase2_Rapida_1.5pct.set` (objetivo 5%). Activan `InpRiskPct=1.5`, `InpPhaseMaxDays=3` (el EA cierra todo y se bloquea si la fase no se ha pasado en 3 días hábiles), quitan el stop por beneficio diario y permiten hasta 10 operaciones/día. Las protecciones de pérdida diaria (4%) y DD total (8%) **siguen activas**. En cada cuenta nueva arranca una vez con `InpResetPhase=true`.

Monte Carlo (RR 1.5, sin días mínimos de trading, 3000 simulaciones):

| Winrate | Fase 1 (10%) en 3 días, 4 ops/día | Fase 2 (5%) en 3 días, 4 ops/día | Ambas fases, 4 ops/día | Ambas fases, 6 ops/día | Ambas fases a 1.5% con 60 días, 2 ops/día |
|---|---|---|---|---|---|
| 45% | 8% | 32% | 2.4% | 5.4% | 30% |
| 48% | 11% | 37% | 3.8% | 8.7% | 47% |
| 50% | 14% | 42% | 5.4% | 12% | 57% |
| 55% | 21% | 53% | 11% | 23% | 79% |

- Ninguna simulación viola las reglas de la firma (el EA se detiene antes), pero **la mayoría de intentos terminan sin llegar al objetivo en 3 días**.
- 10% en 3 días a 1.5% = unas 5 operaciones ganadoras netas. Con ~2 señales/día la estrategia no genera suficientes operaciones: el resultado depende más de la suerte que de la ventaja.
- Si la firma exige 4 días mínimos de trading, pasar en 3 días es imposible.
- El riesgo de 1.5% sin límite de 3 días aprueba bastante más, a cambio de más intentos con el EA parado por drawdown.

## WSFunded

Reglas recogidas de reseñas públicas (la web oficial no era accesible desde el entorno donde se hizo esto: **verifícalas en wsfunded.com** antes de operar):

| Modelo | Fases | Objetivo | Pérdida diaria | DD máx. (estático) | Límites del EA (preset) |
|---|---|---|---|---|---|
| Rapid | 1 | 10% | 4% | 6% | 3.5% / 5.2% |
| Classic | 2 | 8% + 5% | 5% | 8% | 4% / 7% |
| Ultra | 2 | 10% + 5% | 5% | 10% | 4% / 8% |

Otras reglas que el EA ya respeta:
- **Stop loss obligatorio** en los primeros minutos: el EA envía cada orden con SL y TP.
- **Máx. 50% de la pérdida diaria por idea de trading**: el EA nunca arriesga más de la mitad del margen diario restante (1.5% < 2%).
- **Día de trading desde las 17:00 de Nueva York**: ajustable con `InpDayResetHour` (0 en servidores GMT+2/+3, que ya cierran a esa hora).
- **Noticias en cuenta fondeada** (ventana restringida alrededor de noticias de alto impacto): el filtro de noticias del EA cubre ±30 min.
- Revisa si tu modelo tiene **regla de consistencia** (mejor día ≤ 15–30% del beneficio) para los retiros en la cuenta fondeada.

Presets en `MQL5/Presets/WSFunded_*.set`.

### Monte Carlo WSFunded (riesgo 1.5%, 3 días máx. por fase, 4 operaciones/día)

| Winrate | Rapid | Classic | Ultra |
|---|---|---|---|
| 45% | 7.6% | 4.2% | 2.4% |
| 48% | 10.2% | 6.2% | 3.8% |
| 50% | 12.5% | 8.1% | 5.4% |
| 55% | 19.7% | 16.2% | 10.7% |

Mismo riesgo 1.5% pero **sin límite de 3 días**: Rapid 47%, Classic 41%, Ultra 46% (winrate 48%).

**Rapid** con winrate 48% y 4 operaciones/día, según el riesgo (sin límite de días):

| Riesgo | Aprueba | Días mediana |
|---|---|---|
| 0.5% | 78% | 32 |
| 0.75% | 66% | 17 |
| 1.0% | 58% | 11 |
| 1.5% | 47% | 6 |

En todos los casos 0% de suspensos por las reglas de la firma: lo que no aprueba es porque el EA se detiene antes del límite (cuenta salvada pero challenge no superado) o porque se acaba el plazo.

## Backtest con datos reales (EURUSD M1, 2021–2025)

`tools/backtest.py` replica la lógica del EA en Python sobre datos M1 de HistData (resuelve SL/TP minuto a minuto; si en el mismo minuto se tocan ambos, cuenta el SL). Costes: 0.3 pips de spread + 7 $/lote de comisión (≈0.7 pips). Se ajusta con 2021–2023 y se valida con 2024–2025.

```bash
python3 tools/backtest.py --data carpeta_con_DAT_ASCII_EURUSD_M1_YYYY.csv --years 2021-2025 --export-r trades_r.txt
python3 tools/montecarlo.py --r-file trades_r.txt --phases 10 --firm-daily 4 --firm-dd 6 --ea-daily 3.5 --ea-dd 5.2 --risk 1.5 --max-days 3
```

Comprobación del motor: entradas aleatorias sin costes dan esperanza ≈ 0 (sin sesgo).

**Estrategia actual (pullback M5):**

| Año | Operaciones | Winrate | Esperanza | PF |
|---|---|---|---|---|
| 2021 | 847 | 35.7% | −0.31R | 0.49 |
| 2022 | 909 | 40.2% | −0.18R | 0.66 |
| 2023 | 741 | 40.8% | −0.17R | 0.69 |
| 2024 | 730 | 41.0% | −0.18R | 0.68 |
| 2025 | 892 | 41.7% | −0.12R | 0.78 |

Sin costes la esperanza es ≈ 0: la señal no tiene ventaja y los costes (≈1 pip con SL de 4–8 pips = 0.12–0.25R) la hunden.

Monte Carlo con estas operaciones reales en WSFunded Rapid a 1.5%: aprueba **0.6%** en 3 días y **4.9%** sin límite (en el 94% restante el EA se detiene por drawdown antes de violar la regla).

**Intentos de mejora del winrate (~100 configuraciones, validadas fuera de muestra):**

| Variante | Winrate (test) | Esperanza (test) |
|---|---|---|
| Filtros ADX / M15 / cuerpo de vela / apertura diaria / horarios | 40–48% | −0.02 a −0.18R |
| SL más amplio (8–20 pips) | 43% | −0.11R |
| Reversión a la media asiática M5 (RR negativo) | 61–71% | −0.12 a −0.18R |
| Ruptura de rango de Londres / apertura NY | 30–46% | −0.09 a −0.24R |
| Pullback en M15 | 35–50% | −0.07 a −0.13R |
| Reversión a la media M15 (Bollinger 2.5, RSI, ADX bajo) | 60–73% | −0.04 a +0.05R (ruido, no supera a train) |

Conclusión: **es fácil subir el winrate (bajando el TP o haciendo reversión a la media), pero ninguna variante simple tiene esperanza positiva estable tras costes en EURUSD M5/M15.** Subir el winrate sin ventaja solo cambia la forma de perder.

## Búsqueda de una operativa rentable (EURUSD 2010–2025)

Con 16 años de datos M1 (scripts en `tools/research/`), parámetros elegidos en 2010–2017 y validados en 2018–2025, coste 1 pip/operación:

| Familia | Resultado fuera de muestra (2018–2025) |
|---|---|
| Scalping con indicadores M5/M15 (pullback, reversión, rupturas) | Negativo en todas las variantes |
| **Estacionalidad horaria: venta 13:00–16:00 servidor** | **+0.5 pips netos/operación, Sharpe 0.36** (2010–17: +1.9 pips, Sharpe 1.0). Positiva 14 de 16 años |
| Esa ventana con filtros (sesión previa, día anterior…) | Ningún filtro se mantiene de train a test |
| Tendencia H4 (medias, Donchian) | Negativo |
| Tendencia D1 | ≈ 0 (Sharpe −0.17 a +0.17) |

La única anomalía robusta es que el EUR tiende a depreciarse durante el horario europeo, en concreto entre 13:00 y 16:00 servidor (la hora 14 fue negativa los 16 años, t = −4.9; efecto documentado en la literatura como *time-of-day patterns* de divisas). Pero la ventaja se ha reducido a ~0.5 pips por operación tras costes: **no basta para pasar un challenge rápido ni para vivir de ella**, y depende mucho de los costes reales del bróker.

## Continuaciones FVG en M1 (2010–2025)

`tools/fvg_backtest.py` (requiere `numba`) automatiza la entrada en continuación sobre Fair Value Gaps de M1: FVG de 3 velas a favor de la tendencia (EMA de M1), vela de desplazamiento, orden limitada en el borde o al 50% del hueco, SL tras la vela 1 o el borde lejano del FVG, TP por RR y una operación a la vez. Ejecución conservadora sobre velas M1 (en la vela de relleno solo cuenta el SL).

`tools/research/fvg_grid.py` prueba 1296 variantes (tamaño mínimo del hueco, desplazamiento, EMA 0/50/200/800, entrada borde/50%, tipo de SL, RR 1/2/3, sesiones):

| | Resultado |
|---|---|
| Variantes con esperanza positiva tras costes | **0 de 1296** (ni en 2010–17 ni en 2018–25) |
| Mejor variante (hueco ≥2 pips, desplazamiento ≥2.5 ATR, EMA 800, RR 2) | −0.18R/op (winrate 33%) |
| La misma, sin costes | ≈ 0R (−0.02 / +0.00) |
| La misma con SL ≥ 8 pips y coste 1 pip | −0.08R |

Las reglas mecánicas de FVG en M1 no tienen ventaja: sin costes se comportan como entradas aleatorias, y en M1 los costes (≈1 pip con SL de 2–6 pips) suponen 0.2–0.4R por operación.
