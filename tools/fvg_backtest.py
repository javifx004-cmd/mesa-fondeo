#!/usr/bin/env python3
"""
Backtest de continuaciones con FVG (Fair Value Gap) en M1 para EURUSD.

Reglas (parametrizables):
  - FVG alcista en las velas (i-2, i-1, i): minimo de i > maximo de i-2, hueco >= min_gap pips.
    La vela central (desplazamiento) es alcista y su cuerpo >= disp_atr x ATR(14) M1.
  - Continuacion: solo a favor de la tendencia (cierre por encima de una EMA de M1, opcional).
  - Entrada: orden limitada en el borde del FVG (entry_frac=0) o en el 50% (entry_frac=0.5),
    valida valid_bars minutos. Se cancela si el precio llega al TP antes de rellenar.
  - SL: bajo la vela 1 del patron (sl_mode=0) o bajo el borde lejano del FVG (sl_mode=1).
  - TP: rr x riesgo. Salida por tiempo a max_hold minutos.
  - Espejo para ventas. Una operacion a la vez.

Ejecucion conservadora sobre velas M1 de BID:
  - Compra limitada se rellena si bid_low <= entrada - spread; en la vela de relleno solo se
    evalua el SL (nunca el TP). Si en una vela se tocan SL y TP, cuenta el SL.

Uso:
  python3 tools/fvg_backtest.py --pkl m1_all.pkl            # rejilla de variantes
"""
import argparse
import sys

import numpy as np
import pandas as pd
from numba import njit

PIP = 0.0001


@njit(cache=True)
def simulate(tmin, o, h, l, c, ema, atr, hour, wday, use_trend,
             min_gap, disp_atr, entry_frac, sl_mode, sl_buf, rr, valid_bars, max_hold,
             min_sl, max_sl, spread, comm, sess_mask, max_per_day, day_id):
    n = len(o)
    out_i = np.empty(n // 10 + 10, np.int64)
    out_dir = np.empty(n // 10 + 10, np.int8)
    out_r = np.empty(n // 10 + 10, np.float64)
    out_k = np.empty(n // 10 + 10, np.int8)      # 0 sl, 1 tp, 2 tiempo
    cnt = 0
    busy = 0
    cur_day = -1
    n_day = 0
    i = 2
    while i < n - 1:
        if i < busy:
            i += 1
            continue
        if day_id[i] != cur_day:
            cur_day = day_id[i]
            n_day = 0
        if n_day >= max_per_day or not sess_mask[hour[i]] or wday[i] >= 5 or tmin[i] - tmin[i - 2] != 2:
            i += 1
            continue
        d = 0
        a = atr[i]
        if l[i] - h[i - 2] >= min_gap and c[i - 1] - o[i - 1] >= disp_atr * a:
            if (not use_trend) or c[i] > ema[i]:
                d = 1
        elif h[i] - l[i - 2] <= -min_gap and o[i - 1] - c[i - 1] >= disp_atr * a:
            if (not use_trend) or c[i] < ema[i]:
                d = -1
        if d == 0:
            i += 1
            continue

        if d == 1:
            gap = l[i] - h[i - 2]
            entry = l[i] - entry_frac * gap                      # precio ask de compra
            sl = (l[i - 2] if sl_mode == 0 else h[i - 2]) - sl_buf
            risk = entry - sl
        else:
            gap = l[i - 2] - h[i]
            entry = h[i] + entry_frac * gap                      # precio bid de venta
            sl = (h[i - 2] if sl_mode == 0 else l[i - 2]) + sl_buf
            risk = sl - entry
        if risk < min_sl or risk > max_sl:
            i += 1
            continue
        tp = entry + d * rr * risk

        # Espera de relleno
        filled = -1
        j = i + 1
        last = min(n - 1, i + valid_bars)
        while j <= last:
            if tmin[j] - tmin[i] > valid_bars + 5:               # hueco de datos / fin de semana
                break
            if d == 1:
                if l[j] <= entry - spread:
                    filled = j
                    break
                if h[j] >= tp:
                    break
            else:
                if h[j] >= entry:
                    filled = j
                    break
                if l[j] + spread <= tp:
                    break
            j += 1
        if filled < 0:
            busy = j + 1
            i += 1
            continue

        # Gestion
        k = filled
        res_px = 0.0
        kind = 2
        end = min(n - 1, filled + max_hold)
        while True:
            if d == 1:
                if l[k] <= sl:
                    res_px = min(sl, o[k]) if k > filled else sl
                    kind = 0
                    break
                if k > filled and h[k] >= tp:
                    res_px = tp
                    kind = 1
                    break
            else:
                if h[k] + spread >= sl:
                    res_px = max(sl, o[k] + spread) if k > filled else sl
                    kind = 0
                    break
                if k > filled and l[k] + spread <= tp:
                    res_px = tp
                    kind = 1
                    break
            if k >= end or tmin[k + 1] - tmin[k] > 30:
                res_px = c[k] if d == 1 else c[k] + spread
                kind = 2
                break
            k += 1
        pnl = d * (res_px - entry) / 0.0001 - comm
        out_i[cnt] = i
        out_dir[cnt] = d
        out_r[cnt] = pnl / (risk / 0.0001)
        out_k[cnt] = kind
        cnt += 1
        n_day += 1
        busy = k + 1
        i = k + 1
    return out_i[:cnt], out_dir[:cnt], out_r[:cnt], out_k[:cnt]


class M1:
    def __init__(self, df):
        self.df = df
        self.idx = df.index
        self.o, self.h, self.l, self.c = (df[k].values.astype(np.float64) for k in ("o", "h", "l", "c"))
        self.tmin = (df.index.values.astype("datetime64[m]").astype(np.int64))
        self.hour = df.index.hour.values.astype(np.int64)
        self.wday = df.index.weekday.values.astype(np.int64)
        self.day_id = (self.tmin // 1440).astype(np.int64)
        pc = df["c"].shift()
        tr = pd.concat([df["h"] - df["l"], (df["h"] - pc).abs(), (df["l"] - pc).abs()], axis=1).max(axis=1)
        self.atr = tr.rolling(14).mean().fillna(0).values
        self.emas = {}

    def ema(self, n):
        if n not in self.emas:
            self.emas[n] = self.df["c"].ewm(span=n, adjust=False).mean().values
        return self.emas[n]


DEFAULT = dict(min_gap=0.5, disp_atr=1.0, trend=200, entry_frac=0.0, sl_mode=0, sl_buf=0.2, rr=2.0,
               valid_bars=30, max_hold=120, min_sl=2.0, max_sl=15.0, spread=0.3, comm=0.7,
               sessions=((9, 12), (15, 18)), max_per_day=10)


def run(D, **kw):
    p = {**DEFAULT, **kw}
    mask = np.zeros(24, np.bool_)
    for a, b in p["sessions"]:
        mask[a:b] = True
    use_trend = p["trend"] > 0
    ema = D.ema(p["trend"]) if use_trend else D.c
    ii, dd, rr, kk = simulate(D.tmin, D.o, D.h, D.l, D.c, ema, D.atr, D.hour, D.wday, use_trend,
                              p["min_gap"] * PIP, p["disp_atr"], p["entry_frac"], p["sl_mode"],
                              p["sl_buf"] * PIP, p["rr"], p["valid_bars"], p["max_hold"],
                              p["min_sl"] * PIP, p["max_sl"] * PIP, p["spread"] * PIP, p["comm"],
                              mask, p["max_per_day"], D.day_id)
    return pd.DataFrame({"time": D.idx[ii], "dir": dd, "R": rr, "kind": kk})


def stats(tr):
    if len(tr) == 0:
        return dict(n=0, wr=0, exp=0, pf=0, tpd=0)
    R = tr["R"].values
    bdays = max(np.busday_count(tr["time"].min().date(), tr["time"].max().date()), 1)
    return dict(n=len(R), wr=float(np.mean(R > 0)), exp=float(R.mean()),
                pf=float(R[R > 0].sum() / max(-R[R < 0].sum(), 1e-9)), tpd=len(R) / bdays)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pkl", required=True, help="Pickle M1 (tools/research/prep.py)")
    ap.add_argument("--split", default="2018-01-01")
    a = ap.parse_args()
    D = M1(pd.read_pickle(a.pkl))
    split = pd.Timestamp(a.split)
    tr = run(D)
    for y, g in tr.groupby(tr.time.dt.year):
        s = stats(g)
        print(f"{y}: n={s['n']:>5} op/dia={s['tpd']:.2f} WR={s['wr']:.1%} E={s['exp']:+.3f}R PF={s['pf']:.2f}")
    s1, s2 = stats(tr[tr.time < split]), stats(tr[tr.time >= split])
    print(f"TRAIN E={s1['exp']:+.3f}R WR={s1['wr']:.1%} | TEST E={s2['exp']:+.3f}R WR={s2['wr']:.1%}")


if __name__ == "__main__":
    sys.exit(main())
