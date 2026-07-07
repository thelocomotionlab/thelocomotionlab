# Plan PR2 — `/live`, état « En cours » conforme au design (chantier 2)

> **Statut : validé d'avance par Valentin le 2026-07-07** (« Passe tout de suite à PR2,
> je valide le plan d'avance ») — consigné ici pour la trace avant implémentation,
> conformément au protocole. Référence : `docs/live-brief.md` §5, design
> `docs/design/live-v2/` (écrans 2a, 2d, 2e, mini-spec 2g), décisions PR1
> (`docs/live-pr1-plan.md` §13, dont les textes validés).

## 1. Périmètre

- **Seul l'état « En cours » change** : dans `LiveHub`, `isLive === true` rend le
  nouveau composant `LiveEnCours` (design 2a mobile / 2d desktop deux colonnes
  `1fr 460px`). L'état « Prochain départ » du chantier 1 reste tel quel (refonte
  « Avant » = PR3) ; « Terminé » = PR3.
- **`packages/tracking` n'est PAS touché** : les replays des pages projets en
  dépendent. La carte du live v2 est un composant **du site** (maplibre-gl direct,
  déjà dépendance du site), au style du design : trace de référence pointillée
  `brand-deep-dark` sur liseré crème, portion parcourue `brand-accent`, marqueur
  coureur à halo pulsant, contrôle Topo/Satellite, `fitBounds` padding 34.
- **Le site reste en JavaScript** (règle du repo) : composants `.jsx`, libs `.js`.
- **Charte** : tous les tokens du design existent déjà dans `packages/ui`
  (`brand-bg/primary/primary-dark/accent/accent-dark/deep/deep-dark/text`) —
  **aucune modification de la charte**.

## 2. Écarts au design, assumés et signalés

1. **Encart « Arrivée estimée » de la maquette 2a : OMIS.** Le pronostic d'arrivée
   est **hors-scope strict** (brief §2 et §12) — le brief prime sur le HTML.
2. Tuiles carto : mêmes fournisseurs que la maquette (OpenTopoMap, Esri World
   Imagery) — déjà utilisés par `packages/tracking`.
3. Le lecteur audio de la maquette n'affiche que la durée totale ; le brief §5
   exige « temps écoulé/durée » → on affiche `écoulé / durée` (monospace), sans
   scrubbing ni barre de progression, conformément à l'esprit « une prise ».

## 3. Données et configuration

- **`lib/liveConfig.js` étendu** (une aventure = un objet) :
  `aventure` (slug, nom, `dateDebut` ISO **avec heure et offset** `2026-08-20T06:00:00+02:00`,
  dates affichables, `distanceKm`, `deniveleM`), `journal` (`pollMs` 30 000,
  base API résolue par `NEXT_PUBLIC_JOURNAL_API` sinon `https://api.thelocomotionlab.com`),
  `freshness.zoneBlancheMinutes` 60, `referenceGpx` = trace temporaire committée
  (`/tracks/tour-des-ecrins_temp.gpx`, marquée à remplacer), bornes altimétriques.
- **Deux hooks de polling** (pattern existant, cache-buster + `cache: "no-store"`) :
  `useLivePositions` (10 s, `live-positions.json` — base `NEXT_PUBLIC_TRACKING_PROXY`
  sinon tracking.thelocomotionlab.com) et `useJournal` (30 s, `journal.json` sur la
  base API du journal). En dev, les deux bases pointent sur le simulateur
  (`http://localhost:3000`) : une seule commande pour tout.
- **Erreur réseau** : on garde les dernières données valides (pas d'écran vide),
  la fraîcheur continue de vieillir naturellement.

## 4. Libs pures (testées unitairement — Vitest, nouveau sur le site)

- **`lib/liveTime.js`** — le J-index et l'heure du journal : fuseau **FORCÉ
  Europe/Paris** via `Intl.DateTimeFormat` (jamais celui du visiteur), **frontière
  de jour à minuit heure française**, `formatEntryTag(ts, dateDebut)` → « J2 · 15 h 04 ».
  Tests : veille de minuit / minuit / lendemain, entrée avant le départ (« J1 » plancher),
  réutilisable à l'identique pour l'archive (PR3). Aussi : durée « une prise »
  (`1:42`), temps écoulé (« 2 j 08 h 32 »), fraîcheur (« il y a 3 min » / « il y a 4 h »).
- **`lib/simplify.js`** — Douglas-Peucker (tolérance en degrés ~0,00008) appliqué à
  la trace AVANT affichage (règle du brief) : GPX de référence ET trace vécue.
- **`lib/freshness.js`** — machine à trois régimes : `premier-signal` (timer
  démarré, aucune position — texte validé « En attente du premier signal — le
  départ est imminent. »), `normal` (« Dernière position il y a X min »),
  `zone-blanche` au-delà du seuil (« Zone blanche probable — dernière position il
  y a X h », information de terrain, jamais une alerte).

## 5. Composants (`apps/site/components/live/`)

`LiveEnCours.jsx` (orchestrateur : hooks + grille mobile/desktop) ·
`LiveHeader.jsx` (badge EN DIRECT clignotant, titre, méta avec Jour calculé) ·
`LiveMap.jsx` (maplibre, import dynamique `ssr:false`) · `FreshnessPill.jsx`
(overlay carte) · `ProgressionCard.jsx` (pourcentage, barre en dégradé ambre,
parcourus/restants, D+, temps écoulé — SANS arrivée estimée) · `JournalCard.jsx`
+ `JournalEntry.jsx` (timeline du design : pastille, tag, pill « Vacation audio »,
texte Lora italique ; photo réelle lazy-load ; **types inconnus ignorés
silencieusement**) · `AudioPlayer.jsx` (« une prise » : play/pause 40 px,
26 barres animées `ll-eq`, écoulé/durée mono, `preload="none"`, **reprise
robuste** : sur `error`/`stalled` → mémorise `currentTime`, `load()`, re-seek,
reprend) · `VideoPlayer.jsx` (variante derrière drapeau : rendue seulement si le
service publie des entrées `video`) · `MessageCard.jsx` (« Laisse un mot à
Valentin » : textarea + prénom/email facultatifs + honeypot `website`, états
repos / « Envoi… » / « Remis. Il le lira ce soir au bivouac. » / « Le message
n'est pas parti — réessaie dans un instant. », mention exacte « Message privé —
remis à Valentin le soir au bivouac. Rien n'est publié. » avec cadenas).

Règles de rendu du brief : ambre/sauge jamais en texte < 16 px hors
pastilles/badges ; photos `loading="lazy"` ; budget premier chargement
**< 1,5 Mo hors tuiles** (maplibre en import dynamique, audio `preload="none"`).

## 6. Recette (point d'arrêt n°2)

Sur le **simulateur** (`pnpm -F @locomotionlab/live-journal sim` +
`NEXT_PUBLIC_TRACKING_PROXY=http://localhost:3000 NEXT_PUBLIC_JOURNAL_API=http://localhost:3000`) :
les trois types d'entrées s'affichent et se lisent ; un message privé part et se
confirme ; les régimes premier-signal → normal → zone blanche s'observent ;
mobile 390 px et desktop 1440 px conformes ; budget mesuré au navigateur (hors
tuiles) et collé au rapport. Vérifs : tests Vitest site + service, `pnpm -F site
lint` + `build` + `@cloudflare/next-on-pages`. La lecture réelle iOS/Android
reste à confirmer par Valentin sur la préversion Cloudflare (limite de
l'environnement de dev).
