// lib/liveConfig.js
//
// La page /live : le SEUL fichier à éditer pour lancer une aventure.
//
// Changer d'aventure, en 3 gestes :
//   1. Dépose ta trace GPX dans  apps/site/public/tracks/   (ex. mon-tour.gpx)
//   2. Génère la trace légère :   pnpm -F site build:track public/tracks/mon-tour.gpx
//      → distance, D+, altitudes et profil sont CALCULÉS depuis le GPX :
//        tu n'as rien à recopier à la main.
//   3. Renseigne les champs ci-dessous, puis déploie.
//
// Les 3 états de la page :
//   • avant    — compte à rebours, tant que le tracker n'a pas démarré.
//   • en cours — AUTOMATIQUE dès  ./track start  sur le VPS (rien à toucher ici).
//   • terminé  — quand tu passes  statut  à "termine" (note tout en bas).

export const liveConfig = {
  aventure: {
    // Nom affiché en grand.
    nom: "Les 4x2000m de Chartreuse",

    // Départ : date + heure + fuseau (+02:00 l'été). Format MACHINE — pilote le
    // compte à rebours (LiveAvant) et le numéro du jour du journal (J1, J2…).
    dateDebut: "2026-07-24T08:30:00+02:00",

    // Période affichée, format HUMAIN. Ce n'est PAS un doublon de dateDebut :
    // celui-ci ne porte qu'un instant, alors qu'une aventure de plusieurs jours
    // s'annonce « du 20 au 24 août 2026 » — une fin qu'aucun calcul ne devine.
    // Sert uniquement à la carte de partage (via /live-config.json).
    dates: "24 juillet 2026",

    // Phrase d'intention, en italique sous le titre.
    intention: "Boucle qui relie les 4 sommets de plus 2 000 m de Chartreuse.",

    // Trace prévue : le .track.json généré au geste 2.
    trace: "/tracks/4x2000m-chartreuse.track.json",

    // Repères de cols sur le profil : [{ nom: "Col Vert", km: 6 }, …].
    // Laisse [] pour n'en afficher aucun.
    waypoints: [],

    // ——— Fin d'aventure seulement ———
    // "avant" pendant toute la prépa ET le direct ; "termine" une fois le
    // replay publié. (Astuce recette : NEXT_PUBLIC_LIVE_STATUT=termine au
    // build force l'aperçu « terminé » sans éditer ce fichier.)
    statut: process.env.NEXT_PUBLIC_LIVE_STATUT || "termine",

    // Dossier du replay, créé à l'arrivée par la commande export-archive.
    archive: "/replays/chartreuse-4x2000/archive.json",
  },

  // Libellés affichés AILLEURS que sur /live (accueil, tête de la page Explorer).
  indicateur: {
    enDirect: "Les 4x2000m de Chartreuse",
    prochainDepart: "Le tour des Écrins",
  },
};

// Réglages techniques — tu n'as pas besoin d'y toucher.
export const liveReglages = {
  positionsPollMs: 10000, // rafraîchissement de la carte (ms)
  journalPollMs: 30000, // rafraîchissement du journal (ms)
  zoneBlancheMinutes: 60, // minutes sans position avant l'alerte « zone blanche »
};

// Adresses des services (fixées au build par les variables NEXT_PUBLIC_*).
// En test local avec le simulateur, pointe les deux sur http://localhost:3999.
export const trackingApiBase =
  process.env.NEXT_PUBLIC_TRACKING_PROXY || "https://tracking.thelocomotionlab.com";
export const journalApiBase =
  process.env.NEXT_PUBLIC_JOURNAL_API || "https://api.thelocomotionlab.com";
