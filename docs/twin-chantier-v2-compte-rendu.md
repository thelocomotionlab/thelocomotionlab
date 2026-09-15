# Chantier Twin v2 — compte-rendu (document de chantier, destiné à `docs/archive/` à la clôture)

> Ce document suit le chantier « Twin v2 » (2026-09) : ce qui a changé, ce qui a été rejeté
> et pourquoi, les questions ouvertes, et la liste des points où Claude a dû choisir à la
> place de Valentin. Il n'édicte aucune règle ; les preuves chiffrées vivent dans
> `services/twin-engine/DIAGNOSTIC.md` §10, la méthode dans `docs/twin-theory.md`, l'usage
> dans `docs/manuel-twin.md`.

## Objet

Resserrer honnêtement les bandes du Locomotion Twin, individualiser le plan, rendre le
rapport vendable. Diagnostic de départ (audit externe) : le centre est bon (LOO ≈ 6,8 % sur
12 ultras), les bandes valent ~2,2 × une gaussienne au σ implicite parce que l'intervalle
est mécaniquement large — levier d'extrapolation (cible 32 h, ultras validés 10–22 h),
quantile conforme à n = 12 (un seul mauvais pli fixe la borne), symétrie en heures d'une
erreur multiplicative. Règle : apporter de l'information dans la zone 25–35 h, stabiliser
le quantile, casser la symétrie ; jamais réduire la couverture nominale.

Phases : 0 baselines et mesures · 1 statistique de l'intervalle (A2 lien log, A1 prior sur
la pente, A3 facteur d'échelle studentisé) · 2 structure du temps (B4 arrêts, C2 nuit,
fade individualisé, C3 chaleur/altitude) · 3 information manquante (B1 efficacité-durée,
B2 queue des plus longues courses) · 4 données publiques de la course (B3) · 5 coût de
pente personnel (C1) · 6 rapport v2.

## État au départ (2026-09-15)

- Branche du chantier créée depuis `origin/main` (de80c00) ; une branche par phase
  (`twin-v2/phase-N-…`).
- Suite `pytest services/twin-engine` : 264 passés, 6 sautés (PDF sans XeLaTeX/biber dans
  le conteneur, golden réel sans archive). Golden déterministe vert.
- Le registre committé (`docs/twin-registre-couverture.json`, 34 entrées) reproduit à
  l'identique le banc du 2026-08-15 (DIAGNOSTIC §5.y) ; aucun changement moteur depuis.
- Les archives du banc (`_seed/cas_validation/`, 1,9 Go) restent chez Valentin : les
  mesures réelles se font chez lui (voie A), les outils sont testés ici sur du synthétique.
- Rapport de référence livré le 2026-09-15 (archive fraîche, 891 activités) : central
  32 h 17, fourchette 28 h 11 – 36 h 22, sécurité 24 h 39 – 39 h 54, LOO 6,8 %, durabilité
  19 %, dérive affichée « −16 % ». Ses chiffres diffèrent des références du golden réel
  (archive de juillet, 449 activités) : voir « Questions ouvertes ».
- L'écart signalé par l'audit entre `CLAUDE.md` (« Ubuntu + Lora ») et `packages/ui`
  (Ubuntu Sans seule) n'existe plus : corrigé le 2026-09-10 (commit 50c13ee).

## Phase 0 — baselines et mesures (branche `twin-v2/phase-0-baselines`)

**Aucun changement de comportement.** Aucun flag ajouté, `twin.config.json` intact, golden
déterministe inchangé au chiffre près, `tools.ab_montagnhard` identique au tableau §4,
suite verte (275 passés, 6 sautés).

**Livré.**
- `docs/archive/twin-v2/registre-avant.json` : copie du registre committé, référence de tous
  les avant/après.
- `tools/registre --tableau` (tableau de référence markdown : par athlète et total,
  vendus/refusés, MAE, biais, couvertures 50/80, Winkler relatif moyen, largeur relative
  médiane) et `--compare AVANT.json` (deltas par athlète sur les vendus, changements de
  verdict, erreur entrée par entrée).
- `twin/stops.py` : masque « en mouvement » (base distance), détection d'arrêts par plateau,
  statistiques ; `record.py` consomme désormais ce masque (refactor sans effet numérique).
- `pacing/sun.py::night_mask/night_share` : part de nuit intégrée à la minute, même test
  jour/nuit que le plan.
- `CourseProfile.lat_grid/lon_grid` + `checkpoint_coords()` : position des points de
  découpage sur la grille du profil (additif, `to_dict` inchangé).
- `tools/diag_ultras` : par archive, arrêts (H2) et part de nuit (C2) des efforts longs,
  statut au filtre vrais ultras, poids récence × maximalité, écart montre − officiel via le
  manifeste ; part de nuit de la cible par segment via le plan réel.
- `tools/passages` : heures de passage réelles aux points de contrôle des courses passées,
  consignées dans le registre sous `passages`.
- `tools/banc` : backtest, radiographie et passages sur un seul décodage par archive,
  sorties markdown/JSON dans un dossier ; résultats identiques aux outils séparés.
- `_seed/manifest-val.json` pointe sur le dossier `archives/` de Val comme les autres
  manifestes (le nom d'archive qu'il portait n'existait plus) ; une archive introuvable est
  signalée et sautée par `backtest`, `passages` et `banc`.
- DIAGNOSTIC §10.0 (constats, tableau de référence, placeholders des mesures réelles),
  manuel §8 (outils et feuille de commandes), ce compte-rendu.

**Constat 0.4 (fade).** Confirmé dans le code et dans le PDF : le plan sert Δ = 0,085
(dérive affichée −15,7 %, imprimée « −16 % ») alors que la durabilité mesurée vaut 19 %
(20,9 % dans twin-theory §12) et que le texte dit « la dérive contrôlée du plan est faite
pour toi ». Correctif en Phase 2 (`fade_source=durability`, puis `splits`).

**Banc rejoué (2026-09-15, chez Valentin, `tools/banc`).** Crasse, Lolo et Rapace identiques
au chiffre près à l'instantané ; Val change parce que son archive a changé (export frais,
55 mois). Mesures H2, nuit et passages consignées en DIAGNOSTIC §10.0 : la montre ne ment
pas sur l'écoulé (écart ≤ 5 min), le taux d'arrêt est personnel et dispersé (Crasse
0,2–0,7 min/h de plateaux en course, Val 4–5), la nuit de Nice vaut 43 % du mouvement
contre 33–34 % sur les ultras de Val, ≈ 290 passages réels relevés sur 30 courses.

**Découverte : doublons d'activités.** Val (toute activité depuis 2024-09, 551 copies) et
Lolo (545 copies, déjà au banc d'août) ont chaque activité en double dans leur archive —
deux exports qui se recouvrent. Correctif activé : `twin.dedup_activities=on` (même départ,
même durée, même distance ⇒ une copie, la plus riche ; rollback `off`), sans effet sur le
golden ni sur les fixtures (pas d'heure de départ dans les agrégats). Le banc rejoué sous
dédoublonnage est le « avant » du chantier (`registre-avant.json`) ; l'instantané brut est
gardé sous `registre-avant-doublons.json`.

**Phase 0 close (2026-09-15).** « Avant » définitif : cas vendus n=13, MAE 10,3 %, couverture
38 % (50 nominal) et 54 % (80 nominal), Winkler relatif 0,342 / 0,570, largeur relative
médiane 8,1 % / 15,5 % ; cas de référence Nice : 32,33 h, fourchette ±15,0 %, sécurité
±24,3 %, LOO 6,9 % sur 12 plis. Trois lectures pour la suite : les bandes sous-couvrent
sur les cas vendus (la règle « jamais réduire la couverture nominale » est contraignante),
deux bandes dégénérées à corriger (borne basse 0,0 h, borne haute au plafond), et un biais
de progression chez un second athlète (Val 2024 : +21 à +24 %).

## Choix faits à la place de Valentin (Phase 0)

1. **Définition d'un arrêt.** Deux vues, toutes deux imprimées : les secondes « sans
   mouvement » au sens du moteur (incrément de distance ≤ 0,5 m/s, `moving_speed_threshold_ms`)
   et les plateaux d'au moins 60 s (`--min-stop-s`, réglable), avec un compte séparé des
   plateaux ≥ 5 min. La marche très lente compte dans la première, pas dans la seconde.
2. **Fuseau des activités pour la nuit.** Fuseau « solaire » déduit de la longitude
   (arrondi à l'heure), pas le fuseau civil : le test jour/nuit ne dépend que de la
   cohérence horloge/heures solaires, et l'heure d'été n'y change rien.
3. **Pondération des agrégats.** Médianes (tous efforts longs, vrais ultras) et moyennes
   pondérées par récence × maximalité, recalculées avec les fonctions de la calibration :
   c'est ce que le modèle servi « voit » ; c'est la moyenne qui servira à C2.
4. **Relevé des passages.** Rayon 150 m (réglable), monotonie, cohérence avec la distance de
   la montre (± max(3 km, 8 % du km)), heure = approche la plus proche du premier passage
   dans le rayon (pas l'entrée dans le rayon, qui avance chaque passage de rayon/vitesse).
   Repli « closest » si l'approche la plus proche est sous 1 km, sinon « introuvable ».
5. **Activité du jour de course.** Recherche à ± 1 jour de la date du manifeste (courses
   nocturnes), durée la plus proche du temps officiel.
6. **Stockage des passages.** Dans l'entrée de registre correspondante, champ `passages`
   (validé par Valentin : des heures à des km publics n'ajoutent rien d'identifiant).
   Une entrée absente du registre est créée minimale ; la re-fusion du banc la complète.
7. **Colonnes du tableau de référence.** Winkler relatif (÷ temps réel) plutôt qu'en heures,
   pour comparer des courses de 6 h et de 26 h ; largeur relative médiane (÷ central) par
   bande ; le split vendu/refusé avec les motifs bloquants.
8. **Part de nuit de la cible.** Obtenue du plan réel (`build_pacing`, fade et arrêts
   compris) sur un temps central donné à la main (`--hours`), plutôt que d'un preview complet
   qui exigerait l'archive.
9. **Une passe par archive.** Le premier essai du banc chez Valentin a montré le coût de
   trois décodages par archive (interruptions) : `tools/banc` ouvre le flux une fois et le
   distribue au cache du banc, à la radiographie et aux passages, et écrit lui-même ses
   sorties, pour supprimer les redirections et les chemins à recopier.
10. **Dédoublonnage activé d'emblée** (pas seulement derrière un flag) : un doublon d'export
    n'est jamais légitime, le correctif est une règle de plomberie de données comme §9.10 et
    §9.11, sans effet sur le golden ni les fixtures, avec rollback `off`. Clé : heure de
    départ ISO à la seconde, durée ±5 s, distance ±2 % ; préférence FC > altitude >
    découplage > première copie. Sans heure de départ, rien n'est fusionné.
11. **Activité du jour de course** : durée exigée entre 0,5 et 1,5 × l'officiel (Chota 2025
    avait retenu une sortie d'une heure).

## Questions ouvertes

- **Golden réel et archive fraîche.** Les références §12 (2026-07-02, 449 activités) ne
  correspondent plus à l'archive fraîche (55 mois, 891 activités uniques : VC 9,72 km/h,
  E 1,18, 32,28 h, LOO 6,8 %). Le golden réel ne peut être vérifié PASS que sur l'archive
  de juillet, si elle existe encore ; sinon, la recapture « avant » sur l'archive fraîche
  dédoublonnée devient la référence du chantier et §12 sera recapturé avec justification.
- **Origine des doublons de Val et de Lolo** : deux exports réunis dans une archive ? Le
  moteur les fusionne désormais ; savoir d'où ils viennent dit si d'autres athlètes de la
  cohorte en auront.
- **Spec de course du rapport livré.** Arrêts imprimés 1 h 25 contre 1 h 45 attendus avec
  `examples/nice-100m.json` : la spec (et la config) servies pour le PDF du 2026-09-15 sont à
  récupérer.
- **Phase 4.** Import CSV manuel par défaut ; LiveTrail seulement après vérification de ses
  conditions d'utilisation.
- **Annexe en ligne** : page du site (décidé) ; support à implémenter en Phase 6.
- **Polices** : instances statiques Ubuntu Sans produites par `fonttools varLib.instancer`,
  abandon d'UbuntuMono au profit des chiffres tabulaires (décidé) ; à faire en Phase 6.

## Rejeté

(rien encore — les pistes rejetées des phases suivantes seront listées ici avec leurs chiffres)
