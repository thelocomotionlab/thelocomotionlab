repo: thelocomotionlab/thelocomotionlab
branch: main

## Last sync
date: 2026-09-22T08:02:37Z

### Updated in this project
- Charte lue depuis packages/ui (theme.css, tokens.ts, Button, Field) et grammaire rail / inspecteur du studio (Rail, Inspecteur, BarreHaute, Controles).
- Course de référence (nice-100m.json : carnet de route officiel 169,7 km / 8 900 m, postes d'assistance, bases majeures) et altimétrie par segment (_seed/analyse/segments.json) pour le profil calculé.
- Registre de couverture (docs/twin-registre-couverture.md) pour le vocabulaire et la synthèse de l'écran Registre.
- BadgeEtat (packages/ui/src/components/contenu/BadgeEtat.tsx) : pastilles de statut à venir / en cours / derrière nous.

## Screen map
| Écran (Tableau de bord Locomotion Twin.dc.html) | Fichiers du dépôt |
|---|---|
| File, Athlète, Bibliothèque, Registre | apps/studio/components/BarreHaute.tsx, Inspecteur.tsx, Controles.tsx ; packages/ui/src/styles/theme.css ; docs/twin-registre-couverture.md |
| Éditeur de course (Trace, Ravitaillements, Course) | apps/studio/components/Rail.tsx, Inspecteur.tsx ; services/twin-engine/examples/nice-100m.json ; services/twin-engine/_seed/analyse/segments.json |
| Plan | services/twin-engine/examples/nice-100m.json ; docs/maquettes/rapport-v4/canevas.md ; services/twin-depot/README.md |
| Page athlète (avant / après, desktop et téléphone) | docs/maquettes/rapport-v4/canevas.md ; services/twin-engine/report/charte.py ; packages/ui/src/components/Button.tsx |
