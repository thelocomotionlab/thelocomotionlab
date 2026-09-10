import { describe, expect, it } from "vitest";

import { cumulKm } from "./geo.ts";
import {
  ancreDuSegment,
  coupuresDepuisWaypoints,
  coupuresRegulieres,
  decouperTrace,
  etiquetteParDefaut,
  fusionnerTraces,
  traceDepuisGpx,
  traceDepuisTrackJson,
} from "./trace.ts";
import type { Coord } from "./types.ts";

/** Une trace synthétique : une ligne droite plein est, altitude en toit. */
function traceDroite(nPoints = 101, totalKm = 100) {
  const coords: Coord[] = [];
  const profile: { km: number; alt: number }[] = [];
  for (let i = 0; i < nPoints; i += 1) {
    const t = i / (nPoints - 1);
    coords.push([6 + t * 1.2, 44.9]);
    profile.push({ km: t * totalKm, alt: 1000 + (t < 0.5 ? t : 1 - t) * 2000 });
  }
  return { schemaVersion: 1, totalKm, dPlusM: 1000, dMinusM: 1000, coords, profile };
}

describe("cumulKm", () => {
  it("recale la longueur géométrique sur la distance annoncée", () => {
    const { coords } = traceDroite();
    const brut = cumulKm(coords);
    const recale = cumulKm(coords, 100);
    expect(brut[brut.length - 1]).not.toBeCloseTo(100, 1);
    expect(recale[recale.length - 1]).toBeCloseTo(100, 6);
  });

  it("est monotone croissant", () => {
    const c = cumulKm(traceDroite().coords, 100);
    for (let i = 1; i < c.length; i += 1) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]!);
  });

  it("ne casse pas sur une polyligne vide", () => {
    expect(cumulKm([])).toEqual([]);
  });
});

describe("traceDepuisTrackJson", () => {
  it("lit un .track.json valide", () => {
    const t = traceDepuisTrackJson(traceDroite())!;
    expect(t.totalKm).toBe(100);
    expect(t.coords).toHaveLength(101);
    expect(t.cumul[t.cumul.length - 1]).toBeCloseTo(100, 6);
  });

  it("refuse poliment un schéma inconnu", () => {
    expect(traceDepuisTrackJson({ schemaVersion: 2, profile: [] })).toBeNull();
    expect(traceDepuisTrackJson(null)).toBeNull();
  });
});

/** Un GPX minimal, avec ou sans horodatage — c'est LUI qui décide si la trace
 *  est une sortie vécue ou un itinéraire prévu. */
function gpx({ avecTemps }: { avecTemps: boolean }): string {
  const pts: [number, number, number, string][] = [
    [6.0, 44.9, 1000, "2026-08-20T08:00:00Z"],
    [6.01, 44.91, 1400, "2026-08-20T09:00:00Z"],
    [6.02, 44.92, 1200, "2026-08-20T10:30:00Z"],
  ];
  const corps = pts
    .map(
      ([lon, lat, ele, t]) =>
        `<trkpt lat="${lat}" lon="${lon}"><ele>${ele}</ele>${avecTemps ? `<time>${t}</time>` : ""}</trkpt>`,
    )
    .join("");
  return `<gpx><trk><name>Sortie d'essai</name><trkseg>${corps}</trkseg></trk></gpx>`;
}

describe("vécue ou prévue", () => {
  it("un GPX horodaté est une sortie vécue, et porte sa durée", () => {
    const t = traceDepuisGpx(gpx({ avecTemps: true }))!;
    expect(t.vecue).toBe(true);
    expect(t.dureeSecondes).toBe(9000); // 2 h 30
  });

  it("un GPX sans heure est un itinéraire prévu", () => {
    const t = traceDepuisGpx(gpx({ avecTemps: false }))!;
    expect(t.vecue).toBe(false);
    expect(t.dureeSecondes).toBeNull();
  });

  it("un .track.json n'est JAMAIS une sortie vécue", () => {
    // `build:track` ne conserve aucun horodatage : il ne peut décrire qu'un
    // itinéraire. Le mode bilan ne doit pas pouvoir s'y activer tout seul.
    expect(traceDepuisTrackJson(traceDroite())!.vecue).toBe(false);
  });
});

describe("fusionnerTraces", () => {
  const a = traceDepuisTrackJson(traceDroite(51, 40))!;
  const b = traceDepuisTrackJson(traceDroite(51, 60))!;

  it("additionne les distances et les dénivelés", () => {
    const f = fusionnerTraces([a, b])!;
    expect(f.totalKm).toBe(100);
    expect(f.dPlusM).toBe(a.dPlusM + b.dPlusM);
  });

  it("DÉCALE les kilomètres du profil de la trace suivante", () => {
    // Sans décalage, chaque jour repartirait de 0 et le profil se replierait
    // sur lui-même — c'est LE piège de la fusion.
    const f = fusionnerTraces([a, b])!;
    const kms = f.profil.map((p) => p.km);
    expect(Math.max(...kms)).toBeCloseTo(100, 6);
    for (let i = 1; i < kms.length; i += 1) expect(kms[i]).toBeGreaterThanOrEqual(kms[i - 1]!);
  });

  it("expose les jonctions, qui deviennent les fins de journée", () => {
    expect(fusionnerTraces([a, b])!.jonctions).toEqual([40]);
  });

  it("ne somme la durée QUE si toutes les traces en portent une", () => {
    const vecue = { ...a, dureeSecondes: 3600, vecue: true };
    expect(fusionnerTraces([vecue, { ...b, dureeSecondes: 1800, vecue: true }])!.dureeSecondes).toBe(5400);
    // Une seule trace sans heure, et on n'annonce plus de temps du tout :
    // un temps amputé serait pire que pas de temps.
    expect(fusionnerTraces([vecue, b])!.dureeSecondes).toBeNull();
    expect(fusionnerTraces([vecue, b])!.vecue).toBe(false);
  });

  it("rend la trace telle quelle s'il n'y en a qu'une, et null s'il n'y en a aucune", () => {
    expect(fusionnerTraces([a])).toBe(a);
    expect(fusionnerTraces([])).toBeNull();
    expect(fusionnerTraces([null])).toBeNull();
  });
});

describe("coupures", () => {
  it("découpe régulièrement", () => {
    expect(coupuresRegulieres(120, 4)).toEqual([30, 60, 90]);
    expect(coupuresRegulieres(120, 1)).toEqual([]);
  });

  it("tire les coupures des waypoints, triées et dédoublonnées", () => {
    const wp = [
      { nom: "Valgaudémar", km: 130.6 },
      { nom: "Arsine", km: 42 },
      { nom: "Vallouise", km: 84 },
      { nom: "doublon", km: 42.04 },
      { nom: "hors trace", km: 999 },
    ];
    expect(coupuresDepuisWaypoints(wp, 170)).toEqual([42, 84, 130.6]);
  });

  it("écarte un waypoint collé au départ ou à l'arrivée", () => {
    expect(coupuresDepuisWaypoints([{ km: 0.2 }, { km: 99.9 }], 100)).toEqual([]);
  });

  it("nomme les journées J1, J2…", () => {
    expect([0, 1, 2].map(etiquetteParDefaut)).toEqual(["J1", "J2", "J3"]);
  });
});

describe("decouperTrace", () => {
  const trace = traceDepuisTrackJson(traceDroite());

  it("produit une journée de plus que de coupures", () => {
    expect(decouperTrace(trace, [25, 50, 75])).toHaveLength(4);
    expect(decouperTrace(trace, [])).toHaveLength(1);
  });

  it("couvre l'itinéraire sans trou ni recouvrement de kilomètres", () => {
    const segs = decouperTrace(trace, [25, 50, 75]);
    expect(segs[0]!.kmDebut).toBe(0);
    expect(segs[segs.length - 1]!.kmFin).toBe(100);
    for (let i = 1; i < segs.length; i += 1) {
      expect(segs[i]!.kmDebut).toBeCloseTo(segs[i - 1]!.kmFin, 6);
    }
    expect(segs.reduce((s, x) => s + x.distanceKm, 0)).toBeCloseTo(100, 6);
  });

  it("soude les segments : chaque journée reprend au point de la précédente", () => {
    const segs = decouperTrace(trace, [50]);
    const finJ1 = segs[0]!.coords[segs[0]!.coords.length - 1]!;
    // Le premier point de J2 est AVANT ou ÉGAL à la fin de J1 — c'est ce
    // recouvrement d'un point qui empêche le trait de se briser au bivouac.
    expect(segs[1]!.coords[0]![0]).toBeLessThanOrEqual(finJ1[0] + 1e-9);
  });

  it("calcule le D+ de chaque journée séparément", () => {
    const segs = decouperTrace(trace, [50]);
    // Toit à mi-parcours : tout le D+ est dans la première journée.
    expect(segs[0]!.dPlusM).toBeGreaterThan(900);
    expect(segs[1]!.dPlusM).toBe(0);
  });

  it("ignore une coupure hors de l'itinéraire", () => {
    expect(decouperTrace(trace, [-5, 250])).toHaveLength(1);
  });

  it("rend une liste vide sans trace", () => {
    expect(decouperTrace(null, [10])).toEqual([]);
  });
});

describe("ancreDuSegment", () => {
  it("choisit le point le plus HAUT du segment à l'écran", () => {
    const segment = {
      coords: [
        [6.0, 44.9],
        [6.1, 45.4], // le plus au nord → l'ordonnée écran la plus petite
        [6.2, 44.8],
      ] as Coord[],
    };
    const project = ([lon, lat]: Coord): [number, number] => [lon * 100, -lat * 100];
    expect(ancreDuSegment(segment, project)).toEqual(project([6.1, 45.4]));
  });

  it("rend null sur un segment vide", () => {
    expect(ancreDuSegment({ coords: [] }, (c) => c)).toBeNull();
  });
});
