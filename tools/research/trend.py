import pandas as pd, numpy as np, sys
h1 = pd.read_pickle(sys.argv[1]+"/h1_all.pkl")
P=0.0001; COST=1.0
def bt(px, pos, label):
    pos = pos.shift(1).fillna(0)          # se opera en la vela siguiente
    ret = pos*(px.diff()/P)
    trades = pos.diff().abs().fillna(0)
    net = ret - trades*COST
    yr = net.groupby(net.index.year).sum()
    tr, te = net[net.index<"2018"], net[net.index>="2018"]
    sh = lambda x: x.resample("1D").sum().mean()/x.resample("1D").sum().std()*np.sqrt(252)
    print(f"{label:<28} cambios/año={trades.sum()/16:5.0f}  TRAIN {tr.sum()/8:+7.0f} pips/año sh={sh(tr):+.2f} | TEST {te.sum()/8:+7.0f} pips/año sh={sh(te):+.2f} | años+ {(yr>0).sum()}/16")
for tf in ["4h","1D"]:
    b = h1.resample(tf).agg({"o":"first","h":"max","l":"min","c":"last"}).dropna()
    c=b.c
    for f,s in [(10,50),(20,100),(50,200)]:
        pos = np.sign(c.rolling(f).mean()-c.rolling(s).mean())
        bt(c,pos,f"{tf} SMA {f}/{s}")
    for n in [20,55]:
        hi=b.h.rolling(n).max().shift(1); lo=b.l.rolling(n).min().shift(1)
        pos=pd.Series(np.where(c>hi,1,np.where(c<lo,-1,np.nan)),index=c.index).ffill().fillna(0)
        bt(c,pos,f"{tf} Donchian {n}")
