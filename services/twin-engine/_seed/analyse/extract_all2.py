import fitdecode, numpy as np, glob, os, json, sys, warnings
warnings.filterwarnings("ignore")
files = sorted(glob.glob("/home/claude/twin/acts/*.fit")); N=len(files)
def Cr(i): return 155.4*i**5 - 30.4*i**4 - 43.3*i**3 + 46.3*i**2 + 19.5*i + 3.6
CR0=3.6; FCAP=3.0; VMAX=7.0; BASE=50.0  # gradient baseline +/-50 m

durs = np.array([30,45,60,90,120,180,240,300,420,600,780,900,1200,1500,1800,2400,
                 3000,3600,4500,5400,7200,9000,10800,14400,18000,21600,28800])
best_vga=np.zeros(len(durs)); best_prov=[None]*len(durs); best_vraw=np.zeros(len(durs))
acts=[]; longest_dur=0

def parse(fp):
    t=[];dist=[];v=[];hr=[];alt=[];sport=None;sub=None;start=None
    with fitdecode.FitReader(fp) as fr:
        for fm in fr:
            if not isinstance(fm,fitdecode.FitDataMessage): continue
            if fm.name=="session":
                d={f.name:f.value for f in fm.fields}; sport=d.get("sport");sub=d.get("sub_sport");start=d.get("start_time")
            elif fm.name=="record":
                d={f.name:f.value for f in fm.fields}; ts=d.get("timestamp")
                if ts is None: continue
                t.append(ts); dist.append(d.get("distance",np.nan))
                v.append(d.get("enhanced_speed",d.get("speed",np.nan)))
                hr.append(d.get("heart_rate",np.nan)); alt.append(d.get("enhanced_altitude",d.get("altitude",np.nan)))
    return t,dist,v,hr,alt,sport,sub,start

for idx,fp in enumerate(files):
    try: t,dist,v,hr,alt,sport,sub,start=parse(fp)
    except Exception as e: acts.append(dict(idx=idx,err=str(e))); continue
    if len(t)<60 or sport!="running": acts.append(dict(idx=idx,sport=sport,skipped=True)); continue
    t0=t[0]; te=np.array([(x-t0).total_seconds() for x in t],float)
    dist=np.array(dist,float);v=np.array(v,float);hr=np.array(hr,float);alt=np.array(alt,float)
    if te[-1]<60: acts.append(dict(idx=idx,skipped=True)); continue
    tg=np.arange(0,te[-1]+1,1.0)
    dist_g=np.interp(tg,te,np.nan_to_num(dist,nan=0.0))
    medalt=np.nanmedian(alt); medalt=medalt if np.isfinite(medalt) else 0.0
    alt_g=np.interp(tg,te,np.nan_to_num(alt,nan=medalt))
    hr_g=np.interp(tg,te,hr)  # may contain nan
    # light alt smoothing (5 s) then distance-baseline gradient
    k=5;ker=np.ones(k)/k;altp=np.pad(alt_g,k,mode="reflect");alts=np.convolve(altp,ker,mode="same")[k:-k]
    # ensure dist_g strictly non-decreasing for searchsorted
    dmono=np.maximum.accumulate(dist_g)
    lo=np.searchsorted(dmono, dmono-BASE, side="left")
    hi=np.searchsorted(dmono, dmono+BASE, side="right")-1
    hi=np.clip(hi,0,len(dmono)-1); lo=np.clip(lo,0,len(dmono)-1)
    ddist=dmono[hi]-dmono[lo]
    dalt=alts[hi]-alts[lo]
    with np.errstate(all="ignore"):
        grad=np.where(ddist>5.0, dalt/ddist, 0.0)
    grad=np.clip(grad,-0.45,0.45)
    f=np.minimum(Cr(grad)/CR0, FCAP)
    dd=np.diff(dmono)
    f_mid=f[:-1]
    dga=np.concatenate([[0],np.cumsum(f_mid*dd)])
    dur=tg[-1]
    da=np.diff(alts); dp=da[da>0].sum(); dm=-da[da<0].sum()
    vga_act=np.full(len(durs),np.nan); vraw_act=np.full(len(durs),np.nan); n=len(tg)
    for j,T in enumerate(durs):
        T=int(T)
        if n<=T: break
        vga_act[j]=np.nanmax((dga[T:]-dga[:-T])/T)
        vraw_act[j]=np.nanmax((dmono[T:]-dmono[:-T])/T)
    for j in range(len(durs)):
        if np.isfinite(vga_act[j]) and vga_act[j]>best_vga[j]:
            best_vga[j]=vga_act[j]; best_prov[j]=(idx,str(start)[:10],round(float(vga_act[j]),3),round(float(vraw_act[j]),3))
        if np.isfinite(vraw_act[j]) and vraw_act[j]>best_vraw[j]: best_vraw[j]=vraw_act[j]
    decouple=np.nan
    if dur>=4500:
        sp=np.gradient(dga,tg); half=n//2
        with np.errstate(all="ignore"):
            e1=np.nanmean(sp[:half]/np.where(hr_g[:half]>60,hr_g[:half],np.nan))
            e2=np.nanmean(sp[half:]/np.where(hr_g[half:]>60,hr_g[half:],np.nan))
        if np.isfinite(e1) and e1>0 and np.isfinite(e2): decouple=(e1-e2)/e1*100
    avhr=np.nanmean(hr_g)
    acts.append(dict(idx=idx,date=str(start)[:10],sub=sub,dur_s=round(dur,0),
        dist_km=round(dmono[-1]/1000,3),ga_km=round(dga[-1]/1000,3),
        avg_hr=(None if not np.isfinite(avhr) else round(float(avhr),0)),
        dplus=round(float(dp),0),dminus=round(float(dm),0),
        decouple_pct=(None if not np.isfinite(decouple) else round(float(decouple),2))))
    if dur>longest_dur:
        longest_dur=dur
        np.savez("/home/claude/twin/work/longest_act.npz",tg=tg,dist=dmono,alt=alts,hr=hr_g,dga=dga,date=str(start)[:10])
    if idx%80==0: print("…%d/%d"%(idx,N)); sys.stdout.flush()

np.savez("/home/claude/twin/work/record_curve.npz",durs=durs,best_vga=best_vga,best_vraw=best_vraw)
json.dump(dict(best_prov=best_prov),open("/home/claude/twin/work/record_prov.json","w"))
json.dump(acts,open("/home/claude/twin/work/acts_summary.json","w"),ensure_ascii=False)
print("DONE usable:",len([a for a in acts if a.get('dur_s')]),"longest %.2f h"%(longest_dur/3600))
