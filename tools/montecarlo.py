#!/usr/bin/env python3
"""
Monte Carlo para FondeoScalperEURUSD en cuentas de fondeo de 100k.

Simula miles de challenges/meses aplicando:
  - Las reglas de la prop firm (perdida diaria, drawdown maximo, objetivo, dias minimos).
  - Las protecciones internas del EA (stop diario, stop por beneficio diario, max operaciones,
    perdidas seguidas y reduccion de riesgo segun el margen restante).

Las operaciones se expresan en multiplos de R (1R = riesgo de la operacion), asi que se
pueden re-escalar a cualquier % de riesgo.

Fuentes de operaciones:
  1) Informe del Probador de Estrategias de MT5 (HTML) o CSV con columna de beneficio:
       python3 tools/montecarlo.py --report ReportTester.html --sample-risk 0.30
     (se hace bootstrap de las operaciones reales del backtest)
  2) Parametrico (sin backtest): tasa de acierto + ratio:
       python3 tools/montecarlo.py --winrate 0.45 --rr 1.5

Ejemplos:
  python3 tools/montecarlo.py --scenarios                  # tabla de escenarios de winrate
  python3 tools/montecarlo.py --winrate 0.47 --mode funded --months 12
  python3 tools/montecarlo.py --winrate 0.47 --phases 10,5 # challenge de 2 fases
"""
import argparse
import csv
import html.parser
import io
import os
import sys

import numpy as np


# ---------------------------------------------------------------------------
# Lectura de operaciones
# ---------------------------------------------------------------------------
class _TableParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self._row, self._cell, self._in_cell = [], None, "", False

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._in_cell, self._cell = True, ""

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._row is not None and self._in_cell:
            self._row.append(self._cell.strip())
            self._in_cell = False
        elif tag == "tr" and self._row is not None:
            self.rows.append(self._row)
            self._row = None

    def handle_data(self, data):
        if self._in_cell:
            self._cell += data


def _num(s):
    s = s.replace("\xa0", "").replace(" ", "")
    if s.count(",") and s.count("."):
        s = s.replace(",", "")
    else:
        s = s.replace(",", ".")
    return float(s) if s not in ("", "-") else 0.0


def _read_text(path):
    raw = open(path, "rb").read()
    for enc in ("utf-16", "utf-8-sig", "latin-1"):
        try:
            txt = raw.decode(enc)
            if "<" in txt or "," in txt or ";" in txt:
                return txt
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1")


def load_trades_pct(path):
    """Devuelve (lista de resultados por operacion en % del balance previo, dias con operaciones)."""
    txt = _read_text(path)
    if path.lower().endswith((".htm", ".html")):
        p = _TableParser()
        p.feed(txt)
        rows = p.rows
    else:
        dialect = csv.Sniffer().sniff(txt[:4096], delimiters=",;\t")
        rows = list(csv.reader(io.StringIO(txt), dialect))

    # Buscar la cabecera de la tabla de transacciones (Deals / Transacciones)
    hdr_idx = None
    for i, r in enumerate(rows):
        low = [c.lower() for c in r]
        if any(c in ("profit", "beneficio") for c in low) and any(
            c in ("direction", "dirección", "direccion") for c in low
        ):
            hdr_idx = i
    if hdr_idx is None:
        # CSV simple: primera fila con columna profit/beneficio
        for i, r in enumerate(rows):
            low = [c.lower() for c in r]
            if any(c in ("profit", "beneficio") for c in low):
                hdr_idx = i
                break
    if hdr_idx is None:
        sys.exit("No encuentro una columna 'Profit'/'Beneficio' en el informe.")

    hdr = [c.lower() for c in rows[hdr_idx]]

    def col(*names):
        for n in names:
            if n in hdr:
                return hdr.index(n)
        return None

    c_profit = col("profit", "beneficio")
    c_dir = col("direction", "dirección", "direccion")
    c_comm = col("commission", "comisión", "comision")
    c_swap = col("swap")
    c_bal = col("balance")
    c_time = col("time", "fecha/hora", "hora", "date")

    trades, days, pending_comm, bal_prev = [], set(), 0.0, None
    for r in rows[hdr_idx + 1:]:
        if len(r) <= c_profit:
            continue
        try:
            profit = _num(r[c_profit])
        except ValueError:
            continue
        comm = _num(r[c_comm]) if c_comm is not None and c_comm < len(r) else 0.0
        swap = _num(r[c_swap]) if c_swap is not None and c_swap < len(r) else 0.0
        bal = None
        if c_bal is not None and c_bal < len(r):
            try:
                bal = _num(r[c_bal])
            except ValueError:
                bal = None
        direction = r[c_dir].lower() if c_dir is not None and c_dir < len(r) else "out"
        if direction == "in":
            pending_comm += comm
            continue
        if direction not in ("out", "in/out", "out by"):
            if bal is not None:
                bal_prev = bal  # deposito inicial
            continue
        pl = profit + comm + swap + pending_comm
        pending_comm = 0.0
        base = bal - pl if bal is not None else (bal_prev or 100000.0)
        trades.append(100.0 * pl / base)
        bal_prev = bal
        if c_time is not None and c_time < len(r):
            days.add(r[c_time][:10])
    if not trades:
        sys.exit("El informe no contiene operaciones cerradas.")
    return np.array(trades), len(days)


# ---------------------------------------------------------------------------
# Simulacion
# ---------------------------------------------------------------------------
class Rules:
    def __init__(self, a):
        self.size = a.account
        self.firm_daily = a.firm_daily / 100.0
        self.firm_dd = a.firm_dd / 100.0
        self.trailing = a.trailing_dd
        self.ea_daily = a.ea_daily / 100.0
        self.ea_dd = a.ea_dd / 100.0
        self.ea_day_profit = a.ea_day_profit / 100.0
        self.risk = a.risk / 100.0
        self.max_trades = a.max_trades
        self.max_consec = a.max_consec
        self.trades_per_day = a.trades_per_day
        self.min_days = a.min_days
        self.min_frac = a.min_risk_frac


def simulate(rules, draw_r, target_pct, max_days, rng, start_balance=None):
    """Una ejecucion. draw_r(n) devuelve n resultados en R.
    Devuelve (estado, dias, curva_equity, dd_max_pct)."""
    size = rules.size
    bal = start_balance or size
    peak = bal
    curve = [bal]
    max_dd = 0.0
    traded_days = 0
    target = size * (1 + target_pct / 100.0) if target_pct else None

    for day in range(1, max_days + 1):
        day_start = bal
        firm_floor_day = day_start - size * rules.firm_daily
        ea_floor_day = day_start - size * rules.ea_daily
        n = min(rng.poisson(rules.trades_per_day), rules.max_trades)
        if n > 0:
            traded_days += 1
        consec = 0
        for r in draw_r(n):
            dd_base = peak if rules.trailing else size
            firm_floor_total = dd_base * (1 - rules.firm_dd)
            ea_floor_total = dd_base * (1 - rules.ea_dd)
            # Igual que CalcLots(): riesgo nunca mayor que la mitad del margen restante
            # (si cae bajo min_frac del normal, el EA se para: dia o permanente)
            normal = bal * rules.risk
            day_risk = 0.5 * (bal - ea_floor_day)
            total_risk = 0.5 * (bal - ea_floor_total)
            if total_risk < rules.min_frac * normal:
                curve.append(bal)
                return "ea_stopped", day, curve, max_dd
            if day_risk < rules.min_frac * normal:
                break
            risk_money = min(normal, day_risk, total_risk)
            bal += r * risk_money
            peak = max(peak, bal)
            max_dd = max(max_dd, (peak - bal) / size * 100)
            # Reglas de la firma (perdida maxima en una operacion = SL, sin slippage extremo)
            if bal <= firm_floor_day:
                curve.append(bal)
                return "fail_daily", day, curve, max_dd
            if bal <= firm_floor_total:
                curve.append(bal)
                return "fail_dd", day, curve, max_dd
            if target and bal >= target and traded_days >= rules.min_days:
                curve.append(bal)
                return "pass", day, curve, max_dd
            # Protecciones internas del EA
            consec = consec + 1 if r < 0 else 0
            if rules.ea_day_profit and bal >= day_start + size * rules.ea_day_profit:
                break
            if consec >= rules.max_consec:
                break
        curve.append(bal)
        if target and bal >= target and traded_days >= rules.min_days:
            return "pass", day, curve, max_dd
    return "timeout" if target else "survived", max_days, curve, max_dd


def make_drawer(args, rng):
    if args.r_file:
        r = np.loadtxt(args.r_file, ndmin=1)
        print(f"Fichero R: {len(r)} operaciones | Winrate {np.mean(r > 0):.1%} | media {r.mean():+.3f}R")
        return lambda n: rng.choice(r, size=n, replace=True), r
    if args.report:
        pct, ndays = load_trades_pct(args.report)
        r = pct / args.sample_risk
        print(f"Informe: {len(r)} operaciones, {ndays} dias con operaciones")
        print(f"  Winrate {np.mean(r > 0):.1%}  |  media {r.mean():+.3f}R  |  "
              f"PF {r[r > 0].sum() / max(-r[r < 0].sum(), 1e-9):.2f}")
        if ndays and args.trades_per_day is None:
            args.trades_per_day = len(r) / ndays
        return lambda n: rng.choice(r, size=n, replace=True), r
    # Parametrico: TP, SL y una fraccion de cierres en break-even/tiempo (~0R)
    p_be = args.be_rate
    p_win = args.winrate * (1 - p_be)
    outcomes = np.array([args.rr, -1.0, args.be_r]) - args.cost_r
    probs = np.array([p_win, 1 - p_be - p_win, p_be])
    if args.slip_sd > 0:
        return (lambda n: rng.choice(outcomes, size=n, p=probs)
                + rng.normal(0, args.slip_sd, size=n)), None
    return lambda n: rng.choice(outcomes, size=n, p=probs), None


def run_challenge(args, rules, rng, draw, verbose=True):
    phases = [float(x) for x in args.phases.split(",")]
    results = []
    curves = []
    for i in range(args.runs):
        total_days, status, dd = 0, "pass", 0.0
        run_curve = []
        for target in phases:
            status, days, curve, mdd = simulate(rules, draw, target, args.max_days, rng)
            total_days += days
            dd = max(dd, mdd)
            run_curve += curve if not run_curve else curve[1:]
            if status != "pass":
                break
        results.append((status, total_days, dd))
        if i < 300:
            curves.append(run_curve)
    st = np.array([r[0] for r in results])
    days = np.array([r[1] for r in results])
    dds = np.array([r[2] for r in results])
    summary = {
        "pass": np.mean(st == "pass"),
        "fail_daily": np.mean(st == "fail_daily"),
        "fail_dd": np.mean(st == "fail_dd"),
        "ea_stopped": np.mean(st == "ea_stopped"),
        "timeout": np.mean(st == "timeout"),
        "days_median": float(np.median(days[st == "pass"])) if np.any(st == "pass") else float("nan"),
        "days_p90": float(np.percentile(days[st == "pass"], 90)) if np.any(st == "pass") else float("nan"),
        "dd_median": float(np.median(dds)),
        "dd_p95": float(np.percentile(dds, 95)),
    }
    if verbose:
        print(f"\n=== CHALLENGE ({' + '.join(f'{p:g}%' for p in phases)}) | {args.runs} simulaciones | "
              f"max {args.max_days} dias por fase ===")
        print(f"  Aprobado ............................ {summary['pass']:6.1%}")
        print(f"  Suspendido por perdida diaria ....... {summary['fail_daily']:6.1%}")
        print(f"  Suspendido por drawdown maximo ...... {summary['fail_dd']:6.1%}")
        print(f"  EA detenido por su limite de DD ..... {summary['ea_stopped']:6.1%}  (cuenta salvada, sin aprobar)")
        print(f"  Sin llegar al objetivo a tiempo ..... {summary['timeout']:6.1%}")
        print(f"  Dias hasta aprobar: mediana {summary['days_median']:.0f}, p90 {summary['days_p90']:.0f}")
        print(f"  Drawdown max pico-valle (% de 100k): mediana {summary['dd_median']:.2f}%, p95 {summary['dd_p95']:.2f}%")
    return summary, curves, st, days, dds


def run_funded(args, rules, rng, draw):
    days = args.months * 21
    finals, sts, dds, curves = [], [], [], []
    for i in range(args.runs):
        status, _, curve, mdd = simulate(rules, draw, 0, days, rng)
        finals.append(curve[-1])
        sts.append(status)
        dds.append(mdd)
        if i < 300:
            curves.append(curve)
    finals, sts, dds = np.array(finals), np.array(sts), np.array(dds)
    ret = (finals / rules.size - 1) * 100
    print(f"\n=== CUENTA FONDEADA | {args.months} meses | {args.runs} simulaciones ===")
    print(f"  Cuenta perdida (regla diaria) ....... {np.mean(sts == 'fail_daily'):6.1%}")
    print(f"  Cuenta perdida (DD maximo) .......... {np.mean(sts == 'fail_dd'):6.1%}")
    print(f"  EA detenido por su limite de DD ..... {np.mean(sts == 'ea_stopped'):6.1%}")
    print(f"  Rentabilidad total: p5 {np.percentile(ret, 5):+.1f}%  mediana {np.median(ret):+.1f}%  "
          f"p95 {np.percentile(ret, 95):+.1f}%")
    print(f"  Prob. de terminar en positivo ....... {np.mean(ret > 0):6.1%}")
    print(f"  Beneficio medio/mes (mediana) ....... {np.median(ret) / args.months:+.2f}%  "
          f"(~{rules.size * np.median(ret) / args.months / 100:,.0f} $ antes del reparto)")
    print(f"  Drawdown max pico-valle: mediana {np.median(dds):.2f}%, p95 {np.percentile(dds, 95):.2f}%")
    return curves, sts, ret, dds


def plot(path, title, curves, st, extra, extra_label, size):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("(matplotlib no instalado: sin grafico)")
        return
    fig, axes = plt.subplots(1, 2, figsize=(13, 5))
    ax = axes[0]
    colors = {"pass": "#2a9d8f", "survived": "#2a9d8f", "fail_daily": "#e63946",
              "fail_dd": "#e63946", "ea_stopped": "#f4a261", "timeout": "#8d99ae"}
    for c, s in zip(curves[:200], st[:200]):
        ax.plot(np.array(c) / size * 100 - 100, color=colors.get(s, "#999"), alpha=0.25, lw=0.8)
    ax.axhline(0, color="#333", lw=0.8)
    ax.set_title("Curvas de equity simuladas (verde=ok, rojo=suspendida, naranja=EA parado)")
    ax.set_xlabel("Dia de trading")
    ax.set_ylabel("% sobre la cuenta")
    ax.grid(alpha=0.3)
    ax = axes[1]
    ax.hist(extra, bins=40, color="#457b9d", alpha=0.85)
    ax.set_title(extra_label)
    ax.grid(alpha=0.3)
    fig.suptitle(title)
    fig.tight_layout()
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    fig.savefig(path, dpi=110)
    print(f"Grafico guardado en {path}")


def scenarios(args, rules):
    print(f"\n=== ESCENARIOS (RR {args.rr}, riesgo {args.risk}%, coste {args.cost_r}R, "
          f"{args.be_rate:.0%} cierres a BE, objetivo {args.phases}) ===")
    print(f"{'Winrate':>8} {'Esperanza':>10} {'Aprueba':>8} {'Susp.diaria':>12} {'Susp.DD':>8} "
          f"{'EA parado':>10} {'Sin tiempo':>11} {'Dias med':>9}")
    rows = []
    for wr in (0.38, 0.40, 0.42, 0.45, 0.48, 0.50, 0.55):
        a = argparse.Namespace(**vars(args))
        a.winrate = wr
        rng = np.random.default_rng(args.seed)
        draw, _ = make_drawer(a, rng)
        exp = (wr * (1 - a.be_rate) * a.rr - (1 - a.be_rate) * (1 - wr) + a.be_rate * a.be_r) - a.cost_r
        s, *_ = run_challenge(a, rules, rng, draw, verbose=False)
        rows.append((wr, exp, s))
        print(f"{wr:>8.0%} {exp:>+9.3f}R {s['pass']:>8.1%} {s['fail_daily']:>12.1%} {s['fail_dd']:>8.1%} "
              f"{s['ea_stopped']:>10.1%} {s['timeout']:>11.1%} {s['days_median']:>9.0f}")
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_argument_group("Fuente de operaciones")
    src.add_argument("--report", help="Informe HTML del probador de MT5 o CSV con columna Profit")
    src.add_argument("--r-file", help="Fichero con un resultado en R por linea (tools/backtest.py --export-r)")
    src.add_argument("--sample-risk", type=float, default=0.30, help="%% de riesgo usado en el backtest")
    src.add_argument("--winrate", type=float, default=0.45, help="Tasa de acierto (modo parametrico)")
    src.add_argument("--rr", type=float, default=1.5, help="Ratio TP/SL")
    src.add_argument("--be-rate", type=float, default=0.15, help="Fraccion de operaciones cerradas en BE/tiempo")
    src.add_argument("--be-r", type=float, default=0.05, help="Resultado medio de esos cierres en R")
    src.add_argument("--cost-r", type=float, default=0.08, help="Coste por operacion en R (comision+slippage)")
    src.add_argument("--slip-sd", type=float, default=0.05, help="Ruido de ejecucion en R (desv. tipica)")
    src.add_argument("--scenarios", action="store_true", help="Tabla con varias tasas de acierto")

    acc = ap.add_argument_group("Cuenta y reglas")
    acc.add_argument("--mode", choices=("challenge", "funded"), default="challenge")
    acc.add_argument("--account", type=float, default=100000)
    acc.add_argument("--phases", default="10,5", help="Objetivos por fase en %%, ej. '10,5' o '8'")
    acc.add_argument("--max-days", type=int, default=60, help="Dias de trading max por fase")
    acc.add_argument("--min-days", type=int, default=4, help="Dias minimos de trading")
    acc.add_argument("--months", type=int, default=12, help="Meses a simular (modo funded)")
    acc.add_argument("--firm-daily", type=float, default=5.0)
    acc.add_argument("--firm-dd", type=float, default=10.0)
    acc.add_argument("--trailing-dd", action="store_true")

    ea = ap.add_argument_group("Parametros del EA")
    ea.add_argument("--risk", type=float, default=0.40, help="Riesgo por operacion %%")
    ea.add_argument("--ea-daily", type=float, default=4.0)
    ea.add_argument("--ea-dd", type=float, default=8.0)
    ea.add_argument("--ea-day-profit", type=float, default=1.5)
    ea.add_argument("--max-trades", type=int, default=6)
    ea.add_argument("--max-consec", type=int, default=3)
    ea.add_argument("--min-risk-frac", type=float, default=0.25)
    ea.add_argument("--trades-per-day", type=float, default=None, help="Media de operaciones/dia")

    ap.add_argument("--runs", type=int, default=10000)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default="reports", help="Carpeta de salida para graficos")
    args = ap.parse_args()

    rng = np.random.default_rng(args.seed)
    draw, _ = make_drawer(args, rng)
    if args.trades_per_day is None:
        args.trades_per_day = 2.0
    rules = Rules(args)

    if args.scenarios:
        scenarios(args, rules)
        return

    src_label = os.path.basename(args.report or args.r_file) if (args.report or args.r_file) else f"winrate {args.winrate:.0%}, RR {args.rr}"
    print(f"Fuente: {src_label} | riesgo {args.risk}% | {args.trades_per_day:.2f} operaciones/dia")
    if args.mode == "challenge":
        s, curves, st, days, dds = run_challenge(args, rules, rng, draw)
        plot(os.path.join(args.out, "montecarlo_challenge.png"),
             f"Monte Carlo challenge 100k ({src_label}) - aprueba {s['pass']:.1%}",
             curves, st, days[st == "pass"], "Dias de trading hasta aprobar", args.account)
    else:
        curves, sts, ret, dds = run_funded(args, rules, rng, draw)
        plot(os.path.join(args.out, "montecarlo_funded.png"),
             f"Monte Carlo cuenta fondeada 100k, {args.months} meses ({src_label})",
             curves, sts, ret, f"Rentabilidad a {args.months} meses (%)", args.account)


if __name__ == "__main__":
    main()
