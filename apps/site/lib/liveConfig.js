// lib/liveConfig.js
//
// Configuration de l'aventure courante du hub /live : LE seul endroit à
// éditer quand une nouvelle aventure se prépare. Consommé par la page /live
// (embed plein écran + bloc « prochain départ ») et par le bloc compact en
// tête de /explorer.

export const liveConfig = {
  // Affiché quand aucun direct n'est en cours.
  nextDeparture: {
    nom: "Tour des Écrins en autonomie",
    dates: "20–24 août 2026",
    distance: "194 km",
    denivele: "~12 000 m D+",
    // Version courte pour le bloc compact de /explorer.
    shortLabel: "Écrins · 20 août",
  },

  // Props de l'embed live (LiveTrackingLazy → LiveTrackingMap) quand le
  // direct est actif. apiBase et les endpoints sont résolus par l'adaptateur
  // (NEXT_PUBLIC_TRACKING_PROXY, puis domaine historique).
  embed: {
    title: "Tour des Écrins en direct",
    totalDistanceKm: 194,
    elevationMin: 700, // À REMPLACER : bornes altimétriques réelles du tour
    elevationMax: 3200, // À REMPLACER
    // À REMPLACER par la trace réelle (public/tracks/…) quand elle existera ;
    // null = l'embed s'affiche sans trace de référence.
    referenceGpx: null,
    pollIntervalMs: 10000,
    initialMapStyle: "osm",
  },
};
