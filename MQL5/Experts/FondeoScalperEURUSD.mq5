//+------------------------------------------------------------------+
//|                                       FondeoScalperEURUSD.mq5    |
//|   Scalper EURUSD para cuentas de fondeo (prop firms) de 100k     |
//|                                                                  |
//|   Estrategia: pullback a la EMA lenta en M5 a favor de la        |
//|   tendencia de H1, confirmado con RSI y vela de rechazo.         |
//|   SL/TP por ATR, break-even, trailing y salida por tiempo.       |
//|                                                                  |
//|   Protecciones de fondeo: perdida diaria maxima, drawdown        |
//|   maximo (estatico o trailing), objetivo diario, limite de       |
//|   operaciones, rachas de perdidas, filtro de spread, sesion,     |
//|   noticias de alto impacto y cierre de viernes.                  |
//+------------------------------------------------------------------+
#property copyright "mesa-fondeo"
#property version   "1.00"

#include <Trade\Trade.mqh>

//--- Entradas -------------------------------------------------------
input group "=== General ==="
input long             InpMagic              = 20261012;  // Numero magico
input ENUM_TIMEFRAMES  InpTF                 = PERIOD_M5; // Timeframe de entrada
input ENUM_TIMEFRAMES  InpTrendTF            = PERIOD_H1; // Timeframe de tendencia

input group "=== Reglas de la cuenta de fondeo ==="
input double InpAccountSize        = 100000.0; // Tamano inicial de la cuenta
input double InpMaxDailyLossPct    = 4.0;      // Perdida diaria max % (regla 5% -> margen 1%)
input double InpMaxTotalDDPct      = 8.0;      // Drawdown total max % (regla 10% -> margen 2%)
input bool   InpTrailingDD         = false;    // DD trailing desde maximo de balance (si tu firma lo usa)
input double InpDailyProfitStopPct = 1.5;      // Dejar de operar al ganar este % en el dia (0 = off)
input double InpProfitTargetPct    = 0.0;      // Parar EA al alcanzar objetivo total % (0 = off)
input int    InpPhaseMaxDays       = 0;        // Dias habiles max para la fase (0 = sin limite)
input bool   InpResetPhase         = false;    // Reiniciar fase (contador de dias y bloqueos)
input int    InpDayResetHour       = 0;        // Hora (servidor) de reinicio del dia de la firma

input group "=== Riesgo por operacion ==="
input double InpRiskPct            = 0.30;  // Riesgo por operacion % del balance
input double InpCommissionPerLot   = 7.0;   // Comision ida+vuelta por lote (USD)
input double InpMaxLots            = 10.0;  // Lotes maximos por operacion
input int    InpMaxTradesPerDay    = 6;     // Operaciones maximas por dia
input int    InpMaxConsecLosses    = 3;     // Perdidas seguidas max en el dia
input int    InpCooldownMinutes    = 30;    // Pausa tras una perdida (min)
input double InpMinRiskFraction    = 0.25;  // Parar si el riesgo permitido cae bajo x del normal

input group "=== Senal ==="
input int    InpFastEMA            = 8;     // EMA rapida (M5)
input int    InpSlowEMA            = 21;    // EMA lenta (M5)
input int    InpTrendEMA           = 200;   // EMA de tendencia (H1)
input int    InpRSIPeriod          = 14;    // Periodo RSI
input double InpRSILongMin         = 45.0;  // RSI minimo para compras
input double InpRSILongMax         = 70.0;  // RSI maximo para compras
input double InpRSIShortMin        = 30.0;  // RSI minimo para ventas
input double InpRSIShortMax        = 55.0;  // RSI maximo para ventas
input double InpTouchPips          = 1.0;   // Tolerancia de toque a la EMA lenta (pips)
input int    InpATRPeriod          = 14;    // Periodo ATR
input double InpMinATRPips         = 2.5;   // ATR minimo (evita mercado muerto)
input double InpMaxATRPips         = 15.0;  // ATR maximo (evita volatilidad extrema)

input group "=== Salidas ==="
input double InpSL_ATR             = 1.5;   // SL = ATR x
input double InpMinSLPips          = 4.0;   // SL minimo (pips)
input double InpMaxSLPips          = 12.0;  // SL maximo (pips)
input double InpRR                 = 1.5;   // Ratio TP/SL
input bool   InpUseBreakEven       = true;  // Usar break-even
input double InpBE_R               = 0.8;   // Activar BE al alcanzar x R
input double InpBE_LockPips        = 0.5;   // Pips asegurados en BE
input bool   InpUseTrailing        = true;  // Usar trailing stop
input double InpTrailStart_R       = 1.0;   // Activar trailing al alcanzar x R
input double InpTrail_ATR          = 1.0;   // Distancia trailing = ATR x
input int    InpMaxTradeMinutes    = 120;   // Cerrar operacion tras x minutos (0 = off)

input group "=== Filtros de horario (hora del SERVIDOR) ==="
input int    InpStartHour          = 9;     // Hora inicio (servidor)
input int    InpEndHour            = 19;    // Hora fin (servidor)
input double InpMaxSpreadPips      = 1.2;   // Spread maximo (pips)
input bool   InpFridayClose        = true;  // Cerrar todo el viernes
input int    InpFridayCloseHour    = 20;    // Hora de cierre viernes (servidor)
input int    InpFridayNoNewHour    = 16;    // Sin nuevas entradas viernes desde (servidor)

input group "=== Filtro de noticias (solo en real/demo) ==="
input bool   InpUseNewsFilter      = true;  // Evitar noticias de alto impacto USD/EUR
input int    InpNewsMinutesBefore  = 30;    // Minutos antes de la noticia
input int    InpNewsMinutesAfter   = 30;    // Minutos despues de la noticia
input bool   InpCloseBeforeNews    = true;  // Cerrar posiciones abiertas antes de noticia

//--- Globales -------------------------------------------------------
CTrade   trade;
int      hFast = INVALID_HANDLE, hSlow = INVALID_HANDLE, hTrend = INVALID_HANDLE;
int      hRSI  = INVALID_HANDLE, hATR  = INVALID_HANDLE;
double   g_pip;
datetime g_lastBar        = 0;
int      g_dayId          = 0;
double   g_dayStartEquity = 0;   // referencia para la perdida diaria
double   g_peakBalance    = 0;   // para DD trailing
int      g_tradesToday    = 0;
int      g_consecLosses   = 0;
datetime g_lastLossTime   = 0;
double   g_dayClosedPL    = 0;
bool     g_dailyBlocked   = false;
bool     g_permBlocked    = false;
string   g_blockReason    = "";
datetime g_newsCheckTime  = 0;
bool     g_newsActive     = false;

string GVName(const string key)
{
   return StringFormat("FSE_%I64d_%I64d_%s", AccountInfoInteger(ACCOUNT_LOGIN), InpMagic, key);
}

//+------------------------------------------------------------------+
int OnInit()
{
   if(InpRiskPct <= 0 || InpRiskPct > 2.0)
   {
      Print("Riesgo por operacion fuera de rango (0-2%).");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(InpStartHour < 0 || InpStartHour > 23 || InpEndHour < 0 || InpEndHour > 24 ||
      InpDayResetHour < 0 || InpDayResetHour > 23)
      return INIT_PARAMETERS_INCORRECT;

   g_pip = (_Digits == 3 || _Digits == 5) ? _Point * 10.0 : _Point;

   hFast  = iMA(_Symbol, InpTF, InpFastEMA, 0, MODE_EMA, PRICE_CLOSE);
   hSlow  = iMA(_Symbol, InpTF, InpSlowEMA, 0, MODE_EMA, PRICE_CLOSE);
   hTrend = iMA(_Symbol, InpTrendTF, InpTrendEMA, 0, MODE_EMA, PRICE_CLOSE);
   hRSI   = iRSI(_Symbol, InpTF, InpRSIPeriod, PRICE_CLOSE);
   hATR   = iATR(_Symbol, InpTF, InpATRPeriod);
   if(hFast == INVALID_HANDLE || hSlow == INVALID_HANDLE || hTrend == INVALID_HANDLE ||
      hRSI == INVALID_HANDLE || hATR == INVALID_HANDLE)
   {
      Print("Error creando indicadores: ", GetLastError());
      return INIT_FAILED;
   }

   trade.SetExpertMagicNumber((ulong)InpMagic);
   trade.SetDeviationInPoints(10);
   trade.SetTypeFillingBySymbol(_Symbol);

   if(StringFind(_Symbol, "EURUSD") < 0)
      Print("AVISO: este EA esta disenado y ajustado para EURUSD. Simbolo actual: ", _Symbol);

   if(InpResetPhase)
   {
      GlobalVariableDel(GVName("perm"));
      GlobalVariableDel(GVName("phase0"));
      GlobalVariableDel(GVName("peak"));
      Print("Fase reiniciada. Vuelve a poner InpResetPhase=false.");
   }
   if(!GlobalVariableCheck(GVName("phase0")))
      GlobalVariableSet(GVName("phase0"), (double)DayStart());

   // Restaurar estado persistente (reinicios de terminal/VPS)
   g_peakBalance = GlobalVariableCheck(GVName("peak")) ? GlobalVariableGet(GVName("peak"))
                                                        : MathMax(InpAccountSize, AccountInfoDouble(ACCOUNT_BALANCE));
   if(GlobalVariableCheck(GVName("perm")) && GlobalVariableGet(GVName("perm")) > 0)
   {
      g_permBlocked = true;
      g_blockReason = "Bloqueo permanente previo (DD max u objetivo alcanzado)";
   }
   UpdateDay();
   RecountToday();
   EventSetTimer(1);
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   IndicatorRelease(hFast);
   IndicatorRelease(hSlow);
   IndicatorRelease(hTrend);
   IndicatorRelease(hRSI);
   IndicatorRelease(hATR);
   Comment("");
}

//+------------------------------------------------------------------+
void OnTimer()
{
   // Vigilancia de riesgo tambien sin ticks
   UpdateDay();
   CheckRiskLimits();
   DrawPanel();
}

//+------------------------------------------------------------------+
void OnTick()
{
   UpdateDay();
   CheckRiskLimits();

   if(InpFridayClose && IsFridayCloseTime())
      CloseAll("Cierre de viernes");

   if(InpUseNewsFilter && InpCloseBeforeNews && IsNewsTime())
      CloseAll("Noticia de alto impacto");

   ManagePositions();

   // Solo evaluar entradas al cierre de cada vela
   datetime barTime = iTime(_Symbol, InpTF, 0);
   if(barTime == g_lastBar)
      return;
   g_lastBar = barTime;

   if(CanOpenNewTrade())
   {
      int dir = GetSignal();
      if(dir != 0)
         OpenTrade(dir);
   }
   DrawPanel();
}

//+------------------------------------------------------------------+
//| Gestion del dia y limites de fondeo                              |
//+------------------------------------------------------------------+
void UpdateDay()
{
   MqlDateTime t;
   TimeToStruct(TimeCurrent() - InpDayResetHour * 3600, t);
   int dayId = t.year * 10000 + t.mon * 100 + t.day;
   if(dayId == g_dayId)
      return;

   g_dayId = dayId;
   string keyDay = GVName("day"), keyEq = GVName("dayeq");
   if(GlobalVariableCheck(keyDay) && (int)GlobalVariableGet(keyDay) == dayId && GlobalVariableCheck(keyEq))
   {
      g_dayStartEquity = GlobalVariableGet(keyEq);   // reinicio a mitad de dia
   }
   else
   {
      // Conservador: mayor entre balance y equity al inicio del dia
      g_dayStartEquity = MathMax(AccountInfoDouble(ACCOUNT_BALANCE), AccountInfoDouble(ACCOUNT_EQUITY));
      GlobalVariableSet(keyDay, dayId);
      GlobalVariableSet(keyEq, g_dayStartEquity);
   }
   g_dailyBlocked = false;
   if(!g_permBlocked)
      g_blockReason = "";
   RecountToday();
}

datetime DayStart()
{
   datetime now = TimeCurrent() - InpDayResetHour * 3600;
   return now - (now % 86400) + InpDayResetHour * 3600;
}

void RecountToday()
{
   g_tradesToday  = 0;
   g_consecLosses = 0;
   g_dayClosedPL  = 0;
   if(!HistorySelect(DayStart(), TimeCurrent() + 60))
      return;
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0) continue;
      if(HistoryDealGetInteger(deal, DEAL_MAGIC) != InpMagic) continue;
      if(HistoryDealGetString(deal, DEAL_SYMBOL) != _Symbol) continue;
      long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
      if(entry == DEAL_ENTRY_IN)
         g_tradesToday++;
      else if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY)
      {
         double pl = HistoryDealGetDouble(deal, DEAL_PROFIT) + HistoryDealGetDouble(deal, DEAL_SWAP) +
                     HistoryDealGetDouble(deal, DEAL_COMMISSION);
         g_dayClosedPL += pl;
         if(pl < 0)
         {
            g_consecLosses++;
            g_lastLossTime = (datetime)HistoryDealGetInteger(deal, DEAL_TIME);
         }
         else
            g_consecLosses = 0;
      }
   }
}

void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
{
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
      RecountToday();
}

double DDFloor()
{
   double base = InpTrailingDD ? g_peakBalance : InpAccountSize;
   return base * (1.0 - InpMaxTotalDDPct / 100.0);
}

double DailyFloor()
{
   // La mayoria de firmas calculan el 5% sobre el tamano inicial de la cuenta
   return g_dayStartEquity - InpAccountSize * InpMaxDailyLossPct / 100.0;
}

void CheckRiskLimits()
{
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);

   if(balance > g_peakBalance)
   {
      g_peakBalance = balance;
      GlobalVariableSet(GVName("peak"), g_peakBalance);
   }

   if(!g_permBlocked && equity <= DDFloor())
   {
      CloseAll("Drawdown maximo");
      SetPermBlock("Drawdown maximo alcanzado");
   }

   if(!g_permBlocked && InpProfitTargetPct > 0 &&
      equity >= InpAccountSize * (1.0 + InpProfitTargetPct / 100.0))
   {
      CloseAll("Objetivo de la fase alcanzado");
      SetPermBlock("Objetivo de la fase alcanzado");
   }

   if(!g_permBlocked && InpPhaseMaxDays > 0 && PhaseDaysElapsed() > InpPhaseMaxDays)
   {
      CloseAll("Plazo de la fase agotado");
      SetPermBlock(StringFormat("Plazo de %d dias de la fase agotado", InpPhaseMaxDays));
   }

   if(!g_dailyBlocked && equity <= DailyFloor())
   {
      CloseAll("Perdida diaria maxima");
      g_dailyBlocked = true;
      g_blockReason  = "Perdida diaria maxima alcanzada";
   }

   if(!g_dailyBlocked && InpDailyProfitStopPct > 0 &&
      equity >= g_dayStartEquity + InpAccountSize * InpDailyProfitStopPct / 100.0)
   {
      CloseAll("Objetivo diario alcanzado");
      g_dailyBlocked = true;
      g_blockReason  = "Objetivo diario alcanzado";
   }
}

// Dias habiles (lunes-viernes) desde el inicio de la fase, incluido hoy
int PhaseDaysElapsed()
{
   datetime start = (datetime)GlobalVariableGet(GVName("phase0"));
   datetime today = DayStart();
   int days = 0;
   for(datetime d = start; d <= today; d += 86400)
   {
      MqlDateTime t;
      TimeToStruct(d, t);
      if(t.day_of_week != 0 && t.day_of_week != 6)
         days++;
   }
   return days;
}

void SetPermBlock(const string reason)
{
   g_permBlocked = true;
   g_blockReason = reason;
   GlobalVariableSet(GVName("perm"), 1);
   Print("EA BLOQUEADO: ", reason, ". Borra la variable global ", GVName("perm"), " para reactivar.");
}

//+------------------------------------------------------------------+
//| Filtros                                                          |
//+------------------------------------------------------------------+
bool InSession()
{
   MqlDateTime t;
   TimeToStruct(TimeCurrent(), t);
   if(t.day_of_week == 0 || t.day_of_week == 6)
      return false;
   if(InpStartHour <= InpEndHour)
      return t.hour >= InpStartHour && t.hour < InpEndHour;
   return t.hour >= InpStartHour || t.hour < InpEndHour;
}

bool IsFridayCloseTime()
{
   MqlDateTime t;
   TimeToStruct(TimeCurrent(), t);
   return t.day_of_week == 5 && t.hour >= InpFridayCloseHour;
}

bool IsFridayNoNew()
{
   MqlDateTime t;
   TimeToStruct(TimeCurrent(), t);
   return t.day_of_week == 5 && t.hour >= InpFridayNoNewHour;
}

double SpreadPips()
{
   return (SymbolInfoDouble(_Symbol, SYMBOL_ASK) - SymbolInfoDouble(_Symbol, SYMBOL_BID)) / g_pip;
}

bool IsNewsTime()
{
   if(!InpUseNewsFilter || MQLInfoInteger(MQL_TESTER))
      return false;
   datetime now = TimeTradeServer();
   if(now - g_newsCheckTime < 60)
      return g_newsActive;
   g_newsCheckTime = now;
   g_newsActive    = false;

   string currencies[2] = {"USD", "EUR"};
   for(int c = 0; c < 2 && !g_newsActive; c++)
   {
      MqlCalendarValue values[];
      int n = CalendarValueHistory(values, now - InpNewsMinutesAfter * 60, now + InpNewsMinutesBefore * 60,
                                   NULL, currencies[c]);
      for(int i = 0; i < n; i++)
      {
         MqlCalendarEvent ev;
         if(CalendarEventById(values[i].event_id, ev) && ev.importance == CALENDAR_IMPORTANCE_HIGH)
         {
            g_newsActive = true;
            break;
         }
      }
   }
   return g_newsActive;
}

int CountMyPositions()
{
   int count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == InpMagic)
         count++;
   }
   return count;
}

bool CanOpenNewTrade()
{
   if(g_permBlocked || g_dailyBlocked)                       return false;
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED))          return false;
   if(CountMyPositions() > 0)                                return false;
   if(!InSession())                                          return false;
   if(IsFridayNoNew())                                       return false;
   if(g_tradesToday >= InpMaxTradesPerDay)                   return false;
   if(g_consecLosses >= InpMaxConsecLosses)                  return false;
   if(g_lastLossTime > 0 && TimeCurrent() - g_lastLossTime < InpCooldownMinutes * 60) return false;
   if(SpreadPips() > InpMaxSpreadPips)                       return false;
   if(IsNewsTime())                                          return false;
   return true;
}

//+------------------------------------------------------------------+
//| Senal: pullback a EMA lenta a favor de la tendencia H1           |
//+------------------------------------------------------------------+
int GetSignal()
{
   double fast[], slow[], trend[], rsi[], atr[];
   MqlRates r[];
   ArraySetAsSeries(fast, true);
   ArraySetAsSeries(slow, true);
   ArraySetAsSeries(trend, true);
   ArraySetAsSeries(rsi, true);
   ArraySetAsSeries(atr, true);
   ArraySetAsSeries(r, true);

   if(CopyBuffer(hFast, 0, 1, 2, fast) < 2)   return 0;
   if(CopyBuffer(hSlow, 0, 1, 2, slow) < 2)   return 0;
   if(CopyBuffer(hTrend, 0, 1, 2, trend) < 2) return 0;
   if(CopyBuffer(hRSI, 0, 1, 2, rsi) < 2)     return 0;
   if(CopyBuffer(hATR, 0, 1, 1, atr) < 1)     return 0;
   if(CopyRates(_Symbol, InpTF, 1, 2, r) < 2) return 0;

   double trendClose = iClose(_Symbol, InpTrendTF, 1);
   if(trendClose == 0) return 0;

   double atrPips = atr[0] / g_pip;
   if(atrPips < InpMinATRPips || atrPips > InpMaxATRPips)
      return 0;

   double touch = InpTouchPips * g_pip;

   bool trendUp   = trendClose > trend[0] && trend[0] > trend[1];
   bool trendDown = trendClose < trend[0] && trend[0] < trend[1];

   // Compra: estructura alcista, la vela toca la EMA lenta y cierra por encima, alcista, RSI girando arriba
   bool longSig = trendUp &&
                  fast[0] > slow[0] && fast[0] > fast[1] &&
                  r[0].low <= slow[0] + touch &&
                  r[0].close > slow[0] &&
                  r[0].close > r[0].open &&
                  rsi[0] > InpRSILongMin && rsi[0] < InpRSILongMax && rsi[0] > rsi[1];

   // Venta: espejo
   bool shortSig = trendDown &&
                   fast[0] < slow[0] && fast[0] < fast[1] &&
                   r[0].high >= slow[0] - touch &&
                   r[0].close < slow[0] &&
                   r[0].close < r[0].open &&
                   rsi[0] < InpRSIShortMax && rsi[0] > InpRSIShortMin && rsi[0] < rsi[1];

   if(longSig)  return 1;
   if(shortSig) return -1;
   return 0;
}

//+------------------------------------------------------------------+
//| Ejecucion                                                        |
//+------------------------------------------------------------------+
double CalcLots(const double slDistance)
{
   double balance    = AccountInfoDouble(ACCOUNT_BALANCE);
   double normalRisk = balance * InpRiskPct / 100.0;

   // Nunca arriesgar mas de la mitad del margen restante (diario y total).
   // Si eso obliga a operar con un riesgo residual, se para en lugar de
   // seguir con lotes minimos cerca del limite.
   double dayRisk   = 0.5 * (AccountInfoDouble(ACCOUNT_EQUITY) - DailyFloor());
   double totalRisk = 0.5 * (AccountInfoDouble(ACCOUNT_EQUITY) - DDFloor());
   if(totalRisk < InpMinRiskFraction * normalRisk)
   {
      SetPermBlock("Margen de drawdown total agotado");
      return 0;
   }
   if(dayRisk < InpMinRiskFraction * normalRisk)
   {
      g_dailyBlocked = true;
      g_blockReason  = "Margen diario agotado";
      return 0;
   }
   double riskMoney = MathMin(normalRisk, MathMin(dayRisk, totalRisk));

   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(tickValue <= 0)
      tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickValue <= 0 || tickSize <= 0)
      return 0;

   double lossPerLot = slDistance / tickSize * tickValue + InpCommissionPerLot;
   double lots = riskMoney / lossPerLot;

   double step   = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot = MathMin(SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX), InpMaxLots);
   lots = MathFloor(lots / step) * step;
   if(lots < minLot)
      return 0;   // no forzar el lote minimo: superaria el riesgo
   return NormalizeDouble(MathMin(lots, maxLot), 2);
}

void OpenTrade(const int dir)
{
   double atr[];
   ArraySetAsSeries(atr, true);
   if(CopyBuffer(hATR, 0, 1, 1, atr) < 1)
      return;

   double slDist = atr[0] * InpSL_ATR;
   slDist = MathMax(slDist, InpMinSLPips * g_pip);
   slDist = MathMin(slDist, InpMaxSLPips * g_pip);

   double stopsLevel = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   if(slDist <= stopsLevel)
      slDist = stopsLevel + 2 * _Point;
   double tpDist = slDist * InpRR;

   double lots = CalcLots(slDist);
   if(lots <= 0)
   {
      Print("Lote calculado = 0, no se opera.");
      return;
   }

   bool ok;
   if(dir > 0)
   {
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double sl  = NormalizeDouble(ask - slDist, _Digits);
      double tp  = NormalizeDouble(ask + tpDist, _Digits);
      ok = trade.Buy(lots, _Symbol, ask, sl, tp, "FSE long");
   }
   else
   {
      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double sl  = NormalizeDouble(bid + slDist, _Digits);
      double tp  = NormalizeDouble(bid - tpDist, _Digits);
      ok = trade.Sell(lots, _Symbol, bid, sl, tp, "FSE short");
   }
   if(!ok)
      PrintFormat("Error abriendo operacion: %d %s", trade.ResultRetcode(), trade.ResultRetcodeDescription());
}

void ManagePositions()
{
   double atr[];
   ArraySetAsSeries(atr, true);
   bool haveAtr = CopyBuffer(hATR, 0, 1, 1, atr) == 1;
   double stopsLevel = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;

      long     type   = PositionGetInteger(POSITION_TYPE);
      double   open   = PositionGetDouble(POSITION_PRICE_OPEN);
      double   sl     = PositionGetDouble(POSITION_SL);
      double   tp     = PositionGetDouble(POSITION_TP);
      datetime opened = (datetime)PositionGetInteger(POSITION_TIME);

      // Salida por tiempo
      if(InpMaxTradeMinutes > 0 && TimeCurrent() - opened >= InpMaxTradeMinutes * 60)
      {
         trade.PositionClose(ticket);
         continue;
      }

      if(tp == 0) continue;
      double R = MathAbs(tp - open) / InpRR;   // distancia de riesgo inicial
      if(R <= 0) continue;

      if(type == POSITION_TYPE_BUY)
      {
         double bid    = SymbolInfoDouble(_Symbol, SYMBOL_BID);
         double profit = bid - open;
         double newSL  = sl;
         if(InpUseBreakEven && profit >= InpBE_R * R)
            newSL = MathMax(newSL, open + InpBE_LockPips * g_pip);
         if(InpUseTrailing && haveAtr && profit >= InpTrailStart_R * R)
            newSL = MathMax(newSL, bid - atr[0] * InpTrail_ATR);
         newSL = NormalizeDouble(newSL, _Digits);
         if(newSL > sl + _Point && bid - newSL > stopsLevel)
            trade.PositionModify(ticket, newSL, tp);
      }
      else
      {
         double ask    = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
         double profit = open - ask;
         double newSL  = (sl == 0) ? DBL_MAX : sl;
         if(InpUseBreakEven && profit >= InpBE_R * R)
            newSL = MathMin(newSL, open - InpBE_LockPips * g_pip);
         if(InpUseTrailing && haveAtr && profit >= InpTrailStart_R * R)
            newSL = MathMin(newSL, ask + atr[0] * InpTrail_ATR);
         if(newSL == DBL_MAX) continue;
         newSL = NormalizeDouble(newSL, _Digits);
         if((sl == 0 || newSL < sl - _Point) && newSL - ask > stopsLevel)
            trade.PositionModify(ticket, newSL, tp);
      }
   }
}

void CloseAll(const string reason)
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      if(trade.PositionClose(ticket))
         PrintFormat("Posicion %I64u cerrada: %s", ticket, reason);
   }
}

//+------------------------------------------------------------------+
//| Panel                                                            |
//+------------------------------------------------------------------+
void DrawPanel()
{
   if(MQLInfoInteger(MQL_TESTER) && !MQLInfoInteger(MQL_VISUAL_MODE))
      return;
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   string status = g_permBlocked ? "BLOQUEADO" : (g_dailyBlocked ? "PAUSADO HOY" : "ACTIVO");
   Comment(StringFormat(
      "Fondeo Scalper EURUSD  |  %s %s\n"
      "Equity: %.2f   Inicio dia: %.2f   P/L dia: %.2f\n"
      "Limite diario: %.2f (margen %.2f)\n"
      "Limite DD total: %.2f (margen %.2f)\n"
      "Operaciones hoy: %d/%d   Perdidas seguidas: %d/%d   Dia de fase: %d/%s\n"
      "Spread: %.1f pips   Sesion: %s   Noticias: %s",
      status, g_blockReason,
      equity, g_dayStartEquity, equity - g_dayStartEquity,
      DailyFloor(), equity - DailyFloor(),
      DDFloor(), equity - DDFloor(),
      g_tradesToday, InpMaxTradesPerDay, g_consecLosses, InpMaxConsecLosses,
      PhaseDaysElapsed(), InpPhaseMaxDays > 0 ? IntegerToString(InpPhaseMaxDays) : "-",
      SpreadPips(), InSession() ? "SI" : "NO", g_newsActive ? "BLOQUEO" : "OK"));
}

//+------------------------------------------------------------------+
//| Criterio de optimizacion personalizado:                          |
//| premia beneficio estable y penaliza drawdown y pocas operaciones |
//+------------------------------------------------------------------+
double OnTester()
{
   double profit = TesterStatistics(STAT_PROFIT);
   double ddPct  = TesterStatistics(STAT_EQUITYDD_PERCENT);
   double pf     = TesterStatistics(STAT_PROFIT_FACTOR);
   double trades = TesterStatistics(STAT_TRADES);
   if(trades < 100 || profit <= 0 || pf < 1.1)
      return 0;
   if(ddPct >= InpMaxTotalDDPct)
      return 0;
   return profit / MathMax(ddPct, 1.0) * MathMin(pf, 3.0);
}
//+------------------------------------------------------------------+
