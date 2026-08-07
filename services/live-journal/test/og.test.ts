// Cartes de partage : collecte des données (avec projection sur l'itinéraire),
// sélection de variante, contenu propre à chaque format, et rendu RÉEL
// satori+resvg aux bonnes dimensions. Aucun accès réseau — fetch injecté, et
// les tuiles sont fabriquées ici.

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  jourParis,
  kmSurItineraire,
  lastWaypointPassed,
  liveFromArtefacts,
  trackFromJson,
  OgDataSource,
  type OgData,
} from "../src/og/data";
import { dureeCourte, departLe, GABARITS, rendreCarte } from "../src/og/cards";
import { decouperJour, NOTE_MAX } from "../src/og/cli";
import { traceSvgDataUri } from "../src/og/trace";
import { fitView, type LonLat } from "../src/og/geo";
import { profilDataUri } from "../src/og/profil";

const LIVE_CONFIG = {
  schemaVersion: 1,
  aventure: {
    nom: "Tour des Écrins en autonomie",
    dates: "20–24 août 2026",
    dateDebut: "2026-08-20T06:00:00+02:00",
    distanceKm: 194,
    deniveleM: 12000,
    statut: "avant",
  },
  live: {
    referenceTrack: "/tracks/test.track.json",
    waypoints: [
      { nom: "Lautaret", km: 40, altitude: 2058 },
      { nom: "Col de l'Aup Martin", km: 96, altitude: 2761 },
    ],
  },
};

// Itinéraire synthétique : une ligne nord-sud de ~20 km, 50 sommets.
const COORDS: LonLat[] = Array.from({ length: 50 }, (_, i) => [6.35, 44.85 + (i / 49) * 0.18]);

const TRACK = {
  schemaVersion: 1,
  totalKm: 194,
  dPlusM: 12000,
  dMinusM: 11800,
  coords: COORDS,
  profile: Array.from({ length: 50 }, (_, i) => ({
    km: (i / 49) * 194,
    alt: 1000 + 800 * Math.abs(Math.sin(i / 6)),
  })),
};

/** Positions vécues : la moitié de l'itinéraire, horodatées. */
const POSITIONS = {
  stats: { distance: 96_400, dplus: 6240, dminus: 5980, durationSeconds: 27_900 },
  profile: COORDS.slice(0, 25).map(([lon, lat], i) => ({
    longitude: lon,
    latitude: lat,
    distMeters: i * 1000,
    dPlus: i * 60,
    dMinus: i * 55,
    fixTime: new Date(Date.parse("2026-08-20T06:00:00+02:00") + i * 600_000).toISOString(),
  })),
};

function fetcherWith(overrides: Record<string, unknown | null> = {}): typeof fetch {
  const routes: Record<string, unknown | null> = {
    "/live-config.json": LIVE_CONFIG,
    "/tracks/test.track.json": TRACK,
    "/live-positions.json": POSITIONS,
    "/live-timer.json": { running: true },
    ...overrides,
  };
  return (async (url: RequestInfo | URL) => {
    const key = Object.keys(routes).find((r) => String(url).includes(r));
    const body = key !== undefined ? routes[key] : null;
    if (body === null) return { ok: false, status: 404, json: async () => null } as Response;
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as typeof fetch;
}

function makeSource(overrides: Record<string, unknown | null> = {}) {
  return new OgDataSource({
    siteBase: "http://site.test",
    trackingBase: "http://tracking.test",
    fetcher: fetcherWith(overrides),
  });
}

/** Rendu hors ligne : `sansFond` saute le téléchargement des tuiles. */
const rendre = (data: OgData, format: "story" | "carrousel" | "og") =>
  rendreCarte(data, { format, sansFond: true });

describe("OgDataSource", () => {
  it("variante live quand le direct tourne, avec jour et dernière étape", async () => {
    const data = await makeSource().collect();
    expect(data.variant).toBe("live");
    expect(data.aventure.nom).toBe("Tour des Écrins en autonomie");
    expect(data.live?.doneKm).toBeCloseTo(96.4);
    expect(data.live?.dminus).toBe(5980);
    expect(data.jour).toBeGreaterThanOrEqual(1);
    expect(data.track?.totalKm).toBe(194);
    expect(data.track?.coords.length).toBe(50);
  });

  it("L'AVANCEMENT EST PROJETÉ, pas déduit de la distance parcourue", async () => {
    // Sur ce jeu, la trace vécue couvre 24/49 de l'itinéraire (≈ 49 %) alors
    // que `stats.distance` en annonce 96,4 km sur 194 (≈ 50 %). Ce qui compte,
    // c'est que le pourcentage vienne de la PROJECTION : à la Croix de
    // Belledonne, la distance parcourue dépassait la longueur du parcours.
    const data = await makeSource().collect();
    expect(data.live?.pourcent).not.toBeNull();
    expect(data.live?.pourcent).toBeCloseTo(48.98, 1);
    expect(data.live?.avancementKm).toBeCloseTo(9.8, 0);
    // Le waypoint franchi se lit sur l'itinéraire, pas sur le compteur.
    expect(kmSurItineraire(data.live!)).toBe(data.live!.avancementKm);
  });

  it("sans itinéraire, l'avancement est nul mais la carte reste générable", async () => {
    const data = await makeSource({ "/tracks/test.track.json": null }).collect();
    expect(data.track).toBeNull();
    expect(data.live?.pourcent).toBeNull();
    expect(kmSurItineraire(data.live!)).toBeCloseTo(96.4);
    const png = await rendre(data, "story");
    expect(png.subarray(1, 4).toString()).toBe("PNG");
  }, 30_000);

  it("variante avant seulement si AUCUNE session n'a été lancée", async () => {
    const avant = await makeSource({ "/live-timer.json": { running: false, startTime: null } }).collect();
    expect(avant.variant).toBe("avant");
  });

  it("LE CAS DE BELLEDONNE : sortie terminée ≠ « prochain départ »", async () => {
    // Le chrono arrêté APRÈS un départ décrit une aventure bouclée : la page
    // /live reste figée dessus (LiveHub : `running || startTime`). La carte
    // annonçait pourtant « PROCHAIN DÉPART · 22 km à parcourir » — le badge de
    // l'aventure qu'on venait de terminer.
    const data = await makeSource({
      "/live-timer.json": { running: false, startTime: "2026-08-06T06:23:00+02:00", stopTime: "2026-08-06T16:09:00+02:00" },
    }).collect();
    expect(data.live?.termine).toBe(true);
    expect(data.variant).toBe("termine");
    // Et le grand chiffre devient ce qui a été PARCOURU, pas la longueur du parcours.
    expect(data.live?.doneKm).toBeCloseTo(96.4);
  });

  it("le statut de liveConfig force encore « terminé »", async () => {
    const termine = await makeSource({
      "/live-config.json": {
        ...LIVE_CONFIG,
        aventure: { ...LIVE_CONFIG.aventure, statut: "termine" },
      },
    }).collect();
    expect(termine.variant).toBe("termine");
  });

  it("live-config.json injoignable → aventure neutre, carte toujours générable", async () => {
    const data = await makeSource({ "/live-config.json": null }).collect();
    expect(data.aventure.nom).toBe("Aventure du Locomotion Lab");
    const png = await rendre(data, "og");
    expect(png.subarray(1, 4).toString()).toBe("PNG");
  }, 30_000);
});

describe("trackFromJson", () => {
  it("refuse un schéma inconnu, tolère l'absence de coords", () => {
    expect(trackFromJson(null)).toBeNull();
    expect(trackFromJson({ schemaVersion: 2, profile: TRACK.profile })).toBeNull();
    expect(trackFromJson({ schemaVersion: 1, profile: [{ km: 0, alt: 1 }] })).toBeNull();
    const sansCoords = trackFromJson({ schemaVersion: 1, profile: TRACK.profile, totalKm: 194 });
    expect(sansCoords?.coords).toEqual([]);
  });
});

describe("lastWaypointPassed / jourParis / formats de texte", () => {
  it("dernier waypoint dépassé ; null si liste vide (placeholder propre)", () => {
    const wps = LIVE_CONFIG.live.waypoints;
    expect(lastWaypointPassed(96.4, wps)?.nom).toBe("Col de l'Aup Martin");
    expect(lastWaypointPassed(50, wps)?.nom).toBe("Lautaret");
    expect(lastWaypointPassed(10, wps)).toBeNull();
    expect(lastWaypointPassed(100, [])).toBeNull();
  });

  it("jourParis : frontière à minuit heure française (même règle que le site)", () => {
    expect(jourParis("2026-08-20T23:59:00+02:00", "2026-08-20T06:00:00+02:00")).toBe(1);
    expect(jourParis("2026-08-21T00:01:00+02:00", "2026-08-20T06:00:00+02:00")).toBe(2);
    expect(jourParis("2026-08-20T22:30:00Z", "2026-08-20T06:00:00+02:00")).toBe(2);
  });

  it("dureeCourte : « 7 h 45 », et des minutes seules sous l'heure", () => {
    expect(dureeCourte(27_900)).toBe("7 h 45");
    expect(dureeCourte(3_600)).toBe("1 h 00");
    expect(dureeCourte(2_700)).toBe("45 min");
    expect(dureeCourte(0)).toBe("0 min");
    expect(dureeCourte(-10)).toBe("0 min");
  });

  it("departLe : date lisible, null si la date ne se lit pas", () => {
    expect(departLe("2026-08-20T06:00:00+02:00")).toBe("Départ le 20 août");
    expect(departLe("pas une date")).toBeNull();
  });
});

describe("profil altimétrique", () => {
  it("produit un SVG data URI, avec curseur seulement à mi-parcours", () => {
    const enCours = profilDataUri(TRACK.profile, { doneKm: 96, totalKm: 194 });
    const svg = Buffer.from(enCours!.split(",")[1], "base64").toString();
    expect(svg).toContain("<line"); // le trait vertical de l'avancement
    expect(svg).toContain("stroke-dasharray");

    const boucle = profilDataUri(TRACK.profile, { doneKm: 194, totalKm: 194 });
    expect(Buffer.from(boucle!.split(",")[1], "base64").toString()).not.toContain("<line");
  });

  it("refuse un profil vide ou dégénéré au lieu de dessiner n'importe quoi", () => {
    expect(profilDataUri([], { doneKm: 0, totalKm: 10 })).toBeNull();
    expect(profilDataUri([{ km: 0, alt: 100 }], { doneKm: 0, totalKm: 10 })).toBeNull();
    expect(profilDataUri(TRACK.profile, { doneKm: 0, totalKm: 0 })).not.toBeNull();
  });
});

describe("trace posée sur le fond", () => {
  const view = fitView(COORDS, { width: 1080, height: 1920, fit: { x: 96, y: 200, width: 888, height: 800 } })!;
  const svgDe = (uri: string) => Buffer.from(uri.split(",")[1], "base64").toString();

  it("itinéraire en pointillés, vécu en trait plein, chacun sur son liseré", () => {
    const svg = svgDe(traceSvgDataUri(view, { reference: COORDS, done: COORDS.slice(0, 20) })!);
    expect(svg).toContain("stroke-dasharray"); // référence
    expect(svg.match(/<path/g)!.length).toBe(4); // 2 liserés + 2 traits
    expect(svg).toContain("#D6246E");
    expect(svg).toContain("#FFFFFF");
  });

  it("le marqueur est un disque terracotta cerclé de crème", () => {
    const svg = svgDe(traceSvgDataUri(view, { reference: COORDS, marker: COORDS[10] })!);
    expect(svg).toContain("<circle");
    expect(svg).toContain("#B67352");
  });

  it("rien à dessiner → null (la carte n'ajoute pas de calque vide)", () => {
    expect(traceSvgDataUri(view, {})).toBeNull();
    expect(traceSvgDataUri(view, { reference: [], done: [] })).toBeNull();
  });
});

describe("découpe par jour (carrousel d'une aventure de plusieurs jours)", () => {
  const dateDebut = "2026-08-20T06:00:00+02:00";
  const point = (iso: string, dist: number, dp: number, dm: number) => ({
    fixTime: iso,
    distMeters: dist,
    dPlus: dp,
    dMinus: dm,
  });
  const positions = {
    stats: { distance: 60_000, dplus: 3000, dminus: 2800, durationSeconds: 100_000 },
    profile: [
      point("2026-08-20T07:00:00+02:00", 0, 0, 0),
      point("2026-08-20T18:00:00+02:00", 25_000, 1200, 1100),
      point("2026-08-21T07:00:00+02:00", 26_000, 1250, 1150),
      point("2026-08-21T19:00:00+02:00", 60_000, 3000, 2800),
    ],
  };

  it("les chiffres sont ceux de la JOURNÉE, pas les cumuls", () => {
    const j2 = decouperJour(positions, dateDebut, 2)!;
    expect(j2.stats!.distance).toBe(35_000); // 60 000 − 25 000
    expect(j2.stats!.dplus).toBe(1800);
    expect(j2.stats!.dminus).toBe(1700);
    expect(j2.stats!.durationSeconds).toBe(12 * 3600); // 7 h → 19 h
  });

  it("la trace, elle, reste CUMULÉE jusqu'à la fin de la journée", () => {
    expect(decouperJour(positions, dateDebut, 2)!.profile!.length).toBe(4);
    expect(decouperJour(positions, dateDebut, 1)!.profile!.length).toBe(2);
  });

  it("le premier jour n'a pas de veille à soustraire", () => {
    const j1 = decouperJour(positions, dateDebut, 1)!;
    expect(j1.stats!.distance).toBe(25_000);
    expect(j1.stats!.dplus).toBe(1200);
  });

  it("sans positions, la découpe ne casse rien", () => {
    expect(decouperJour(null, dateDebut, 2)).toBeNull();
    expect(decouperJour({ profile: [] }, dateDebut, 2)).toEqual({ profile: [] });
  });
});

describe("rendu satori + resvg (réel, hors ligne)", () => {
  it("les trois formats sortent aux dimensions annoncées", async () => {
    const data = await makeSource().collect();
    for (const format of ["story", "carrousel", "og"] as const) {
      const meta = await sharp(await rendre(data, format)).metadata();
      expect([meta.width, meta.height], format).toEqual([
        GABARITS[format].width,
        GABARITS[format].height,
      ]);
    }
  }, 60_000);

  it("les trois variantes (avant / live / terminé) sont générables en story", async () => {
    const jeux = [
      await makeSource().collect(),
      await makeSource({ "/live-timer.json": { running: false } }).collect(),
      await makeSource({
        "/live-config.json": { ...LIVE_CONFIG, aventure: { ...LIVE_CONFIG.aventure, statut: "termine" } },
      }).collect(),
    ];
    for (const data of jeux) {
      expect((await rendre(data, "story")).subarray(1, 4).toString(), data.variant).toBe("PNG");
    }
  }, 60_000);

  it("le carrousel accepte un encart, jusqu'à la limite documentée", async () => {
    const data = await makeSource().collect();
    const png = await rendre({ ...data, note: "x".repeat(NOTE_MAX) }, "carrousel");
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1350]);
  }, 30_000);

  it("une aventure sans AUCUNE donnée produit quand même une carte", async () => {
    const vide: OgData = {
      variant: "avant",
      aventure: {
        nom: "Aventure sans données",
        dates: "",
        dateDebut: "2026-08-20T06:00:00+02:00",
        distanceKm: 0,
        deniveleM: 0,
        statut: "avant",
        waypoints: [],
      },
      track: null,
      live: null,
      jour: null,
      lastWaypoint: null,
    };
    expect((await rendre(vide, "story")).subarray(1, 4).toString()).toBe("PNG");
  }, 30_000);
});

describe("liveFromArtefacts", () => {
  it("tolère des positions absentes ou sans coordonnées", () => {
    const rien = liveFromArtefacts(null, { running: true }, COORDS);
    expect(rien.running).toBe(true);
    expect(rien.coords).toEqual([]);
    expect(rien.pourcent).toBeNull();

    const bancales = liveFromArtefacts(
      { profile: [{ latitude: null, longitude: null }, { latitude: 44.9, longitude: 6.35 }] },
      { running: false },
      COORDS,
    );
    expect(bancales.coords).toEqual([[6.35, 44.9]]);
  });
});
