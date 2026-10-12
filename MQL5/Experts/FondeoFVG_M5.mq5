//+------------------------------------------------------------------+
//|                                              FondeoFVG_M5.mq5    |
//|   Continuaciones FVG en M5 a favor de la EMA 20 (EURUSD)         |
//|                                                                  |
//|   Senal: FVG de 3 velas en M5 (vela 3 no solapa con la vela 1),  |
//|   vela central a favor, cierre de la vela 3 a favor de la EMA 20.|
//|   Entrada: orden limitada en el borde del FVG (o en el 50%),     |
//|   valida X minutos; se cancela si el precio llega al TP antes.   |
//|   SL bajo el minimo (compras) / sobre el maximo (ventas) de la   |
//|   vela 1 del patron o del swing de N velas. TP = RR x riesgo.    |
//|   Sesiones de Londres y Nueva York.                              |
//|                                                                  |
//|   AVISO: en el backtest 2010-2025 (tools/fvg_backtest.py) estas  |
//|   reglas tienen esperanza negativa tras costes. Ver README.      |
//|                                                                  |
//|   Protecciones de fondeo: perdida diaria, drawdown maximo,       |
//|   objetivo de fase, plazo de fase, rachas, spread, noticias,     |
//|   viernes y riesgo limitado al margen restante.                  |
//+------------------------------------------------------------------+
#property copyright "mesa-fondeo"
#property version   "1.00"

#include <Trade\Trade.mqh>

//--- Entradas -------------------------------------------------------
input group "=== General ==="
input long             InpMagic              = 20261013;  // Numero magico
input ENUM_TIMEFRAMES  InpTF                 = PERIOD_M5; // Timeframe del FVG

input group "=== Reglas de la cuenta de fondeo ==="
input double InpAccountSize        = 100000.0; // Tamano inicial de la cuenta
input double InpMaxDailyLossPct    = 3.5;      // Perdida diaria max % (WSFunded Rapid 4%)
input double InpMaxTotalDDPct      = 5.2;      // Drawdown total max % (WSFunded Rapid 6%)
input bool   InpTrailingDD         = false;    // DD trailing desde maximo de balance
input double InpDailyProfitStopPct = 0.0;      // Dejar de operar al ganar este % en el dia (0 = off)
input double InpProfitTargetPct    = 10.0;     // Parar EA al alcanzar objetivo de la fase % (0 = off)
input int    InpPhaseMaxDays       = 0;        // Dias habiles max para la fase (0 = sin limite)
input bool   InpResetPhase         = false;    // Reiniciar fase (contador de dias y bloqueos)
input int    InpDayResetHour       = 0;        // Hora (servidor) de reinicio del dia de la firma

input group "=== Riesgo por operacion ==="
input double InpRiskPct            = 0.50;  // Riesgo por operacion % del balance
input double InpCommissionPerLot   = 7.0;   // Comision ida+vuelta por lote (USD)
input double InpMaxLots            = 50.0;  // Lotes maximos por operacion
input int    InpMaxTradesPerDay    = 6;     // Operaciones maximas por dia
input int    InpMaxConsecLosses    = 4;     // Perdidas seguidas max en el dia
input int    InpCooldownMinutes    = 0;     // Pausa tras una perdida (min)
input double InpMinRiskFraction    = 0.25;  // Parar si el riesgo permitido cae bajo x del normal

input group "=== Senal FVG ==="
input int    InpEMAPeriod          = 20;    // EMA de tendencia (en el timeframe del FVG)
input double InpMinGapPips         = 0.5;   // Tamano minimo del FVG (pips)
input double InpMinDispATR         = 0.0;   // Cuerpo minimo de la vela central (x ATR, 0 = off)
input int    InpATRPeriod          = 14;    // Periodo ATR

input group "=== Entrada y salidas ==="
input double InpEntryFrac          = 0.0;   // Entrada: 0 = borde del FVG, 0.5 = mitad
input int    InpSLMode             = 0;     // SL: 0 = vela 1 del patron, 1 = swing de N velas
input int    InpSwingBars          = 10;    // Velas para el swing (modo 1)
input double InpSLBufferPips       = 0.2;   // Margen extra del SL (pips)
input double InpMinSLPips          = 3.0;   // SL minimo (pips)
input double InpMaxSLPips          = 25.0;  // SL maximo (pips)
input double InpRR                 = 3.0;   // TP = RR x riesgo
input int    InpOrderValidMinutes  = 60;    // Validez de la orden limitada (min)
input int    InpMaxTradeMinutes    = 240;   // Cerrar operacion tras x minutos (0 = off)

input group "=== Sesiones (hora del SERVIDOR; Espana = servidor - 1) ==="
input int    InpLondonStart        = 10;    // Londres inicio (servidor)
input int    InpLondonEnd          = 13;    // Londres fin (servidor)
input int    InpNYStart            = 15;    // Nueva York inicio (servidor)
input int    InpNYEnd              = 18;    // Nueva York fin (servidor)
input double InpMaxSpreadPips      = 1.2;   // Spread maximo (pips)
input bool   InpFridayClose        = true;  // Cerrar todo el viernes
input int    InpFridayCloseHour    = 20;    // Hora de cierre viernes (servidor)
input int    InpFridayNoNewHour    = 16;    // Sin nuevas entradas viernes desde (servidor)

input group "=== Filtro de noticias (solo en real/demo) ==="
input bool   InpUseNewsFilter      = true;  // Evitar noticias de alto impacto USD/EUR
input int    InpNewsMinutesBefore  = 30;    // Minutos antes de la noticia
input int    InpNewsMinutesAfter   = 30;    // Minutos despues de la noticia
input bool   InpCloseBeforeNews    = true;  // Cerrar posiciones y borrar ordenes antes de noticia

//--- Globales -------------------------------------------------------
CTrade   trade;
int      hEMA = INVALID_HANDLE, hATR = INVALID_HANDLE;
double   g_pip;
datetime g_lastBar        = 0;
int      g_dayId          = 0;
double   g_dayStartEquity = 0;
double   g_peakBalance    = 0;
int      g_tradesToday    = 0;
int      g_consecLosses   = 0;
datetime g_lastLossTime   = 0;
double   g_dayClosedPL    = 0;
bool     g_dailyBlocked   = false;
bool     g_permBlocked    = false;
string   g_blockReason    = "";
datetime g_newsCheckTime  = 0;
bool     g_newsActive     = false;
string   g_lastSignal     = "-";

string GVName(const string key)
{
   return StringFormat("FFVG_%I64d_%I64d_%s", AccountInfoInteger(ACCOUNT_LOGIN), InpMagic, key);
}

//+------------------------------------------------------------------+
int OnInit()
{
   if(InpRiskPct <= 0 || InpRiskPct > 2.0)
   {
      Print("Riesgo por operacion fuera de rango (0-2%).");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(InpRR <= 0 || InpEntryFrac < 0 || InpEntryFrac > 1 || InpSwingBars < 3 ||
      InpDayResetHour < 0 || InpDayResetHour > 23)
      return INIT_PARAMETERS_INCORRECT;

   g_pip = (_Digits == 3 || _Digits == 5) ? _Point * 10.0 : _Point;

   hEMA = iMA(_Symbol, InpTF, InpEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   hATR = iATR(_Symbol, InpTF, InpATRPeriod);
   if(hEMA == INVALID_HANDLE || hATR == INVALID_HANDLE)
   {
      Print("Error creando indicadores: ", GetLastError());
      return INIT_FAILED;
   }

   trade.SetExpertMagicNumber((ulong)InpMagic);
   trade.SetDeviationInPoints(10);
   trade.SetTypeFillingBySymbol(_Symbol);

   if(StringFind(_Symbol, "EURUSD") < 0)
      Print("AVISO: este EA se ha probado solo en EURUSD. Simbolo actual: ", _Symbol);

   if(InpResetPhase)
   {
      GlobalVariableDel(GVName("perm"));
      GlobalVariableDel(GVName("phase0"));
      GlobalVariableDel(GVName("peak"));
      Print("Fase reiniciada. Vuelve a poner InpResetPhase=false.");
   }
   if(!GlobalVariableCheck(GVName("phase0")))
      GlobalVariableSet(GVName("phase0"), (double)DayStart());

   g_peakBalance = GlobalVariableCheck(GVName("peak")) ? GlobalVariableGet(GVName("peak"))
                                                        : MathMax(InpAccountSize, AccountInfoDouble(ACCOUNT_BALANCE));
   if(GlobalVariableCheck(GVName("perm")) && GlobalVariableGet(GVName("perm")) > 0)
   {
      g_permBlocked = true;
      g_blockReason = "Bloqueo permanente previo (DD max, objetivo o plazo)";
   }
   UpdateDay();
   RecountToday();
   EventSetTimer(1);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   IndicatorRelease(hEMA);
   IndicatorRelease(hATR);
   Comment("");
}

void OnTimer()
{
   UpdateDay();
   CheckRiskLimits();
   ManagePending();
   DrawPanel();
}

void OnTick()
{
   UpdateDay();
   CheckRiskLimits();

   if(InpFridayClose && IsFridayCloseTime())
      CloseAll("Cierre de viernes");

   if(InpUseNewsFilter && InpCloseBeforeNews && IsNewsTime())
      CloseAll("Noticia de alto impacto");

   ManagePositions();
   ManagePending();

   datetime barTime = iTime(_Symbol, InpTF, 0);
   if(barTime == g_lastBar)
      return;
   g_lastBar = barTime;

   if(CanOpenNewTrade())
      CheckFVGAndPlace();
   DrawPanel();
}

//+------------------------------------------------------------------+
//| Dia de trading y limites de fondeo                               |
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
      g_dayStartEquity = GlobalVariableGet(keyEq);
   else
   {
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
   Print("EA BLOQUEADO: ", reason, ". Usa InpResetPhase=true para reactivar.");
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
   return (t.hour >= InpLondonStart && t.hour < InpLondonEnd) ||
          (t.hour >= InpNYStart && t.hour < InpNYEnd);
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

int CountMyOrders()
{
   int count = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if(OrderGetString(ORDER_SYMBOL) == _Symbol && OrderGetInteger(ORDER_MAGIC) == InpMagic)
         count++;
   }
   return count;
}

bool CanOpenNewTrade()
{
   if(g_permBlocked || g_dailyBlocked)                       return false;
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED))          return false;
   if(CountMyPositions() > 0 || CountMyOrders() > 0)         return false;
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
//| Senal FVG y colocacion de la orden limitada                      |
//+------------------------------------------------------------------+
void CheckFVGAndPlace()
{
   // r[0] = vela 3 (ultima cerrada), r[1] = vela central, r[2] = vela 1
   MqlRates r[];
   ArraySetAsSeries(r, true);
   int need = MathMax(3, InpSwingBars);
   if(CopyRates(_Symbol, InpTF, 1, need, r) < need)
      return;
   if(r[0].time - r[2].time != 2 * PeriodSeconds(InpTF))
      return;   // hueco de datos (fin de semana, etc.)

   double ema[], atr[];
   ArraySetAsSeries(ema, true);
   ArraySetAsSeries(atr, true);
   if(CopyBuffer(hEMA, 0, 1, 1, ema) < 1 || CopyBuffer(hATR, 0, 1, 1, atr) < 1)
      return;

   double minGap = InpMinGapPips * g_pip;
   double disp   = InpMinDispATR * atr[0];
   int dir = 0;
   double gap = 0;
   if(r[0].low - r[2].high >= minGap && r[1].close > r[1].open &&
      r[1].close - r[1].open >= disp && r[0].close > ema[0])
   {
      dir = 1;
      gap = r[0].low - r[2].high;
   }
   else if(r[2].low - r[0].high >= minGap && r[1].close < r[1].open &&
           r[1].open - r[1].close >= disp && r[0].close < ema[0])
   {
      dir = -1;
      gap = r[2].low - r[0].high;
   }
   if(dir == 0)
      return;

   double buf = InpSLBufferPips * g_pip;
   double entry, sl;
   if(dir > 0)
   {
      entry = r[0].low - InpEntryFrac * gap;
      if(InpSLMode == 0)
         sl = r[2].low - buf;
      else
      {
         double lo = r[0].low;
         for(int i = 1; i < InpSwingBars; i++) lo = MathMin(lo, r[i].low);
         sl = lo - buf;
      }
   }
   else
   {
      entry = r[0].high + InpEntryFrac * gap;
      if(InpSLMode == 0)
         sl = r[2].high + buf;
      else
      {
         double hi = r[0].high;
         for(int i = 1; i < InpSwingBars; i++) hi = MathMax(hi, r[i].high);
         sl = hi + buf;
      }
   }
   entry = NormalizeDouble(entry, _Digits);
   sl    = NormalizeDouble(sl, _Digits);
   double risk = MathAbs(entry - sl);
   if(risk < InpMinSLPips * g_pip || risk > InpMaxSLPips * g_pip)
      return;
   double tp = NormalizeDouble(entry + dir * InpRR * risk, _Digits);

   // La orden limitada tiene que quedar por detras del precio actual
   double stopsLevel = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(dir > 0 && ask - entry <= stopsLevel) return;
   if(dir < 0 && entry - bid <= stopsLevel) return;

   double lots = CalcLots(risk);
   if(lots <= 0)
   {
      Print("Lote calculado = 0, no se coloca la orden.");
      return;
   }

   bool ok;
   string cmt = StringFormat("FVG %s RR%.1f", dir > 0 ? "buy" : "sell", InpRR);
   if(dir > 0)
      ok = trade.BuyLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, cmt);
   else
      ok = trade.SellLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, cmt);
   if(ok)
      g_lastSignal = StringFormat("%s %s @%.5f SL %.5f TP %.5f (%.1f pips)", TimeToString(TimeCurrent(), TIME_MINUTES),
                                  dir > 0 ? "BUY LIMIT" : "SELL LIMIT", entry, sl, tp, risk / g_pip);
   else
      PrintFormat("Error colocando orden: %d %s", trade.ResultRetcode(), trade.ResultRetcodeDescription());
}

// Cancela ordenes caducadas, las que el precio ya llevo al TP sin rellenar y las bloqueadas
void ManagePending()
{
   bool blocked = g_permBlocked || g_dailyBlocked || (InpFridayClose && IsFridayCloseTime()) ||
                  (InpUseNewsFilter && InpCloseBeforeNews && IsNewsTime());
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol || OrderGetInteger(ORDER_MAGIC) != InpMagic)
         continue;
      long     type  = OrderGetInteger(ORDER_TYPE);
      double   tp    = OrderGetDouble(ORDER_TP);
      datetime setup = (datetime)OrderGetInteger(ORDER_TIME_SETUP);
      bool expired = TimeCurrent() - setup >= InpOrderValidMinutes * 60;
      bool ranAway = (type == ORDER_TYPE_BUY_LIMIT && tp > 0 && bid >= tp) ||
                     (type == ORDER_TYPE_SELL_LIMIT && tp > 0 && ask <= tp);
      if(blocked || expired || ranAway)
         trade.OrderDelete(ticket);
   }
}

//+------------------------------------------------------------------+
//| Riesgo y gestion                                                 |
//+------------------------------------------------------------------+
double CalcLots(const double slDistance)
{
   double balance    = AccountInfoDouble(ACCOUNT_BALANCE);
   double normalRisk = balance * InpRiskPct / 100.0;

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
      return 0;
   return NormalizeDouble(MathMin(lots, maxLot), 2);
}

void ManagePositions()
{
   if(InpMaxTradeMinutes <= 0)
      return;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      datetime opened = (datetime)PositionGetInteger(POSITION_TIME);
      if(TimeCurrent() - opened >= InpMaxTradeMinutes * 60)
         trade.PositionClose(ticket);
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
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol || OrderGetInteger(ORDER_MAGIC) != InpMagic)
         continue;
      if(trade.OrderDelete(ticket))
         PrintFormat("Orden %I64u borrada: %s", ticket, reason);
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
      "Fondeo FVG M5 + EMA%d  |  %s %s\n"
      "Equity: %.2f   Inicio dia: %.2f   P/L dia: %.2f\n"
      "Limite diario: %.2f (margen %.2f)\n"
      "Limite DD total: %.2f (margen %.2f)\n"
      "Operaciones hoy: %d/%d   Perdidas seguidas: %d/%d   Dia de fase: %d/%s\n"
      "Spread: %.1f pips   Sesion: %s   Noticias: %s\n"
      "Ultima orden: %s",
      InpEMAPeriod, status, g_blockReason,
      equity, g_dayStartEquity, equity - g_dayStartEquity,
      DailyFloor(), equity - DailyFloor(),
      DDFloor(), equity - DDFloor(),
      g_tradesToday, InpMaxTradesPerDay, g_consecLosses, InpMaxConsecLosses,
      PhaseDaysElapsed(), InpPhaseMaxDays > 0 ? IntegerToString(InpPhaseMaxDays) : "-",
      SpreadPips(), InSession() ? "SI" : "NO", g_newsActive ? "BLOQUEO" : "OK",
      g_lastSignal));
}

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
