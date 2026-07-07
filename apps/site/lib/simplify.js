// lib/simplify.js
//
// Douglas-Peucker itératif : la trace est SIMPLIFIÉE AVANT AFFICHAGE (règle du
// brief §5 — un GPX de 20 000 points n'a rien à faire dans maplibre tel quel).
// Distances en degrés plan (suffisant pour une simplification d'affichage à
// l'échelle d'un massif) ; tolérance par défaut ≈ 8-9 m.

const DEFAULT_TOLERANCE = 0.00008;

/** Distance perpendiculaire (en degrés) d'un point [lng, lat] au segment a-b. */
function perpendicularDistance(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  const t = Math.max(
    0,
    Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared),
  );
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy));
}

/**
 * Simplifie une polyligne [[lng, lat], …]. Itératif (pile) : pas de limite de
 * récursion sur les grosses traces. Préserve premier et dernier point.
 */
export function simplifyTrack(points, tolerance = DEFAULT_TOLERANCE) {
  if (!Array.isArray(points) || points.length <= 2) return points ?? [];

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let maxDistance = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const distance = perpendicularDistance(points[i], points[first], points[last]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const result = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) result.push(points[i]);
  return result;
}
