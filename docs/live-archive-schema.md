# Schéma d'archive d'une aventure — `archive.json` (v1)

> Contrat de données préparé pendant le chantier 1 (refonte du site, PR3)
> pour le **chantier 2** (journal Telegram, mur/chat, enrichissement des
> replays). Aucun code ne le consomme encore : ce document fixe la cible
> pour que le back (tracking-cache) et le front (site, page /live, replays)
> convergent vers le même fichier.

## Principes

- **Une aventure = un fichier** `archive.json`, autoportant : méta, trace,
  stats, et (à terme) journal et mur.
- **Versionné** : le champ `schemaVersion` est obligatoire. Tout changement
  incompatible incrémente la version ; les lecteurs doivent refuser
  poliment une version qu'ils ne connaissent pas.
- **Champs optionnels vides plutôt qu'absents** : `journal` et `chat`
  existent dès la v1 comme tableaux vides — le chantier 2 les remplira sans
  changement de schéma.

## Structure

```jsonc
{
  "schemaVersion": 1,

  // Identité de l'aventure
  "meta": {
    "slug": "tour-des-ecrins-2026",        // identifiant stable (dossier, URL)
    "nom": "Tour des Écrins en autonomie", // nom affichable
    "dateDebut": "2026-08-20",             // ISO 8601 (date locale de départ)
    "dateFin": "2026-08-24",               // ISO 8601 (arrivée ou abandon)
    "distanceKm": 194,                     // distance prévue ou réalisée
    "denivelePositifM": 12000              // D+ total (m)
  },

  // Trace enregistrée — points ordonnés par temps.
  // Reprend la forme du `profile` produit par services/tracking-cache
  // (live-positions.json actuel), qui est déjà la forme la plus compacte.
  "positions": [
    {
      "idx": 0,                                  // index séquentiel
      "fixTime": "2026-08-20T05:00:12.000+00:00", // horodatage GPS (ISO 8601)
      "latitude": 44.9182,
      "longitude": 6.3021,
      "altitude": 1450.2,                        // m (optionnel)
      "distance": 0,                             // m cumulés depuis le départ (optionnel)
      "batteryLevel": 98                         // % (optionnel)
    }
  ],

  // Agrégats de fin d'aventure (mêmes clés que les live-stats actuels).
  "stats": {
    "distance": 194230,        // m
    "dplus": 12040,            // m
    "dminus": 12080,           // m
    "durationSeconds": 375600, // durée totale
    "lastFixTime": "2026-08-24T13:20:00.000+00:00"
  },

  // Journal de bord horodaté (chantier 2 : alimenté depuis Telegram).
  // Chaque entrée a un type et un contenu. Depuis la PR3 du chantier 2,
  // des champs OPTIONNELS ADDITIFS enrichissent l'entrée (un lecteur v1
  // les ignore sans casser — schemaVersion reste 1) et le littéral "video"
  // est admis (drapeau vidéo du chantier 2).
  "journal": [
    // {
    //   "time": "2026-08-21T11:42:00.000+00:00",
    //   "type": "texte" | "photo" | "audio" | "video",
    //   "texte": "Col franchi, gros vent.",   // pour type "texte" (ou légende)
    //   "media": "journal/img-0012.webp",     // chemin relatif à l'archive,
    //                                         // pour "photo" / "audio" / "video"
    //   // — champs optionnels additifs (PR3) —
    //   "id": "01J5ZK…",                      // id stable du journal vivant (ULID)
    //   "duree": 102,                         // s — audio/vidéo (lecteur « une prise »)
    //   "largeur": 1600, "hauteur": 1200,     // px — photo/vidéo
    //   "edite": true                         // l'entrée a été corrigée du terrain
    // }
  ],

  // Mur / chat des spectateurs (chantier 2). VIDE aujourd'hui.
  "chat": [
    // {
    //   "time": "2026-08-21T11:45:03.000+00:00",
    //   "pseudo": "Jean",
    //   "message": "Allez Valentin !"
    // }
  ]
}
```

## Ce que ce schéma ne couvre PAS : les replays v1 existants

Les replays actuellement en ligne (`apps/site/public/replays/*`) sont
**antérieurs à ce schéma et le restent** — ce sont des pièces v1, exposées
telles quelles (cartel « Direct v1 — smartphone + Traccar, conservé tel
quel » sur le site). On les trouve sous deux formes historiques :

1. **Brut Traccar** (Réunion 2025) : `live-positions.json` = tableau de
   positions Traccar complètes + `live-stats.json` séparé
   (`{ distance, dplus, dminus }`).
2. **Format tracking-cache** (Chartreuse, Vercors, Monts du Lyonnais 2026) :
   `live-positions.json` = `{ meta: { pointCount, updatedAt }, stats { … },
   profile: [ { idx, fixTime, latitude, longitude, … } ] }`.

Le composant `Replay` de `packages/tracking` sait lire les deux
(`normalizeReplayData`). **Aucune migration rétroactive n'est prévue** : le
schéma `archive.json` s'applique aux aventures à venir, à commencer par le
Tour des Écrins 2026.

## Producteur / consommateurs (chantier 2, PR3)

- **Producteur** : la commande **`export-archive`** de `services/live-journal`
  (`pnpm -F @locomotionlab/live-journal export-archive -- --positions … --journal …`),
  en fin d'aventure. Elle lit les artefacts officiels vivants
  (`live-positions.json` de tracking-cache — profil complet déjà filtré/corrigé —
  et `journal.json` + médias du live-journal), assemble l'archive, **valide le
  contrat avant d'écrire** (une archive non conforme n'est jamais produite) et
  copie les médias sous `journal/`. `chat` reste vide par construction : les
  messages privés n'entrent JAMAIS dans l'archive publique.
- **Consommateurs** : la page `/live`, état « Terminé » (rendu depuis l'archive
  SEULE, l'infra vivante peut être éteinte), les pages projets (replays
  enrichis), d'éventuels exports.
- **Emplacement** : `apps/site/public/replays/<slug>/archive.json` + `journal/`.
