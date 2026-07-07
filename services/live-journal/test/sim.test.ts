// Parseur GPX naïf + construction de trace du simulateur.

import { describe, expect, it } from "vitest";

import { buildTrack, parseGpx } from "../src/sim/positions";

const GPX = `<?xml version="1.0"?>
<gpx><trk><trkseg>
  <trkpt lat="44.9000" lon="6.1000"><ele>1000</ele><time>2026-08-20T05:00:00Z</time></trkpt>
  <trkpt lat="44.9090" lon="6.1000"><ele>1150</ele></trkpt>
  <trkpt lat="44.9180" lon="6.1000"><ele>1100</ele></trkpt>
</trkseg></trk></gpx>`;

describe("simulateur — GPX", () => {
  it("parse lat/lon/ele des trkpt", () => {
    const points = parseGpx(GPX);
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ lat: 44.9, lon: 6.1, ele: 1000 });
  });

  it("cumule distance (haversine) et D+/D-", () => {
    const track = buildTrack(parseGpx(GPX));
    // 0,009° de latitude ≈ 1 km par segment.
    expect(track[1].distMeters).toBeGreaterThan(900);
    expect(track[1].distMeters).toBeLessThan(1100);
    expect(track[2].distMeters).toBeGreaterThan(1800);
    expect(track[2].dPlus).toBe(150);
    expect(track[2].dMinus).toBe(50);
  });
});
