// lib/carrousel.test.js
//
// Ce qui se teste sans canvas : la géométrie et le DÉCOUPAGE EN JOURNÉES. Le
// reste (le dessin) se juge à l'œil dans l'atelier — mais le découpage, lui,
// porte des règles qu'on ne veut pas casser sans s'en apercevoir : le recalage
// des kilomètres, le raccord entre segments, l'ancrage des étiquettes.

import { describe, expect, it } from "vitest";

import { dureeCourte, journeesMontrees, ligneDeJournee, statsDeJournee } from "./carrouselCartes";
import { fitView, decimerPixels, normX, normY } from "./carrouselGeo";
import {
  ancreDuSegment,
  coupuresDepuisWaypoints,
  coupuresRegulieres,
  cumulKm,
  decouperTrace,
  fusionnerTraces,
  traceDepuisGpx,
  traceDepuisTrackJson,
} from "./carrouselTrace";

/** Une trace synthétique : une ligne droite plein est, altitude en toit. */
function traceDroite(nPoints = 101, totalKm = 100) {
  const coords = [];
  const profile = [];
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
    for (let i = 1; i < c.length; i += 1) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]);
  });

  it("ne casse pas sur une polyligne vide", () => {
    expect(cumulKm([])).toEqual([]);
  });
});

describe("traceDepuisTrackJson", () => {
  it("lit un .track.json valide", () => {
    const t = traceDepuisTrackJson(traceDroite());
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
function gpx({ avecTemps }) {
  const pts = [
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
    const t = traceDepuisGpx(gpx({ avecTemps: true }));
    expect(t.vecue).toBe(true);
    expect(t.dureeSecondes).toBe(9000); // 2 h 30
  });

  it("un GPX sans heure est un itinéraire prévu", () => {
    const t = traceDepuisGpx(gpx({ avecTemps: false }));
    expect(t.vecue).toBe(false);
    expect(t.dureeSecondes).toBeNull();
  });

  it("un .track.json n'est JAMAIS une sortie vécue", () => {
    // `build:track` ne conserve aucun horodatage : il ne peut décrire qu'un
    // itinéraire. Le mode bilan ne doit pas pouvoir s'y activer tout seul.
    expect(traceDepuisTrackJson(traceDroite()).vecue).toBe(false);
  });
});

describe("dureeCourte", () => {
  it("dit la durée comme on la dit", () => {
    expect(dureeCourte(9000)).toBe("2 h 30");
    expect(dureeCourte(3660)).toBe("1 h 01");
    expect(dureeCourte(1500)).toBe("25 min");
    expect(dureeCourte(0)).toBe("0 min");
  });
});

describe("fusionnerTraces", () => {
  const a = traceDepuisTrackJson(traceDroite(51, 40));
  const b = traceDepuisTrackJson(traceDroite(51, 60));

  it("additionne les distances et les dénivelés", () => {
    const f = fusionnerTraces([a, b]);
    expect(f.totalKm).toBe(100);
    expect(f.dPlusM).toBe(a.dPlusM + b.dPlusM);
  });

  it("DÉCALE les kilomètres du profil de la trace suivante", () => {
    // Sans décalage, chaque jour repartirait de 0 et le profil se replierait
    // sur lui-même — c'est LE piège de la fusion.
    const f = fusionnerTraces([a, b]);
    const kms = f.profil.map((p) => p.km);
    expect(Math.max(...kms)).toBeCloseTo(100, 6);
    for (let i = 1; i < kms.length; i += 1) expect(kms[i]).toBeGreaterThanOrEqual(kms[i - 1]);
  });

  it("expose les jonctions, qui deviennent les fins de journée", () => {
    expect(fusionnerTraces([a, b]).jonctions).toEqual([40]);
  });

  it("ne somme la durée QUE si toutes les traces en portent une", () => {
    const vecue = { ...a, dureeSecondes: 3600, vecue: true };
    expect(fusionnerTraces([vecue, { ...b, dureeSecondes: 1800, vecue: true }]).dureeSecondes).toBe(5400);
    // Une seule trace sans heure, et on n'annonce plus de temps du tout :
    // un temps amputé serait pire que pas de temps.
    expect(fusionnerTraces([vecue, b]).dureeSecondes).toBeNull();
    expect(fusionnerTraces([vecue, b]).vecue).toBe(false);
  });

  it("rend la trace telle quelle s'il n'y en a qu'une, et null s'il n'y en a aucune", () => {
    expect(fusionnerTraces([a])).toBe(a);
    expect(fusionnerTraces([])).toBeNull();
    expect(fusionnerTraces(null)).toBeNull();
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
});

describe("decouperTrace", () => {
  const trace = traceDepuisTrackJson(traceDroite());

  it("produit une journée de plus que de coupures", () => {
    expect(decouperTrace(trace, [25, 50, 75])).toHaveLength(4);
    expect(decouperTrace(trace, [])).toHaveLength(1);
  });

  it("couvre l'itinéraire sans trou ni recouvrement de kilomètres", () => {
    const segs = decouperTrace(trace, [25, 50, 75]);
    expect(segs[0].kmDebut).toBe(0);
    expect(segs[segs.length - 1].kmFin).toBe(100);
    for (let i = 1; i < segs.length; i += 1) {
      expect(segs[i].kmDebut).toBeCloseTo(segs[i - 1].kmFin, 6);
    }
    expect(segs.reduce((s, x) => s + x.distanceKm, 0)).toBeCloseTo(100, 6);
  });

  it("soude les segments : chaque journée reprend au point de la précédente", () => {
    const segs = decouperTrace(trace, [50]);
    const finJ1 = segs[0].coords[segs[0].coords.length - 1];
    // Le premier point de J2 est AVANT ou ÉGAL à la fin de J1 — c'est ce
    // recouvrement d'un point qui empêche le trait de se briser au bivouac.
    expect(segs[1].coords[0][0]).toBeLessThanOrEqual(finJ1[0] + 1e-9);
  });

  it("calcule le D+ de chaque journée séparément", () => {
    const segs = decouperTrace(trace, [50]);
    // Toit à mi-parcours : tout le D+ est dans la première journée.
    expect(segs[0].dPlusM).toBeGreaterThan(900);
    expect(segs[1].dPlusM).toBe(0);
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
      ],
    };
    const project = ([lon, lat]) => [normX(lon) * 1000, normY(lat) * 1000];
    const ancre = ancreDuSegment(segment, project);
    expect(ancre).toEqual(project([6.1, 45.4]));
  });

  it("rend null sur un segment vide", () => {
    expect(ancreDuSegment({ coords: [] }, (c) => c)).toBeNull();
  });
});

describe("fitView", () => {
  const coords = traceDroite().coords;
  const opts = { width: 1080, height: 1350, fit: { x: 72, y: 200, width: 936, height: 600 } };

  it("cadre l'itinéraire dans la fenêtre demandée", () => {
    const view = fitView(coords, opts);
    const xs = coords.map((c) => view.project(c)[0]);
    const ys = coords.map((c) => view.project(c)[1]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(opts.fit.x - 2);
    expect(Math.max(...xs)).toBeLessThanOrEqual(opts.fit.x + opts.fit.width + 2);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(opts.fit.y - 2);
    expect(Math.max(...ys)).toBeLessThanOrEqual(opts.fit.y + opts.fit.height + 2);
  });

  it("garde un zoom fini sur un itinéraire dégénéré", () => {
    const view = fitView([[6, 44.9]], opts);
    expect(Number.isFinite(view.zoom)).toBe(true);
    expect(view.zoom).toBeLessThanOrEqual(16);
  });

  it("rend null sans coordonnée exploitable", () => {
    expect(fitView([], opts)).toBeNull();
    expect(fitView([[NaN, NaN]], opts)).toBeNull();
  });
});

describe("decimerPixels", () => {
  it("garde toujours le premier et le dernier point", () => {
    const points = Array.from({ length: 500 }, (_, i) => [i * 0.01, 0]);
    const out = decimerPixels(points);
    expect(out[0]).toEqual(points[0]);
    expect(out[out.length - 1]).toEqual(points[points.length - 1]);
    expect(out.length).toBeLessThan(points.length);
  });
});

describe("ligneDeJournee", () => {
  it("dit la journée, pas l'aventure", () => {
    // Le piège qu'elle existe pour éviter : une planche « Jour 3 » annonçait les
    // 188 km du tour entier, parce que c'est ce que la trace sait dire d'elle.
    expect(ligneDeJournee({ distanceKm: 51.2, dPlusM: 2863 })).toBe(
      "*51,2 km*   ·   *2 863 m D+*",
    );
  });

  it("laisse tomber ce qui vaut zéro", () => {
    expect(ligneDeJournee({ distanceKm: 12.4, dPlusM: 0 })).toBe("*12,4 km*");
  });

  it("rend `null` sans journée — la planche retombe alors sur la trace", () => {
    expect(ligneDeJournee(null)).toBeNull();
    expect(ligneDeJournee({ distanceKm: 0, dPlusM: 0 })).toBeNull();
  });
});

describe("journeesMontrees", () => {
  const quatre = [
    { kmDebut: 0, kmFin: 40 },
    { kmDebut: 40, kmFin: 90 },
    { kmDebut: 90, kmFin: 140 },
    { kmDebut: 140, kmFin: 188 },
  ];
  const jours = (carte) => journeesMontrees(carte, quatre).map((j) => j.jour);

  it("rend tout l'itinéraire sans réglage", () => {
    expect(jours({})).toEqual([0, 1, 2, 3]);
    expect(jours({ jusquA: null, depuis: null })).toEqual([0, 1, 2, 3]);
  });

  it("s'arrête à `jusquA` — l'avancement", () => {
    expect(jours({ jusquA: 1 })).toEqual([0, 1]);
    expect(jours({ jusquA: 0 })).toEqual([0]);
  });

  it("ne rend QUE la journée demandée quand les deux bornes se touchent", () => {
    expect(jours({ depuis: 2, jusquA: 2 })).toEqual([2]);
  });

  it("GARDE le rang d'origine — c'est toute la raison d'être des paires", () => {
    // Le piège : couper la liste ferait de la journée 3 la journée 0. Elle
    // repartirait en fuchsia, étiquetée « J1 », et déplacer son étiquette
    // écrirait dans celle de J1.
    const [seule] = journeesMontrees({ depuis: 2, jusquA: 2 }, quatre);
    expect(seule.jour).toBe(2);
    expect(seule.seg).toBe(quatre[2]);
  });

  it("ne déborde pas de la trace, et ne rend rien d'impossible", () => {
    expect(jours({ jusquA: 9 })).toEqual([0, 1, 2, 3]);
    expect(jours({ depuis: 3, jusquA: 1 })).toEqual([]);
    expect(journeesMontrees({ jusquA: 1 }, [])).toEqual([]);
    expect(journeesMontrees({}, null)).toEqual([]);
  });
});

describe("les chiffres d'une étape", () => {
  it("compte la DESCENTE autant que la montée", () => {
    // Le D− manquait aux segments : un tour de montagne se raconte avec les
    // deux, et la planche Étape en fait une colonne à part entière.
    const [j1, j2] = decouperTrace(traceDepuisTrackJson(traceDroite()), [50]);
    expect(j1.dPlusM).toBeGreaterThan(0);
    expect(j1.dMinusM).toBe(0); // la première moitié ne fait que monter
    expect(j2.dPlusM).toBe(0);
    expect(j2.dMinusM).toBeGreaterThan(0);
  });

  it("range les quatre lignes de la planche Étape", () => {
    const lignes = statsDeJournee({ distanceKm: 46.8, dPlusM: 2519, dMinusM: 1940 });
    expect(lignes.map((l) => l.valeur)).toEqual(["46,8 km", "2 519 m", "1 940 m", ""]);
    // La masse portée ne se déduit d'aucun fichier : elle attend, en ambre.
    expect(lignes[3].label).toMatch(/masse/i);
    expect(lignes[3].accent).toBe(true);
  });

  it("laisse les chiffres vides plutôt que d'inventer", () => {
    expect(statsDeJournee(null).map((l) => l.valeur)).toEqual(["", "", "", ""]);
  });
});
