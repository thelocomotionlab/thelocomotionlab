// LE TEST QUI JUSTIFIE LA DUPLICATION.
//
// `src/og/progression.ts` est un port du module JS du site
// (apps/site/lib/progression.js) : le site est en ESM compilé par Next, ce
// service en CommonJS compilé par tsc — aucun des deux ne peut importer l'autre
// sans changer sa chaîne de build.
//
// Une duplication n'est acceptable que si sa divergence est DÉTECTÉE. Ce test
// exécute donc les DEUX implémentations sur les traces réelles du dépôt et
// exige le même résultat au millimètre. Il ne tourne qu'en développement (le
// conteneur n'embarque pas le site) — c'est exactement là qu'on modifie le
// calcul.

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { avancementSurTrace as portTS, cumulDistances as cumulTS } from "../src/og/progression";
import type { LonLat } from "../src/og/progression";

const REPO = path.resolve(__dirname, "..", "..", "..");
const SITE_MODULE = path.join(REPO, "apps", "site", "lib", "progression.js");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const site = (await import(/* @vite-ignore */ SITE_MODULE)) as any;

interface TrackJson {
  coords: LonLat[];
  totalKm: number;
}
interface PositionsJson {
  profile: Array<{ latitude: number; longitude: number; fixTime: string }>;
}

function lire<T>(relatif: string): T | null {
  const p = path.join(REPO, relatif);
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as T) : null;
}

const TRACES = [
  "apps/site/public/tracks/croix_de_belledonne.track.json",
  "apps/site/public/tracks/4x2000m-chartreuse.track.json",
  "apps/site/public/tracks/vouillands_test.track.json",
  "apps/site/public/tracks/tour-des-ecrins_temp.track.json",
];

describe("parité avec apps/site/lib/progression.js", () => {
  it("le module du site est bien celui qu'on croit", () => {
    expect(typeof site.avancementSurTrace).toBe("function");
    expect(typeof site.cumulDistances).toBe("function");
  });

  it("cumulDistances : mêmes distances cumulées sur les traces réelles", () => {
    for (const relatif of TRACES) {
      const track = lire<TrackJson>(relatif);
      if (!track) continue;
      const a = cumulTS(track.coords);
      const b = site.cumulDistances(track.coords);
      expect(a.length, relatif).toBe(b.length);
      expect(a[a.length - 1], relatif).toBeCloseTo(b[b.length - 1], 6);
    }
  });

  it("avancementSurTrace : même avancement, sur la trace ET à contresens", () => {
    for (const relatif of TRACES) {
      const track = lire<TrackJson>(relatif);
      if (!track || track.coords.length < 10) continue;

      // « Vécu » synthétique : on suit l'itinéraire jusqu'à 60 %, en bruitant
      // légèrement (le GPS ne colle jamais au GPX au mètre près).
      const jusqua = Math.floor(track.coords.length * 0.6);
      const t0 = Date.parse("2026-08-06T06:00:00Z");
      const vecu = track.coords.slice(0, jusqua).map(([lon, lat], i) => ({
        longitude: lon + Math.sin(i) * 0.0002,
        latitude: lat + Math.cos(i) * 0.0002,
        fixTime: new Date(t0 + i * 30_000).toISOString(),
      }));

      for (const [nom, reference] of [
        ["sens du fichier", track.coords],
        ["à contresens", [...track.coords].reverse()],
      ] as const) {
        const a = portTS(reference as LonLat[], vecu);
        const b = site.avancementSurTrace(reference, vecu);
        expect(a === null, `${relatif} (${nom})`).toBe(b === null);
        if (a && b) {
          expect(a.pourcent, `${relatif} (${nom})`).toBeCloseTo(b.pourcent, 9);
          expect(a.metresParcourus, `${relatif} (${nom})`).toBeCloseTo(b.metresParcourus, 6);
        }
      }
    }
  });

  it("avancementSurTrace : mêmes refus (entrées absentes, vides, trop courtes)", () => {
    const cas: Array<[unknown, unknown]> = [
      [undefined, undefined],
      [[], []],
      [[[5.9, 45.2]], [{ longitude: 5.9, latitude: 45.2 }]],
      [
        [
          [5.9, 45.2],
          [5.9, 45.3],
        ],
        [],
      ],
    ];
    for (const [ref, vecu] of cas) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(portTS(ref as any, vecu as any)).toEqual(site.avancementSurTrace(ref, vecu));
    }
  });

  it("sur des positions RÉELLES de replay, les deux donnent le même pourcentage", () => {
    const track = lire<TrackJson>("apps/site/public/tracks/4x2000m-chartreuse.track.json");
    const positions = lire<PositionsJson>("apps/site/public/replays/traversee-chartreuse/live-positions.json");
    if (!track || !positions) return;
    const a = portTS(track.coords, positions.profile);
    const b = site.avancementSurTrace(track.coords, positions.profile);
    expect(a === null).toBe(b === null);
    if (a && b) expect(a.pourcent).toBeCloseTo(b.pourcent, 9);
  });
});
