import json, numpy as np
from numpy.polynomial import polynomial as P
rc=np.load("work/record_curve.npz"); durs=rc["durs"].astype(float); vga=rc["best_vga"]; vraw=rc["best_vraw"]
acts=json.load(open("work/acts_summary.json")); ok=[a for a in acts if a.get("dur_s")]

# ---------- A. CS / D' from clean (flat) medium efforts ----------
# Use record points where source effort was flat (GA~raw). Identify by |vga-vraw| small.
prov=json.load(open("work/record_prov.json"))["best_prov"]
pts=[]
for j,T in enumerate(durs):
    if prov[j] is None: continue
    vg=prov[j][2]; vr=prov[j][3] if len(prov[j])>3 else None
    if vr and vr>0 and (vg-vr)/vr < 0.10 and 600<=T<=5400:   # flat-ish, 10min-90min
        pts.append((T,vg))
pts=np.array(pts)
print("Clean flat points (T, vga) used for CS/D':")
for T,v in pts: print("   %5.0fs  %.3f m/s"%(T,v))
# linear fit d = CS*t + D'  with d=v*t
t=pts[:,0]; d=pts[:,0]*pts[:,1]
A=np.vstack([t,np.ones_like(t)]).T
coef,res,_,_=np.linalg.lstsq(A,d,rcond=None)
CS,Dp=coef
# uncertainty via bootstrap
rng=np.random.default_rng(0); CSs=[];Dps=[]
for _ in range(2000):
    ii=rng.integers(0,len(t),len(t))
    c,_,_,_=np.linalg.lstsq(np.vstack([t[ii],np.ones_like(t[ii])]).T, d[ii], rcond=None)
    CSs.append(c[0]);Dps.append(c[1])
CSs=np.array(CSs);Dps=np.array(Dps)
print("\nCS = %.3f m/s (%.2f km/h, %s/km)  ±%.3f"%(CS,CS*3.6,"%d:%02d"%(int(1000/CS//60),int(1000/CS%60)),CSs.std()))
print("D' = %.0f m  ±%.0f  (poorly constrained, model stretched beyond 2-15min)"%(Dp,Dps.std()))

# ---------- B. Power-law endurance exponent on long envelope ----------
mask=(durs>=1800)&(durs<=21600)&(vga>0)
lt=np.log(durs[mask]); lv=np.log(vga[mask])
b,loga=np.polyfit(lt,lv,1)   # log v = loga + b log t ; b = -alpha
alpha=-b; E=1/(1-alpha)
print("\nEndurance envelope (30min-6h): v ~ t^(-%.3f)  => Riegel E = %.3f"%(alpha,E))

# ---------- C. Ultra calibration: whole-race GA speed vs duration ----------
import datetime as dt
def hours(a): return a["dur_s"]/3600
# genuine committed ultras: exclude recon/hike (very low GA speed or extreme decouple)
genuine=[]
for a in ok:
    if a["dur_s"]<10*3600: continue
    gakmh=a["ga_km"]/hours(a)
    if gakmh<5.5: continue                 # exclude hikes/recons
    if a.get("decouple_pct") and a["decouple_pct"]>30: continue
    genuine.append((hours(a),gakmh,a["dplus"],a["dist_km"],a["date"],a.get("avg_hr")))
genuine=np.array([[g[0],g[1],g[2],g[3]] for g in genuine])
print("\nGenuine ultra calibration set:")
for g in sorted(genuine.tolist()):
    print("   %.1fh  GA %.2f km/h  D+%.0f  %.0fkm"%(g[0],g[1],g[2],g[3]))
# regress GA speed (km/h) on log(duration) and D+/km
H=genuine[:,0]; Vk=genuine[:,1]; Dpos=genuine[:,2]; Dist=genuine[:,3]
dpk=Dpos/Dist   # D+ per km
X=np.vstack([np.ones_like(H), np.log(H), dpk]).T
beta,_,_,_=np.linalg.lstsq(X,Vk,rcond=None)
pred=X@beta; resid=Vk-pred
sigma=resid.std(ddof=1)
print("\nGA race speed model: v[km/h] = %.3f %+.3f*ln(h) %+.4f*(D+/km)   resid sd=%.2f km/h"%(beta[0],beta[1],beta[2],sigma))

# ---------- 100M self-consistent prediction ----------
Deq=200.1          # km flat-equivalent (from course)
dpk_race=8874/167.2   # D+ per km of the 100M
def vrace(h): return beta[0]+beta[1]*np.log(h)+beta[2]*dpk_race
# fixed point: T = Deq / v(T)
T=25.0
for _ in range(100):
    v=vrace(T); Tn=Deq/v
    if abs(Tn-T)<1e-4: break
    T=0.5*T+0.5*Tn
print("\n=== 100M PREDICTION (point estimate) ===")
print("predicted whole-race GA speed: %.2f km/h (%.2f m/s)"%(v, v/3.6))
print("predicted moving-equivalent finish time: %.2f h"%T)
# Monte-Carlo on prediction uncertainty (resid + param)
rng=np.random.default_rng(1); Ts=[]
for _ in range(5000):
    vp=vrace(T)+rng.normal(0,sigma)
    Ts.append(Deq/max(vp,2.0))
Ts=np.array(Ts)
print("finish time 80%% interval: %.1f - %.1f h (median %.1f)"%(np.percentile(Ts,10),np.percentile(Ts,90),np.median(Ts)))

np.savez("work/twin_params.npz", CS=CS, CS_sd=CSs.std(), Dp=Dp, Dp_sd=Dps.std(),
         alpha=alpha, E=E, beta=beta, sigma=sigma, Deq=Deq, dpk_race=dpk_race,
         Tpred=T, vpred=v, Ts=Ts, genuine=genuine)
print("\nsaved twin params")
