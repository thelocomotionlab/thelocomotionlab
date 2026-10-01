# Registre de couverture — prédictions vs réel (Locomotion Twin)

> **Rôle.** Chaque rapport livré fait une promesse falsifiable : un temps central, une
> fourchette de course (50 % nominal) et des bornes de sécurité (80 % nominal). Ce registre
> consigne, pour chaque course COURUE, où le réel est tombé. C'est LUI qui tranche les débats
> de calibration (« la fourchette est trop large / trop étroite ») — jamais un cas isolé :
> pour un système bien calibré, la moitié des réels tombent dans le quart intérieur de la
> bande (médiane |erreur| = 0,67 σ vs demi-largeur 80 % = 1,28 σ), donc « le réel est tout
> près du central » est le comportement ATTENDU, pas une preuve de sur-largeur.

## Ce que porte le registre

Tout vit sous `docs/twin-registre/`, en agrégats (pseudonymes, chiffres, heures de passage à
des kilomètres publics ; aucune trace, aucune archive, aucun nom).

| Fichier | Contenu |
|---|---|
| `banc/<run>.json` | le **livre banc**, rétrospectif : un fichier par run, jamais réécrit |
| `servi.json` | le **livre servi**, prospectif : les plans servis puis courus |
| `athletes.json` | le statut `dev` / `frais` de chaque athlète, daté, avec son journal |
| `quarantaines.json` | les entrées sorties des statistiques et leur motif, pour tous les runs |
| `passages.json` | les heures de passage réelles d'une course, communes à ses runs et à son entrée servie |

**Le livre banc se régénère à volonté.** Chaque passage de `tools/backtest` ou `tools/banc`
écrit un nouveau run, dont l'en-tête dit ce qui l'a produit : la date, le **commit** du
moteur (et s'il était modifié), l'**empreinte** de la configuration effective, et la liste
des **drapeaux hors défaut** (chaque `bloc.clé` qui diffère de `twin.config.json`). Une
variante du banc est un run de plus, sous sa propre empreinte.

**Le livre servi ne se réécrit pas.** Une entrée servie se fige quand le laboratoire saisit le
résultat (tableau de bord, `PUT …/result`) ; la changer demande une correction motivée, et
l'ancienne version reste dans l'historique de l'entrée. Un résultat saisi par l'athlète reste
provisoire jusqu'à celui du laboratoire. Le livre committé se complète par
`tools/registre --importer` à partir de l'export du tableau de bord, sous la même règle.

**Le statut est porté par l'athlète.** Un athlète est `frais` tant que le moteur n'a pas été
réglé sur ses données ; il devient `dev` le jour où on s'en sert pour mettre le modèle au
point (bouton « Marquer comme cas de développement » de l'écran Athlète, ou
`tools/registre --marquer`), avec un motif journalisé. Une décision ne compte que les athlètes
frais à sa date, et les nomme (`tools/registre --decision AAAA-MM-JJ`).

**Les lectures séparent toujours livre × statut × niveau** — niveau calibré (🟢/🟠, vendu)
et niveau de base (🔴, refusé) : `tools/registre`, ses tableaux et ses comparaisons, l'écran
Registre du tableau de bord.

## Règles pré-enregistrées

**Règle de décision (2026-07-03).** À ≥ 8–10 entrées frais : calculer la couverture empirique
des deux bandes et l'*interval score* de Winkler (S_α = largeur + (2/α)·dépassement ;
Gneiting & Raftery 2007, JASA). Si la couverture du 80 % dépasse nettement 90 % ET que des
bandes plus étroites scorent mieux, recalibrer (facteur d'échelle sur les scores conformes,
ou quantiles mutualisés inter-athlètes — le « conforme groupé » : mêmes scores studentisés,
pool sur tous les athlètes). Sinon, ne rien toucher. On ne recalibre JAMAIS sur moins de 8 cas
ni sans score propre.

**Règle de retour (2026-09-16, Décision 1 du chantier v2).** Les défauts servis sont la pile
de référence du chantier (lien log, prior sur la pente lu sur l'efficacité-durée, queue
d'enveloppe sur l'efficacité-durée, échelle studentisée) ; les anciens défauts sont le
rollback nommé `examples/twin.config.historique.json`. À **10 nouvelles courses COURUES par
des athlètes frais à la date de la décision**, on rejoue le banc à l'identique sous les deux
configurations : si la MAE des vendus OU le Winkler 80 sont pires sous les nouveaux défauts
que sous les anciens, on revient aux anciens. Aucune autre condition, aucun cas isolé.

## R&D

Règles du chantier « Terrain, registre, cohorte » (Valentin, 2026-10) :

- On est en recherche et développement : on tente beaucoup, on mesure tout, et c'est le
  registre qui dit ce qui marche.
- Tout se trace. Chaque nouveauté vit derrière un drapeau de `twin.config.json`. La
  configuration de référence de Valentin peut porter tous les drapeaux expérimentaux utiles ;
  chaque entrée du registre garde la configuration qui l'a produite (l'en-tête de son run).
- Les défauts — ceux des plans de la cohorte — ne basculent que sur preuve au registre.
- Le total et la répartition sont deux questions : le terrain change la répartition ; il ne
  change le total que de façon symétrique (ultras passés et cible traités pareil) ou par
  différence.
- Ce qui est ajusté sur Nice se juge ailleurs ; Nice est rapportée à part.

## Protocole de backtest rétrospectif (alimentation accélérée du livre banc)

Chaque course PASSÉE d'un athlète consentant = une entrée, sans attendre les courses futures.
Un manifeste JSON par athlète → `tools/backtest.py` (ou `tools/banc.py`, une passe par
archive) enchaîne les coupures « veille de course » et écrit un run ; `tools/passages.py`
relève les heures de passage réelles ; `tools/registre.py` calcule couverture, biais, score de
Winkler et quantiles groupés.

```
# 0. « jusqu'où puis-je resserrer sans mentir ? » — frontière finesse/calibration :
PYTHONPATH=src python -m tools.registre --frontiere
# 1. un manifeste par athlète (cf. docstring de tools/backtest.py pour le format) :
#    { "athlete": "Pseudo", "archive": "export.zip",
#      "races": [{"name": "…", "date": "2025-06-14", "official_time": "26:30:00",
#                 "gpx": "trace.gpx"}] }
# 2. depuis services/twin-engine : un run, puis sa lecture
PYTHONPATH=src python -m tools.backtest manifest-a1.json manifest-a2.json ... [--label NOM] [--set bloc.clé=valeur]
PYTHONPATH=src python -m tools.registre [--run ID] [--livre banc|servi|tous] [--decision AAAA-MM-JJ]
PYTHONPATH=src python -m tools.registre --runs                 # les runs et ce qui les a produits
PYTHONPATH=src python -m tools.registre --compare RUN_A RUN_B   # avant → après
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
   athlète d'abord.
3. Le statut de l'athlète se lit dans `athletes.json` à la date de la décision ; un manifeste
   ne le porte plus.
4. L'outil consigne : central, deux bandes, source (mc/conforme), sd prédictif relatif
   (normalisation de la future fenêtre groupée), temps réel, erreur signée, couvert ou non,
   n ultras et verdict à la coupure. Un refus de prédire (🔴) est consigné tel quel.
   Une course À VENIR (sans `official_time`) donne une entrée **préparée** : tout est consigné
   sauf le réel, et elle reste hors des statistiques jusqu'à ce que le temps soit renseigné et
   le banc relancé.
5. **Quarantaine, jamais de suppression silencieuse** : une entrée aux données d'ENTRÉE
   fausses (ex. trace de parcours corrompue) se met en quarantaine avec son motif —
   `python -m tools.registre --quarantine "Athlète" "Course" "AAAA-MM-JJ" "motif"` — elle
   sort des statistiques de tous les runs mais reste visible.
6. Le niveau calibré (**VENDU**, verdict 🟢/🟠) se lit à part du niveau de base (refusé, 🔴) :
   c'est la statistique commerciale — un raté refusé par le garde-fou ne coûte pas un
   client, il valide le garde-fou.

## Historique

- Jusqu'au 2026-10-01, le registre était un fichier unique
  (`docs/archive/twin-registre-couverture-2026-09.json`, 35 entrées, statut dans `dev_set`).
  Il est rangé au livre banc comme run `20260916-000000-registre-migre` ; ses passages et ses
  trois quarantaines sont dans `passages.json` et `quarantaines.json`.
- Notes d'étiquetage (2026-07-15) : Crasse est un cas de développement (filtre de maximalité
  et réglages mis au point sur son fixture) ; le cas MIUT de Lolo a motivé la bascule des
  bandes vers le conforme normalisé. Depuis le 2026-10-01, Val, Crasse, Lolo et Rapace sont
  tous des cas de développement.
- Biais de progression (signal n° 3 du banc) : sur Crasse, athlète en forte progression, le
  central prédisait systématiquement trop lent en régime riche ; mécanisme et leviers testés
  au carnet (DIAGNOSTIC §5.x, §10.12).
