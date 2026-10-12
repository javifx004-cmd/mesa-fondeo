import pandas as pd, numpy as np, sys
h1 = pd.read_pickle(sys.argv[1]+"/h1_all.pkl")
h1 = h1[h1.index.weekday<5]
r = (h1.c - h1.o)/0.0001  # pips por hora
df = pd.DataFrame({"r":r,"h":h1.index.hour,"y":h1.index.year})
t = df.pivot_table(index="h", columns="y", values="r", aggfunc="mean").round(2)
pd.set_option("display.width",250)
print("Media pips por hora (servidor GMT+2/+3) por año")
print(t)
tot = df.groupby("h").r.agg(["mean","std","count"])
tot["t"] = tot["mean"]/(tot["std"]/np.sqrt(tot["count"]))
tot["años+"] = (t>0).sum(axis=1)
print(tot.round(2))
