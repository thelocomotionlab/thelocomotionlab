// services/tracking-cache/src/gpx.test.ts
//
// Sérialisation GPX : ce qu'un lecteur tiers (Strava, Komoot, le moteur Twin)
// doit pouvoir relire sans broncher.

import assert from "node:assert/strict";
import { test } from "node:test";

import { versGpx } from "./gpx";

const P = (lat: number, lon: number, ele: number | null, time: string | null) => ({ lat, lon, ele, time });

test("versGpx : un trkpt par point, avec altitude et horodatage", () => {
  const gpx = versGpx(
    [P(44.98743, 6.11578, 1042.4, "2026-08-22T06:06:57.636Z"), P(44.98851, 6.11641, 1050, "2026-08-22T06:07:12Z")],
    { nom: "Tour des Écrins" },
  );
  assert.ok(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(gpx.includes('<trkpt lat="44.987430" lon="6.115780">'));
  assert.ok(gpx.includes("<ele>1042.4</ele>"));
  assert.ok(gpx.includes("<time>2026-08-22T06:06:57.636Z</time>"));
  assert.equal(gpx.match(/<trkpt /g)?.length, 2);
  assert.ok(gpx.trimEnd().endsWith("</gpx>"));
});

test("versGpx : « +00:00 » devient « Z » — Traccar rend l'un, le GPX attend l'autre", () => {
  const gpx = versGpx([P(44.9, 6.1, 1000, "2026-08-23T11:11:13.000+00:00")], { nom: "T" });
  assert.ok(gpx.includes("<time>2026-08-23T11:11:13.000Z</time>"));
  assert.ok(!gpx.includes("+00:00"));
});

test("versGpx : les points sans coordonnées finies sont écartés", () => {
  const gpx = versGpx(
    [
      P(44.9, 6.1, 1000, null),
      { lat: NaN, lon: 6.1, ele: 1, time: null },
      { lat: 44.9, lon: null as unknown as number, ele: 1, time: null },
    ],
    { nom: "T" },
  );
  assert.equal(gpx.match(/<trkpt /g)?.length, 1);
});

test("versGpx : ni ele ni time quand ils manquent, et aucune balise vide", () => {
  const gpx = versGpx([{ lat: 44.9, lon: 6.1 }], { nom: "T" });
  assert.ok(gpx.includes('<trkpt lat="44.900000" lon="6.100000"></trkpt>'));
  assert.ok(!gpx.includes("<ele>"));
  assert.ok(!gpx.includes("<time>"));
});

test("versGpx : le fichier est horodaté au PREMIER point, pas à l'heure d'export", () => {
  const gpx = versGpx([P(44.9, 6.1, 1, null), P(44.91, 6.11, 1, "2026-08-22T06:06:57.000Z")], { nom: "T" });
  assert.ok(gpx.includes("    <time>2026-08-22T06:06:57.000Z</time>"));
});

test("versGpx : le nom est échappé", () => {
  const gpx = versGpx([P(44.9, 6.1, 1, null)], { nom: 'Écrins & <cie> "2026"' });
  assert.ok(gpx.includes("<name>Écrins &amp; &lt;cie&gt; &quot;2026&quot;</name>"));
  assert.ok(!gpx.includes("<cie>"));
});

test("versGpx : sans aucun point, le GPX reste valide", () => {
  const gpx = versGpx([], { nom: "T" });
  assert.ok(gpx.includes("<trkseg>"));
  assert.ok(!gpx.includes("<trkpt"));
});
