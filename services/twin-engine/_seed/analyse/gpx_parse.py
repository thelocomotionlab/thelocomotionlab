import xml.etree.ElementTree as ET
import numpy as np

GPX = "/mnt/user-data/uploads/Nice-Azur-by-UTMB-100M.gpx"
ns = {"g": "http://www.topografix.com/GPX/1/1"}
tree = ET.parse(GPX)
root = tree.getroot()
pts = []
for trkpt in root.iter("{http://www.topografix.com/GPX/1/1}trkpt"):
    lat = float(trkpt.attrib["lat"]); lon = float(trkpt.attrib["lon"])
    ele_el = trkpt.find("g:ele", ns)
    ele = float(ele_el.text) if ele_el is not None else np.nan
    pts.append((lat, lon, ele))
pts = np.array(pts)
lat, lon, ele = pts[:,0], pts[:,1], pts[:,2]
print("n points:", len(pts))

# Haversine cumulative distance
R = 6371000.0
phi = np.radians(lat); lam = np.radians(lon)
dphi = np.diff(phi); dlam = np.diff(lam)
a = np.sin(dphi/2)**2 + np.cos(phi[:-1])*np.cos(phi[1:])*np.sin(dlam/2)**2
seg = 2*R*np.arcsin(np.sqrt(a))   # horizontal distance per segment (m)
# incorporate vertical for 3D distance (small effect) - keep horizontal for distance markers (standard)
dist = np.concatenate([[0], np.cumsum(seg)])
print("total horizontal distance: %.3f km" % (dist[-1]/1000))

# raw elevation stats
print("ele min/max raw: %.1f / %.1f m" % (np.nanmin(ele), np.nanmax(ele)))
print("start ele %.1f  end ele %.1f" % (ele[0], ele[-1]))

# raw D+ / D- (no smoothing) - will be inflated
dele = np.diff(ele)
print("RAW D+ %.0f  D- %.0f m" % (dele[dele>0].sum(), -dele[dele<0].sum()))

np.savez("/home/claude/twin/work/gpx_raw.npz", lat=lat, lon=lon, ele=ele, dist=dist, seg=seg)
print("saved")
