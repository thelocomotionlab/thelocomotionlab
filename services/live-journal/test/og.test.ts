// Cartes de partage : sélection de variante, « dernière étape franchie »,
// tolérance aux sources injoignables, et rendu RÉEL satori+resvg (PNG aux
// bonnes dimensions, vérifiées via sharp) — aucun réseau (fetch injecté).

import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { jourParis, lastWaypointPassed, OgDataSource } from "../src/og/data";
import { ogCard, storyCard } from "../src/og/cards";
import { renderPng } from "../src/og/render";

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

const TRACK = {
  schemaVersion: 1,
  totalKm: 194,
  profile: Array.from({ length: 50 }, (_, i) => ({
    km: (i / 49) * 194,
    alt: 1000 + 800 * Math.abs(Math.sin(i / 6)),
  })),
};

function fetcherWith(overrides: Record<string, unknown | null> = {}): typeof fetch {
  const routes: Record<string, unknown | null> = {
    "/live-config.json": LIVE_CONFIG,
    "/tracks/test.track.json": TRACK,
    "/live-positions.json": { stats: { distance: 96_400, dplus: 6240 } },
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

describe("OgDataSource", () => {
  it("variante live quand le direct tourne, avec jour et dernière étape", async () => {
    const data = await makeSource().collect();
    expect(data.variant).toBe("live");
    expect(data.aventure.nom).toBe("Tour des Écrins en autonomie");
    expect(data.live?.doneKm).toBeCloseTo(96.4);
    expect(data.lastWaypoint?.nom).toBe("Col de l'Aup Martin");
    expect(data.jour).toBeGreaterThanOrEqual(1);
    expect(data.track?.totalKm).toBe(194);
  });

  it("variante avant quand le timer est arrêté ; termine quand le statut le dit", async () => {
    const avant = await makeSource({ "/live-timer.json": { running: false } }).collect();
    expect(avant.variant).toBe("avant");

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
    const png = await renderPng(ogCard(data), 1200, 630);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
  });
});

describe("lastWaypointPassed / jourParis", () => {
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
});

describe("rendu satori + resvg (réel, hors ligne)", () => {
  it("og.png : 1200×630, contient le titre (SVG satori)", async () => {
    const data = await makeSource().collect();
    const png = await renderPng(ogCard(data), 1200, 630);
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 630]);
  }, 30_000);

  it("story.png : 1080×1920, variantes avant/termine générables aussi", async () => {
    const live = await makeSource().collect();
    const meta = await sharp(await renderPng(storyCard(live), 1080, 1920)).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1920]);

    const avant = await makeSource({ "/live-timer.json": { running: false } }).collect();
    const avantPng = await renderPng(storyCard(avant), 1080, 1920);
    expect(avantPng.subarray(1, 4).toString()).toBe("PNG");
  }, 30_000);
});
