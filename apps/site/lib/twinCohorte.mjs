// lib/twinCohorte.mjs
//
// Source unique du contenu de la page /outils/twin/cohorte : marques de
// montres supportées + tuto d'extraction de l'archive pour chacune.
// ⚠ Les `id` restent en phase avec services/twin-depot/twin-depot.config.json
// (le service refuse une montre inconnue), même convention que les ids
// d'ateliers entre lib/ateliers.mjs et atelier-api.config.json.

/** Taille maximale d'archive acceptée, en Mo — en phase avec `maxArchiveMo`
 *  de services/twin-depot/twin-depot.config.json (et la borne Caddy). */
export const MAX_ARCHIVE_MO = 2048;

/** Extensions acceptées à l'étape 2 (le ZIP complet reste la voie royale). */
export const EXTENSIONS_ARCHIVE = [".zip", ".fit", ".tcx", ".gpx"];

export const MARQUES = [
  {
    id: "garmin",
    label: "Garmin",
    lien: "https://www.garmin.com/fr-FR/account/datamanagement/",
    lienLabel: "Ouvrir la page « Gestion des données » Garmin",
    etapes: [
      "Connecte-toi à ton compte Garmin, puis ouvre la page « Gestion des données » (lien ci-dessous).",
      "Clique sur « Exporter vos données ».",
      "Garmin prépare ton archive et t'envoie un email avec un lien de téléchargement (de quelques minutes à 48 h).",
      "Télécharge le fichier ZIP sans le décompresser et dépose-le à l'étape 2.",
    ],
    note: "L'archive contient tout ton compte ; le moteur ne lit que les fichiers d'activités (dossier DI_Connect).",
  },
  {
    id: "polar",
    label: "Polar",
    lien: "https://account.polar.com/",
    lienLabel: "Ouvrir account.polar.com",
    etapes: [
      "Connecte-toi sur account.polar.com.",
      "Dans la section de tes données, clique sur « Télécharger vos données » (Download your data).",
      "Polar prépare l'archive et t'envoie un email quand elle est prête ; le lien te ramène sur la même page, où le bouton devient « Télécharger ».",
      "Récupère le ZIP sans le décompresser et dépose-le à l'étape 2.",
    ],
    note: null,
  },
  {
    id: "strava",
    label: "Strava",
    lien: "https://www.strava.com/account",
    lienLabel: "Ouvrir les paramètres de compte Strava",
    etapes: [
      "Sur strava.com (depuis un ordinateur), clique sur ton avatar en haut à droite → « Paramètres » → « Mon compte ».",
      "Sous « Télécharger ou supprimer votre compte », clique « Commencer ».",
      "À l'étape 2 de la page, clique « Demander votre archive » — surtout pas l'étape 3, qui supprime ton compte !",
      "Tu reçois sous quelques heures un email avec un lien : télécharge le ZIP et dépose-le à l'étape 2.",
    ],
    note: "Strava est aussi la bonne option si ta montre n'est pas dans la liste mais s'y synchronise.",
  },
  {
    id: "coros",
    label: "Coros",
    lien: "https://t.coros.com/",
    lienLabel: "Ouvrir le COROS Training Hub",
    etapes: [
      "Depuis un ordinateur, connecte-toi au COROS Training Hub : t.coros.com.",
      "Ouvre ta liste d'activités (Activity List).",
      "Sélectionne tes activités et lance l'export groupé (bulk export) sur la période la plus large possible.",
      "Télécharge le ZIP généré et dépose-le à l'étape 2.",
    ],
    note: "L'app mobile n'exporte qu'activité par activité — passe bien par le Training Hub.",
  },
  {
    id: "suunto",
    label: "Suunto",
    lien: null,
    lienLabel: null,
    etapes: [
      "Le plus simple : si tes activités se synchronisent vers Strava, suis plutôt le tuto Strava.",
      "Sinon, demande ton export complet au support Suunto (droit RGPD, via le chat de l'app ou par email) : tu recevras un lien vers un ZIP de fichiers .FIT — délai parfois long.",
      "Pour dépanner : dans l'app Suunto, ouvre une activité → « ⋯ » en haut à droite → exporte le .FIT, répète pour tes courses clés, puis regroupe le tout dans un ZIP.",
    ],
    note: "Suunto n'offre pas (encore) d'export en masse en libre-service.",
  },
];
