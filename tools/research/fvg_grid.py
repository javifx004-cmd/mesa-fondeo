import sys, itertools, numpy as np, pandas as pd
sys.path.insert(0,"/home/user/mesa-fondeo/tools")
import fvg_backtest as fb
D = fb.M1(pd.read_pickle(sys.argv[1]))
split = pd.Timestamp("2018-01-01")
def ev(**kw):
    tr = fb.run(D, **kw)
    a, b = fb.stats(tr[tr.time < split]), fb.stats(tr[tr.time >= split])
    return a, b
a,b = ev(spread=0, comm=0); print(f"SIN COSTES base: train E={a['exp']:+.3f} WR={a['wr']:.1%} | test E={b['exp']:+.3f} WR={b['wr']:.1%}")
rows=[]
grid = dict(min_gap=[0.5,1.0,2.0], disp_atr=[0.0,1.5,2.5], trend=[0,50,200,800], entry_frac=[0.0,0.5],
            sl_mode=[0,1], rr=[1.0,2.0,3.0], sessions=[((9,12),(15,18)), ((9,19),), ((15,17),)])
keys=list(grid)
for vals in itertools.product(*grid.values()):
    kw=dict(zip(keys,vals))
    a,b=ev(**kw)
    rows.append({**{k:str(v) for k,v in kw.items()}, "tr_n":a["n"], "tr_opd":round(a["tpd"],2), "tr_wr":a["wr"], "tr_E":a["exp"], "te_n":b["n"], "te_wr":b["wr"], "te_E":b["exp"]})
df=pd.DataFrame(rows); df.to_csv(sys.argv[2], index=False)
pd.set_option("display.width",250); pd.set_option("display.max_columns",30)
print(f"\n{len(df)} variantes. Con E>0 en train: {(df.tr_E>0).sum()} | en test: {(df.te_E>0).sum()} | en ambos: {((df.tr_E>0)&(df.te_E>0)).sum()}")
print(df[df.tr_n>=300].sort_values("tr_E",ascending=False).head(15).round(3).to_string(index=False))
print("\nCorrelacion E train vs test:", round(df.tr_E.corr(df.te_E),2))
