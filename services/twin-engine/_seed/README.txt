Plan de pacing — Nice by UTMB 100M — module Locomotion Twin
===========================================================

rapport/   : rapport LaTeX complet et recompilable
  - main.tex, references.bib  (le rapport)
  - locomotionreport.cls, math.tex, fonts/, assets/  (template Locomotion Lab)
  - figures/  (6 figures PNG)
  Compilation :  latexmk -xelatex main.tex     (nécessite XeLaTeX + biber)

analyse/   : pipeline d'analyse (graine de l'app numerical-twin)
  - gpx_parse.py / course.py : trace GPX -> profil, coût de pente (Minetti),
                               distance équivalente, découpage par ravitaillements
  - extract_all2.py          : 449 fichiers .fit Coros -> courbe record ajustée
                               à la pente, durabilité, résumés par activité
  - twin_fit.py              : vitesse critique, exposant d'endurance,
                               régression ultra, prédiction auto-cohérente
  - pacing.py                : validation croisée, plan par segment, horaires/nuit
  - figs.py                  : génération des figures
  - segments.json, plan.json : résultats intermédiaires

Note : les chemins dans les scripts pointent vers /home/claude/twin/... (environnement
d'analyse) ; à adapter pour réexécution locale.
