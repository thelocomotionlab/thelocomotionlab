import numpy as np, json, math, datetime as dt

# ---------- Sun times (NOAA approximation) ----------
def sun_times(y,m,d,lat,lon,tz):
    N=dt.date(y,m,d).timetuple().tm_yday
    g=2*math.pi/365*(N-1+0.5)
    eot=229.18*(0.000075+0.001868*math.cos(g)-0.032077*math.sin(g)-0.014615*math.cos(2*g)-0.040849*math.sin(2*g))
    decl=(0.006918-0.399912*math.cos(g)+0.070257*math.sin(g)-0.006758*math.cos(2*g)+0.000907*math.sin(2*g)-0.002697*math.cos(3*g)+0.00148*math.sin(3*g))
    latr=math.radians(lat); zen=math.radians(90.833)
    cosH=(math.cos(zen)-math.sin(latr)*math.sin(decl))/(math.cos(latr)*math.cos(decl))
    H=math.degrees(math.acos(cosH))
    sr=720-4*(lon+H)-eot+tz*60
    ss=720-4*(lon-H)-eot+tz*60
    return sr,ss
LAT,LON,TZ=43.703,7.266,2
for d in (25,26,27):
    sr,ss=sun_times(2026,9,d,LAT,LON,TZ)
    print("2026-09-%02d  sunrise %02d:%02d  sunset %02d:%02d"%(d,int(sr//60),int(sr%60),int(ss//60),int(ss%60)))

# ---------- Load twin + segments ----------
tp=np.load("twin_params.npz",allow_pickle=True)
beta=tp["beta"]; sigma=float(tp["sigma"]); CS=float(tp["CS"]); E=float(tp["E"])
Deq_tot=float(tp["Deq"]); dpk_race=float(tp["dpk_race"]); Tpred=float(tp["Tpred"]); vpred=float(tp["vpred"])
genuine=tp["genuine"]   # cols: hours, v_ga_kmh, dplus, dist_km
seg=json.load(open("segments.json"))

# ---------- LOO cross-validation on genuine ultras ----------
def solve_T(Deq, dpk, b):
    T=20.0
    for _ in range(200):
        v=b[0]+b[1]*math.log(T)+b[2]*dpk
        Tn=Deq/max(v,2.0)
        if abs(Tn-T)<1e-5: break
        T=0.5*T+0.5*Tn
    return T, b[0]+b[1]*math.log(T)+b[2]*dpk
print("\n=== LEAVE-ONE-OUT CROSS-VALIDATION (genuine ultras) ===")
H=genuine[:,0]; V=genuine[:,1]; DP=genuine[:,2]; DI=genuine[:,3]
dpk=DP/DI; Deq_each=V*H   # GA distance per race
errs=[]
print("%-6s %7s %9s %9s %7s"%("race","dist_km","T_actual","T_pred_LOO","err%"))
for i in range(len(H)):
    keep=[j for j in range(len(H)) if j!=i]
    Xs=np.vstack([np.ones(len(keep)), np.log(H[keep]), dpk[keep]]).T
    bi,_,_,_=np.linalg.lstsq(Xs, V[keep], rcond=None)
    Tp,_=solve_T(Deq_each[i], dpk[i], bi)
    e=100*(Tp-H[i])/H[i]; errs.append(e)
    print("%-6d %7.1f %8.2fh %8.2fh %+6.1f"%(i, DI[i], H[i], Tp, e))
errs=np.array(errs)
print("LOO mean |err| = %.1f%%   RMSE = %.1f%%   (n=%d, 3 params)"%(np.mean(np.abs(errs)), np.sqrt(np.mean(errs**2)), len(H)))

# ---------- Per-segment pacing plan ----------
# fade shape on GA speed vs cumulative-Deq progress (start faster, end slower)
deq=np.array([s["deq"] for s in seg]); horiz=np.array([s["off_len"] for s in seg])
cum_deq=np.cumsum(deq); mid=(cum_deq-deq/2)/cum_deq[-1]   # midpoint fraction by Deq
DELTA=0.085   # +/-8.5% -> end GA speed ~ -15.7% vs start (controlled positive split)
g=1.0+DELTA*(0.5-mid)*2.0
# stops: 5 min each AS, +10 min extra at 3 major bases (km50.1=seg5 end, km93.8=seg9 end, km128.3=seg12 end)
stops_min=np.full(len(seg),5.0)
for k in [4,8,11]: stops_min[k]+=10.0   # segments whose END is a major base
stops_min[-1]=0.0   # no stop at finish
T_stops_h=stops_min.sum()/60.0
T_move=Tpred - T_stops_h     # moving time so clock total = Tpred (calibrated on elapsed)
# scale GA speeds so sum(deq/v)=T_move
S=(np.sum(deq/g))/T_move
v_ga=S*g                      # km/h grade-adjusted target per segment
t_move_h=deq/v_ga             # moving hours per segment
real_speed=horiz/t_move_h     # real km/h on the ground
pace_min_km=60.0/real_speed   # min/km real

# cumulative clock time from Fri 25 Sep 13:00
start=dt.datetime(2026,9,25,13,0)
def sun_for(d): 
    sr,ss=sun_times(2026,9,d.day if d.month==9 else 26,LAT,LON,TZ); return sr,ss
rows=[]; clock=start; cum_move=0.0
for i,s in enumerate(seg):
    cum_move+=t_move_h[i]
    arr_move=clock+dt.timedelta(hours=t_move_h[i])
    # arrival clock = previous clock + moving + this segment's stop (stop taken AT arrival AS)
    arr=arr_move+dt.timedelta(minutes=stops_min[i])
    # day/night at arrival
    sr,ss=sun_times(2026,9,arr.day if arr.month==9 else (26 if arr.day<25 else arr.day),LAT,LON,TZ)
    minutes=arr.hour*60+arr.minute
    # handle day rollover for sun: use arr's date
    sr2,ss2=sun_times(2026,9,arr.day,LAT,LON,TZ)
    night = (minutes<sr2) or (minutes>ss2)
    rows.append(dict(seg=s["seg"], to=s["to"], off1=s["off1"], off_len=round(horiz[i],1),
        dp=round(s["dp"]), dm=round(s["dm"]), deq=round(deq[i],1), mg=round(s["mg"],1),
        e1=round(s["e1"]), v_ga=round(v_ga[i],2), pace=pace_min_km[i],
        t_move_min=round(t_move_h[i]*60,1), stop_min=round(stops_min[i],0),
        cum_move_h=round(cum_move,2), arr_clock=arr.strftime("%a %H:%M"), night=night))
    clock=arr
T_clock=(clock-start).total_seconds()/3600
print("\n=== PER-SEGMENT PACING PLAN ===")
print("%-2s %-20s %5s %5s %5s %6s %7s %6s %7s %5s %-11s %s"%(
    "#","to","km","D+","Deq","GA","pace","t_mov","cum_h","stop","arrivée","nuit"))
for r in rows:
    pm="%d:%02d"%(int(r["pace"]//1),int((r["pace"]%1)*60))
    print("%-2d %-20s %5.1f %5d %5.1f %6.2f %6s/k %5.0fm %6.2f %4.0f %-11s %s"%(
        r["seg"], r["to"][:20], r["off_len"], r["dp"], r["deq"], r["v_ga"], pm,
        r["t_move_min"], r["cum_move_h"], r["stop_min"], r["arr_clock"], "🌙" if r["night"] else ""))
print("TOTAL moving %.2f h + stops %.2f h = clock %.2f h"%(T_move, T_stops_h, T_clock))
print("check: avg GA speed (all-in) = %.2f km/h"%(Deq_tot/Tpred))

# ---------- Monte-Carlo arrival bands ----------
Ts=tp["Ts"]   # 5000 finish times (elapsed)
mult=Ts/Tpred
cum_move_arr=np.array([r["cum_move_h"] for r in rows])
# clock arrival hours after start, including stops up to each AS
cum_stop=np.cumsum([r["stop_min"] for r in rows])/60.0
cum_clock=cum_move_arr+cum_stop
bands=[]
for i in range(len(rows)):
    arr_dist=cum_clock[i]*mult   # scale whole profile by athlete-speed multiplier
    lo,hi=np.percentile(arr_dist,10),np.percentile(arr_dist,90)
    bands.append((lo,hi))
    rows[i]["lo_h"]=round(float(lo),2); rows[i]["hi_h"]=round(float(hi),2)
print("\n=== arrival uncertainty (cumulative clock h, 80%% band) ===")
for i,r in enumerate(rows):
    print("  %-20s  %.1f h  [%.1f - %.1f]"%(r["to"][:20], cum_clock[i], r["lo_h"], r["hi_h"]))

json.dump(dict(rows=rows, T_move=T_move, T_stops=T_stops_h, T_clock=T_clock,
    Tpred=Tpred, vpred=vpred, CS=CS, E=E, Deq_tot=Deq_tot, dpk_race=dpk_race,
    loo_mae=float(np.mean(np.abs(errs))), loo_rmse=float(np.sqrt(np.mean(errs**2))),
    sun={"sunrise_25":"07:%02d"%int(sun_times(2026,9,25,LAT,LON,TZ)[0]%60),
         "sunset_25":"%02d:%02d"%(int(sun_times(2026,9,25,LAT,LON,TZ)[1]//60),int(sun_times(2026,9,25,LAT,LON,TZ)[1]%60))}),
    open("plan.json","w"), ensure_ascii=False, indent=1)
np.savez("plan_arrays.npz", v_ga=v_ga, pace=pace_min_km, deq=deq, horiz=horiz,
    cum_clock=cum_clock, mult=mult, t_move_h=t_move_h, g=g, mid=mid)
print("\nsaved plan.json + plan_arrays.npz")
