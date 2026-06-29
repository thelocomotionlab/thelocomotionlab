import numpy as np
d = np.load("/home/claude/twin/work/gpx_raw.npz")
lat, lon, ele, dist, seg = d["lat"], d["lon"], d["ele"], d["dist"], d["seg"]
L = dist[-1]                      # horizontal length (m)
dele_raw = np.diff(ele)
seg3d = np.sqrt(seg**2 + dele_raw**2)
dist3d = np.concatenate([[0], np.cumsum(seg3d)])
L3d = dist3d[-1]

OFFICIAL_FINISH_KM = 167.2        # roadbook total (user's last aid point)
scale = OFFICIAL_FINISH_KM*1000 / L3d   # map 3D arc length -> official km
def km_off(idx_dist3d):           # official km for a given 3D distance (m)
    return idx_dist3d*scale/1000

# --- uniform 5 m grid + 150 m smoothing on elevation ---
step = 5.0
xg = np.arange(0, L, step)
eg = np.interp(xg, dist, ele)
win = 150.0; k = int(round(win/step))
pad = k
egp = np.pad(eg, pad, mode="reflect")
kernel = np.ones(k)/k
es = np.convolve(egp, kernel, mode="same")[pad:-pad]   # smoothed elevation on grid
# gradient on smoothed profile
grad = np.gradient(es, step)                            # dEle/dDist (fraction)
grad = np.clip(grad, -0.45, 0.45)                       # Minetti validity

# Minetti cost and grade factor
def Cr(i): return 155.4*i**5 - 30.4*i**4 - 43.3*i**3 + 46.3*i**2 + 19.5*i + 3.6
f = Cr(grad)/3.6
Deq_grid = np.cumsum(f*step)                            # cumulative equivalent-flat distance (m)

# 3D distance on the grid (for official km mapping): interp dist3d at xg
dist3d_grid = np.interp(xg, dist, dist3d)
off_km_grid = dist3d_grid*scale/1000                    # official km at each grid point

# D+/D- on grid
deg = np.diff(es)
print("Smoothed total D+ %.0f  D- %.0f  net %.0f" % (deg[deg>0].sum(), -deg[deg<0].sum(), es[-1]-es[0]))
print("Horiz L=%.2f km  3D L=%.2f km  scaled finish=%.2f km" % (L/1000, L3d/1000, off_km_grid[-1]))

# --- segment by aid stations (official km) ---
aid = [0.0, 8.1,16.5,28.9,38.0,50.1,63.7,68.4,83.5,93.8,109.8,121.8,128.3,140.4,147.4,156.5,167.2]
names = ["Auron (départ)","AS1 km8.1","AS2 km16.5","AS3 km28.9","AS4 km38","AS5 km50.1",
         "AS6 km63.7","AS7 km68.4","AS8 km83.5","AS9 km93.8","AS10 km109.8","AS11 km121.8",
         "AS12 km128.3","AS13 km140.4","AS14 km147.4","AS15 km156.5","Arrivée Nice km167.2"]

def grid_idx_for_offkm(t):
    return int(np.argmin(np.abs(off_km_grid - t)))

rows=[]
for s in range(len(aid)-1):
    i0, i1 = grid_idx_for_offkm(aid[s]), grid_idx_for_offkm(aid[s+1])
    sl = slice(i0, i1+1)
    seg_e = es[sl]; seg_grad = grad[i0:i1]
    de = np.diff(seg_e)
    dp = de[de>0].sum(); dm = -de[de<0].sum()
    horiz = (xg[i1]-xg[i0])/1000
    off_len = aid[s+1]-aid[s]
    deq = (Deq_grid[i1]-Deq_grid[i0])/1000
    # representative gradient stats
    mg = np.mean(seg_grad)*100
    rows.append(dict(seg=s+1, frm=names[s], to=names[s+1], off0=aid[s], off1=aid[s+1],
                     off_len=off_len, horiz=horiz, dp=dp, dm=dm, deq=deq,
                     emin=seg_e.min(), emax=seg_e.max(), e0=seg_e[0], e1=seg_e[-1], mg=mg))

print("\n%-3s %-22s %7s %7s %7s %7s %7s %7s %6s" % ("Seg","Vers","off_km","horiz","D+","D-","Deq_km","meanG%","alt_fin"))
tot_dp=tot_dm=tot_deq=0
for r in rows:
    print("%-3d %-22s %6.1f %7.2f %7.0f %7.0f %7.2f %6.1f %6.0f" %
          (r["seg"], r["to"][:22], r["off_len"], r["horiz"], r["dp"], r["dm"], r["deq"], r["mg"], r["e1"]))
    tot_dp+=r["dp"]; tot_dm+=r["dm"]; tot_deq+=r["deq"]
print("TOTAL off=%.1f km  D+=%.0f  D-=%.0f  Deq=%.1f km" % (aid[-1], tot_dp, tot_dm, tot_deq))

np.savez("/home/claude/twin/work/course_proc.npz",
         xg=xg, es=es, grad=grad, f=f, Deq_grid=Deq_grid, off_km_grid=off_km_grid,
         aid=np.array(aid))
import json
json.dump(rows, open("/home/claude/twin/work/segments.json","w"), ensure_ascii=False, indent=1)
print("saved")
