#!/usr/bin/env python3
"""
Backtester en Python de la logica de FondeoScalperEURUSD sobre datos M1 de HistData.

Replica la senal del EA (pullback a EMA lenta en M5 + tendencia H1 + RSI + ATR) y la gestion
(SL/TP por ATR, break-even, trailing, salida por tiempo, max operaciones, rachas, pausa),
resolviendo SL/TP dentro de cada vela M1 (si en la misma M1 se tocan ambos, cuenta el SL).

Datos: ficheros DAT_ASCII_EURUSD_M1_YYYY.csv de histdata.com (hora EST fija, UTC-5),
convertidos a hora de servidor GMT+2/+3 (cierre de Nueva York = 00:00).

Uso:
  python3 tools/backtest.py --data carpeta_csv --years 2021-2025
  python3 tools/backtest.py --data carpeta_csv --preset mejorada --export-r trades_r.txt
"""
import argparse
import glob
import os
import sys

import numpy as np
import pandas as pd

PIP = 0.0001


# ---------------------------------------------------------------------------
# Datos
# ---------------------------------------------------------------------------
def _us_dst(ts):
    """True si la fecha (array de Timestamps) cae en horario de verano de EEUU."""
    years = ts.year
    out = np.zeros(len(ts), dtype=bool)
    for y in np.unique(years):
        mar = pd.Timestamp(year=y, month=3, day=1)
        start = mar + pd.Timedelta(days=(6 - mar.weekday()) % 7 + 7, hours=2)   # 2o domingo marzo
        nov = pd.Timestamp(year=y, month=11, day=1)
        end = nov + pd.Timedelta(days=(6 - nov.weekday()) % 7, hours=2)          # 1er domingo nov
        m = years == y
        out[m] = (ts[m] >= start) & (ts[m] < end)
    return out


def load_m1(folder, y0, y1):
    files = []
    for y in range(y0, y1 + 1):
        files += sorted(glob.glob(os.path.join(folder, f"*M1*{y}*.csv")) +
                        glob.glob(os.path.join(folder, f"m1_{y}.csv")))
    if not files:
        sys.exit(f"No hay ficheros M1 en {folder} para {y0}-{y1}")
    dfs = []
    for f in sorted(set(files)):
        d = pd.read_csv(f, sep=";", header=None, names=["t", "o", "h", "l", "c", "v"],
                        dtype={"t": str, "o": float, "h": float, "l": float, "c": float, "v": float})
        dfs.append(d)
    d = pd.concat(dfs, ignore_index=True)
    t = pd.to_datetime(d["t"], format="%Y%m%d %H%M%S")
    # EST fijo -> hora de servidor (NY + 7h)
    t = t + pd.to_timedelta(7 + _us_dst(pd.DatetimeIndex(t)).astype(int), unit="h")
    d.index = pd.DatetimeIndex(t)
    d = d[["o", "h", "l", "c"]].sort_index()
    return d[~d.index.duplicated()]


def resample(m1, rule):
    r = m1.resample(rule, label="left", closed="left").agg({"o": "first", "h": "max", "l": "min", "c": "last"})
    return r.dropna()


# ---------------------------------------------------------------------------
# Indicadores (como MT5)
# ---------------------------------------------------------------------------
def ema(s, n):
    return s.ewm(span=n, adjust=False).mean()


def rsi(c, n):
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))


def atr_sma(df, n):
    pc = df["c"].shift()
    tr = pd.concat([df["h"] - df["l"], (df["h"] - pc).abs(), (df["l"] - pc).abs()], axis=1).max(axis=1)
    return tr.rolling(n).mean()   # iATR de MT5 = media simple del TR


def adx(df, n):
    up = df["h"].diff()
    dn = -df["l"].diff()
    pdm = np.where((up > dn) & (up > 0), up, 0.0)
    ndm = np.where((dn > up) & (dn > 0), dn, 0.0)
    pc = df["c"].shift()
    tr = pd.concat([df["h"] - df["l"], (df["h"] - pc).abs(), (df["l"] - pc).abs()], axis=1).max(axis=1)
    a = 1 / n
    atr_w = tr.ewm(alpha=a, adjust=False).mean()
    pdi = 100 * pd.Series(pdm, index=df.index).ewm(alpha=a, adjust=False).mean() / atr_w
    ndi = 100 * pd.Series(ndm, index=df.index).ewm(alpha=a, adjust=False).mean() / atr_w
    dx = 100 * (pdi - ndi).abs() / (pdi + ndi).replace(0, np.nan)
    return dx.ewm(alpha=a, adjust=False).mean()


# ---------------------------------------------------------------------------
# Configuracion
# ---------------------------------------------------------------------------
BASE = dict(
    fast=8, slow=21, trend=200, rsi_n=14, atr_n=14,
    rsi_long=(45, 70), rsi_short=(30, 55), touch=1.0,
    atr_min=2.5, atr_max=15.0,
    sl_atr=1.5, sl_min=4.0, sl_max=12.0, rr=1.5,
    be=True, be_r=0.8, be_lock=0.5, trail=True, trail_start=1.0, trail_atr=1.0, max_min=120,
    start=9, end=19, fri_no_new=16, max_trades=6, max_consec=3, cooldown=30,
    spread=0.3, comm_pips=0.7,
    # Filtros extra (desactivados en la version base)
    adx_min=0, adx_tf="M5", m15_align=False, close_beyond_fast=False, body_min=0.0,
    max_ext_atr_h1=0.0, day_open_align=False, rsi_cross=False, hours=None,
    strategy="pullback", tf_min=5,
    # asian_mr
    bb_n=20, bb_k=2.0, rsi_lo=30, rsi_hi=70, adx_max=25, tp_atr=1.0, tp_min=2.0,
    # range_bo (minutos del dia en hora de servidor)
    range_from=0, range_to=540, bo_until=720, rng_min=10, rng_max=40, bo_buffer=0.5,
    sl_mode="atr", sl_rng_frac=0.5, trend_filter=False,
)

PRESETS = {
    "base": {},
}


# ---------------------------------------------------------------------------
# Motor
# ---------------------------------------------------------------------------
class Data:
    def __init__(self, m1, tf_min=5):
        self.m1 = m1
        self.m5 = resample(m1, f"{tf_min}min")   # timeframe de entrada (nombre historico)
        self.m15 = resample(m1, "15min")
        self.h1 = resample(m1, "1h")
        self.d1 = resample(m1, "1D")
        self.cache = {}

    def ind(self, key, fn):
        if key not in self.cache:
            self.cache[key] = fn()
        return self.cache[key]


def build_signals(D, cfg):
    m5, h1 = D.m5, D.h1
    c = m5["c"]
    fast = D.ind(("ema5", cfg["fast"]), lambda: ema(c, cfg["fast"]))
    slow = D.ind(("ema5", cfg["slow"]), lambda: ema(c, cfg["slow"]))
    r = D.ind(("rsi5", cfg["rsi_n"]), lambda: rsi(c, cfg["rsi_n"]))
    a = D.ind(("atr5", cfg["atr_n"]), lambda: atr_sma(m5, cfg["atr_n"]))
    te = D.ind(("emah1", cfg["trend"]), lambda: ema(h1["c"], cfg["trend"]))

    # Valores de la vela M5 cerrada (shift 1) en el momento de abrir la siguiente
    f0, f1 = fast, fast.shift()
    s0 = slow
    r0, r1 = r, r.shift()
    o, h, l, cl = m5["o"], m5["h"], m5["l"], m5["c"]

    # H1: ultima vela H1 cerrada antes de la apertura de la siguiente vela M5
    decision_time = m5.index + pd.Timedelta(minutes=cfg["tf_min"])
    h1_key = decision_time.floor("1h") - pd.Timedelta(hours=1)
    h1c = h1["c"].reindex(h1_key).values
    t0 = te.reindex(h1_key).values
    t1 = te.shift().reindex(h1_key).values
    trend_up = (h1c > t0) & (t0 > t1)
    trend_dn = (h1c < t0) & (t0 < t1)

    atr_p = (a / PIP).values
    vol_ok = (atr_p >= cfg["atr_min"]) & (atr_p <= cfg["atr_max"])
    touch = cfg["touch"] * PIP

    long_ = (trend_up & vol_ok & (f0 > s0).values & (f0 > f1).values &
             (l <= s0 + touch).values & (cl > s0).values & (cl > o).values &
             (r0 > cfg["rsi_long"][0]).values & (r0 < cfg["rsi_long"][1]).values & (r0 > r1).values)
    short = (trend_dn & vol_ok & (f0 < s0).values & (f0 < f1).values &
             (h >= s0 - touch).values & (cl < s0).values & (cl < o).values &
             (r0 < cfg["rsi_short"][1]).values & (r0 > cfg["rsi_short"][0]).values & (r0 < r1).values)

    # --- filtros extra ---
    if cfg["adx_min"] > 0:
        if cfg["adx_tf"] == "H1":
            ax = D.ind(("adxh1", 14), lambda: adx(h1, 14)).reindex(h1_key).values
        else:
            ax = D.ind(("adx5", 14), lambda: adx(m5, 14)).values
        long_ &= ax >= cfg["adx_min"]
        short &= ax >= cfg["adx_min"]
    if cfg["m15_align"]:
        m15 = D.m15
        e50 = D.ind(("ema15", 50), lambda: ema(m15["c"], 50))
        k = decision_time.floor("15min") - pd.Timedelta(minutes=15)
        mc = m15["c"].reindex(k).values
        me = e50.reindex(k).values
        me1 = e50.shift().reindex(k).values
        long_ &= (mc > me) & (me > me1)
        short &= (mc < me) & (me < me1)
    if cfg["close_beyond_fast"]:
        long_ &= (cl > f0).values
        short &= (cl < f0).values
    if cfg["body_min"] > 0:
        rng = (h - l).replace(0, np.nan)
        body = ((cl - o).abs() / rng).values
        long_ &= body >= cfg["body_min"]
        short &= body >= cfg["body_min"]
    if cfg["max_ext_atr_h1"] > 0:
        ah1 = D.ind(("atrh1", 14), lambda: atr_sma(h1, 14)).reindex(h1_key).values
        ext = np.abs(cl.values - t0) / ah1
        long_ &= ext <= cfg["max_ext_atr_h1"]
        short &= ext <= cfg["max_ext_atr_h1"]
    if cfg["day_open_align"]:
        dk = decision_time.floor("1D")
        dopen = D.d1["o"].reindex(dk).values
        long_ &= cl.values > dopen
        short &= cl.values < dopen
    if cfg["rsi_cross"]:
        long_ &= (r1 < 50).values & (r0 > 50).values | ((r1 < r0) & (r0 < 60)).values
        short &= (r1 > 50).values & (r0 < 50).values | ((r1 > r0) & (r0 > 40)).values

    sig = np.where(long_, 1, np.where(short, -1, 0))
    sig = np.nan_to_num(sig).astype(int)
    sl_d = np.clip(a.values * cfg["sl_atr"], cfg["sl_min"] * PIP, cfg["sl_max"] * PIP)
    return pd.DataFrame({"sig": sig, "atr": a.values, "sl_d": sl_d, "tp_d": sl_d * cfg["rr"]},
                        index=decision_time)


def bollinger(c, n, k):
    m = c.rolling(n).mean()
    sd = c.rolling(n).std(ddof=0)
    return m, m + k * sd, m - k * sd


def signals_asian_mr(D, cfg):
    """Reversion a la media en sesion asiatica: cierre fuera de Bollinger + RSI extremo + ADX bajo."""
    m5 = D.m5
    c = m5["c"]
    mid, up, lo = D.ind(("bb", cfg["bb_n"], cfg["bb_k"]), lambda: bollinger(c, cfg["bb_n"], cfg["bb_k"]))
    r = D.ind(("rsi5", cfg["rsi_n"]), lambda: rsi(c, cfg["rsi_n"]))
    a = D.ind(("atr5", cfg["atr_n"]), lambda: atr_sma(m5, cfg["atr_n"]))
    ax = D.ind(("adx5", 14), lambda: adx(m5, 14))
    decision_time = m5.index + pd.Timedelta(minutes=cfg["tf_min"])
    atr_p = (a / PIP).values
    ok = (atr_p >= cfg["atr_min"]) & (atr_p <= cfg["atr_max"]) & (ax.values <= cfg["adx_max"])
    long_ = ok & (c < lo).values & (r < cfg["rsi_lo"]).values
    short = ok & (c > up).values & (r > cfg["rsi_hi"]).values
    sig = np.nan_to_num(np.where(long_, 1, np.where(short, -1, 0))).astype(int)
    sl_d = np.clip(a.values * cfg["sl_atr"], cfg["sl_min"] * PIP, cfg["sl_max"] * PIP)
    tp_d = np.clip(a.values * cfg["tp_atr"], cfg["tp_min"] * PIP, 100 * PIP)
    return pd.DataFrame({"sig": sig, "atr": a.values, "sl_d": sl_d, "tp_d": tp_d}, index=decision_time)


def signals_range_bo(D, cfg):
    """Ruptura del rango previo (asiatico u apertura) con cierre M5 fuera del rango."""
    m5 = D.m5
    t = m5.index
    a = D.ind(("atr5", cfg["atr_n"]), lambda: atr_sma(m5, cfg["atr_n"]))
    day = t.floor("1D")
    mins = t.hour * 60 + t.minute
    r0, r1 = cfg["range_from"], cfg["range_to"]          # minutos del dia (servidor)
    in_rng = (mins >= r0) & (mins < r1)
    g = pd.DataFrame({"h": m5["h"].where(in_rng), "l": m5["l"].where(in_rng), "d": day})
    rh = g.groupby("d")["h"].transform("max").values
    rl = g.groupby("d")["l"].transform("min").values
    size = (rh - rl) / PIP
    c = m5["c"].values
    buf = cfg["bo_buffer"] * PIP
    win = (mins >= r1) & (mins < cfg["bo_until"])
    ok = win & (size >= cfg["rng_min"]) & (size <= cfg["rng_max"])
    long_ = ok & (c > rh + buf)
    short = ok & (c < rl - buf)
    if cfg.get("trend_filter"):
        te = D.ind(("emah1", cfg["trend"]), lambda: ema(D.h1["c"], cfg["trend"]))
        k = (t + pd.Timedelta(minutes=cfg["tf_min"])).floor("1h") - pd.Timedelta(hours=1)
        tv = te.reindex(k).values
        long_ &= c > tv
        short &= c < tv
    # solo la primera ruptura del dia
    first = pd.Series(np.where(long_ | short, 1, 0), index=t).groupby(day).cumsum().values == 1
    long_ &= first
    short &= first
    sig = np.where(long_, 1, np.where(short, -1, 0)).astype(int)
    if cfg["sl_mode"] == "range":
        sl_d = np.clip(np.where(long_, c - rl, rh - c) * cfg["sl_rng_frac"] + 0 * PIP,
                       cfg["sl_min"] * PIP, cfg["sl_max"] * PIP)
    else:
        sl_d = np.clip(a.values * cfg["sl_atr"], cfg["sl_min"] * PIP, cfg["sl_max"] * PIP)
    sl_d = np.nan_to_num(sl_d, nan=cfg["sl_min"] * PIP)
    return pd.DataFrame({"sig": sig, "atr": a.values, "sl_d": sl_d, "tp_d": sl_d * cfg["rr"]},
                        index=t + pd.Timedelta(minutes=cfg["tf_min"]))


STRATEGIES = {"pullback": build_signals, "asian_mr": signals_asian_mr, "range_bo": signals_range_bo}


def run(D, cfg):
    sigs = STRATEGIES[cfg["strategy"]](D, cfg)
    sigs = sigs[sigs["sig"] != 0]
    m1 = D.m1
    t_m1 = m1.index.values
    o1, h1_, l1, c1 = (m1[k].values for k in ("o", "h", "l", "c"))
    spread = cfg["spread"] * PIP
    hours = cfg["hours"]

    trades = []
    busy_until = np.datetime64("1970-01-01")
    day, n_day, consec, last_loss = None, 0, 0, None
    for t, row in sigs.iterrows():
        tt = np.datetime64(t)
        if tt < busy_until:
            continue
        hr, wd = t.hour, t.weekday()
        if wd >= 5:
            continue
        if hours is not None:
            if hr not in hours:
                continue
        elif not (cfg["start"] <= hr < cfg["end"]):
            continue
        if wd == 4 and hr >= cfg["fri_no_new"]:
            continue
        d = t.date()
        if d != day:
            day, n_day, consec, last_loss = d, 0, 0, None
        if n_day >= cfg["max_trades"] or consec >= cfg["max_consec"]:
            continue
        if last_loss is not None and (t - last_loss).total_seconds() < cfg["cooldown"] * 60:
            continue
        i = np.searchsorted(t_m1, tt)
        if i >= len(t_m1) or (t_m1[i] - tt) > np.timedelta64(10, "m"):
            continue

        direction = row["sig"]
        atr_v = row["atr"]
        sl_d, tp_d = row["sl_d"], row["tp_d"]
        bid0 = o1[i]
        entry = bid0 + spread if direction > 0 else bid0
        sl = entry - direction * sl_d
        tp = entry + direction * tp_d
        end_t = tt + np.timedelta64(cfg["max_min"], "m")
        exit_px, exit_t, outcome = None, None, None
        j = i
        while j < len(t_m1):
            if t_m1[j] >= end_t or (pd.Timestamp(t_m1[j]).weekday() == 4 and pd.Timestamp(t_m1[j]).hour >= 20):
                exit_px = o1[j] + (spread if direction < 0 else 0)
                exit_t, outcome = t_m1[j], "time"
                break
            if direction > 0:
                lo, hi = l1[j], h1_[j]           # cierre de compras al bid
                if lo <= sl:
                    exit_px, exit_t, outcome = min(sl, o1[j]), t_m1[j], "sl"
                    break
                if hi >= tp:
                    exit_px, exit_t, outcome = tp, t_m1[j], "tp"
                    break
                prog = hi - entry
                new_sl = sl
                if cfg["be"] and prog >= cfg["be_r"] * sl_d:
                    new_sl = max(new_sl, entry + cfg["be_lock"] * PIP)
                if cfg["trail"] and prog >= cfg["trail_start"] * sl_d:
                    new_sl = max(new_sl, hi - atr_v * cfg["trail_atr"])
                sl = new_sl
            else:
                lo, hi = l1[j] + spread, h1_[j] + spread   # cierre de ventas al ask
                if hi >= sl:
                    exit_px, exit_t, outcome = max(sl, o1[j] + spread), t_m1[j], "sl"
                    break
                if lo <= tp:
                    exit_px, exit_t, outcome = tp, t_m1[j], "tp"
                    break
                prog = entry - lo
                new_sl = sl
                if cfg["be"] and prog >= cfg["be_r"] * sl_d:
                    new_sl = min(new_sl, entry - cfg["be_lock"] * PIP)
                if cfg["trail"] and prog >= cfg["trail_start"] * sl_d:
                    new_sl = min(new_sl, lo + atr_v * cfg["trail_atr"])
                sl = new_sl
            j += 1
        if exit_px is None:
            break
        pnl_pips = direction * (exit_px - entry) / PIP - cfg["comm_pips"]
        R = pnl_pips / (sl_d / PIP)
        trades.append((t, direction, R, outcome, sl_d / PIP))
        n_day += 1
        if R < 0:
            consec += 1
            last_loss = pd.Timestamp(exit_t)
        else:
            consec = 0
        busy_until = exit_t + np.timedelta64(1, "m")
    return pd.DataFrame(trades, columns=["time", "dir", "R", "outcome", "sl_pips"])


def stats(tr):
    if len(tr) == 0:
        return dict(n=0, wr=0, tp=0, exp=0, pf=0, tpd=0, dd=0, totR=0)
    R = tr["R"].values
    days = tr["time"].dt.date.nunique()
    bdays = max(np.busday_count(tr["time"].min().date(), tr["time"].max().date()), 1)
    eq = np.cumsum(R)
    dd = np.max(np.maximum.accumulate(eq) - eq) if len(eq) else 0
    return dict(n=len(R), wr=np.mean(R > 0), tp=np.mean(tr["outcome"] == "tp"), exp=R.mean(),
                pf=R[R > 0].sum() / max(-R[R < 0].sum(), 1e-9), tpd=len(R) / bdays, days=days,
                dd=dd, totR=R.sum())


def fmt(name, s):
    return (f"{name:<34} n={s['n']:>5}  op/dia={s['tpd']:.2f}  WR={s['wr']:.1%}  TP={s['tp']:.1%}  "
            f"E={s['exp']:+.3f}R  PF={s['pf']:.2f}  totR={s['totR']:+7.1f}  DD={s['dd']:.1f}R")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", required=True)
    ap.add_argument("--years", default="2021-2025")
    ap.add_argument("--preset", default="base", choices=sorted(PRESETS))
    ap.add_argument("--export-r", help="Guardar los resultados en R (uno por linea) para montecarlo.py")
    a = ap.parse_args()
    y0, y1 = (int(x) for x in a.years.split("-"))
    cfg = {**BASE, **PRESETS[a.preset]}
    D = Data(load_m1(a.data, y0, y1), cfg["tf_min"])
    tr = run(D, cfg)
    print(fmt(a.preset, stats(tr)))
    for y, g in tr.groupby(tr["time"].dt.year):
        print(fmt(f"  {y}", stats(g)))
    if a.export_r:
        np.savetxt(a.export_r, tr["R"].values, fmt="%.4f")
        print(f"Resultados en R guardados en {a.export_r}")


if __name__ == "__main__":
    main()
