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
