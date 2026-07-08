# Plan PR3 — États « Avant » et « Terminé » + export d'archive (chantier 2, à valider)

> **Statut : PLAN — à valider par Valentin avant le code** (point d'arrêt n°1).
> Référence : brief §6, design 2b (Mobile · Avant) et 2c (Mobile · Terminé),
> contrat `docs/live-archive-schema.md`, acquis PR1/PR2 (`docs/live-pr1-plan.md`,
> `docs/live-pr2-plan.md`). PR2 validée le 2026-07-08 (test mobile réel reporté à
> la préversion post-déploiement, au plus tard au test 24 h).

## 1. Ce que la PR3 livre

1. **État « Avant »** conforme au design 2b — remplace le bloc « Prochain départ »
   du chantier 1.
2. **État « Terminé »** conforme au design 2c — rendu **depuis `archive.json`
   seul** (service et VPS éteints, plus aucune dépendance à l'infra vivante).
3. **Export d'archive** : commande `export-archive` → `archive.json` conforme au
   contrat + copie des médias, prêt à committer dans le site.
4. **Bascule des trois états par la seule config** (+ le timer pour le direct),
   `liveConfig` finalisé « une aventure = un objet ».

## 2. La bascule des trois états (décision à valider)

`liveConfig.aventure.statut : "avant" | "termine"` — et le direct reste piloté
par le terrain :

| `statut` | `live-timer.running` | État rendu |
|---|---|---|
| `"avant"` | `false` | **Avant** (design 2b) |
| `"avant"` | `true` | **En cours** (PR2 — bascule automatique au `track start`) |
| `"termine"` | (ignoré) | **Terminé** (design 2c, lit `archive.json`) |

Le passage à « Terminé » est un acte volontaire de fin d'aventure : export,
commit de l'archive, `statut: "termine"`. Recette du brief (« bascule des trois
états par la seule config ») : `statut` + le simulateur pour l'état En cours.

## 3. État « Avant » (design 2b)

- **Hero** : badge « J−44 » (calculé depuis `aventure.dateDebut`, même lib
  `liveTime` — jamais de date en dur), overline « Prochain départ », titre,
  sous-titre « 20–24 août 2026 · 194 km · ~12 000 m D+ » (config).
- **Intention en Lora italique** — texte du design : « Une boucle intégrale
  autour du massif, seul et sans assistance, sur le fil du GR54. Le direct
  s'ouvrira ici au premier pas. » (dans `liveConfig`, donc modifiable sans code).
- **Compte à rebours** 4 cases jours/heures/min/sec (secondes en terracotta),
  tick 1 s côté client, calé sur `aventure.dateDebut`.
- **Carte de l'itinéraire prévisionnel** : réutilise `LiveMap` (trace pointillée
  seule, marqueur DÉPART sauge `#8CB9BD` au premier point, hauteur 280 px) +
  **profil altimétrique** (réutilise `ProfileCard`, aucune aire couverte).
  Waypoints : la liste `{nom, km}` de `liveConfig` — **placeholder propre**
  (aucun repère) tant que Valentin ne l'a pas fournie (brief §10.3).
- **Capture email** : `EmailCapture` existant, `source="live"`, titre « Être
  prévenu·e du départ », micro-promesse exacte (« Pas de newsletter. Un email
  quand quelque chose paraît ici. » — déjà le composant du chantier 1).
- Le texte `[PROVISOIRE — texte n°7]` du chantier 1 disparaît au profit de
  l'intention (le brief PR5 réglera les textes définitifs).

## 4. État « Terminé » (design 2c)

- **Bandeau sombre** `#333` : « Aventure bouclée », « Arrivée le 24 août 2026,
  07 h 41 » (heure **Europe/Paris** via `liveTime`, depuis
  `stats.lastFixTime` de l'archive), stats finales : distance · D+ · durée ·
  jours — toutes lues dans `archive.json`.
- **Carte + profil** de la trace VÉCUE (depuis `archive.positions`), marqueur
  ARRIVÉE sauge foncé `#6E9CA0` au dernier point.
- **Journal complet consultable** : réutilise `JournalCard` en mode archive
  (médias résolus en chemins relatifs `/replays/<slug>/journal/…`) ; compteur
  « N entrées · J1 → J4 » ; replié à ~6 entrées avec bouton « **Dérouler les N
  entrées** » (design 2c) ; le lecteur audio garde durée et lecture.
- **Encart pointillé** « Récit à paraître — Le retour d'expérience complet,
  bientôt sur le Lab. » + **capture email** « Être prévenu·e du récit »
  (`source="live"` — l'allowlist de la gateway est fermée, on ne crée pas de
  nouvelle source pour ça).
- **Zéro appel au VPS** : la page ne consomme que
  `/replays/<slug>/archive.json` et ses médias, statiques sur Cloudflare Pages.

## 5. Export d'archive (décisions à valider)

**Commande** : `pnpm -F @locomotionlab/live-journal export-archive` (script du
service — c'est lui qui possède journal + médias), exécutable en local comme
sur le VPS. Entrées :

- `--positions <url|fichier>` : le `live-positions.json` de tracking-cache —
  **profil complet et corrigé depuis le départ** (le cache brut est incrémental
  depuis `track start`, le recalcul couvre toute la session). **Écart assumé au
  brief** (« positions via l'API Traccar ») : on lit l'artefact officiel déjà
  filtré/corrigé plutôt que de re-requêter Traccar et dupliquer le pipeline de
  corrections — moins de code, zéro divergence. Le brut Traccar reste
  disponible via l'API si un besoin futur l'exige.
- `--journal <url|fichier>` + `--media <url-base|dossier>` : le journal vivant
  et ses médias (sources : volume ou URLs publiques).
- `--out apps/site/public/replays/<slug>/` : écrit `archive.json` + copie les
  médias sous `journal/`. `meta` depuis `liveConfig`-mêmes valeurs (passées en
  arguments — le service reste agnostique de l'aventure).
- `chat: []` **toujours** — les messages privés n'entrent jamais dans l'archive.
- Validation intégrée : le script refuse d'écrire une archive non conforme
  (schemaVersion, champs requis, médias manquants) — et un test unitaire couvre
  la conversion.

**Mapping journal vivant → archive (LA décision de fond)** — deux options :

- **Option A (recommandée)** : le contrat v1 garde ses littéraux français et sa
  forme (`{time, type: "texte"|"photo"|"audio", texte?, media}`), enrichis de
  champs **optionnels additifs** : `id`, `duree` (s), `largeur`, `hauteur`,
  `edite` (bool), et le littéral `"video"` admis si le drapeau a servi.
  `schemaVersion` reste `1` (un lecteur v1 ignore des champs inconnus, rien ne
  casse). `docs/live-archive-schema.md` est mis à jour en conséquence.
  → L'état Terminé rend le lecteur audio avec durée, sans perte.
- Option B : `schemaVersion: 2` au format du journal vivant (`ts`, `text`,
  `media{}` anglais). Plus propre à long terme, mais rompt le contrat gelé au
  chantier 1 pour un bénéfice nul aujourd'hui.

## 6. Fichiers touchés

```
apps/site/
├─ components/live/LiveAvant.jsx        # design 2b (hero, countdown, carte, profil, capture)
├─ components/live/LiveTermine.jsx      # design 2c (bandeau, carte, journal replié, récit, capture)
├─ components/live/Countdown.jsx        # 4 cases, tick 1 s
├─ components/LiveHub.jsx               # bascule à 3 états (§2)
├─ lib/liveConfig.js                    # statut, archivePath, intention, arrivée… (une aventure = un objet)
├─ lib/useArchive.js                    # fetch unique de archive.json (refus poli des versions inconnues)
└─ lib/liveTime.js                      # + formatDateArrivee (« 24 août 2026, 07 h 41 »), testé

services/live-journal/
├─ src/export/archive.ts                # conversion journal+positions → archive (pur, testé)
├─ src/export/cli.ts                    # la commande export-archive (--positions --journal --out …)
└─ test/export.test.ts                  # conformité au contrat, mapping, chat[] vide, médias copiés

docs/live-archive-schema.md             # extension additive (option A) si validée
docs/live-pr3-plan.md                   # ce plan
```

Rien de nouveau côté `infra/` (l'export est une commande, pas un service).

## 7. Écarts au design, assumés et signalés

1. **Pas de maquette desktop pour Avant et Terminé** (le design ne fournit que
   le mobile 2b/2c) → proposition : **une colonne centrée** (max-w ~760 px,
   carte un peu plus haute), même grammaire de cartes que le mobile. Sobre,
   sans invention.
2. Le compteur « 23 entrées · J1 → J4 » et le « Dérouler » du design sont
   repris tels quels ; les entrées du design 2c n'ont pas de médias, mais on
   les rend consultables avec médias (c'est le sens de « journal complet
   consultable » du brief — le design simplifiait la vignette).

## 8. Recette PR3 (= recette du brief §6)

Sur le simulateur : ① `statut:"avant"` sans timer → état Avant (countdown,
carte prévisionnelle, capture) ; ② sim lancé → bascule En cours automatique ;
③ `export-archive` sur les données du simulateur → `archive.json` **valide**
(vérification de schéma) sous `public/replays/tour-des-ecrins-2026/` ;
④ `statut:"termine"`, **simulateur COUPÉ** → état Terminé complet (bandeau,
stats, journal avec vocal lisible, récit, capture) sans aucune requête vers le
service. + tests Vitest (export, formatDateArrivee), `lint`/`build`/
`next-on-pages`, captures Playwright mobile + desktop des deux états.

## 9. Questions ouvertes pour Valentin

1. **Mapping archive : option A** (additive, schemaVersion 1 conservé) — OK ?
2. **Bascule** par `aventure.statut: "avant"|"termine"` + timer pour le direct
   (§2) — OK ?
3. **Export** en commande du service live-journal, lisant `live-positions.json`
   (pas l'API Traccar directement, écart argumenté §5) — OK ?
4. **Textes** : l'intention Lora du design (« Une boucle intégrale… GR54 ») et
   « Récit à paraître — Le retour d'expérience complet, bientôt sur le Lab. »
   sont-ils bons à graver dans la config, ou tu me donnes tes versions ?
5. **Desktop Avant/Terminé** en une colonne centrée sobre (§7.1) — OK ?
6. **Emplacement de l'archive** : `apps/site/public/replays/<slug>/` (comme les
   replays v1, mais au format v2) — OK ?
