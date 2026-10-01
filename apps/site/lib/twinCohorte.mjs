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

/**
 * Les textes de consentement, par version — la version voyage avec le dépôt
 * (`consentementVersion`) et décide de la conservation côté moteur (`cohorte`).
 * ⚠ Les versions restent en phase avec `consentementVersions` de
 * services/twin-depot/twin-depot.config.json et `cohorte.versions_conservation` du
 * moteur (celles qui autorisent la conservation).
 *
 * « 2026-07 » : le texte de la maquette de recrutement — l'archive est supprimée
 * après analyse. « 2026-10 » : la conservation six mois, chiffrée, puis la purge.
 */
export const TEXTES_DE_CONSENTEMENT = {
  "2026-07": {
    case:
      "J’accepte que mon archive d’entraînement soit utilisée pour calibrer le Locomotion Twin, puis supprimée après analyse.",
    sousLEnvoi:
      "Ton archive est supprimée immédiatement après analyse — seuls ton rapport et quelques métadonnées sont conservés.",
    succes: "Conformément à la règle du labo, ton archive sera supprimée immédiatement après analyse.",
    page:
      "Le Twin apprend sur des données réelles. En rejoignant la cohorte, tu me confies ton archive d’entraînement : elle sert à calibrer et valider le moteur, puis elle est supprimée. En échange, tu recevras ton plan de course gratuit dès que ton jumeau sera prêt.",
  },
  "2026-10": {
    case:
      "J’accepte que mon archive d’entraînement — positions, fréquence cardiaque, cadence — soit conservée chiffrée six mois pour calibrer et développer le Locomotion Twin, puis supprimée avec mon jumeau, mes plans et ma page ; ce qui reste au registre du labo est anonyme.",
    sousLEnvoi:
      "Ton archive est conservée chiffrée six mois, puis supprimée avec ton jumeau, tes plans et ta page. Ce qui reste au registre du labo — ce que le moteur avait prévu, ce que tu as couru — est anonyme.",
    succes:
      "Ton archive est conservée chiffrée six mois pour développer le Twin, puis supprimée ; ce qui reste au registre est anonyme.",
    page:
      "Le Twin apprend sur des données réelles. En rejoignant la cohorte, tu me confies ton archive d’entraînement : tes sorties, avec leurs positions, ta fréquence cardiaque et ta cadence. Elle sert à calibrer ton jumeau et à développer le moteur, conservée chiffrée pendant six mois, puis supprimée — avec ton jumeau, tes plans et ta page. Ce qui reste au registre du labo est anonyme. En échange, tu reçois ton plan de course gratuit dès que ton jumeau est prêt.",
  },
};

/** La version servie par la page en ligne. */
export const VERSION_EN_LIGNE = "2026-07";

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
