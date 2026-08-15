# Manuel — Locomotion Twin (moteur d'analyse)

> Mode d'emploi **vivant** du moteur `services/twin-engine`. À mettre à jour à chaque évolution.
> La méthode scientifique (VC, exposant d'endurance, durabilité, Minetti, pacing) est dans
> [`docs/twin-theory.md`](./twin-theory.md) — ce document-ci ne couvre que **l'usage**.
>
> Dernière mise à jour (2026-07-08) : mode backtest `--until`, outils de registre,
> lecture des deux bandes (intervalles conformes par défaut depuis le 2026-07-03).

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
côté site, seuls le teaser `/outils/twin` et la page de dépôt de la cohorte
`/outils/twin/cohorte` sont en ligne ; les archives déposées arrivent sur le VPS via le
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

> ⚠️ Ce qui vient **toujours du GPX** (jamais du JSON) : le **D+/D-**, le profil, la pente,
> le Deq. Fournir `aid_km` **recale** seulement la distance totale sur le km officiel et
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
```

> ⚠️ Ne **jamais** enchaîner `--dry-run` puis le run réel : le dry-run fait 100 % du calcul et
> ne saute que l'écriture du registre — c'est deux fois le travail. Pour vérifier un manifeste
> douteux, fais le dry-run sur un manifeste réduit à UNE course.
>
> Le banc décode l'archive **une seule fois par manifeste** (`ArchiveCache`) puis rejoue chaque
> coupure sur les agrégats : mesuré ×3,2 (5 activités) à ×12,0 (120) sur 15 coupures — le gain
> tend vers le nombre de courses. `tools/ab_recency` exploite le même cache pour balayer une
> grille de demi-vies au prix d'un seul décodage.

Le registre vit dans `docs/twin-registre-couverture.md` (avec sa règle de décision
pré-enregistrée : pas de recalibration avant 8–10 cas frais). **Tout changement du moteur suit le
protocole de CLAUDE.md** : golden intact, comportement derrière flag, preuve A/B collée dans
`services/twin-engine/DIAGNOSTIC.md` (le carnet de labo).

## 9. Déploiement (rappel)

L'infra est **du code** (`infra/`). Le service `twin-engine` est déjà décrit dans `infra/compose.yml`
(interne, volume `twin_engine_data`, route Caddy publique en *draft* désactivée). L'image se
construit et se pousse sur GHCR **automatiquement** via `.github/workflows/deploy-vps.yml` à chaque
push sur `main` touchant `services/twin-engine/**`. Voir `docs/runbook-vps.md` pour l'exploitation.
