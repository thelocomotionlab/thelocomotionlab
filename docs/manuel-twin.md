# Manuel — Locomotion Twin (moteur d'analyse)

> Mode d'emploi **vivant** du moteur `services/twin-engine`. À mettre à jour à chaque évolution.
> La méthode scientifique (VC, exposant d'endurance, durabilité, Minetti, pacing) est dans
> [`docs/twin-theory.md`](./twin-theory.md) — ce document-ci ne couvre que **l'usage**.
>
> Dernière mise à jour : ingestion multi-marques (Coros/Garmin `.fit`, Polar JSON, Strava bulk).

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

> `--race` par défaut : `examples/nice-100m.json` (course de référence). Pour une autre course, copie
> ce fichier et adapte les champs (voir §6).

## 4. Utilisation via l'API (HTTP)

L'API FastAPI est **interne** en prod (jointe par l'app `twin`). En local, on l'expose pour tester :

```bash
docker compose -f services/twin-engine/compose.local.yml up --build
# → http://localhost:8000/health      (sonde)
# → http://localhost:8000/docs        (OpenAPI interactif)
```

Endpoints :

| Méthode & route | Rôle |
|---|---|
| `GET /health` | sonde de vie |
| `POST /preview` | archive + GPX + spec de course → verdict + fourchette (synchrone, sans PDF) |
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

## 7. Développement & tests

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

## 8. Déploiement (rappel)

L'infra est **du code** (`infra/`). Le service `twin-engine` est déjà décrit dans `infra/compose.yml`
(interne, volume `twin_engine_data`, route Caddy publique en *draft* désactivée). L'image se
construit et se pousse sur GHCR **automatiquement** via `.github/workflows/deploy-vps.yml` à chaque
push sur `main` touchant `services/twin-engine/**`. Voir `docs/runbook-vps.md` pour l'exploitation.
