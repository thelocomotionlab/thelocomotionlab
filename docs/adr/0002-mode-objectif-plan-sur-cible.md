# ADR 0002 — Mode objectif : un plan de course ancré sur la cible de l'athlète

- **Statut** : accepté
- **Date** : 2026-08-14
- **Décideurs** : mainteneur (Valentin) + Claude
- **Contexte technique** : [`CLAUDE.md`](../../CLAUDE.md), [`docs/twin-theory.md`](../twin-theory.md) §6,
  [`docs/manuel-twin.md`](../manuel-twin.md) §7,
  [`services/twin-engine/DIAGNOSTIC.md`](../../services/twin-engine/DIAGNOSTIC.md) §9.8–9.9,
  [`docs/twin-registre-couverture.md`](../twin-registre-couverture.md)

## Contexte

Le Locomotion Twin répond aujourd'hui à **une** question : « d'après tes données
d'entraînement, en combien de temps finiras-tu cette course ? » — un temps central, une
fourchette de course (50 % nominal) et des bornes de sécurité (80 % nominal), le tout validé
par validation croisée sur les propres courses de l'athlète.

Deux athlètes de la cohorte sur quatre (Crasse, Rapace) ont spontanément demandé **autre
chose** : « je vise 31 h sur l'Échappée Belle, donne-moi le plan pour y arriver ». La question
n'est plus *combien de temps* mais *comment répartir un temps choisi*. C'est une demande
différente, adressée par une population différente : des athlètes qui connaissent déjà leur
niveau et veulent un outil de pilotage, pas un pronostic.

Trois faits techniques rendent la réponse peu coûteuse :

1. **Le pacing est déjà un moteur de répartition.** `pacing/plan.py` ne consomme de la
   prédiction qu'un scalaire (`tpred = prediction.finish_hours`) puis normalise
   `Σ deq_i / v_i = t_move`. Le fade vient de la durabilité mesurée, les arrêts de la
   `RaceSpec`, l'horloge et la nuit du `start_time`/`lat`/`lon`. Rien ne dépend de l'origine
   de ce scalaire.
2. **L'inversion physiologique existe déjà.** `Twin.envelope_vga_ms(t_s)` donne la vitesse
   ajustée soutenable pour une durée donnée. Confrontée à la vitesse qu'exige la cible
   (`deq_km / t_cible`), elle produit un indice de faisabilité sans aucune science nouvelle.
3. **Rien de tout cela ne traverse `predict.py` ni `calibration.py`.** Le chantier est
   *additif* : il n'est pas un changement de modèle.

Le risque, lui, est réel et n'est pas technique : **un plan sur objectif n'est pas
falsifiable**. Si l'athlète finit en 33 h alors qu'on lui a écrit un plan pour 31 h, on ne
peut pas distinguer un modèle qui s'est trompé d'un athlète qui n'a pas tenu son plan. Or
c'est la falsifiabilité de chaque rapport qui alimente le registre de couverture, seule
instance autorisée à trancher la calibration — et la jauge est à 2 cas frais vendables dans
le domaine sur les 8 requis (DIAGNOSTIC §9.9). Un produit plus vendeur et moins vérifiable
est exactement la pente qu'il faut baliser avant de s'y engager.

## Décision

On ajoute un **mode objectif** au moteur existant. Ce n'est **pas une v2** ni un produit
séparé : c'est un **second rendu du même jumeau**, activé par une entrée optionnelle.

1. **Entrée** : `RaceSpec.target_hours` (optionnelle, `None` par défaut), renseignable dans
   la spec de course JSON (`"target_hours": "31h"`, `"31:00:00"` ou un nombre d'heures).
2. **Ancre** : `build_pacing(..., anchor_hours=…)` remplace le temps prédit par la cible dans
   la normalisation. Tout le reste du plan (fade, arrêts, horloge, nuit) est inchangé.
3. **Verdict de faisabilité** : un module `feasibility.py` confronte la cible au jumeau et au
   domaine de calibration, et classe la demande en quatre régimes (ci-dessous).
4. **La prédiction n'est jamais remplacée ni masquée.** Elle est toujours calculée, toujours
   affichée dans le rapport, toujours consignée au registre. Le mode objectif s'ajoute à
   côté d'elle.

### Vocabulaire : trois objets, trois noms, jamais mélangés

| Objet | Source | Question à laquelle il répond |
|---|---|---|
| **Bornes de sécurité** (80 % nominal) | prédiction | « il est très improbable d'arriver hors de ça » — logistique, barrières, assistance |
| **Fourchette de course** (50 % nominal) | prédiction | « une course sur deux se joue là » — pilotage en mode prédiction |
| **Fenêtre de passage** (tolérance d'exécution) | **cible + tolérance fixe** | « passe ici dans cette fenêtre, sinon tu es en train de griller ton plan » |

En mode objectif, les fenêtres par segment sont la **fenêtre de passage** : elles ne sont
plus une bande de probabilité. Le rapport ne doit donc jamais écrire « 50 % » ni « 80 % » à
leur sujet. Les bornes de sécurité, elles, **restent affichées** et restent issues de la
prédiction : c'est le rappel du réel à côté de l'objectif choisi.

**Origine de la tolérance.** Trois sources étaient possibles : (a) un pourcentage fixe en
config, (b) la dispersion prédictive déjà disponible, (c) la variabilité d'exécution réelle
mesurée sur les écarts plan/passages aux ravitaillements. On retient **(a)**,
`target.tolerance_pct = 2,5 %`, explicitement **provisoire**. (b) est rejetée : elle
transformerait une bande statistique en consigne d'exécution, ce que le tableau ci-dessus
interdit. (c) est la bonne réponse à terme, mais demande une matière qu'on n'a pas encore.
Propriété utile du pourcentage fixe : appliqué au temps *cumulé*, il produit une fenêtre qui
s'élargit avec la course (±18 min à mi-parcours d'un 31 h, ±46 min à l'arrivée), ce qui est
le comportement voulu, gratuitement.

### Les quatre régimes de faisabilité

Les frontières sont les bandes de la prédiction (temps décroissant = plus rapide) :

| Régime | Condition | Ce qu'on livre |
|---|---|---|
| `confortable` | cible ≥ central prédit | le plan, **plus** la mention que l'athlète a de la marge |
| `nominal` | fourchette de course ≤ cible < central | le plan de pilotage — le cas attendu |
| `ambitieux` | borne de sécurité basse ≤ cible < fourchette | le plan **et** où l'écart se paie |
| `hors_portee` | cible < borne de sécurité basse | **pas de plan** : l'écart chiffré, comme objectif d'entraînement |

Un plan pour un objectif hors d'atteinte est un plan pour un abandon : le refus est un
livrable, pas un échec.

### Garde-fous non contournables par la cible

- **`sufficiency.domain_gate` reste prioritaire.** Une cible sous `genuine_min_hours` (10 h)
  est une extrapolation hors périmètre : le refus tient, même si l'athlète a un chiffre en
  tête. Le mode objectif ne contourne aucun garde-fou d'honnêteté.
- **Sans prédiction (données insuffisantes), pas de verdict** : régime `indecidable`, aucun
  plan servi. On ne peut pas juger une cible sans jumeau.
- **`target.refuse_outside_safety`** (défaut `true`) commande le refus du régime
  `hors_portee` ; le passer à `false` est un rollback explicite, jamais un défaut.

## Conséquences

### Sur le registre de couverture

Le mode objectif **n'entre pas** dans le calcul de couverture. Concrètement :

- la prédiction est calculée et consignée comme aujourd'hui, cible ou pas ;
- deux champs s'ajouteront à l'entrée (`target_h` demandée, régime de faisabilité) pour
  pouvoir scorer **plus tard** la qualité du verdict lui-même — avec la même règle
  pré-enregistrée (aucune conclusion sous 8–10 cas) ;
- aucune entrée « plan sur objectif » ne compte dans la couverture des bandes : ce n'est pas
  la même promesse.

### Sur le protocole de changement du moteur

Le chantier ne touche ni `predict.py` ni `calibration.py` ni `twin/` : **le golden reste
intact par construction**, aucune re-capture de fixture et aucun A/B Montagnhard ne sont
requis. La preuve de non-régression est un **test d'invariance** : appelé avec
`anchor_hours = prediction.finish_hours`, `build_pacing` doit rendre des segments identiques
au mode prédiction sur tous les champs **sauf** les fenêtres (`lo_h`, `hi_h`, et les heures
de passage correspondantes), qui changent de nature par décision.

### Sur la rédaction du rapport

C'est là qu'est le vrai coût, et il est éditorial : écrire « voilà ton plan » sans laisser
entendre « donc tu vas y arriver ». La section `Prédiction et validation` reste en place et
non modifiée ; la section `Trois scénarios de course` (déclenchée par la dispersion
*prédictive*, `pacing.scenario_rel_width`) est hors sujet en mode objectif et doit être
neutralisée ; la section `Limites assumées` gagne une ligne obligatoire : *ce plan suppose la
cible tenable, il ne la rend pas tenable*.

### Réserve opérationnelle

Le biais de progression documenté sur Crasse (central systématiquement trop lent en régime
riche : +16,7 / +8,4 / +5,1 / +13,8 %, cf. `docs/twin-registre-couverture.md`) rend le
classement d'une cible ambitieuse peu fiable **pour les athlètes en forte progression** : on
risque de déclarer « hors de portée » l'objectif d'un athlète qui progresse vite — le pire
faux négatif possible. Tant que ce biais n'est pas traité, le verdict de faisabilité d'un
athlète en progression doit être présenté avec cette réserve explicite.

## Lots

| Lot | Contenu | État |
|---|---|---|
| 1 | Moteur : `RaceSpec.target_hours`, `build_pacing(anchor_hours=…)`, `feasibility.py`, constantes de config, tests (dont l'invariance) | **fait** |
| 2 | Rapport : contexte, template LaTeX, narratif, rappel de la prédiction sur la figure de cumul ; câblage `pipeline.analyze_full` | **fait** |
| 3 | CLI (`--target`) + champ optionnel de l'API (`/preview`, `/jobs`) | à faire |
| 4 | Champ structuré dans le formulaire du site (aujourd'hui : `objectifs` en texte libre dans `twin-depot`) | à faire |

Depuis le lot 2, le mode s'active en posant `target_hours` dans la spec de course (`--race`) :
`pipeline.analyze_full` calcule le verdict, n'ancre le plan que si `plan_ok`, et passe le tout au
rapport. Le lot 3 n'ajoute que des **portes d'entrée** (drapeau CLI, champ HTTP), pas de
comportement.

**Vérification du rendu LaTeX.** La compilation PDF réelle n'est exercée qu'avec XeLaTeX présent
(image Docker) ; en CI le test est *skippé*. Le mode objectif ajoutant des blocs conditionnels au
template, un test statique compare le **solde d'accolades et les environnements** du rendu aux
mêmes compteurs du mode prédiction, qui compile en production — il a effectivement attrapé une
accolade en trop (continuation de chaîne non préfixée `f` dans `caption_cumul`) avant tout PDF.

## Alternatives écartées

- **Une « v2 » du Twin, produit séparé.** Dédouble la maintenance et le registre pour un
  moteur identique à 95 %. Rejetée : c'est un mode, pas un produit.
- **Remplacer la prédiction par la cible dans le rapport.** Plus simple et plus vendeur ;
  détruit la falsifiabilité et donc l'instrument d'amélioration du moteur. Rejetée.
- **Dériver la fenêtre de passage de la dispersion prédictive.** Gratuit techniquement,
  mais fait passer une bande de probabilité pour une consigne d'exécution. Rejetée.

## Ce qui reste ouvert

- La valeur de `tolerance_pct` (2,5 % au doigt mouillé) attend la source (c) : l'écart réel
  entre plan et passages, mesuré sur les traces de courses de la cohorte.
- Le scoring du verdict de faisabilité lui-même (une cible déclarée `nominal` est-elle plus
  souvent tenue qu'une cible `ambitieuse` ?) demande de la matière : à rouvrir quand le
  registre aura assez d'entrées avec cible.
