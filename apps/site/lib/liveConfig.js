// lib/liveConfig.js
//
// Configuration de l'aventure courante du hub /live : LE seul endroit à
// éditer quand une nouvelle aventure se prépare. Consommé par la page /live
// (état « En cours » v2 + bloc « prochain départ ») et par le bloc compact
// en tête de /explorer.

export const liveConfig = {
  // L'aventure (une aventure = un objet). `dateDebut` porte l'HEURE DE DÉPART
  // réelle avec offset : c'est elle qui pilote le J-index du journal (frontière
  // de jour à minuit heure française) et le cas « premier signal ».
  aventure: {
    slug: "tour-des-ecrins-2026",
    nom: "Tour des Écrins en autonomie",
    dateDebut: "2026-08-20T06:00:00+02:00", // À AFFINER : heure de départ réelle
    dates: "20–24 août 2026",
    distanceKm: 194,
    deniveleM: 12000,
    // [PREMIER JET — à réécrire par Valentin] Intention de l'état « Avant »,
    // en Lora italique (texte issu du design 2b).
    intention:
      "Une boucle intégrale autour du massif, seul et sans assistance, sur le fil du GR54. Le direct s'ouvrira ici au premier pas.",
    // Bascule des trois états (plan PR3 §2) : "avant" | "termine".
    // L'état « En cours » reste déclenché par le terrain (live-timer.running).
    // Surchargeable au build : NEXT_PUBLIC_LIVE_STATUT (recette, bascule express).
    statut: process.env.NEXT_PUBLIC_LIVE_STATUT || "avant",
    // Archive consommée par l'état « Terminé » (produite par export-archive).
    archivePath: "/replays/tour-des-ecrins-2026/archive.json",
  },

  // Paramètres de l'état « En cours » (design live-v2).
  live: {
    positionsPollMs: 10000, // sonde live-positions.json
    journalPollMs: 30000, // sonde journal.json
    zoneBlancheMinutes: 60, // seuil du régime « zone blanche probable »
    // Trace prévisionnelle (pointillés sous la trace vécue + profil altimétrique).
    // Version LÉGÈRE précalculée : `pnpm -F site build:track public/tracks/<x>.gpx`.
    // TEMPORAIRE : trace de travail — régénérer depuis le GPX définitif des Écrins.
    referenceTrack: "/tracks/tour-des-ecrins_temp.track.json",
    elevationMin: 700, // À REMPLACER : bornes altimétriques réelles du tour
    elevationMax: 3200, // À REMPLACER
    // Repères du profil altimétrique { nom, km } — Sarenne, Lautaret, Arsine,
    // Aup Martin, Vauze/Muzelle… PLACEHOLDER PROPRE (vide) tant que Valentin
    // n'a pas fourni la liste avec les kilométrages (brief §10.3).
    waypoints: [],
  },

  // Affiché quand aucun direct n'est en cours (état chantier 1 — refonte en PR3).
  nextDeparture: {
    nom: "Tour des Écrins en autonomie",
    dates: "20–24 août 2026",
    distance: "194 km",
    denivele: "~12 000 m D+",
    // Version courte pour le bloc compact de /explorer.
    shortLabel: "Écrins · 20 août",
    // Libellé de l'indicateur live de l'accueil (« Prochain départ — … »).
    homeLabel: "Tour des Écrins",
  },

  // Props de l'ancien embed (LiveTrackingLazy → LiveTrackingMap). Seul `title`
  // est encore lu (ExplorerLiveIndicator). L'état « En cours » v2 ne s'en sert plus.
  embed: {
    title: "Tour des Écrins en direct",
    totalDistanceKm: 194,
    elevationMin: 700,
    elevationMax: 3200,
    referenceGpx: null,
    pollIntervalMs: 10000,
    initialMapStyle: "osm",
  },
};

// Bases d'API, résolues au build (variables NEXT_PUBLIC_*). En dev avec le
// simulateur du chantier 2, pointer LES DEUX sur http://localhost:3000.
export const trackingApiBase =
  process.env.NEXT_PUBLIC_TRACKING_PROXY || "https://tracking.thelocomotionlab.com";
export const journalApiBase =
  process.env.NEXT_PUBLIC_JOURNAL_API || "https://api.thelocomotionlab.com";
