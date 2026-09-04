// lib/freshness.js
//
// L'indicateur de fraîcheur à DEUX RÉGIMES, plus le cas « premier signal ».
// Fonction pure : le composant FreshnessPill ne fait que l'habiller.
// Ton : information de terrain — la zone blanche n'est JAMAIS une alerte.

import { formatAgo } from "./liveTime";

/**
 * @param {object} p
 * @param {boolean} p.running        live-timer.running
 * @param {string|null} p.lastFixTime ISO de la dernière position (ou null)
 * @param {number} p.nowMs           horloge injectée (testabilité)
 * @param {number} p.zoneBlancheMinutes seuil (liveConfig, défaut 60)
 * @returns {{regime: "premier-signal"|"normal"|"zone-blanche"|"termine", ageMinutes: number|null, strong: string, rest: string}|null}
 *          null si rien à afficher (pas de direct).
 */
export function freshnessState({ running, lastFixTime, nowMs, zoneBlancheMinutes }) {
  if (!lastFixTime) {
    if (!running) return null;
    // Le direct tourne mais aucune position n'est encore arrivée.
    return {
      regime: "premier-signal",
      ageMinutes: null,
      strong: "En attente du premier signal",
      rest: "",
    };
  }

  const parsed = Date.parse(lastFixTime);
  if (!Number.isFinite(parsed)) return null;
  const ageMinutes = Math.max(0, Math.floor((nowMs - parsed) / 60_000));

  // Session arrêtée (./track stop) = aventure terminée. Aucune alerte : la
  // page reste consultable telle quelle jusqu'à l'archivage définitif.
  if (!running) {
    return {
      regime: "termine",
      ageMinutes,
      strong: "Aventure terminée",
      rest: "",
    };
  }

  if (ageMinutes >= zoneBlancheMinutes) {
    // Texte exact du design (2e) — seul « Zone blanche probable » est en gras.
    return {
      regime: "zone-blanche",
      ageMinutes,
      strong: "Zone blanche probable",
      rest: ` — dernière position ${formatAgo(ageMinutes)}`,
    };
  }

  return {
    regime: "normal",
    ageMinutes,
    strong: "",
    rest: `Dernière position ${formatAgo(ageMinutes)}`,
  };
}
