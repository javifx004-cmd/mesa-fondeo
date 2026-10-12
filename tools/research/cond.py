import pandas as pd, numpy as np, sys
h1 = pd.read_pickle(sys.argv[1]+"/h1_all.pkl"); h1 = h1[h1.index.weekday<5]
h1["d"]=h1.index.normalize(); h1["h"]=h1.index.hour
op = h1.pivot_table(index="d", columns="h", values="o")
cl = h1.pivot_table(index="d", columns="h", values="c")
P=0.0001; COST=1.0
y = -(op[16]-op[13])/P - COST
feat = pd.DataFrame({
 "morning_9_13": (op[13]-op[9])/P,
 "asia_0_9": (op[9]-op[0])/P,
 "prevday": ((op[0]-op[0].shift(1))/P),
 "dow": op.index.weekday,
})
feat["y"]=y
feat=feat.dropna()
tr=feat[feat.index<"2018-01-01"]; te=feat[feat.index>="2018-01-01"]
def show(name, mtr, mte):
    a,b=tr.y[mtr],te.y[mte]
    print(f"{name:<38} TRAIN n={len(a):>4} {a.mean():+.2f} pips sh={a.mean()/a.std()*np.sqrt(250):+.2f} | TEST n={len(b):>4} {b.mean():+.2f} pips sh={b.mean()/b.std()*np.sqrt(250):+.2f}")
show("todos", tr.y==tr.y, te.y==te.y)
for col in ["morning_9_13","asia_0_9","prevday"]:
    for q in [(0,0.33),(0.33,0.66),(0.66,1.0)]:
        lo,hi=tr[col].quantile(q[0]),tr[col].quantile(q[1])
        show(f"{col} tercil {q}", (tr[col]>=lo)&(tr[col]<=hi), (te[col]>=lo)&(te[col]<=hi))
    show(f"{col} > 0", tr[col]>0, te[col]>0)
    show(f"{col} < 0", tr[col]<0, te[col]<0)
