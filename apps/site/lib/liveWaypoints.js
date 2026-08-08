// lib/liveWaypoints.js
//
// Les repères (`waypoints`) de liveConfig sont saisis en KILOMÈTRES le long du
// parcours — c'est ce que Valentin lit sur une trace, et ça reste juste même
// si le GPX est régénéré. La carte, elle, a besoin de COORDONNÉES : on les
// retrouve ici, en projetant le km sur le profil de la trace de référence
// (.track.json, qui porte km/alt/lat/lng pour chacun de ses points).
//
// Séparé des composants pour être testable sans DOM ni maplibre : `pointAuKm`
// est la seule partie qui fait un vrai calcul, et c'est elle qui décide où
// l'icône se pose sur la carte.

import { iconeDuRepere } from "./liveWaypointIcons";

/**
 * Point (lat/lng/alt) à `km` sur un profil trié par km croissant.
 * Interpolation LINÉAIRE entre les deux points encadrants : le profil est
 * décimé (~400 points, soit ~75 m sur une trace de 30 km) et un repère posé
 * « au col » tomberait visiblement à côté si on se contentait du point le
 * plus proche.
 * Retourne null si le profil est inutilisable ou le km hors trace.
 */
export function pointAuKm(profile, km) {
  if (!Array.isArray(profile) || profile.length === 0) return null;
  if (!Number.isFinite(km) || km < 0) return null;

  const premier = profile[0];
  const dernier = profile[profile.length - 1];
  // Hors bornes : on s'arrête aux extrémités plutôt que d'extrapoler.
  if (km <= premier.km) return { lat: premier.lat, lng: premier.lng, alt: premier.alt };
  if (km >= dernier.km) return { lat: dernier.lat, lng: dernier.lng, alt: dernier.alt };

  for (let i = 1; i < profile.length; i++) {
    const b = profile[i];
    if (b.km < km) continue;
    const a = profile[i - 1];
    const span = b.km - a.km;
    // Deux points au même km (trace à l'arrêt) : pas d'interpolation possible.
    const t = span > 0 ? (km - a.km) / span : 0;
    return {
      lat: a.lat + (b.lat - a.lat) * t,
      lng: a.lng + (b.lng - a.lng) * t,
      alt: a.alt + (b.alt - a.alt) * t,
    };
  }
  return null;
}

/**
 * Prépare les repères pour l'affichage : icône résolue, position sur la carte
 * (lng/lat) et position sur le profil (`frac`, 0 → 1).
 *
 * - Un repère sans km exploitable est ÉCARTÉ (on ne sait pas où le poser).
 * - Un repère dont la position n'est pas retrouvable garde quand même sa
 *   `frac` : il apparaît sur le profil, pas sur la carte. Tant que le
 *   .track.json n'est pas chargé, c'est le cas de tous.
 *
 * @param {Array<{nom?: string, km: number, icone?: string}>} waypoints
 * @param {{profile?: Array, totalKm?: number}|null} reference trace de référence
 */
export function reperesAffichables(waypoints, reference) {
  if (!Array.isArray(waypoints) || waypoints.length === 0) return [];
  const totalKm = reference?.totalKm;
  const profile = reference?.profile;

  return waypoints
    .filter((w) => w && Number.isFinite(w.km) && w.km >= 0)
    .map((w, i) => {
      const point = pointAuKm(profile, w.km);
      return {
        // Le nom n'est pas garanti unique (deux « Ravito ») : l'index le rend sûr.
        cle: `${i}-${w.nom ?? w.km}`,
        nom: w.nom ?? "",
        km: w.km,
        Icone: iconeDuRepere(w.icone),
        // Position sur le profil, bornée : un repère saisi au-delà de la
        // distance totale se colle à l'arrivée au lieu de sortir du cadre.
        frac: totalKm > 0 ? Math.min(1, Math.max(0, w.km / totalKm)) : null,
        lng: point?.lng ?? null,
        lat: point?.lat ?? null,
      };
    });
}

/** Les repères posables sur la carte (coordonnées retrouvées). */
export function reperesSurCarte(waypoints, reference) {
  return reperesAffichables(waypoints, reference).filter(
    (r) => Number.isFinite(r.lng) && Number.isFinite(r.lat),
  );
}

/** Les repères posables sur le profil altimétrique (abscisse connue). */
export function reperesSurProfil(waypoints, reference) {
  return reperesAffichables(waypoints, reference).filter((r) => Number.isFinite(r.frac));
}
