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
//     Elle reste affichée, FIGÉE, après  ./track stop  : c'est l'état de fin.

export const liveConfig = {
  aventure: {
    // Nom affiché en grand.
    nom: "Les 4x2000m de Chartreuse",

    // Départ : date + heure + fuseau (+02:00 l'été). Pilote le compte à
    // rebours et le numéro du jour du journal.
    dateDebut: "2026-08-04T20:30:00+02:00",

    // Période affichée sur la carte de partage.
    dates: "4 août 2026",

    // Phrase d'intention, en italique sous le titre.
    intention: "Boucle qui relie les 4 sommets de plus 2 000 m de Chartreuse.",

    // Trace prévue : le .track.json généré au geste 2.
    trace: "/tracks/4x2000m-chartreuse.track.json",

    // Repères de cols sur le profil : [{ nom: "Col Vert", km: 6 }, …].
    // Laisse [] pour n'en afficher aucun.
    waypoints: [],

    // Deux valeurs seulement :
    //   • "avant" — en toutes circonstances (prépa, direct, et après : la page
    //     reste figée sur les dernières données jusqu'au prochain `track reset`) ;
    //   • "repos" — quand AUCUNE aventure n'est prévue.
    // (Astuce recette : NEXT_PUBLIC_LIVE_STATUT=repos au build force l'aperçu
    // sans éditer ce fichier.)
    statut: process.env.NEXT_PUBLIC_LIVE_STATUT || "avant",
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
