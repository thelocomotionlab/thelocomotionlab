// services/tracking-cache/src/compute.ts
//
// Calcul des stats + profil officiel à partir des positions GPS brutes.
// Porté À L'IDENTIQUE de live-cache.mjs (computeLiveData), typé, avec UNE seule
// addition : un filtre par fenêtre de collecte (windowStart) — il remplace
// l'ancienne date en dur. Les corrections/filtres ne sont jamais stockés dans le
// cache brut : tout est recalculé depuis les bruts à chaque appel.
//
// Étapes : 0) filtre dérive GPS statique · 1) haversine + filtre altimétrique ·
// 2) correction locale de courbure · 3-4) cumul brut + coefficients → profil ·
// 5) stats globales lues depuis le dernier point du profil.

import type { ComputeParams, LivePositions, ProfilePoint, TraccarPosition } from "./types";

const R = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

function haversine(a: TraccarPosition, b: TraccarPosition): number {
  const dLat = toRad((b.latitude ?? 0) - (a.latitude ?? 0));
  const dLon = toRad((b.longitude ?? 0) - (a.longitude ?? 0));
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.latitude ?? 0)) * Math.cos(toRad(b.latitude ?? 0)) * sinLon * sinLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function computeLiveData(
  allPoints: TraccarPosition[],
  params: ComputeParams,
  windowStartIso: string | null
): LivePositions {
  const {
    samplingCorrection,
    elevationPlusCorrection,
    elevationMinusCorrection,
    minDistanceThreshold,
    minElevationPlusThreshold,
    minElevationMinusThreshold,
  } = params;

  const debugMeta = {
    samplingCorrection,
    elevationPlusCorrection,
    elevationMinusCorrection,
    minDistanceThreshold,
    minElevationPlusThreshold,
    minElevationMinusThreshold,
    windowStart: windowStartIso,
  };

  // Fenêtre de collecte : ne garder que les points depuis windowStart (si défini).
  // Remplace la date en dur de l'ancien live-cache.mjs.
  const points =
    windowStartIso != null
      ? allPoints.filter((p) => !!p.fixTime && p.fixTime >= windowStartIso)
      : allPoints;

  if (!Array.isArray(points) || points.length === 0) {
    return {
      meta: { pointCount: 0, updatedAt: new Date().toISOString() },
      stats: { distance: 0, dplus: 0, dminus: 0, durationSeconds: 0, lastFixTime: null },
      profile: [],
      debug: { rawDistance: 0, rawDplus: 0, rawDminus: 0, ...debugMeta },
    };
  }

  if (points.length === 1) {
    const p = points[0];
    return {
      meta: { pointCount: 1, updatedAt: new Date().toISOString() },
      stats: { distance: 0, dplus: 0, dminus: 0, durationSeconds: 0, lastFixTime: p.fixTime ?? null },
      profile: [
        {
          idx: 0,
          fixTime: p.fixTime ?? null,
          latitude: p.latitude ?? null,
          longitude: p.longitude ?? null,
          alt: p.altitude ?? 0,
          distMeters: 0,
          distKm: 0,
          dPlus: 0,
          dMinus: 0,
        },
      ],
      debug: { rawDistance: 0, rawDplus: 0, rawDminus: 0, ...debugMeta },
    };
  }

  // --- Phase 0 : filtrage de la dérive GPS statique ---
  const filteredPoints: TraccarPosition[] = [points[0]];
  let lastAccepted = points[0];
  for (let i = 1; i < points.length; i++) {
    if (haversine(lastAccepted, points[i]) >= minDistanceThreshold) {
      filteredPoints.push(points[i]);
      lastAccepted = points[i];
    }
  }

  // --- Phase 1 : haversine brute par segment + filtrage altimétrique ---
  type Seg = { d: number; dz: number; a: TraccarPosition; b: TraccarPosition; idx: number };
  const segs: Seg[] = [];
  for (let i = 1; i < filteredPoints.length; i++) {
    const a = filteredPoints[i - 1];
    const b = filteredPoints[i];
    let dz = (b.altitude ?? 0) - (a.altitude ?? 0);
    if (dz > 0 && dz < minElevationPlusThreshold) dz = 0;
    if (dz < 0 && -dz < minElevationMinusThreshold) dz = 0;
    segs.push({ d: haversine(a, b), dz, a, b, idx: i });
  }

  // --- Phase 2 : correction locale de courbure ---
  const correctedSegs: Seg[] = segs.map((curr, i) => {
    if (i === 0) return curr;
    const prev = segs[i - 1];
    const v1 = [
      (curr.a.latitude ?? 0) - (prev.a.latitude ?? 0),
      (curr.a.longitude ?? 0) - (prev.a.longitude ?? 0),
    ];
    const v2 = [
      (curr.b.latitude ?? 0) - (curr.a.latitude ?? 0),
      (curr.b.longitude ?? 0) - (curr.a.longitude ?? 0),
    ];
    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    const n1 = Math.hypot(v1[0], v1[1]);
    const n2 = Math.hypot(v2[0], v2[1]);
    const angle =
      n1 > 0 && n2 > 0 ? Math.acos(Math.min(1, Math.max(-1, dot / (n1 * n2)))) : 0;
    return { ...curr, d: curr.d * (1 + 0.25 * (angle / Math.PI)) };
  });

  // --- Phase 3 & 4 : cumul brut + application des coefficients → profil ---
  let rawDist = 0;
  let rawDplus = 0;
  let rawDminus = 0;

  const first = filteredPoints[0];
  const profile: ProfilePoint[] = [
    {
      idx: 0,
      fixTime: first.fixTime ?? null,
      latitude: first.latitude ?? null,
      longitude: first.longitude ?? null,
      alt: first.altitude ?? 0,
      distMeters: 0,
      distKm: 0,
      dPlus: 0,
      dMinus: 0,
    },
  ];

  for (const s of correctedSegs) {
    rawDist += s.d;
    if (s.dz > 0) rawDplus += s.dz;
    else if (s.dz < 0) rawDminus -= s.dz;

    const corrDist = rawDist * samplingCorrection;
    const corrDplus = rawDplus * elevationPlusCorrection;
    const corrDminus = rawDminus * elevationMinusCorrection;

    profile.push({
      idx: s.idx,
      fixTime: s.b.fixTime ?? null,
      latitude: s.b.latitude ?? null,
      longitude: s.b.longitude ?? null,
      alt: s.b.altitude ?? 0,
      distMeters: Math.round(corrDist),
      distKm: Number((corrDist / 1000).toFixed(3)),
      dPlus: Math.round(corrDplus),
      dMinus: Math.round(corrDminus),
    });
  }

  // --- Phase 5 : stats globales depuis le dernier point du profil ---
  const lastPoint = profile.at(-1) as ProfilePoint;

  // Durée : points (bruts dans la fenêtre) pour ne pas perdre le temps immobile.
  const startTime = points[0]?.fixTime ? new Date(points[0].fixTime) : null;
  const lastRaw = points.at(-1);
  const endTime = lastRaw?.fixTime ? new Date(lastRaw.fixTime) : null;
  const durationSeconds =
    startTime && endTime
      ? Math.max(0, Math.floor((endTime.getTime() - startTime.getTime()) / 1000))
      : 0;

  return {
    meta: { pointCount: filteredPoints.length, updatedAt: new Date().toISOString() },
    stats: {
      distance: lastPoint.distMeters,
      dplus: lastPoint.dPlus,
      dminus: lastPoint.dMinus,
      durationSeconds,
      lastFixTime: lastRaw?.fixTime ?? null,
    },
    profile,
    debug: { rawDistance: rawDist, rawDplus, rawDminus, ...debugMeta },
  };
}
