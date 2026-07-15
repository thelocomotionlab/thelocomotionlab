# Registre de couverture — prédictions vs réel (Locomotion Twin)

> **Rôle.** Chaque rapport livré fait une promesse falsifiable : un temps central, une
> fourchette de course (50 % nominal) et des bornes de sécurité (80 % nominal). Ce registre
> consigne, pour chaque course COURUE, où le réel est tombé. C'est LUI qui tranche les débats
> de calibration (« la fourchette est trop large / trop étroite ») — jamais un cas isolé :
> pour un système bien calibré, la moitié des réels tombent dans le quart intérieur de la
> bande (médiane |erreur| = 0,67 σ vs demi-largeur 80 % = 1,28 σ), donc « le réel est tout
> près du central » est le comportement ATTENDU, pas une preuve de sur-largeur.
>
> **Règle de décision pré-enregistrée (2026-07-03).** À ≥ 8–10 entrées : calculer la
> couverture empirique des deux bandes et l'*interval score* de Winkler
> (S_α = largeur + (2/α)·dépassement ; Gneiting & Raftery 2007, JASA). Si la couverture du
> 80 % dépasse nettement 90 % ET que des bandes plus étroites scorent mieux, recalibrer
> (facteur d'échelle sur les scores conformes, ou quantiles mutualisés inter-athlètes —
> le « conforme groupé » : mêmes scores studentisés, pool sur tous les athlètes). Sinon, ne
> rien toucher. On ne recalibre JAMAIS sur moins de 8 cas ni sans score propre.
>
> **PII.** Uniquement des agrégats (pas de trace, pas d'archive) : pseudonyme, course,
> chiffres du rapport, temps officiel public.

| # | Date course | Athlète (pseudo) | Course | Central | Fourchette (50 %) | Sécurité (80 %) | Source bandes | Réel | Erreur centrale | Dans 50 % ? | Dans 80 % ? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2026-04-26 | Lolo | MIUT 2026 (109 km, 6 775 m D+) | 26 h 04 | 18 h 58 – 71 h 55 | 16 h 36 – 71 h 55 | mc (dégénéré : bornes hautes = plafond Deq/v_floor) | 25 h 49 | **−1,0 %** | oui | oui |
| 2 | *(à courir)* | Thomas D. | La Crasse Montagnhard | 19 h 14 *(rapport du 2026-07-03, bandes MC)* | 16 h 50 – 22 h 30 | — | mc | — | — | — | — |

**Notes d'étiquetage (2026-07-15).**
- **Crasse = cas de DÉVELOPPEMENT** (`dev_set: true`) : c'est l'athlète Montagnhard — le
  filtre de maximalité et plusieurs réglages ont été mis au point sur son fixture. Ses
  backtests sont indicatifs, jamais décisionnels.
- **Lolo reste « frais » pour les erreurs du CENTRAL**, mais son cas MIUT a motivé la
  bascule `interval_source=conformal_normalized` : pour les décisions de COUVERTURE des
  bandes, le compter avec prudence (à part si le doute pèse sur une décision).

**Notes.**
- Entrée 1 : données tronquées au 20/04/2026 (6 jours avant course) ; central excellent, bandes
  MC dégénérées (voir DIAGNOSTIC §9.8 — c'est ce cas qui a motivé la bascule des bandes vers le
  conforme normalisé). À re-scorer aussi contre les bandes conformes recalculées a posteriori
  si utile.
- Entrée 2 : à compléter avec le temps officiel après la course ; si le rapport est régénéré
  avec les bandes conformes avant la course, mettre à jour les bandes consignées.

## Protocole de backtest rétrospectif (alimentation accélérée du registre)

Chaque course PASSÉE d'un athlète consentant = une entrée, sans attendre les courses
futures. **Outillé de bout en bout** : un manifeste JSON par athlète →
`tools/backtest.py` enchaîne les coupures « veille de course », imprime le tableau
prédit-vs-réel et alimente le registre machine (`docs/twin-registre-couverture.json`,
agrégats seulement) ; `tools/registre.py` calcule couverture, biais, score de Winkler et
quantiles groupés.

```
# 1. un manifeste par athlète (cf. docstring de tools/backtest.py pour le format) :
#    { "athlete": "Pseudo", "archive": "export.zip",
#      "races": [{"name": "…", "date": "2025-06-14", "official_time": "26:30:00",
#                 "gpx": "trace.gpx"}] }
# 2. depuis services/twin-engine :
PYTHONPATH=src python -m tools.backtest manifest-a1.json manifest-a2.json ...
PYTHONPATH=src python -m tools.registre
```

(Le rejeu manuel d'un cas isolé reste possible : `twin-engine preview --training <archive>
--course <trace.gpx> --until <veille>`.)

Règles :
1. **Coupure la veille de la course** (défaut de l'outil ; jamais le jour même — la course
   elle-même est souvent dans l'archive). Les activités non datées sont écartées d'office
   (anti-fuite).
2. **Toutes les courses qualifiantes de l'athlète**, pas celles qui arrangent (biais de
   sélection). Les abandons se consignent (`"dnf": true`) et sont exclus des quantiles.
   Les courses d'un même athlète ne sont pas indépendantes : les agrégats se lisent PAR
   athlète d'abord (`tools/registre.py` les groupe).
3. Les cas de développement (référence Nice, Montagnhard) portent `"dev_set": true` :
   consignés mais comptés À PART — le modèle a été réglé dessus.
4. L'outil consigne : central, deux bandes, source (mc/conforme), sd prédictif relatif
   (normalisation de la future fenêtre groupée), temps réel, erreur signée, couvert ou non,
   n ultras et verdict à la coupure. Un refus de prédire (🔴) est consigné tel quel.
