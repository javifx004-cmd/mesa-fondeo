import sys; sys.path.insert(0,"/home/user/mesa-fondeo/tools")
import backtest as bt
m1 = bt.load_m1(sys.argv[1], 2010, 2025)
m1.to_pickle(sys.argv[2]+"/m1_all.pkl")
bt.resample(m1,"1h").to_pickle(sys.argv[2]+"/h1_all.pkl")
print(len(m1), m1.index.min(), m1.index.max())
