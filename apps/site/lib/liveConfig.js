// lib/liveConfig.js
//
// Configuration de l'aventure courante du hub /live : LE seul endroit à
// éditer quand une nouvelle aventure se prépare. Consommé par la page /live,
// la Navbar (lien Live), le bloc compact de /explorer et la route
// /live-config.json (lue par live-journal pour les cartes OG).
//
// Nettoyé (recette 2026-07-24) : les stats de la trace (distance, D+, bornes
// altimétriques) sont CALCULÉES depuis le GPX par build:track — la page et la
// carte OG les préfèrent toujours ; `distanceKm`/`deniveleM` ci-dessous ne
// sont qu'un repli d'affichage avant chargement.
//
// Check-list « nouvelle aventure » : slug · nom · dateDebut · dates ·
// intention · referenceTrack (`pnpm -F site build:track public/tracks/<x>.gpx`)
// · waypoints — puis, après l'export d'archive : statut "termine" + archivePath.

export const liveConfig = {
  aventure: {
    slug: "tour-des-ecrins-2026",
    nom: "Tour des Écrins en autonomie",
    // HEURE DE DÉPART réelle avec offset : pilote le compte à rebours, le
    // J-index du journal (frontière de jour à minuit heure française) et le
    // cas « premier signal ».
    dateDebut: "2026-08-20T06:00:00+02:00", // À AFFINER : heure de départ réelle
    // Période affichée par la carte OG de partage.
    dates: "20–24 août 2026",
    // REPLI d'affichage avant le chargement de la trace (la page et l'OG
    // préfèrent totalKm/dPlusM calculés du GPX).
    distanceKm: 194,
    deniveleM: 12000,
    // [PREMIER JET — à réécrire par Valentin] Intention de l'état « Avant ».
    intention:
      "Une boucle intégrale autour du massif, sans assistance, sur le fil du GR54.",
    // Bascule des trois états : "avant" | "termine" — l'état « En cours »
    // reste déclenché par le terrain (live-timer.running). Surchargeable au
    // build : NEXT_PUBLIC_LIVE_STATUT (recette, bascule express).
    statut: process.env.NEXT_PUBLIC_LIVE_STATUT || "avant",
    // Archive consommée par l'état « Terminé » (produite par export-archive).
    archivePath: "/replays/tour-des-ecrins-2026/archive.json",
  },

  // Paramètres de l'état « En cours ».
  live: {
    positionsPollMs: 10000, // sonde live-positions.json
    journalPollMs: 30000, // sonde journal.json
    zoneBlancheMinutes: 60, // seuil du régime « zone blanche probable »
    // Trace prévisionnelle LÉGÈRE précalculée (carte + profil + stats).
    // TEMPORAIRE : trace de travail — régénérer depuis le GPX définitif.
    referenceTrack: "/tracks/tour-des-ecrins_temp.track.json",
    // Repères du profil { nom, km } — vide tant que la liste n'est pas fournie.
    waypoints: [],
  },

  // Libellés des indicateurs HORS /live (accueil + tête de /explorer).
  indicateur: {
    enDirect: "Tour des Écrins en direct",
    prochainDepart: "Tour des Écrins",
  },
};

// Bases d'API, résolues au build (variables NEXT_PUBLIC_*). En dev avec le
// simulateur du chantier 2, pointer LES DEUX sur http://localhost:3999.
export const trackingApiBase =
  process.env.NEXT_PUBLIC_TRACKING_PROXY || "https://tracking.thelocomotionlab.com";
export const journalApiBase =
  process.env.NEXT_PUBLIC_JOURNAL_API || "https://api.thelocomotionlab.com";
