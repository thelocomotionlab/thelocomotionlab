import { describe, expect, it } from "vitest";

import { decimerProfil, denivele, moyenneGlissante, parseGpx, statsDeGpx } from "./gpxStats";

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

/** Altitudes en `n` paliers réguliers de `depart` à `depart + delta`. */
function paliers(depart, delta, n) {
  return Array.from({ length: n + 1 }, (_, i) => depart + (delta * i) / n);
}

/** GPX minimal portant une suite d'altitudes, un point tous les 10 m. */
function gpxSynthetique(altitudes) {
  const pts = altitudes
    .map(
      (alt, i) =>
        `<trkpt lat="${(45.2 + i * 0.0001).toFixed(6)}" lon="5.94"><ele>${alt.toFixed(1)}</ele></trkpt>`,
    )
    .join("");
  return `<gpx><trk><trkseg>${pts}</trkseg></trk></gpx>`;
}

describe("parseGpx", () => {
  it("lit coordonnées, altitude, temps et distance de la montre", () => {
    const { nom, points } = parseGpx(GPX_COROS);
    expect(nom).toBe("Saint-Mury-Monteymond Trail");
    expect(points).toHaveLength(3);
    expect(points[0]).toMatchObject({ lat: 45.2043575, lon: 5.9462255, alt: 1123, dist: 0 });
    expect(points[2].dist).toBe(3000);
    expect(points[1].tMs).toBe(Date.parse("2026-08-06T07:23:10Z"));
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
    // Le scanner utilise un regex global : oublier `lastIndex` ferait sauter la
    // moitié des points au deuxième appel.
    expect(parseGpx(GPX_COROS).points.length).toBe(parseGpx(GPX_COROS).points.length);
  });
});

describe("statsDeGpx", () => {
  it("LA DISTANCE DE LA MONTRE FAIT FOI quand le fichier la porte", () => {
    // Elle vaut mieux que la géométrie : sur la Croix de Belledonne, Coros
    // annonce 24,26 km là où la somme des segments de sa propre trace n'en
    // donne que 22,86 — et c'est 24,26 que Valentin voit sur son poignet.
    const s = statsDeGpx(GPX_COROS);
    expect(s.distanceSource).toBe("montre");
    expect(s.distanceKm).toBeCloseTo(3, 3);
  });

  it("sans distance dans le fichier, on la calcule (et on le dit)", () => {
    const s = statsDeGpx(GPX_NU);
    expect(s.distanceSource).toBe("geometrie");
    // 0,02° de latitude ≈ 2,22 km.
    expect(s.distanceKm).toBeGreaterThan(2.1);
    expect(s.distanceKm).toBeLessThan(2.3);
  });

  it("D+ et D− sont comptés séparément, durée déduite des horodatages", () => {
    // Montée de 300 m puis descente de 200, sur 61 points — assez pour que la
    // moyenne glissante ne mange pas le relief (sur trois points, elle aplatit
    // tout : c'est le cas suivant).
    const s = statsDeGpx(gpxSynthetique([...paliers(1000, 300, 30), ...paliers(1300, -200, 30)]));
    expect(Math.abs(s.dPlusM - 300)).toBeLessThan(20);
    expect(Math.abs(s.dMinusM - 200)).toBeLessThan(20);
    expect(statsDeGpx(GPX_COROS).dureeSecondes).toBe(2 * 3600);
  });

  it("une trace de trois points est aplatie par le lissage — assumé", () => {
    // La fenêtre de 5 points couvre alors toute la série. Aucune sortie réelle
    // ne ressemble à ça (des milliers de points) ; on le documente plutôt que
    // de compliquer le filtre pour un cas qui n'arrive pas.
    expect(statsDeGpx(GPX_COROS).dPlusM).toBe(0);
    expect(statsDeGpx(GPX_COROS, { lissage: 1 }).dPlusM).toBe(100);
    expect(statsDeGpx(GPX_COROS, { lissage: 1 }).dMinusM).toBe(200);
  });

  it("le profil suit la distance retenue, altitudes manquantes exclues", () => {
    const s = statsDeGpx(GPX_COROS);
    expect(s.profil).toEqual([
      { km: 0, alt: 1123 },
      { km: 1.5, alt: 1223 },
      { km: 3, alt: 1023 },
    ]);
    expect(statsDeGpx(GPX_NU).profil).toHaveLength(2); // le 3e point n'a pas d'altitude
  });

  it("moins de deux points : null (l'appelant affiche une erreur claire)", () => {
    expect(statsDeGpx("")).toBeNull();
    expect(statsDeGpx('<gpx><trkpt lat="45" lon="5"/></gpx>')).toBeNull();
  });

  it("une distance qui recule (glitch) ne fait pas reculer le cumul", () => {
    const cabosse = GPX_COROS.replace("<gpxdata:distance>3000.00", "<gpxdata:distance>900.00");
    const s = statsDeGpx(cabosse);
    expect(s.distanceKm).toBeCloseTo(1.5, 3);
    expect(s.profil.map((p) => p.km)).toEqual([0, 1.5, 1.5]);
  });
});

describe("dénivelé", () => {
  it("LE CAS QUI MOTIVE L'HYSTÉRÉSIS : un plateau bruité ne produit rien", () => {
    const plateau = Array.from({ length: 2000 }, (_, i) => 1000 + Math.sin(i) * 2);
    expect(denivele(moyenneGlissante(plateau, 5), 3)).toEqual({ dPlus: 0, dMinus: 0 });
  });

  it("une vraie montée est comptée en entier", () => {
    const montee = Array.from({ length: 51 }, (_, i) => 1000 + i * 10);
    const { dPlus, dMinus } = denivele(montee, 3);
    expect(Math.abs(dPlus - 500)).toBeLessThan(15);
    expect(dMinus).toBe(0);
  });

  it("le seuil est plus BAS que celui du tracker (source barométrique)", () => {
    // Une montre exporte une altitude déjà stable : filtrer à 5 m comme sur du
    // GNSS mangerait du relief réel. Une marche de 4 m doit être comptée.
    const marches = [1000, 1004, 1008, 1012];
    expect(denivele(marches, 3).dPlus).toBe(12);
    expect(denivele(marches, 5).dPlus).toBe(8); // un ressaut de 4 m passe à la trappe
  });

  it("série trop courte : aucun dénivelé, aucun plantage", () => {
    expect(denivele([], 3)).toEqual({ dPlus: 0, dMinus: 0 });
    expect(denivele([1000], 3)).toEqual({ dPlus: 0, dMinus: 0 });
  });
});

describe("decimerProfil", () => {
  it("réduit un profil dense en gardant les extrémités", () => {
    const dense = Array.from({ length: 20_000 }, (_, i) => ({ km: i / 1000, alt: 1000 + i }));
    const out = decimerProfil(dense, 400);
    expect(out.length).toBeLessThanOrEqual(401);
    expect(out[0]).toEqual(dense[0]);
    expect(out[out.length - 1]).toEqual(dense[dense.length - 1]);
  });

  it("laisse un profil déjà court intact", () => {
    const court = [{ km: 0, alt: 1 }, { km: 1, alt: 2 }];
    expect(decimerProfil(court, 400)).toBe(court);
  });
});

describe("profilDeGpx", () => {
  const trkpt = (lat, lon, alt) => `<trkpt lat="${lat}" lon="${lon}"><ele>${alt}</ele></trkpt>`;
  // Une montée régulière de 300 m sur ~11 km, puis une descente de 200 m :
  // un point tous les ~1,1 km (0,01° de latitude), sans lissage pour que les
  // chiffres soient exacts.
  const montee = Array.from({ length: 11 }, (_, i) => trkpt(45 + i * 0.01, 6, 1000 + i * 30));
  const descente = Array.from({ length: 10 }, (_, i) => trkpt(45.1 + (i + 1) * 0.01, 6, 1300 - (i + 1) * 20));
  const GPX = `<gpx><trk><trkseg>${[...montee, ...descente].join("")}</trkseg></trk></gpx>`;

  it("renvoie totaux, bornes et un profil au format du .track.json", async () => {
    const { profilDeGpx } = await import("./gpxStats");
    const r = profilDeGpx(GPX, { lissage: 1 });
    expect(r.dPlusM).toBe(300);
    expect(r.dMinusM).toBe(200);
    expect(r.elevMinM).toBe(1000);
    expect(r.elevMaxM).toBe(1300);
    expect(r.totalKm).toBeGreaterThan(22);
    expect(r.totalKm).toBeLessThan(23);
    expect(r.profile).toHaveLength(21);
    expect(r.profile[0]).toEqual({ km: 0, alt: 1000, lat: 45, lng: 6, dp: 0, dm: 0 });
    // Le D+ accumulé au sommet vaut le D+ total ; le D− n'a pas commencé.
    expect(r.profile[10]).toMatchObject({ alt: 1300, dp: 300, dm: 0 });
    // Au dernier point, les cumuls valent les totaux.
    expect(r.profile[20]).toMatchObject({ dp: 300, dm: 200 });
    // Le profil est croissant en km.
    for (let i = 1; i < r.profile.length; i += 1) expect(r.profile[i].km).toBeGreaterThan(r.profile[i - 1].km);
  });

  it("donne les mêmes totaux que statsDeGpx, par construction", async () => {
    const { profilDeGpx, statsDeGpx } = await import("./gpxStats");
    const a = profilDeGpx(GPX);
    const b = statsDeGpx(GPX);
    expect(a.dPlusM).toBe(b.dPlusM);
    expect(a.dMinusM).toBe(b.dMinusM);
    expect(a.totalKm).toBeCloseTo(b.distanceKm, 2);
  });

  it("rend null sans altitude exploitable", async () => {
    const { profilDeGpx } = await import("./gpxStats");
    expect(profilDeGpx(`<gpx><trk><trkseg><trkpt lat="45" lon="6"/><trkpt lat="45.1" lon="6"/></trkseg></trk></gpx>`)).toBeNull();
    expect(profilDeGpx("")).toBeNull();
  });
});
