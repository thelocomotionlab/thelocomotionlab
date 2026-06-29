import numpy as np, json, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import MultipleLocator
import matplotlib.font_manager as fm

# Locomotion Lab palette
SAGE="#8CB9BD"; GOLD="#EFB159"; GOLDINK="#D89A2E"; TERRA="#B67352"
TEXT="#333333"; BG="#FEFBF6"; GRID="#E7E0D4"; DEEPGRID="#D8CFBE"; GREEN="#3F8F5B"
# try Ubuntu font from template
try:
    for f in ["Ubuntu-R.ttf","Ubuntu-M.ttf","Ubuntu-B.ttf"]:
        fm.fontManager.addfont("/home/claude/twin/template/template_report/fonts/"+f)
    plt.rcParams["font.family"]="Ubuntu"
except Exception as e:
    print("font fallback:",e)
plt.rcParams.update({"font.size":10,"text.color":TEXT,"axes.labelcolor":TEXT,
    "xtick.color":TEXT,"ytick.color":TEXT,"axes.edgecolor":"#B9B2A4",
    "figure.facecolor":BG,"axes.facecolor":BG,"savefig.facecolor":BG,
    "axes.linewidth":0.8,"axes.grid":True,"grid.color":GRID,"grid.linewidth":0.7})

course=np.load("course_proc.npz"); xg=course["xg"]; es=course["es"]; off=course["off_km_grid"]; aid=course["aid"]
seg=json.load(open("segments.json")); plan=json.load(open("plan.json")); rows=plan["rows"]
pa=np.load("plan_arrays.npz"); tp=np.load("twin_params.npz",allow_pickle=True)

SUNSET=19.4; SUNRISE=7.33   # h of day
def night_spans_on_distance():
    # map clock arrival to distance to shade night; approximate using cum_clock
    return None

# ---------- FIG 1: elevation profile ----------
fig,ax=plt.subplots(figsize=(7.4,3.3))
ax.fill_between(off, es, es.min()-50, color=SAGE, alpha=0.30, lw=0)
ax.plot(off, es, color=TERRA, lw=1.3)
for a in aid[1:-1]:
    ax.axvline(a, color=DEEPGRID, lw=0.7, ls=(0,(3,3)), zorder=0)
ax.scatter(aid[1:-1], np.interp(aid[1:-1],off,es), s=14, color=GOLDINK, zorder=5, clip_on=False)
# label key points
ax.annotate("Rabuons ~2520 m\n(pt culminant)", xy=(28.9,2520), xytext=(40,2560),
    fontsize=8, color=TEXT, ha="left", arrowprops=dict(arrowstyle="-",color="#999",lw=0.7))
ax.annotate("Auron 1591 m", xy=(0,1591), xytext=(2,1180), fontsize=8, color=TEXT)
ax.annotate("Nice 6 m", xy=(167,6), xytext=(150,260), fontsize=8, color=TEXT, ha="left")
ax.set_xlim(0,168); ax.set_ylim(es.min()-50,2820)
ax.set_xlabel("distance officielle (km)"); ax.set_ylabel("altitude (m)")
ax.xaxis.set_major_locator(MultipleLocator(20)); ax.yaxis.set_major_locator(MultipleLocator(500))
ax.set_title("Profil altimétrique — Nice by UTMB 100M (165 km, 8 874 m D+ lissé)", fontsize=10.5, color=TERRA, weight="bold", loc="left")
fig.tight_layout(); fig.savefig("fig/profil.png", dpi=170); plt.close(fig)

# ---------- FIG 2: grade-adjusted record curve + CS fit ----------
rc=np.load("record_curve.npz"); durs=rc["durs"].astype(float); vga=rc["best_vga"]
prov=json.load(open("record_prov.json"))["best_prov"]
flat=[]; cont=[]
for j,T in enumerate(durs):
    if prov[j] is None or vga[j]<=0: continue
    vr=prov[j][3] if len(prov[j])>3 else 0
    if 600<=T<=5400 and vr>0 and (prov[j][2]-vr)/vr<0.10: flat.append((T,vga[j]))
    else: cont.append((T,vga[j]))
flat=np.array(flat); cont=np.array(cont)
CS=float(tp["CS"]); Dp=float(tp["Dp"]); alpha=float(tp["alpha"])
fig,ax=plt.subplots(figsize=(7.4,3.5))
ax.scatter(cont[:,0]/60, cont[:,1]*3.6, s=22, color="#C9BCA6", label="courbe record brute (ajustée pente)", zorder=3)
ax.scatter(flat[:,0]/60, flat[:,1]*3.6, s=34, color=TERRA, label="efforts plats propres (servent à la VC)", zorder=4)
tt=np.linspace(600,21600,200)
# CS model speed = (CS*t + D')/t
ax.plot(tt/60, (CS*tt+Dp)/tt*3.6, color=GOLDINK, lw=1.6, label="modèle vitesse critique (VC=%.2f km/h)"%(CS*3.6))
ax.axhline(CS*3.6, color=SAGE, lw=1.2, ls=(0,(4,3)), label="VC = %.2f km/h"%(CS*3.6))
# ultra whole-race points
g=tp["genuine"]; ax.scatter(g[:,0]*60, g[:,1], s=30, marker="D", color=GREEN, label="vrais ultras (vitesse moy. ajustée)", zorder=4)
ax.set_xscale("log"); ax.set_xlabel("durée (min, échelle log)"); ax.set_ylabel("vitesse ajustée (km/h)")
ax.set_xlim(8,1500); ax.set_ylim(5,16)
ax.legend(fontsize=7.4, framealpha=0.9, edgecolor=GRID, loc="upper right")
ax.set_title("Courbe record ajustée à la pente et vitesse critique", fontsize=10.5, color=TERRA, weight="bold", loc="left")
fig.tight_layout(); fig.savefig("fig/record.png", dpi=170); plt.close(fig)

# ---------- FIG 3: per-segment demand (D+ and Deq) ----------
segn=[r["seg"] for r in rows]; dp=[r["dp"] for r in rows]; deqs=[r["deq"] for r in rows]; lens=[r["off_len"] for r in rows]
fig,(ax1,ax2)=plt.subplots(2,1,figsize=(7.4,4.0),sharex=True)
ax1.bar(segn, dp, color=TERRA, alpha=0.85, width=0.7)
ax1.set_ylabel("D+ (m)"); ax1.set_title("Demande par segment : dénivelé positif", fontsize=10, color=TERRA, weight="bold", loc="left")
ax1.grid(axis="x",alpha=0)
ax2.bar(segn, deqs, color=SAGE, alpha=0.9, width=0.7, label="distance équiv. plat (Deq)")
ax2.bar(segn, lens, color=GOLD, alpha=0.5, width=0.4, label="distance réelle")
ax2.set_ylabel("km"); ax2.set_xlabel("segment"); ax2.legend(fontsize=8, edgecolor=GRID)
ax2.set_title("Distance réelle vs équivalent plat", fontsize=10, color=TERRA, weight="bold", loc="left")
ax2.grid(axis="x",alpha=0); ax2.xaxis.set_major_locator(MultipleLocator(1))
fig.tight_layout(); fig.savefig("fig/demande.png", dpi=170); plt.close(fig)

# ---------- FIG 4: pacing chart ----------
vgas=[r["v_ga"] for r in rows]; paces=[r["pace"] for r in rows]
fig,ax=plt.subplots(figsize=(7.4,3.4))
xc=np.array(segn)
ax.plot(xc, vgas, "-o", color=TERRA, lw=1.6, ms=4, label="vitesse ajustée cible (km/h)")
ax.set_ylabel("vitesse ajustée (km/h)", color=TERRA); ax.tick_params(axis="y",labelcolor=TERRA)
ax.set_ylim(6,8); ax.set_xlabel("segment"); ax.xaxis.set_major_locator(MultipleLocator(1))
ax.axhline(CS*3.6, color=SAGE, lw=1.0, ls=(0,(4,3)))
ax.text(1, CS*3.6-0.18, "VC = %.1f km/h (cible ≈ %d%% VC)"%(CS*3.6, 100*np.mean(vgas)/(CS*3.6)), fontsize=7.6, color=SAGE)
ax2=ax.twinx()
ax2.bar(xc, paces, color=GOLD, alpha=0.30, width=0.6, label="allure réelle (min/km)")
ax2.set_ylabel("allure réelle (min/km)", color=GOLDINK); ax2.tick_params(axis="y",labelcolor=GOLDINK)
ax2.set_ylim(0,20); ax2.grid(False); ax2.invert_yaxis()
ax.set_title("Plan de pacing : allure ajustée (fade contrôlé) + allure réelle terrain", fontsize=10, color=TERRA, weight="bold", loc="left")
ax.legend(fontsize=7.6, loc="upper right", edgecolor=GRID)
fig.subplots_adjust(left=0.085,right=0.915,bottom=0.16,top=0.9); fig.savefig("fig/pacing.png", dpi=170); plt.close(fig)

# ---------- FIG 5: cumulative arrival with MC band + night ----------
cum=pa["cum_clock"]; mult=pa["mult"]
offs=[r["off1"] for r in rows]
lo=[r["lo_h"] for r in rows]; hi=[r["hi_h"] for r in rows]
fig,ax=plt.subplots(figsize=(7.4,3.4))
# night shading in time-of-day: between sunset 19.4 (Fri =6.4h race) and sunrise 7.33 next day (=18.33h race)
nstart=SUNSET-13.0; nend=(24-13.0)+SUNRISE  # race-hours
ax.axhspan(nstart, nend, color="#3b4a66", alpha=0.10, lw=0)
ax.text(3, (nstart+nend)/2, "nuit 1 (vend.-sam.)", fontsize=7.6, color="#43506b", rotation=90, va="center")
ax.fill_between(offs, lo, hi, color=SAGE, alpha=0.30, lw=0, label="intervalle 80 %")
ax.plot(offs, cum, "-o", color=TERRA, lw=1.6, ms=3.5, label="temps cumulé (médian)")
for i,r in enumerate(rows):
    if r["off1"] in (50.1,93.8,128.3):
        ax.annotate(r["arr_clock"], xy=(r["off1"],cum[i]), fontsize=7, color=TEXT, xytext=(0,6), textcoords="offset points", ha="center")
ax.set_xlabel("distance officielle (km)"); ax.set_ylabel("temps depuis le départ (h)")
ax.set_xlim(0,168); ax.set_ylim(0,33); ax.xaxis.set_major_locator(MultipleLocator(20))
ax.legend(fontsize=8, loc="upper left", edgecolor=GRID)
ax.set_title("Temps de passage cumulé et incertitude (départ ven. 13:00)", fontsize=10, color=TERRA, weight="bold", loc="left")
fig.tight_layout(); fig.savefig("fig/cumul.png", dpi=170); plt.close(fig)

# ---------- FIG 6: cross-validation predicted vs actual ----------
# recompute LOO quickly
beta=tp["beta"]; H=g[:,0]; V=g[:,1]; DP=g[:,2]; DI=g[:,3]; dpk=DP/DI; Deq_each=V*H
def solve_T(Deq,dpk,b):
    T=20.0
    for _ in range(200):
        v=b[0]+b[1]*np.log(T)+b[2]*dpk; Tn=Deq/max(v,2.0)
        if abs(Tn-T)<1e-5: break
        T=0.5*T+0.5*Tn
    return T
preds=[]
for i in range(len(H)):
    keep=[j for j in range(len(H)) if j!=i]
    Xs=np.vstack([np.ones(len(keep)),np.log(H[keep]),dpk[keep]]).T
    bi,_,_,_=np.linalg.lstsq(Xs,V[keep],rcond=None)
    preds.append(solve_T(Deq_each[i],dpk[i],bi))
preds=np.array(preds)
fig,ax=plt.subplots(figsize=(4.6,4.2))
ax.plot([9,23],[9,23], color=DEEPGRID, lw=1.0, ls=(0,(4,3)))
for frac in (0.05,):
    ax.fill_between([9,23],[9*(1-frac),23*(1-frac)],[9*(1+frac),23*(1+frac)], color=SAGE, alpha=0.18, lw=0)
ax.scatter(H, preds, s=42, color=TERRA, zorder=4)
ax.set_xlabel("temps réel (h)"); ax.set_ylabel("temps prédit, hors-échantillon (h)")
ax.set_xlim(9,23); ax.set_ylim(9,23); ax.set_aspect("equal")
ax.text(10,21.5,"bande ±5 %", color=SAGE, fontsize=8)
ax.set_title("Validation croisée\n(leave-one-out, n=8)", fontsize=10, color=TERRA, weight="bold", loc="left")
fig.tight_layout(); fig.savefig("fig/validation.png", dpi=170); plt.close(fig)

print("figures written:")
import os
for f in sorted(os.listdir("fig")): print("  fig/"+f, os.path.getsize("fig/"+f), "bytes")
