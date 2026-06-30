# services/twin-engine

Moteur d'analyse **Locomotion Twin** (service Python). À partir de l'archive
d'entraînement d'un·e athlète (multi-marques) et de la trace GPX d'une course, il
estime un « jumeau » physiologique, prédit un temps d'arrivée **validé par validation
croisée**, et produit un plan de pacing par segment avec **fenêtres horaires**.

> Méthode scientifique complète : [`docs/twin-theory.md`](../../docs/twin-theory.md).
> Ce service **n'est pas** un package pnpm : dépendances via `pyproject.toml`, build/déploiement
> par Docker (comme `services/tracking-cache`, mais runtime Python). Exposition **interne** au
> VPS (réseau `web`), pas de route publique par défaut.

## Architecture (en cours de construction)

```
src/twin_engine/
├─ config.py            # env (chemins) > twin.config.json (constantes) > défauts
├─ ingest/              # adaptateurs PAR FORMAT (.fit/.tcx/.gpx, gz/zip, Strava) → schéma canonique
│  └─ canonical.py      # LE contrat unique : activité 1 Hz (t, dist, speed, hr, alt, lat, lon)
├─ course/    (c3)      # GPX course → pente, Minetti, Deq, segments
├─ twin/      (c4)      # courbe record, vitesse critique, exposant E, durabilité
├─ calibration/ (c5)    # régression ultra + fallback « peu d'ultras »
├─ predict/   (c6)      # prédiction auto-cohérente + Monte-Carlo + validation croisée LOO
├─ sufficiency/ (c7)    # verdict 🟢/🟠/🔴 (calculé AVANT tout)
├─ pacing/    (c8)      # plan par segment + fenêtres + horaires/nuit (NOAA)
├─ report/    (c9)      # figures matplotlib (charte) + rapport LaTeX (Ubuntu, XeLaTeX+biber)
├─ jobs/      (c10)     # état des jobs en SQLite + runner in-process
├─ api/       (c10)     # FastAPI : POST /preview, POST /jobs, GET /jobs/{id}
└─ cli.py     (c11)     # rejoue le cas Nice 100M de bout en bout
```

## Dev local

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -e "services/twin-engine[dev]"
pytest services/twin-engine
```

Le dossier de données (`DATA_DIR`, défaut `/data`) porte les archives **transitoires**,
`jobs.sqlite` et les sorties. Les archives brutes sont **purgées dès la fin du parsing** ;
on ne conserve que le rapport (le temps du SAV) et le minimum de métadonnées.

## Configuration

- **Chemins** : variables d'environnement (`DATA_DIR`, `TWIN_CONFIG_PATH`). Aucun chemin en dur.
- **Constantes scientifiques** : [`twin.config.json`](./twin.config.json) (versionné, sans secret),
  reprises telles quelles par `config.py`. Ce sont les « règles fixes » de twin-theory §8.

## CLI (rejoue un cas de bout en bout)

```bash
twin-engine preview --training <archive> --course <parcours.gpx> [--race examples/nice-100m.json]
twin-engine full    --training <archive> --course <parcours.gpx> --out ./out [--race ...]
```

En local l'archive n'est **pas** purgée (ajouter `--purge` pour l'opt-in) ; l'API de prod purge.

## Docker / déploiement (comme `tracking-cache`)

L'image (Python + FastAPI + **TeXLive cherry-piqué** pour XeLaTeX+biber) se build avec le
**contexte = racine du monorepo** :

```bash
# local (API exposée sur localhost:8000, données dans ./local-data) :
docker compose -f services/twin-engine/compose.local.yml up --build
#   http://localhost:8000/health · http://localhost:8000/docs (OpenAPI)
```

En prod : la CI ([`deploy-vps.yml`](../../.github/workflows/deploy-vps.yml)) build et pousse
`ghcr.io/thelocomotionlab/twin-engine` ; le service tourne **interne** (réseau `web`, pas de
port hôte) dans [`infra/compose.yml`](../../infra/compose.yml), données dans le volume
`twin_engine_data`. Route publique en draft : `infra/caddy/conf.d/twin-engine.caddy.disabled`.

## API

| Méthode | Route | Rôle |
|---|---|---|
| `GET`  | `/health` | sonde |
| `POST` | `/preview` | synchrone → verdict de suffisance + fourchette (pas de PDF) |
| `POST` | `/jobs` | crée un job `full` (arrière-plan) → `{id}` |
| `GET`  | `/jobs/{id}` | état + résultat |
| `GET`  | `/jobs/{id}/report` | télécharge le PDF |
