// packages/tracking/src/replayData.ts
//
// Normalisation des données de REPLAY (post-course). Porté à l'identique de
// PostLiveTracking.jsx : gère le format courant ({ profile, stats }) ET l'ancien
// format (tableau brut de positions Traccar), encore présent dans certains
// public/replays/*. Pour l'ancien format, on RECALCULE distance / D+ / D- côté
// client (haversine + correction locale des virages).

import type { LngLat, ProfilePoint, RawTraccarPosition } from "./types";

export type NormalizedReplay = {
  coords: LngLat[];
  profile: ProfilePoint[];
  rawDistanceMeters: number;
  rawDplus: number;
  rawDminus: number;
  lastFixTime: string | null;
  durationSeconds: number | null;
  firstFixTime: string | null;
  lastProfilePoint: ProfilePoint | null;
};

type ComputedStats = {
  distanceMeters: number;
  dplus: number;
  dminus: number;
  profile: ProfilePoint[];
  rawDistanceMeters: number;
  rawDplus: number;
  rawDminus: number;
};

/**
 * Logique alignée sur le serveur : segments bruts, correction locale des
 * virages, intégration brute distance / D+ / D-. Les coefficients globaux sont
 * appliqués ensuite dans le composant (distanceFactor / ascentFactor / …).
 */
export function computeStatsFromPoints(points: RawTraccarPosition[]): ComputedStats {
  if (!Array.isArray(points) || points.length < 2) {
    return {
      distanceMeters: 0,
      dplus: 0,
      dminus: 0,
      profile: [],
      rawDistanceMeters: 0,
      rawDplus: 0,
      rawDminus: 0,
    };
  }

  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const haversine = (a: RawTraccarPosition, b: RawTraccarPosition) => {
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  // phase 1 : segments bruts
  type Seg = { d: number; dz: number; a: RawTraccarPosition; b: RawTraccarPosition };
  const segs: Seg[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = haversine(a, b);
    const dz = (b.altitude || 0) - (a.altitude || 0);
    segs.push({ d, dz, a, b });
  }

  // phase 2 : correction locale (virages)
  const correctedSegs: Seg[] = [];
  for (let i = 0; i < segs.length; i++) {
    const prev = segs[i - 1];
    const curr = segs[i];
    if (!prev) {
      correctedSegs.push(curr);
      continue;
    }

    const v1 = [
      curr.a.latitude - prev.a.latitude,
      curr.a.longitude - prev.a.longitude,
    ];
    const v2 = [
      curr.b.latitude - curr.a.latitude,
      curr.b.longitude - curr.a.longitude,
    ];

    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    const norm1 = Math.hypot(...v1);
    const norm2 = Math.hypot(...v2);

    const angle =
      norm1 && norm2
        ? Math.acos(Math.min(1, Math.max(-1, dot / (norm1 * norm2))))
        : 0;

    const curvatureFactor = 1 + 0.25 * (angle / Math.PI);
    correctedSegs.push({ ...curr, d: curr.d * curvatureFactor });
  }

  // phase 3 : intégration brute
  let totalDist = 0;
  let totalDplus = 0;
  let totalDminus = 0;

  let cumDist = 0;
  let cumDplus = 0;
  let cumDminus = 0;
  const profile: ProfilePoint[] = [];

  for (const s of correctedSegs) {
    totalDist += s.d;
    cumDist += s.d;

    if (s.dz > 0) {
      totalDplus += s.dz;
      cumDplus += s.dz;
    } else {
      totalDminus += -s.dz;
      cumDminus += -s.dz;
    }

    profile.push({
      distMeters: cumDist,
      alt: s.b.altitude || 0,
      dPlus: cumDplus,
      dMinus: cumDminus,
      latitude: s.b.latitude ?? null,
      longitude: s.b.longitude ?? null,
      fixTime: s.b.fixTime || null,
    });
  }

  return {
    distanceMeters: totalDist,
    dplus: totalDplus,
    dminus: totalDminus,
    profile,
    rawDistanceMeters: totalDist,
    rawDplus: totalDplus,
    rawDminus: totalDminus,
  };
}

function isNewLivePositionsFormat(data: unknown): boolean {
  return (
    !!data &&
    !Array.isArray(data) &&
    Array.isArray((data as { profile?: unknown }).profile)
  );
}

/** Normalise un JSON de replay (nouveau OU ancien format) en structure unique. */
export function normalizeReplayData(data: unknown): NormalizedReplay {
  if (isNewLivePositionsFormat(data)) {
    const obj = data as {
      profile?: ProfilePoint[];
      stats?: {
        distance?: number;
        dplus?: number;
        dminus?: number;
        lastFixTime?: string | null;
        durationSeconds?: number;
      };
    };
    const profile = Array.isArray(obj.profile) ? obj.profile : [];
    const stats = obj.stats || {};
    const lastPoint = profile.at(-1) || null;

    const coords: LngLat[] = profile
      .map((p): LngLat | null =>
        Number.isFinite(p?.longitude) && Number.isFinite(p?.latitude)
          ? [p.longitude as number, p.latitude as number]
          : null
      )
      .filter((c): c is LngLat => c !== null);

    const normalizedProfile: ProfilePoint[] = profile.map((p) => ({
      distMeters:
        typeof p?.distMeters === "number"
          ? p.distMeters
          : Number(p?.distKm || 0) * 1000,
      alt: p?.alt || 0,
      dPlus: p?.dPlus || 0,
      dMinus: p?.dMinus || 0,
      latitude: p?.latitude ?? null,
      longitude: p?.longitude ?? null,
      fixTime: p?.fixTime || null,
    }));

    const rawDistanceMeters =
      typeof stats?.distance === "number"
        ? stats.distance
        : lastPoint?.distMeters || 0;

    const rawDplus =
      typeof stats?.dplus === "number" ? stats.dplus : lastPoint?.dPlus || 0;

    const rawDminus =
      typeof stats?.dminus === "number" ? stats.dminus : lastPoint?.dMinus || 0;

    return {
      coords,
      profile: normalizedProfile,
      rawDistanceMeters,
      rawDplus,
      rawDminus,
      lastFixTime: stats?.lastFixTime || lastPoint?.fixTime || null,
      durationSeconds:
        typeof stats?.durationSeconds === "number" ? stats.durationSeconds : null,
      firstFixTime: profile[0]?.fixTime || null,
      lastProfilePoint: lastPoint,
    };
  }

  if (Array.isArray(data)) {
    const positions = data as RawTraccarPosition[];
    const computed = computeStatsFromPoints(positions);
    const coords: LngLat[] = positions.map((p) => [p.longitude, p.latitude]);

    return {
      coords,
      profile: computed.profile,
      rawDistanceMeters: computed.rawDistanceMeters,
      rawDplus: computed.rawDplus,
      rawDminus: computed.rawDminus,
      lastFixTime: positions.at(-1)?.fixTime || null,
      durationSeconds: null,
      firstFixTime: positions[0]?.fixTime || null,
      lastProfilePoint: computed.profile.at(-1) || null,
    };
  }

  return {
    coords: [],
    profile: [],
    rawDistanceMeters: 0,
    rawDplus: 0,
    rawDminus: 0,
    lastFixTime: null,
    durationSeconds: null,
    firstFixTime: null,
    lastProfilePoint: null,
  };
}
