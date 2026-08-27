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
    nom: "Tour des Écrins",

    // Départ : date + heure + fuseau (+02:00 l'été). Pilote le compte à
    // rebours et le numéro du jour du journal.
    dateDebut: "2026-08-22T08:00:00+02:00",

    // Période affichée sur la carte de partage.
    dates: "22 août 2026",

    // Phrase d'intention, en italique sous le titre.
    intention: "En autonomie complète sur 4 jours.",

    // Trace prévue : le .track.json généré au geste 2.
    trace: "/tracks/tour-des-ecrins.track.json",

    // Repères du parcours. Chacun pose DEUX choses, à partir du seul km :
    //   • sur la CARTE  : une pastille avec l'icône choisie ;
    //   • sur le PROFIL : un pointillé vertical, l'icône en haut.
    // Le nom ne s'affiche plus en toutes lettres (les libellés se marchaient
    // dessus dès que deux repères étaient proches) : il apparaît au survol et
    // le lisent les lecteurs d'écran. Garde-le court et parlant quand même.
    //
    //   waypoints: [
    //     { nom: "Col Vert",     km: 6,    icone: "col" },
    //     { nom: "Bivouac lac",  km: 23.5, icone: "bivouac" },
    //     { nom: "Source",       km: 31,   icone: "eau" },
    //   ],
    //
    // `icone` : une clé de lib/liveWaypointIcons.js — sommet, col, neige,
    // bivouac, refuge, eau, ravitaillement, commerce, village, route,
    // recharge, depart, arrivee, sentier, velo, foret, riviere, lever-soleil,
    // coucher-soleil, nuit, pluie, vent, photo, danger, secours, repere.
    // Il en manque une ? Ajoute-la dans ce fichier (le mode d'emploi y est).
    // Une clé absente ou mal orthographiée retombe sur le repère générique :
    // ça ne casse jamais la page en plein direct.
    //
    // Le km peut être décimal. Laisse [] pour n'afficher aucun repère.

/*    waypoints: [],*/
    waypoints: [
      { nom: "Valgaudémar",       km: 57.47,   icone: "bivouac" },
      { nom: "Vallouise",     km: 108.7,    icone: "bivouac" },
      { nom: "Arsine",  km: 155.5, icone: "bivouac" },
    ],
    
    // Deux valeurs seulement :
    //   • "avant" — en toutes circonstances (prépa, direct, et après : la page
    //     reste figée sur les dernières données jusqu'au prochain `track reset`) ;
    //   • "repos" — quand AUCUNE aventure n'est prévue.
    // (Astuce recette : NEXT_PUBLIC_LIVE_STATUT=repos au build force l'aperçu
    // sans éditer ce fichier.)
    statut: process.env.NEXT_PUBLIC_LIVE_STATUT || "repos",
  },

  // Libellés affichés AILLEURS que sur /live (accueil, tête de la page Explorer).
  indicateur: {
    enDirect: "Tour des Écrins en autonomie",
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
