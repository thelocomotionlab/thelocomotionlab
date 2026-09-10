import { describe, expect, it } from "vitest";

import { distanceCumulee, parseGpx } from "./gpx.ts";

/** Trois points, avec la distance cumulée de la montre (namespace Coros). */
const GPX_COROS = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns:gpxdata="http://www.cluetrust.com/XML/GPXDATA/1/0" creator="COROS Wearables">
 <trk>
  <name>Saint-Mury-Monteymond Trail</name>
  <trkseg>
   <trkpt lat="45.2043575" lon="5.9462255"><ele>1123</ele><time>2026-08-06T06:23:10Z</time>
     <extensions><gpxdata:distance>0.00</gpxdata:distance></extensions></trkpt>
   <trkpt lat="45.2143575" lon="5.9462255"><ele>1223</ele><time>2026-08-06T07:23:10Z</time>
     <extensions><gpxdata:distance>1500.00</gpxdata:distance></extensions></trkpt>
   <trkpt lat="45.2243575" lon="5.9462255"><ele>1023</ele><time>2026-08-06T08:23:10Z</time>
     <extensions><gpxdata:distance>3000.00</gpxdata:distance></extensions></trkpt>
  </trkseg>
 </trk>
</gpx>`;

/** GPX minimal : pas d'extensions, pas de temps, balise auto-fermante. */
const GPX_NU = `<gpx><trk><trkseg>
   <trkpt lat="45.20" lon="5.94"><ele>1000</ele></trkpt>
   <trkpt lat="45.21" lon="5.94"><ele>1100</ele></trkpt>
   <trkpt lat="45.22" lon="5.94"/>
</trkseg></trk></gpx>`;

/** Un point de montre Garmin : la FC et la cadence sous un préfixe différent. */
const GPX_GARMIN = `<gpx><trk><trkseg>
  <trkpt lat="45.20" lon="5.94"><ele>1000</ele><time>2026-08-06T06:00:00Z</time>
    <extensions><ns3:TrackPointExtension><ns3:hr>142</ns3:hr><ns3:cad>84</ns3:cad>
    </ns3:TrackPointExtension></extensions></trkpt>
  <trkpt lat="45.21" lon="5.94"><ele>1010</ele><time>2026-08-06T06:10:00Z</time>
    <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>151</gpxtpx:hr><gpxtpx:cad>88</gpxtpx:cad>
    </gpxtpx:TrackPointExtension></extensions></trkpt>
</trkseg></trk></gpx>`;

describe("parseGpx", () => {
  it("lit coordonnées, altitude, temps et distance de la montre", () => {
    const { nom, points } = parseGpx(GPX_COROS);
    expect(nom).toBe("Saint-Mury-Monteymond Trail");
    expect(points).toHaveLength(3);
    expect(points[0]).toMatchObject({ lat: 45.2043575, lon: 5.9462255, alt: 1123, dist: 0 });
    expect(points[2]!.dist).toBe(3000);
    expect(points[1]!.tMs).toBe(Date.parse("2026-08-06T07:23:10Z"));
  });

  it("lit la FC et la cadence quel que soit le préfixe de namespace", () => {
    // Coros écrit `gpxtpx:`, Garmin `ns3:`, d'autres rien : cadrer sur un
    // préfixe précis reviendrait à ne lire qu'une marque de montre.
    const { points } = parseGpx(GPX_GARMIN);
    expect(points[0]).toMatchObject({ fc: 142, cadence: 84 });
    expect(points[1]).toMatchObject({ fc: 151, cadence: 88 });
  });

  it("sans ceinture ni capteur, FC et cadence restent nulles", () => {
    const { points } = parseGpx(GPX_COROS);
    expect(points.every((p) => p.fc === null && p.cadence === null)).toBe(true);
  });

  it("tolère l'absence d'extensions, de temps, et les balises auto-fermantes", () => {
    const { points } = parseGpx(GPX_NU);
    expect(points).toHaveLength(3);
    expect(points[2]).toMatchObject({ lat: 45.22, alt: null, tMs: null, dist: null });
  });

  it("un fichier vide ou non-GPX ne produit aucun point (et ne jette pas)", () => {
    expect(parseGpx("").points).toEqual([]);
    expect(parseGpx("<html><body>bonjour</body></html>").points).toEqual([]);
    expect(parseGpx(undefined).points).toEqual([]);
  });

  it("est réentrant : deux lectures de suite donnent le même résultat", () => {
    // Le scanner est un regex global. S'il était partagé entre appels, son
    // `lastIndex` ferait sauter la moitié des points au deuxième passage.
    expect(parseGpx(GPX_COROS).points.length).toBe(parseGpx(GPX_COROS).points.length);
  });
});

describe("distanceCumulee", () => {
  it("LA DISTANCE DE LA MONTRE FAIT FOI quand le fichier la porte", () => {
    const { cumul, source } = distanceCumulee(parseGpx(GPX_COROS).points);
    expect(source).toBe("montre");
    expect(cumul[cumul.length - 1]).toBe(3000);
  });

  it("sans distance dans le fichier, on la calcule (et on le dit)", () => {
    const { cumul, source } = distanceCumulee(parseGpx(GPX_NU).points);
    expect(source).toBe("geometrie");
    // 0,02° de latitude ≈ 2,22 km.
    expect(cumul[cumul.length - 1]).toBeGreaterThan(2100);
    expect(cumul[cumul.length - 1]).toBeLessThan(2300);
  });

  it("une distance qui recule (glitch) ne fait pas reculer le cumul", () => {
    const cabosse = GPX_COROS.replace("<gpxdata:distance>3000.00", "<gpxdata:distance>900.00");
    const { cumul } = distanceCumulee(parseGpx(cabosse).points);
    expect(cumul).toEqual([0, 1500, 1500]);
  });
});
