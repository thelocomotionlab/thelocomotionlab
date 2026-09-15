# Manuel — Locomotion Twin (moteur d'analyse)

> Mode d'emploi **vivant** du moteur `services/twin-engine`. À mettre à jour à chaque évolution.
> La méthode scientifique (VC, exposant d'endurance, durabilité, Minetti, pacing) est dans
> [`docs/twin-theory.md`](./twin-theory.md) — ce document-ci ne couvre que **l'usage**.
>
> Dernière mise à jour (2026-09-15) : outils de la Phase 0 du chantier v2 (tableau de
> référence et avant/après du registre, radiographie arrêts/nuit des vrais ultras, passages
> réels aux points de contrôle). Avant : mode backtest `--until`, outils de registre, lecture
> des deux bandes (intervalles conformes par défaut depuis le 2026-07-03).

## 1. À quoi ça sert

À partir de **l'archive d'entraînement** d'un·e athlète + la **trace GPX** d'une course cible, le
moteur :
1. estime un « jumeau » physiologique (vitesse critique `VC`, exposant d'endurance `E`, durabilité) ;
2. confronte ce jumeau au coût de la pente le long du parcours (Minetti → distance équivalente `Deq`) ;
3. prédit un **temps d'arrivée** validé par validation croisée sur les propres courses de l'athlète ;
4. rend un **verdict de suffisance** (🟢/🟠/🔴) et un **plan de pacing par segment** avec fenêtres horaires ;
5. produit un **rapport PDF** (LaTeX/XeLaTeX) pédagogique.

Deux profondeurs :
- **`preview`** : rapide, sans PDF → verdict + fourchette de temps. C'est ce qu'on montre **avant paiement**.
- **`full`** : `preview` + pacing + figures + **rapport PDF**.

## 2. Formats d'archive acceptés (ingestion)

Tout est normalisé vers **un schéma canonique** (1 enregistrement/seconde) ; le reste du moteur ne
raisonne jamais « par marque ». On ne conserve que la **course à pied** (le sport est lu **dans** le
fichier, jamais d'après son nom) ; l'archive brute est **supprimée juste après l'analyse**.

| Source | Ce qu'on dépose | Détails |
|---|---|---|
| **Fichier unique** | `.fit`, `.tcx`, `.gpx` (éventuellement `.gz`) | Coros/Garmin/Suunto/Polar… |
| **Coros / Garmin (montre)** | un `.zip` de traces | déballé, `.gz` décompressés automatiquement |
| **Garmin RGPD** (« Exporter toutes vos données ») | le `.zip` global | zips imbriqués gérés ; fichiers de bruit (monitoring…) ignorés |
| **Polar Flow** (« Export your data ») | le `.zip` | JSON propriétaire ; seules les *training-sessions* avec échantillons sont lues |
| **Strava** (« Download your archive ») | le `.zip` | lit `activities/` + `activities.csv` (en-tête **localisé** géré) ; `media/`, `routes/`, CSV racine ignorés |
| **Dossier** | un répertoire | parcouru récursivement |

Ce qui est **écarté** dans tous les cas : vélo, natation, rando, ski, musculation, sport en salle,
séances sans données de locomotion, et tout ce qui n'est pas une trace exploitable.

Deux exports qui se recouvrent (montre + Strava, ancien + nouveau) peuvent être déposés
ensemble : une activité présente deux fois (même départ à la seconde, même durée, même
distance) n'est comptée qu'une fois, la copie la plus riche (FC, altitude) est gardée
(`twin.dedup_activities`, rollback `off`). Le journal dit combien de copies ont été
fusionnées.

## 3. Utilisation en ligne de commande (CLI)

Installation dev (une fois) :

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -e "services/twin-engine[dev]"
```

La commande `twin-engine` est alors disponible.

**Aperçu (verdict + fourchette, pas de PDF) :**

```bash
twin-engine preview \
  --training  chemin/vers/archive.zip \
  --course    chemin/vers/parcours.gpx \
  --athlete   "Prénom Nom" \
  --purge      # supprime l'archive après parsing (recommandé)
```

> `--race` est **optionnel**. Sans lui (**mode GPX-only**) : la distance, le D+/D- et le
> profil viennent **directement de la trace GPX**, et le parcours est découpé
> **automatiquement tous les 10 km**. Ajoute `--race spec.json` seulement pour fournir les
> vrais ravitaillements, l'heure de départ et la position (horaires/nuit) — voir §6.

**Rapport complet (figures + PDF) :**

```bash
twin-engine full \
  --training chemin/vers/archive.zip \
  --course   chemin/vers/parcours.gpx \
  --out      chemin/vers/sortie/ \
  --athlete  "Prénom Nom"
  # --no-pdf pour s'arrêter aux figures (sans compiler le PDF)
```

Le `preview` imprime un JSON (verdict, prédiction, jumeau, parcours) + un résumé lisible. Le `full`
écrit les figures et le PDF dans `--out`.

> `--race` est **optionnel** (défaut : aucun → mode GPX-only, distance issue de la trace et
> découpage automatique en segments). `examples/nice-100m.json` est un exemple de spec : pour une
> course avec carnet de route, copie ce fichier et adapte les champs (voir §6).

**Mode backtest (`--until`, `preview` et `full`)** : `--until 2026-05-30` écarte toutes les
activités postérieures (et non datées) — le moteur « remonte le temps » à la veille d'une course
passée pour comparer sa prédiction au temps réel. C'est l'outil du registre de couverture (§7).

## 4. Utilisation via l'API (HTTP)

L'API FastAPI est **interne** en prod (l'app `twin` qui la consommera n'existe pas encore —
côté site, seuls la page `/services/twin` et la page de dépôt de la cohorte
`/services/twin/cohorte` sont en ligne ; les archives déposées arrivent sur le VPS via le
service `twin-depot`, pas par cette API). En local, on l'expose pour tester :

```bash
docker compose -f services/twin-engine/compose.local.yml up --build
# → http://localhost:8000/health      (sonde)
# → http://localhost:8000/docs        (OpenAPI interactif)
```

Endpoints :

| Méthode & route | Rôle |
|---|---|
| `GET /health` | sonde de vie |
| `POST /preview` | archive + GPX + spec de course → verdict + fourchette (synchrone, sans PDF). ⚠️ côté HTTP le champ `race` est **requis** (contrairement au CLI où `--race` est optionnel) |
| `POST /jobs` | lance une analyse **complète** en tâche de fond → renvoie un `job_id` |
| `GET /jobs/{id}` | état du job + résultat (quand prêt) |
| `GET /jobs/{id}/report` | télécharge le **PDF** du rapport |

Les jobs et leurs sorties vivent dans le volume de données (`/data` : `jobs.sqlite` + PDF). Les
archives brutes envoyées sont purgées après parsing.

## 5. Où vont les données / confidentialité

- **Archives d'entraînement supprimées immédiatement après analyse** (garde-fou CLAUDE.md). On ne
  garde que le rapport (le temps du SAV) et un minimum de métadonnées.
- Les **noms de fichiers sont anonymisés** à l'ingestion (les exports RGPD peuvent contenir l'e-mail
  de l'athlète) ; poids, notes privées, descriptions et identifiants d'appareil ne sont **jamais lus**.
- En local, les données de test vont dans `services/twin-engine/local-data/` (git-ignoré).

## 6. Décrire une course cible (`--race`, optionnel)

**Sans `--race`** : mode GPX-only — distance, D+/D-, profil et Deq viennent de la trace ;
découpage automatique tous les 10 km (réglable via `CourseParams.default_segment_km`).

**Avec `--race spec.json`** (cf. `examples/nice-100m.json`) : pour des ravitaillements et des
horaires réels. Tous les champs sont **optionnels** — ne mets que ce que tu veux préciser :

| Champ | Sens | Si absent |
|---|---|---|
| `name` | nom de la course | « Course » |
| `aid_km` | positions (km) des ravitaillements, départ inclus | découpage auto tous les 10 km |
| `aid_names` | noms des points correspondants | « Départ » / « km N » / « Arrivée » |
| `start_time` | départ (ISO 8601 avec fuseau) | pas d'horaires ni de calcul jour/nuit |
| `lat`, `lon`, `tz_offset_h` | point de départ + décalage horaire (soleil/nuit) | idem |
| `major_base_indices` | indices des bases-vie majeures (arrêts longs) | aucune base majeure |
| `technicity_pct` | **majoration de coût déclarée** pour la technicité du terrain (%) | 0 — le moteur ne devine pas |

### Technicité du terrain (`technicity_pct` / `--technicity`)

Le GPX ne porte que la **géométrie**. Minetti traduit la **pente** en coût métabolique en
supposant un sol roulant : à D+/km égal, une piste et une arête chaotique sont traitées
identiquement. Sur un parcours très technique (pierriers, chaos, mains courantes), les temps
réels sont donc **plus lents que prédit**.

`--technicity 13` déclare que ce parcours coûte ~13 % de plus, à pente égale, que les courses
de référence de l'athlète : toute la distance équivalente est majorée d'autant. C'est une
**hypothèse d'entrée assumée**, jamais une mesure — le rapport l'affiche comme telle, dans un
encadré dédié et dans les limites. Sans déclaration (défaut 0), le rapport avertit au contraire
que la technicité n'est pas prise en compte.

Ordre de grandeur : un écart de X % sur le temps visé correspond à ~X % de majoration.

> ⚠️ Ce qui vient **toujours du GPX** (jamais du JSON) : le **D+/D-**, le profil, la pente,
> le Deq (avant majoration). Fournir `aid_km` **recale** seulement la distance totale sur le km officiel et
> nomme les segments. (`official_dplus_m` n'est pas utilisé par le moteur.)

La **trace GPX du parcours** est fournie à part (`--course`) et n'est pas committée.

## 7. Lire la fourchette : les deux bandes

Depuis juillet 2026, les intervalles sont **conformes normalisés** par défaut (calibrés sur les
erreurs de validation croisée de l'athlète) et le rapport affiche **deux bandes, deux usages** :

- **Fourchette de course (25–75 %)** — la bande de PILOTAGE : c'est dans cette fenêtre qu'on
  construit le pacing et qu'on juge « en avance / en retard » pendant la course.
- **Bornes de sécurité (80 %)** — la bande LOGISTIQUE : barrières horaires, assistance,
  récupération — « il est très improbable d'arriver hors de ça ».

Si la dispersion est grande (> 0,35), le rapport ajoute une table de scénarios
rapide / central / prudent. Ne jamais présenter la borne de sécurité comme un objectif.

Trois leviers de la Phase 1 du chantier v2 (DIAGNOSTIC §10.1–10.4) sont livrés derrière des
flags, **défauts inchangés** — le banc n'a touché aucun cas frais du registre, donc aucun
défaut n'a basculé — et servis pour le **rapport de référence** par
`examples/twin.config.reference.json` (§8) : en lien log (`calibration.link=log`) les deux
bandes gardent leurs couvertures nominales mais deviennent **asymétriques en heures**, la
borne haute plus loin du central que la borne basse ; le prior sur la pente en durée
(`calibration.duration_term=prior_shrunk`) tire la pente vers −α, l'exposant de la courbe
record, ce qui resserre les bandes en extrapolation et déplace le central vers plus lent ;
avec `prediction.interval_source=studentized_scale`, les largeurs viennent d'un facteur
d'échelle sur les erreurs de validation croisée lu sur une loi de Student, au lieu du
quantile empirique — même vocabulaire, mêmes usages. Le rapport nomme la méthode servie
(« prédiction conforme » ou « facteur d'échelle studentisé »).

### Mode objectif ([ADR 0002](./adr/0002-mode-objectif-plan-sur-cible.md))

À la demande de la cohorte (« je vise 31 h, donne-moi le plan »), le moteur sait ancrer le plan sur
une **durée visée** au lieu du temps prédit. **Utilisable dès maintenant** : ajoute `target_hours`
à la spec de course et lance un `full` normal.

```json
{ "name": "L'Échappée Belle", "target_hours": "31h", "start_time": "…", "aid_km": [ … ] }
```

…ou, sans toucher au JSON, avec **`--target`** (qui prime sur la spec) :

```bash
twin-engine preview --training <archive> --course <parcours.gpx> --target 31h     # verdict seul
twin-engine full    --training <archive> --course <parcours.gpx> --race <spec.json> \
                    --target 31h --out ./out                                       # + rapport
```

Côté **API**, `target_hours` est un champ de formulaire optionnel de `POST /preview` et
`POST /jobs` (prioritaire sur la spec postée) — un objectif illisible renvoie **422**.

Toutes les saisies acceptent `31h`, `31h30`, `31:00:00` ou un nombre d'heures. Le `preview` rend le
**verdict de faisabilité sans PDF** (c'est la réponse à donner avant paiement) ; le `full` ajoute la
section **« Ton objectif face à ton jumeau »**, répartit le plan sur la cible et change le
vocabulaire des fenêtres (voir ci-dessous). Sans objectif, tout est **exactement** comme avant.

À retenir :

- la **prédiction n'est jamais remplacée** — le mode objectif s'ajoute à côté d'elle, et le registre
  de couverture continue de ne consigner que la prédiction ;
- les fenêtres par segment changent de nature : **fenêtre de passage** (tolérance d'exécution fixe,
  `target.tolerance_pct`), plus une bande de probabilité — donc jamais de « 50 % » ni « 80 % » à
  leur sujet ;
- une cible plus rapide que la borne de sécurité basse ne donne **pas** de plan mais un écart chiffré
  (objectif d'entraînement), et `sufficiency.domain_gate` reste prioritaire sur toute cible.

## 8. Développement & tests

```bash
pytest services/twin-engine                 # suite complète
```

Le **golden test** (course de Nice 100M) ne s'active que si les vraies données sont fournies :

```bash
TWIN_NICE_ARCHIVE=/chemin/archive.zip TWIN_NICE_GPX=/chemin/parcours.gpx \
  pytest services/twin-engine -k nice
```

Les fixtures d'ingestion (Garmin/Polar/Strava, anonymisées) sont committées dans
`services/twin-engine/tests/fixtures/` et tournent en CI sans données réelles.

**Outils d'évaluation** (depuis `services/twin-engine`) :

```bash
PYTHONPATH=src python -m tools.ab_montagnhard      # A/B σ/MAE/interp/extrap — preuve obligatoire avant merge
PYTHONPATH=src python -m tools.backtest <manifest> # walk-forward --until : prédiction veille de course vs réel
PYTHONPATH=src python -m tools.registre [--json]   # couverture des intervalles, biais, score de Winkler
PYTHONPATH=src python -m tools.ab_recency <manifests…>  # balaye la demi-vie de récence (biais de progression)
PYTHONPATH=src python -m tools.registre --frontiere # jusqu'où resserrer les bandes sans perdre la couverture
PYTHONPATH=src python -m tools.registre --tableau   # tableau de référence (markdown) : par athlète et total,
                                                    #   vendus/refusés, MAE, biais, couvertures, Winkler relatif,
                                                    #   largeur relative médiane — à coller dans DIAGNOSTIC
PYTHONPATH=src python -m tools.registre --compare AVANT.json   # avant → après : deltas par athlète (vendus),
                                                    #   changements de verdict, erreur entrée par entrée
PYTHONPATH=src python -m tools.diag_ultras <archive> --manifest <manifeste>   # vrais ultras : arrêts (H2),
                                                    #   part de nuit (C2), écart montre − officiel ; agrégats
                                                    #   pondérés comme la calibration (récence × maximalité)
PYTHONPATH=src python -m tools.diag_ultras --course <gpx> --race <spec.json> --hours 32.3   # part de nuit
                                                    #   de la CIBLE, par segment, via le plan réel
PYTHONPATH=src python -m tools.passages <manifestes…>   # heures de passage RÉELLES aux points de contrôle des
                                                    #   courses passées → champ `passages` du registre
PYTHONPATH=src python -m tools.banc <manifestes…> --out <dossier>   # les trois précédents + backtest en UNE passe
                                                    #   par archive, sorties markdown/JSON dans le dossier
PYTHONPATH=src python -m tools.banc <manifestes…> --out <dossier> --variant NOM:bloc.clé=valeur,…
                                                    #   + rejeu de toutes les coupures sous une config
                                                    #   surchargée (A/B), sur le même décodage
twin-engine preview … --set bloc.clé=valeur         # même surcharge pour un cas isolé (répétable)
```

> **Avant / après (chantier v2).** Le registre committé au départ du chantier est figé dans
> `docs/archive/twin-v2/registre-avant.json`. Toute preuve d'un levier se lit par
> `tools/registre --compare docs/archive/twin-v2/registre-avant.json` après avoir rejoué le
> banc : MAE des cas vendus, couvertures, Winkler, largeurs — par athlète, jamais sur un seul.

**Mesures préalables du chantier v2 (Phase 0), à lancer chez Valentin** — les archives
(`_seed/cas_validation/<Athlète>/archives/`, une archive par dossier, ~1,9 Go en tout) ne
quittent pas sa machine ; les outils n'impriment que des agrégats. Un seul décodage par
archive (`tools/banc`), long sur une grosse archive Coros (le compteur avance tous les
100 fichiers — ne pas interrompre). Depuis `services/twin-engine`, venv de la racine activé :

```bash
M="_seed/manifest-val.json _seed/manifest-crasse.json _seed/manifest-lolo.json _seed/manifest-rapace.json"
# 0.1 + 0.2 + 0.5 en une passe par archive : banc (toutes coupures), arrêts/nuit, passages,
#     puis tableau.md et compare.md (avant/après) dans le dossier de sortie
PYTHONPATH=src python -m tools.banc $M --out /tmp/p0
# 0.3 — part de nuit de la cible (central du rapport livré : 32 h 17) ; la trace cible est
#     dans _seed/cas_validation/Val/courses/
NICE_GPX=$(ls _seed/cas_validation/Val/courses/*.gpx | grep -i nice | head -1); echo "$NICE_GPX"
PYTHONPATH=src python -m tools.diag_ultras --course "$NICE_GPX" --race examples/nice-100m.json --hours 32.28 > /tmp/p0/nuit-nice.md
# référence « avant » du cas Nice sur l'archive de Val et le moteur actuel (JSON hors git)
mkdir -p local-data
twin-engine preview --training _seed/cas_validation/Val/archives --course "$NICE_GPX" --race examples/nice-100m.json > local-data/nice-avant-v2.json
```

Les sorties de `/tmp/p0/` sont du markdown à coller dans le carnet (DIAGNOSTIC §10.0) ;
seuls le registre et les manifestes (agrégats, chemins) se committent. L'instantané
`docs/archive/twin-v2/registre-avant.json` est le banc rejoué SOUS DÉDOUBLONNAGE ; le banc
brut du départ du chantier, où Lolo était doublé, est conservé sous
`registre-avant-doublons.json`.

**Banc de la Phase 1 (leviers de l'intervalle), une relance pour toutes les variantes** —
les variantes ne touchent que la calibration et la prédiction, donc un seul décodage :

```bash
M="_seed/manifest-val.json _seed/manifest-crasse.json _seed/manifest-lolo.json _seed/manifest-rapace.json"
PYTHONPATH=src python -m tools.banc $M --out /tmp/p1 --no-diag --no-passages \
  --variant A2:calibration.link=log \
  --variant A1:calibration.duration_term=prior_shrunk \
  --variant A2A1:calibration.link=log,calibration.duration_term=prior_shrunk \
  --variant A2A1l5:calibration.link=log,calibration.duration_term=prior_shrunk,calibration.duration_shrink_lambda=5 \
  --variant A2A1l10:calibration.link=log,calibration.duration_term=prior_shrunk,calibration.duration_shrink_lambda=10 \
  --variant A3:prediction.interval_source=studentized_scale \
  --variant A2A3:calibration.link=log,prediction.interval_source=studentized_scale \
  --variant A2A1A3:calibration.link=log,calibration.duration_term=prior_shrunk,prediction.interval_source=studentized_scale \
  --variant A2A1A3mad:calibration.link=log,calibration.duration_term=prior_shrunk,prediction.interval_source=studentized_scale_mad \
  --variant A2A1A3signed:calibration.link=log,calibration.duration_term=prior_shrunk,prediction.interval_source=studentized_scale_signed
# cas de référence sous les variantes candidates (une passe d'archive chacune)
NICE_GPX=_seed/cas_validation/Val/courses/nice-100m-2026.gpx
twin-engine preview --training _seed/cas_validation/Val/archives --course "$NICE_GPX" --race examples/nice-100m.json \
  --set calibration.link=log > local-data/nice-A2.json
twin-engine preview --training _seed/cas_validation/Val/archives --course "$NICE_GPX" --race examples/nice-100m.json \
  --set calibration.link=log --set calibration.duration_term=prior_shrunk > local-data/nice-A2A1.json
twin-engine preview --training _seed/cas_validation/Val/archives --course "$NICE_GPX" --race examples/nice-100m.json \
  --set calibration.link=log --set calibration.duration_term=prior_shrunk \
  --set prediction.interval_source=studentized_scale > local-data/nice-A2A1A3.json
```

`compare-<nom>.md` compare chaque variante au banc servi DU MÊME passage (agrégats décodés
identiques) ; `tableau-<nom>.md` donne ses colonnes de référence. Rien de tout cela n'entre
dans le registre committé.

**Résultat de la Phase 1 (2026-09-15, DIAGNOSTIC §10.4)** : aucun défaut basculé ; les trois
leviers sont servis pour le rapport de référence par un fichier de config partiel (les clés
absentes gardent `twin.config.json`) :

```bash
# rapport de référence : lien log + prior de durée + échelle studentisée
TWIN_CONFIG_PATH=examples/twin.config.reference.json twin-engine full \
  --training _seed/cas_validation/Val/archives --course "$NICE_GPX" --race examples/nice-100m.json \
  --athlete Val --out local-data/out/nice-2026
# strictement équivalent, sans fichier :
twin-engine full … --set calibration.link=log --set calibration.duration_term=prior_shrunk \
  --set prediction.interval_source=studentized_scale
# sans rien : les défauts (central 32,3 h, bornes 24,5–40,2) ; avec : 34,3 h, bornes 29,8–39,5
```

Le JSON du `preview` sous cette config expose ce que le rapport utilise : `calibration.link`,
`calibration.duration_prior` (b, λ, origine), `prediction.leverage` et `sd_rel` (levier de la
cible), `scale_kappa` et `scale_dof` (échelle et degrés de liberté de la Student). `tools/backtest`,
`tools/diag_ultras` et `tools/passages` restent utilisables séparément ; `tools/banc` donne
exactement les mêmes résultats (test `test_banc_one_pass_matches_the_separate_tools`).

## 9. Déploiement (rappel)

L'infra est **du code** (`infra/`). Le service `twin-engine` est déjà décrit dans `infra/compose.yml`
(interne, volume `twin_engine_data`, route Caddy publique en *draft* désactivée). L'image se
construit et se pousse sur GHCR **automatiquement** via `.github/workflows/deploy-vps.yml` à chaque
push sur `main` touchant `services/twin-engine/**`. Voir `docs/runbook-vps.md` pour l'exploitation.
