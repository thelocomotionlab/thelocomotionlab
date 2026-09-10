import { describe, expect, it } from "vitest";

import { denivele } from "./denivele.ts";
import { decimer, medianeGlissante, moyenneGlissante } from "./lissage.ts";
import { profilDeGpx, statsDeGpx } from "./stats.ts";

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

const GPX_NU = `<gpx><trk><trkseg>
   <trkpt lat="45.20" lon="5.94"><ele>1000</ele></trkpt>
   <trkpt lat="45.21" lon="5.94"><ele>1100</ele></trkpt>
   <trkpt lat="45.22" lon="5.94"/>
</trkseg></trk></gpx>`;

/** Altitudes en `n` paliers réguliers de `depart` à `depart + delta`. */
function paliers(depart: number, delta: number, n: number): number[] {
  return Array.from({ length: n + 1 }, (_, i) => depart + (delta * i) / n);
}

/** GPX minimal portant une suite d'altitudes, un point tous les ~10 m. */
function gpxSynthetique(altitudes: readonly number[]): string {
  const pts = altitudes
    .map(
      (alt, i) =>
        `<trkpt lat="${(45.2 + i * 0.0001).toFixed(6)}" lon="5.94"><ele>${alt.toFixed(1)}</ele></trkpt>`,
    )
    .join("");
  return `<gpx><trk><trkseg>${pts}</trkseg></trk></gpx>`;
}

describe("statsDeGpx", () => {
  it("la distance de la montre l'emporte sur la géométrie", () => {
    const s = statsDeGpx(GPX_COROS)!;
    expect(s.distanceSource).toBe("montre");
    expect(s.distanceKm).toBeCloseTo(3, 3);
  });

  it("D+ et D− sont comptés séparément, durée déduite des horodatages", () => {
    const s = statsDeGpx(gpxSynthetique([...paliers(1000, 300, 30), ...paliers(1300, -200, 30)]))!;
    expect(Math.abs(s.dPlusM - 300)).toBeLessThan(20);
    expect(Math.abs(s.dMinusM - 200)).toBeLessThan(20);
    expect(statsDeGpx(GPX_COROS)!.dureeSecondes).toBe(2 * 3600);
    expect(statsDeGpx(GPX_COROS)!.debutMs).toBe(Date.parse("2026-08-06T06:23:10Z"));
  });

  it("une trace de trois points est aplatie par le lissage — assumé", () => {
    // La fenêtre de 5 points couvre alors toute la série. Aucune sortie réelle
    // ne ressemble à ça (des milliers de points).
    expect(statsDeGpx(GPX_COROS)!.dPlusM).toBe(0);
    expect(statsDeGpx(GPX_COROS, { lissage: 1 })!.dPlusM).toBe(100);
    expect(statsDeGpx(GPX_COROS, { lissage: 1 })!.dMinusM).toBe(200);
  });

  it("le profil suit la distance retenue, altitudes manquantes exclues", () => {
    expect(statsDeGpx(GPX_COROS)!.profil).toEqual([
      { km: 0, alt: 1123 },
      { km: 1.5, alt: 1223 },
      { km: 3, alt: 1023 },
    ]);
    expect(statsDeGpx(GPX_NU)!.profil).toHaveLength(2); // le 3e point n'a pas d'altitude
  });

  it("moins de deux points : null (l'appelant affiche une erreur claire)", () => {
    expect(statsDeGpx("")).toBeNull();
    expect(statsDeGpx('<gpx><trkpt lat="45" lon="5"/></gpx>')).toBeNull();
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
    const marches = [1000, 1004, 1008, 1012];
    expect(denivele(marches, 3).dPlus).toBe(12);
    expect(denivele(marches, 5).dPlus).toBe(8); // un ressaut de 4 m passe à la trappe
  });

  it("série trop courte : aucun dénivelé, aucun plantage", () => {
    expect(denivele([], 3)).toEqual({ dPlus: 0, dMinus: 0 });
    expect(denivele([1000], 3)).toEqual({ dPlus: 0, dMinus: 0 });
  });
});

describe("médiane glissante", () => {
  it("efface un pic isolé là où la moyenne l'étale", () => {
    // Le cas de Survol : un point d'altitude qui saute de trente mètres. La
    // médiane le supprime sans toucher aux voisins ; la moyenne le répartit
    // sur toute la fenêtre, et la caméra prend une bosse au lieu d'un pic.
    const avecPic = [1000, 1000, 1030, 1000, 1000];
    expect(medianeGlissante(avecPic, 3)).toEqual([1000, 1000, 1000, 1000, 1000]);
    expect(moyenneGlissante(avecPic, 3)[1]).toBeGreaterThan(1000);
  });

  it("respecte un vrai relief", () => {
    const montee = [1000, 1010, 1020, 1030, 1040];
    // Aux bords, la fenêtre centrée est tronquée — même règle que la moyenne
    // glissante : le premier point n'a pas de voisin à sa gauche.
    expect(medianeGlissante(montee, 3).slice(1, -1)).toEqual([1010, 1020, 1030]);
    expect(medianeGlissante(montee, 3)[0]).toBe(1005);
  });

  it("une fenêtre de 1 ou moins ne touche à rien", () => {
    expect(medianeGlissante([3, 1, 2], 1)).toEqual([3, 1, 2]);
  });
});

describe("decimer", () => {
  it("réduit une suite dense en gardant les extrémités", () => {
    const dense = Array.from({ length: 20_000 }, (_, i) => ({ km: i / 1000, alt: 1000 + i }));
    const out = decimer(dense, 400);
    expect(out.length).toBeLessThanOrEqual(401);
    expect(out[0]).toEqual(dense[0]);
    expect(out[out.length - 1]).toEqual(dense[dense.length - 1]);
  });

  it("laisse une suite déjà courte intacte (mais en rend une copie)", () => {
    const court = [{ km: 0, alt: 1 }, { km: 1, alt: 2 }];
    expect(decimer(court, 400)).toEqual(court);
    expect(decimer(court, 400)).not.toBe(court);
  });
});

describe("profilDeGpx", () => {
  const trkpt = (lat: number, lon: number, alt: number) =>
    `<trkpt lat="${lat}" lon="${lon}"><ele>${alt}</ele></trkpt>`;
  const montee = Array.from({ length: 11 }, (_, i) => trkpt(45 + i * 0.01, 6, 1000 + i * 30));
  const descente = Array.from({ length: 10 }, (_, i) =>
    trkpt(45.1 + (i + 1) * 0.01, 6, 1300 - (i + 1) * 20),
  );
  const GPX = `<gpx><trk><trkseg>${[...montee, ...descente].join("")}</trkseg></trk></gpx>`;

  it("renvoie totaux, bornes et un profil au format du .track.json", () => {
    const r = profilDeGpx(GPX, { lissage: 1 })!;
    expect(r.dPlusM).toBe(300);
    expect(r.dMinusM).toBe(200);
    expect(r.elevMinM).toBe(1000);
    expect(r.elevMaxM).toBe(1300);
    expect(r.totalKm).toBeGreaterThan(22);
    expect(r.totalKm).toBeLessThan(23);
    expect(r.profile).toHaveLength(21);
    expect(r.profile[0]).toEqual({ km: 0, alt: 1000, lat: 45, lng: 6, dp: 0, dm: 0 });
    expect(r.profile[10]).toMatchObject({ alt: 1300, dp: 300, dm: 0 });
    expect(r.profile[20]).toMatchObject({ dp: 300, dm: 200 });
    for (let i = 1; i < r.profile.length; i += 1) {
      expect(r.profile[i]!.km).toBeGreaterThan(r.profile[i - 1]!.km);
    }
  });

  it("donne les mêmes totaux que statsDeGpx, par construction", () => {
    const a = profilDeGpx(GPX)!;
    const b = statsDeGpx(GPX)!;
    expect(a.dPlusM).toBe(b.dPlusM);
    expect(a.dMinusM).toBe(b.dMinusM);
    expect(a.totalKm).toBeCloseTo(b.distanceKm, 2);
  });

  it("rend null sans altitude exploitable", () => {
    expect(
      profilDeGpx(`<gpx><trk><trkseg><trkpt lat="45" lon="6"/><trkpt lat="45.1" lon="6"/></trkseg></trk></gpx>`),
    ).toBeNull();
    expect(profilDeGpx("")).toBeNull();
  });
});
