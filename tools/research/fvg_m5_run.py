import sys, numpy as np, pandas as pd
sys.path.insert(0,"/home/user/mesa-fondeo/tools")
import fvg_backtest as fb
D = fb.M1(pd.read_pickle(sys.argv[1])); H = fb.HTF(D, 5); split=pd.Timestamp("2018-01-01")
def ev(lbl, **kw):
    tr = fb.run_htf(H, **kw)
    a,b = fb.stats(tr[tr.time<split]), fb.stats(tr[tr.time>=split])
    print(f"{lbl:<52} TRAIN n={a['n']:>5} op/d={a['tpd']:.2f} WR={a['wr']:.1%} E={a['exp']:+.3f} | TEST n={b['n']:>5} op/d={b['tpd']:.2f} WR={b['wr']:.1%} E={b['exp']:+.3f}  SLmed={tr.sl_pips.median():.1f}p", flush=True)
    return tr
tr = ev("M5 FVG + EMA20, Londres+NY, RR2 (base)")
for y,g in tr.groupby(tr.time.dt.year):
    s=fb.stats(g); print(f"   {y}: n={s['n']:>4} WR={s['wr']:.1%} E={s['exp']:+.3f}R")
ev("  sin costes", spread=0, comm=0)
