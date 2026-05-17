# `plots-src/` — sources des graphiques Plotly

Chaque sous-dossier produit **un fichier** dans `public/data/plots/`.

## Structure

```
plots-src/
└─ kilometrage-hebdo-2026/
   ├─ data.csv          ← les données (éditable dans LibreOffice Calc)
   └─ spec.json         ← la spec Plotly avec références @colonne
```

Sortie : `public/data/plots/kilometrage-hebdo-2026.json`

## Build

```bash
# Installation des deps (une fois)
pip install pandas openpyxl odfpy

# Une figure
python scripts/build_plot.py plots-src/kilometrage-hebdo-2026/

# Toutes les figures
python scripts/build_plot.py plots-src/*/
```

## Format `data.*`

Tous ces formats sont reconnus (le script prend le premier trouvé) :
- `data.csv` — séparateur virgule
- `data.tsv` — séparateur tabulation
- `data.txt` — auto-détection du séparateur (Python `engine="python"`)
- `data.xlsx` — premier onglet uniquement
- `data.ods` — premier onglet uniquement

Première ligne = noms des colonnes (utilisés dans `spec.json`).

### Exemple (`data.csv`)
```
semaine,km
S1,0
S2,24.42
...
S19,62.6
```

## Format `spec.json`

C'est une **spec Plotly normale**, sauf qu'à la place de tableaux de
nombres tu mets des **références aux colonnes du CSV** :

| Syntaxe | Effet |
|---|---|
| `"@colonne"` | Remplacé par la liste des valeurs de la colonne |
| `"@@colonne.agg"` | Remplacé par un scalaire (mean, median, sum, min, max, std, count) |

### Colonnes dérivées

Pour calculer une colonne avant la résolution des `@…`, ajoute un bloc
`_derived` au top-level. Une fois dérivée, elle est référençable
exactement comme une colonne du CSV.

```json
"_derived": {
  "moyenne":   { "agg": "mean",    "of": "km", "round": 2 },
  "cum_km":    { "agg": "cumsum",  "of": "km" },
  "diff_km":   { "agg": "diff",    "of": "km" },
  "roll4":     { "agg": "rolling", "of": "km", "window": 4 }
}
```

Agrégateurs **scalaires** (renvoient une colonne constante) :
`mean`, `median`, `sum`, `min`, `max`, `std`, `count`.

Agrégateurs **série** (renvoient une colonne de même longueur) :
`cumsum`, `diff`, `rolling` (param `window`), `pct_change`.

### Exemple minimal

```json
{
  "_derived": {
    "moyenne": { "agg": "mean", "of": "km", "round": 2 }
  },
  "data": [
    {
      "type": "scatter", "mode": "lines+markers",
      "x": "@semaine", "y": "@km",
      "line": { "color": "#8CB9BD" }
    },
    {
      "type": "scatter", "mode": "lines",
      "x": "@semaine", "y": "@moyenne",
      "line": { "color": "#EFB159", "dash": "dash" }
    }
  ],
  "layout": {
    "yaxis": { "title": { "text": "Kilométrage (km)" } },
    "showlegend": false
  }
}
```

## Workflow recommandé

1. Crée `plots-src/<nom-figure>/`
2. Édite `data.csv` dans LibreOffice Calc (Fichier → Enregistrer sous… → CSV)
3. Crée `spec.json` (copie depuis un existant et adapte)
4. `python scripts/build_plot.py plots-src/<nom-figure>/`
5. Référence dans le markdown : `<plot src="/data/plots/<nom-figure>.json" name="<nom-figure>" />`
6. Référence depuis le texte : `{{fig:<nom-figure>}}`

## Référence complète des options Plotly

Voir `public/data/plots/template.json` pour la liste exhaustive des
clés `data` / `layout` / `config` (titres, axes, légende, annotations,
shapes, modebar, etc.).
