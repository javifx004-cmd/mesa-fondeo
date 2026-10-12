import pandas as pd, numpy as np, sys
h1 = pd.read_pickle(sys.argv[1]+"/h1_all.pkl"); h1 = h1[h1.index.weekday<5]
COST = 1.0  # pips (spread 0.3 + comision 0.7)
o = h1.o.unstack() if False else None
h1["d"]=h1.index.normalize(); h1["h"]=h1.index.hour
op = h1.pivot_table(index="d", columns="h", values="o")
def window(a,b,direction=-1):
    r = direction*(op[b]-op[a])/0.0001 - COST
    return r.dropna()
rows=[]
for a in range(11,15):
  for b in range(a+1,18):
    r=window(a,b)
    tr, te = r[r.index<"2018-01-01"], r[r.index>="2018-01-01"]
    rows.append((f"short {a}-{b}", len(tr), tr.mean(), tr.mean()/tr.std()*np.sqrt(250), te.mean(), te.mean()/te.std()*np.sqrt(250), (r.groupby(r.index.year).mean()>0).sum()))
df=pd.DataFrame(rows,columns=["ventana","n","train_pips","train_sharpe","test_pips","test_sharpe","años+"]).round(2)
print(df.sort_values("train_sharpe",ascending=False).head(12).to_string(index=False))
r=window(13,16); print("\nshort 13-16 por año (pips netos/op):"); print(r.groupby(r.index.year).agg(["mean","count","sum"]).round(1).T.to_string())
print("\npor dia de la semana:"); print(r.groupby(r.index.weekday).mean().round(2).to_string())
