# DIAGNOSTIC — robustesse de la calibration ultra (cas « Crasse Montagnhard »)

> Cause racine, correctifs et preuves du passage **LOO ~25 % → ~9 %** sur données réelles, tout
> reproductible depuis un fixture de 5 Ko (`tests/fixtures/genuine_ultras_montagnhard.fixture.json`)
> — **l'archive Garmin n'est jamais requise**. Chiffres exacts ré-épinglés post-C1 le 2026-07-02
> (24,8 % → 8,8 % ; pré-C1 : 25,3 % → 9,1 %, lisible dans l'historique git).

## 1. Symptôme

Sur l'archive de l'athlète Thomas Ducreux (12 285 fichiers), le moteur rendait `sellable = False`
alors que tous les critères de suffisance étaient 🟢 **sauf un** : l'erreur de validation croisée
(`sufficiency.py` : le verdict = pire critère). Chiffres exacts, **reproduits par le fixture** :

| Grandeur | Valeur |
|---|---|
| Régime | `regression` |
| Vrais ultras retenus | 8 (sur 12 efforts ≥ 10 h ; 4 sont des artefacts « montre laissée en enregistrement », écartés par `ga ≥ 5,5`) |
| σ (bruit résiduel) | **1,528 km/h** |
| Prédiction (Deq 139,6 km, D+/km 75,05) | **20,68 h** |
| **LOO MAE** | **24,8 %** → 🔴 |
| MAE d'interpolation | 18,1 % |
| MAE d'extrapolation | 34,7 % |

*(Valeurs ré-épinglées post-C1, fixture régénéré le 2026-07-02 — D+ base distance, enveloppe fittée.)*

## 2. Cause racine — hétérogénéité d'intention

Le modèle `v(T, D+/km)` **suppose des efforts maximaux**. Les 8 « genuine » mêlent des courses
maximales (FC 136–152) et des **sorties faciles** — typiquement `2026-04-04` : vga 6,38 km/h, FC 119
(la plus basse), soit **~72 % de son propre plafond d'endurance**. Aucune loi `v(T)` n'absorbe ce
mélange → σ gonfle à ~1,5 km/h et la LOO explose.

**Interaction perverse mesurée** : la pondération par récence (correctif de non-stationnarité) donne
un poids **0,94** à cette sortie facile *récente* → elle **amplifie** le problème. Le filtre de
maximalité neutralise exactement ce point (poids → 0), sans toucher aux courses engagées.

### Les deux outliers LOO (confirmés sur données exactes)

| Course | Réel → Prédit LOO | Nature |
|---|---|---|
| `2024-10-04` (Deq 188,6 ; la plus longue) | 26,2 h → **39,7 h (+52 %)** | **extrapolation de durée** (max de ln T) |
| `2022-07-10` (D+/km = **76,6**, max) | 10,3 h → **13,4 h (+30 %)** | **point de levier terrain** (max de D+/km) |

Les deux sont des plis d'**extrapolation** (voir §4.3) : un seul pli sur 8 ne doit pas décider du
vendable.

### Fondations physio — correctes, à NE PAS réécrire

Minetti 2002 (coût de la pente), VC 2 paramètres (Poole 2016 ; Jones & Vanhatalo 2017), Riegel 1981
(exposant d'endurance), durabilité (Maunder 2021 ; Jones 2024). Le problème n'est pas la science,
c'est **l'hypothèse d'effort maximal** implicitement violée par des données « sales ».

## 3. Correctifs (chacun derrière un flag)

> **Défaut livré** (`twin.config.json`) : `maximality_mode=soft_weight` + `gate_policy=honest`
> **ACTIVÉS**. `terrain_term` reste `free` et `speed_basis` reste `elapsed`. Le golden reste intact
> même activé : ses ultras étant near-maximaux, tous les poids de maximalité valent 1 → régression
> inchangée. Les tests de reproduction (`test_montagnhard_robustness.py`) épinglent explicitement le
> baseline (`maximality_mode=off`, `gate_policy=strict`) pour figer l'échec de référence. Pour
> revenir au comportement d'avant, poser `maximality_mode=off` (via `twin.config.json` ou
> `TWIN_CONFIG_PATH`).

### 3.1 [CŒUR] Filtre de maximalité par intensité relative au plafond d'endurance

`calibration.maximality_mode ∈ {off, soft_weight (défaut livré), hard_filter}` + `maximality_r_floor` (0,80),
`maximality_r_ref` (0,95), `maximality_hr_floor` (0,85), `maximality_hr_ref` (0,95), et
`maximality_reference ∈ {envelope_absolute, self_relative (défaut, §A)}`.

Pour chaque ultra : `r_i = vga_i / (envelope_vga_ms(T_i)·3.6)` = **fraction de son propre plafond**
(sans FC absolue, en réutilisant `Twin.envelope_vga_ms`). Poids doux
`w = clip((r − r_floor)/(r_ref − r_floor), 0, 1)`, combiné **multiplicativement** avec la récence, et
appliqué **À L'IDENTIQUE dans le fit ET la LOO** (comme la récence) → l'indice de confiance reflète
le modèle réellement servi.

**Garde-fou anti-faux-positif** : une course *dure mais raide* (D+/km élevé) peut paraître lente vs
plafond (l'ajustement de pente la sous-crédite). On croise `r` avec un **second signal** — la FC
normalisée à la FC max des ultras — qui ne peut que **remonter** le poids : on ne down-pondère
fortement que si **les deux concordent** (r bas ET FC basse). Ainsi `2022-07-10` (r ≈ 0,93, FC 152)
reste à poids 1, tandis que `2026-04-04` (r ≈ 0,72, FC 119) tombe à 0.

Poids de maximalité obtenus (soft) sur le fixture :

| Ultra | 22-07-10 | 23-05-13 | 23-07-01 | 24-02-17 | 24-10-04 | 25-10-19 | **26-04-04** | 26-05-09 |
|---|---|---|---|---|---|---|---|---|
| poids | 1,00 | 1,00 | 0,89 | 1,00 | 0,96 | 1,00 | **0,00** | 1,00 |

→ la sortie facile tombe à 0 ; **la 26 h et la 19,7 h restent** (elles sont engagées).

### 3.2 [SUPPORT] Nettoyer le double-comptage terrain

`calibration.terrain_term ∈ {free (défaut), none, prior_shrunk}`. La vga est **déjà** ajustée à la
pente ; laisser `β2·(D+/km)` libre re-compte partiellement le terrain. `none` (β2 = 0) ramène la MAE
à 21,7 % à lui seul ; `prior_shrunk` (ridge de β2 vers le prior population) atténue le levier D+/km =
104. Effet **modeste seul**, utile surtout en combinaison.

### 3.3 [SUPPORT] Gate honnête tolérant à l'influence

`sufficiency.gate_policy ∈ {strict, honest (défaut livré)}`. La LOO marque désormais les plis
d'**extrapolation** — le point retiré atteint le **min ou max de ln T ou de D+/km** parmi les vrais
ultras (les restants ne l'encadrent pas). Elle rapporte `MAE_interpolation` **et** `MAE_extrapolation`.
En mode `honest`, le verdict s'appuie sur la MAE d'interpolation (+ sanité de la largeur relative de
l'intervalle), pas sur la MAE brute. Sur le fixture, les extrapolants sont exactement
**`2022-07-10`, `2024-10-04`, `2026-05-09`** (MAE_interp 18,1 % vs brute 24,8 %).

### 3.4 [SUPPORT] Locomotion vs arrêts + narratif

`twin.speed_basis ∈ {elapsed (défaut), moving}` : `moving` calcule la durée sur le **temps de
mouvement** (secondes où la vitesse dépasse `moving_speed_threshold_ms`, mesuré à 1 Hz sur le schéma
canonique), pour ne pas diluer l'allure d'ultra avec les longs arrêts (ravitos, sommeil). Repli
automatique sur `elapsed` si non mesurable (le fixture ne porte pas de temps de mouvement → mode non
vérifiable hors archive, documenté). **Narratif** : le signe de l'interprétation de l'exposant E est
**déjà correct** (E↑ ⇒ déclin↑, Riegel 1981 ; corrigé au commit `de04cf2` — vérifié, aucun changement
requis) ; on ajoute un cadrage « E est mesuré sur tes efforts ≤ quelques heures puis prolongé vers
l'ultra » (`endurance_intuition`).

## 4. Preuves A/B (fixture, `python -m tools.ab_montagnhard`)

`sigma` = bruit résiduel (km/h) · `i80` = largeur relative de l'intervalle 80 % · MAE/interp/extrap en %.

(maximalité `soft`/`hard` = `maximality_reference=self_relative`, le défaut livré.)

(Tableau ré-épinglé post-C1, 2026-07-02 — fixture régénéré, enveloppe fittée.)

| Configuration | sigma | i80 | MAE | interp | extrap | CV |
|---|---|---|---|---|---|---|
| **[BASELINE]** récence + terrain libre (3p) | 1,528 | 0,64 | **24,8** | 18,1 | 34,7 | 🔴 |
| récence, terrain=none (2p) — support 3.2 | 1,546 | 0,58 | 21,7 | 16,1 | 29,9 | 🔴 |
| récence, terrain=prior_shrunk (3p) | 1,528 | 0,64 | 23,7 | 17,7 | 32,6 | 🔴 |
| **maximalité soft — cœur 3.1** | 0,532 | 0,19 | **8,8** | 7,3 | 10,0 | 🟠 |
| **maximalité hard — cœur 3.1** | 0,534 | 0,19 | **8,7** | 7,3 | 9,9 | 🟠 |
| maximalité soft + terrain=none | 0,664 | 0,21 | 8,9 | 7,9 | 9,7 | 🟠 |
| maximalité soft + prior_shrunk | 0,532 | 0,19 | **8,3** | 7,1 | 9,3 | 🟠 |
| [BASELINE] + MC prédictif (C3, §9.1) | 1,528 | 2,82 | 24,8 | 18,1 | 34,7 | 🔴 |
| maximalité soft + MC prédictif (C3, §9.1) | 0,532 | 0,68 | 8,8 | 7,3 | 10,0 | 🟠 |

**Le levier robuste est la maximalité : 24,8 % → 8,8 % (−65 %), σ divisée par ~3, intervalle divisé
par ~3.** Le nettoyage terrain et le gate honnête sont des supports de correctness/honnêteté. (Le
critère CV passe de 🔴 à 🟠 ; le 🟢 exigerait ≤ 5 % — sur le fixture isolé la MAE reste ~9 %. Sur
l'archive complète de l'athlète, ce sont les mêmes 8 ultras qui pilotent la CV, donc le passage
`sellable` est identique ; les autres critères de suffisance, eux, sont déjà 🟢 sur l'archive.)

## 5. Pistes TESTÉES et REJETÉES (ne pas re-tenter)

- ❌ **Filtrer les ultras à `Deq > Deq_cible`.** Neutre-à-pire, **biais optimiste** (dangereux en
  pacing), supprime la 19,7 h et la 26 h (seuls points du régime cible → transforme la cible en
  extrapolation), et **orthogonal au vrai problème** : les efforts faciles `< Deq_cible` survivent.
  Le bon critère est la **maximalité**, pas le Deq.
- ❌ **Pondération par noyau en ln(T) comme levier principal.** Neutre, largeur de noyau instable à
  n = 8. Tolérée seulement en raffinement secondaire.

## 6. Limite assumée du proxy d'enveloppe

`r_i` repose sur `envelope_vga_ms`, ajustée sur la courbe record **≤ 6 h** (`endurance_window_s`) puis
**extrapolée** à 10–26 h. **Mitigation (§A, `maximality_reference=self_relative`, défaut)** : on
compare `r` non seulement au plafond extrapolé mais aussi à un **pôle robuste des propres ultras** de
l'athlète → la décision de maximalité devient **invariante à un biais d'échelle** de l'enveloppe. Preuve
(test `test_self_relative_is_robust_to_envelope_scale_bias`, re-vérifiée post-C1) : en perturbant
l'enveloppe ×2, le mode absolu écarte à tort des ultras maximaux (4/8 gardés) tandis que self_relative
reste stable (7/8, seul l'effort facile écarté). Résidu non couvert : un biais qui gonflerait l'enveloppe au point que **même**
l'effort facile dépasse le plafond (tous `r > 1`) → rien n'est écarté (faux négatif prudent, prédiction
conservatrice). Depuis la régénération du 2026-07-02, le fixture embarque l'**enveloppe réellement fittée** sur la
courbe record de l'athlète (α = 0,179, E = 1,218 — H3 résolu, §7) ; le résultat qualitatif reste
**stable pour α ∈ [0,15 ; 0,25]**. Le pipeline réel utilise la même mécanique (fit sur les données
courtes de chaque athlète).

## 7. Hypothèses falsifiables restantes

- **H1 (altitude Garmin / rééchantillonnage)** : partiellement RÉHABILITÉE par C1 (§9.6) — pas un
  bug de rééchantillonnage, mais une **échelle de lissage** du D+ incohérente avec le parcours,
  mesurée à +14,9 % (médiane) sur archive réelle. Corrigée par `dplus_basis=distance_150m` ;
  fixture régénéré sur la nouvelle échelle le 2026-07-02.
- **H2 (écoulé ≫ mouvement)** : plausible ; le flag `speed_basis=moving` est implémenté, et le
  comptage du temps de mouvement est désormais fiable (base distance, §9.2) — mesurable sur
  archive à la prochaine occasion.
- **H3 (E hérité ?) : RÉSOLU le 2026-07-02.** La régénération du fixture fitte l'enveloppe sur la
  vraie courbe record de l'athlète : **α = 0,1792, E = 1,218, coef = 17,27** — l'enveloppe
  « représentative » (0,18 / 1,22 / 17,67) était juste. `fit_endurance_exponent` s'ajuste bien par
  athlète ; E n'était pas figé.

## 8. Régénérer le fixture (optionnel, hors dépôt)

Scanner toutes les `.fit`, garder `is_running and duration_s ≥ 9,5 h`, sérialiser
`process_activity(...).to_dict()`, et stocker l'enveloppe fittée (`fit_endurance_exponent`) dans
`_meta.athlete_envelope`. **Non requis pour corriger.**
## 9. Revue 2026-07 — correctifs (chacun derrière un flag, cf. docs/twin-review-2026-07.md)

### 9.1 L'intervalle voit enfin le levier d'extrapolation (C3, `prediction.mc_mode`)

**Constat.** Le Monte-Carlo historique (`mc_mode=sigma_only`) ne propage que le bruit résiduel
σ : l'intervalle ne voit ni l'**incertitude des coefficients β** (terme de levier
x₀ᵀ(XᵀWX)⁻¹x₀ de la loi prédictive — il explose quand la cible sort de l'enveloppe des
(ln T, D+/km) d'entraînement) ni la **rétroaction du point fixe** (tirage lent ⇒ T plus long ⇒
v(T) encore plus basse). Conséquence structurelle : le critère « largeur d'intervalle » du gate
honnête ne pouvait pas voir l'extrapolation qu'il est censé attraper — il ne mesurait que σ.

**Correctif (flag).** `prediction.mc_mode=predictive` : β ~ N(β̂, σ²(XᵀWX)⁻¹) (covariance
cohérente avec le mode terrain, `pinv`) + ε ~ N(0, σ), point fixe re-résolu **par tirage**
(vectorisé, ~ms). Défaut `sigma_only` **inchangé au bit près** (golden intact) ; repli
automatique hors régression (blend/vc_e). Valeur centrale identique dans les deux modes.

**Preuve A/B (fixture, `python -m tools.ab_montagnhard`)** :

| Configuration | sigma | i80 | MAE |
|---|---|---|---|
| [BASELINE] récence + terrain libre | 1,539 | 0,61 | 25,3 |
| [BASELINE] **+ MC prédictif** | 1,539 | **2,91** | 25,3 |
| maximalité soft (défaut livré) | 0,563 | 0,19 | 9,1 |
| maximalité soft **+ MC prédictif** | 0,563 | **0,52** | 9,1 |

Lecture : sur l'athlète « sale », l'intervalle honnête est ×4,8 plus large — le modèle avoue
qu'il ne sait pas, au lieu d'une fourchette étroite et fausse. Sur la calibration servie
(maximalité soft), ×2,7 : la cible (Deq 139,6, au bord de l'enveloppe des ultras) porte un
levier réel. **Avant de basculer le défaut** : (a) vérifier le golden réel (cible Nice
interpolée → élargissement attendu faible) ; (b) décider des seuils `interval_rel_width_*`
(ici 0,52 > 0,5 → le critère largeur passerait 🟠 à lui seul — c'est le comportement
recherché, mais à assumer explicitement).

**DÉFAUT ACTIVÉ le 2026-07-02** (`mc_mode=predictive`, rollback `sigma_only`), sur double
validation : (a) cas de référence Nice — reconstruction de la loi prédictive depuis la capture
(β, σ, poids de récence, N_eff de Kish recalculé 7,63 ≈ 7,69 capturé) → intervalle 80 %
[30,0–32,8] → **[≈28,9–34,7]** (rel 0,19), justifié : la cible est une extrapolation de durée
(31,3 h vs 21,3 h max des vrais ultras, levier h₀ ≈ 2,7) ; critère de largeur toujours 🟢,
seuils inchangés. (b) fixture Montagnhard — i80 0,19 → 0,68 sur la calibration servie (critère
largeur 🟠, voulu : cet athlète mérite une fourchette large). Le golden déterministe est
re-capturé (intervalle [29,14–33,53] vs sigma_only [29,82–32,28] ; centre/β/MAE strictement
identiques) ; les baselines historiques (tests de robustesse, ab_montagnhard, regen fixture)
épinglent explicitement `sigma_only`.

### 9.2 Temps de mouvement mesuré sur la distance (C2, corrige le mode `speed_basis=moving`)

**Constat (aggrave H2).** `moving_time_s` comptait les secondes où le CANAL VITESSE dépasse le
seuil — or ce canal est interpolé à travers les trous d'enregistrement : pendant une pause de
montre entre deux échantillons à ~3 m/s, la vitesse interpolée reste ~3 m/s alors que la
distance fait un plateau. Les pauses passaient donc pour du mouvement, et le mode
`speed_basis=moving` (correctif H2) était structurellement émoussé.

**Correctif.** Comptage sur les incréments de distance à 1 Hz (`diff(dist_m) > seuil·Δt`) —
cohérent avec la base distance de toute la chaîne. Preuve : test synthétique (10 min de course,
30 min de pause, 10 min de course) → moving ≈ 1 200 s là où l'ancien comptage donnait ~3 000 s.
Ne change RIEN au défaut (`speed_basis=elapsed` : moving_time_s est un descripteur) ; H2 devient
réellement vérifiable sur archive.

### 9.3 Le fade du plan est alimenté par la durabilité mesurée (T3, `pacing.fade_source`)

**Constat.** twin-theory §8 classe la durabilité « ajustée aux données … → plan », mais le
découplage mesuré (~19–24 % chez le cas de référence) n'alimentait QUE le narratif : le fade du
plan restait Δ=0,085 fixe pour tous — le « diesel » (8 %) et l'athlète qui s'use vite (28 %)
recevaient la même dérive. La promesse d'individualisation n'était pas tenue sur le livrable
que l'athlète utilise le jour J.

**Correctif (flag).** `pacing.fade_source=durability` : Δ = X/(200−X) (un fade linéaire
1+Δ → 1−Δ réalise une chute relative 1 − X/100), borné [0,04 ; 0,13], repli sur `fade_delta`
si la FC manque. Contrôle de cohérence : le défaut historique Δ=0,085 ↔ X≈15,7 % — la formule
retombe sur le comportement actuel pour un athlète au découplage « typique ». Le Δ servi est
tracé (`PacingPlan.fade_delta_used`) et le rapport en dérive son « −X % » affiché. Défaut
`config` inchangé ; pour le cas de référence (X≈21 %), activer donnerait Δ≈0,117 (−21 % de
dérive affichée au lieu de −15,7 %) — à valider sur le plan Nice avant bascule.

### 9.4 Découplage : base « en mouvement » + échauffement ignorable (C7, `twin.decouple_basis`)

**Constat.** Le découplage (→ durabilité → fade si 9.3 activé) se calculait sur des moitiés de
temps ÉCOULÉ : pendant un arrêt (ravito, pause), v≈0 avec FC>60 → efficacité ~0 comptée dans la
moitié qui contient l'arrêt — la 2e en ultra. Le « découplage » mesurait donc en partie le
comportement d'ARRÊT, pas l'usure physiologique (preuve synthétique : course régulière à FC
constante + 20 min d'arrêt en 2e moitié → découplage ~29 % en elapsed, ~0 % en moving). De
plus, la dérive FC d'échauffement gonflait e1.

**Correctif (flags).** `decouple_basis=moving` (seuls les échantillons en mouvement comptent,
même masque distance que 9.2) + `decouple_skip_start_s` (ignorer l'échauffement, pratique
standard des études de découplage). Défauts `elapsed`/0 = calcul historique à l'identique.
⚠ Effet réel invisible au fixture (agrégats) : à mesurer sur archive réelle avant toute
bascule (durabilité attendue en BAISSE chez les athlètes qui s'arrêtent longtemps — donc fade
moins pessimiste — sans toucher les vrais « diesels »).

### 9.5 Fraîcheur des données (C8, critère de suffisance)

**Constat.** « Historique » mesure l'ÉTENDUE (première → dernière activité), pas la fraîcheur :
une archive s'arrêtant 8 mois avant l'analyse pouvait être 🟢 partout, alors que la prédiction
suppose la forme du moment (garde-fou twin-theory §2.7/§9, jusqu'ici purement déclaratif).

**Correctif.** Nouveau critère « Fraîcheur des données » = jours entre la dernière activité
datée et la date d'analyse (le pipeline passe la date du jour, injectable pour replay/test).
Seuils `freshness_days_green/orange` (30/90 j, ≤ 0 désactive). Activités non datées → critère
non évalué + raison « recalcul recommandé ».

**Piste examinée et REJETÉE (à ne pas re-tenter).** Ancrer la PONDÉRATION de récence sur la
date d'analyse plutôt que sur le dernier ultra est mathématiquement INERTE : changer l'ancre
multiplie tous les poids par un facteur commun, et la régression pondérée, la σ pondérée et le
N_eff de Kish ((Σw)²/Σw²) sont invariants d'échelle. La staleness ne peut pas « démoter » la
régression par ce biais — c'est le critère de fraîcheur qui porte le signal.

### 9.6 Échelle du D+ : activités (5 s) vs parcours (150 m) (C1, `twin.dplus_basis`) — MESURE REQUISE

**Constat.** Le D+ des activités vient d'une altitude lissée sur ~5 s (≈ 15–20 m de base à
allure ultra), celui du parcours d'une fenêtre de 150 m. Le D+ étant une variation totale, il
GONFLE quand l'échelle diminue (preuve synthétique : rampe 400 m + bruit blanc σ=1 m → D+@5s
sur-lit de > 20 % là où D+@150m reste ~400 m). Conséquence : β2 est appris sur un axe D+/km
gonflé puis appliqué à l'axe dégonflé du parcours — pénalité terrain trop douce, biais
OPTIMISTE sur les parcours raides (aggravé par l'atténuation par erreur de mesure sur le
régresseur). S'y ajoute une incohérence de convention de pente (activité : Δalt/Δdist-appareil
≈ sinus ; parcours : Δalt/Δx horizontal = tangente — ~2 % sur i à 20 %).

**Correctif (flag, mesure AVANT bascule).** `twin.dplus_basis=distance_150m` : altitude
moyennée sur une base de distance (fenêtre `dplus_smooth_window_m`), analogue au profil de
course. Défaut `time_5s` inchangé. ⚠ C'est un changement de *feature* : le fixture (agrégats)
n'y voit RIEN — un A/B fixture inchangé n'est PAS une preuve (avertissement CLAUDE.md).
Protocole : (1) mesurer sur l'archive réelle — `PYTHONPATH=src python -m tools.diag_dplus
<archive>` (tableau D+@5s vs D+@150m par ultra + écart médian) ; (2) si écart ≳ +5 %, activer,
RÉGÉNÉRER le fixture depuis l'archive (§8) et recapturer le golden réel ; (3) coller les
chiffres ici.

**Mesure du 2026-07-02 (archive réelle de référence, `tools/diag_dplus`, 30 activités ≥ 5 h)** :
écart médian **+14,9 %** (min +8,3 %, max +39,9 %) — trois fois le seuil de déclenchement.
L'écart n'est pas uniforme : cluster à **+29–40 %** sur juillet–novembre 2025 (26/07, 04/08,
31/08, 06/09, 19/09, 14/11), signature probable d'une altimétrie différente sur la période
(montre/GPS/firmware — à confirmer par Valentin) : la base distance corrige un artefact de
MESURE, pas du terrain.

**DÉCISION : activé.** `dplus_basis=distance_150m` est le défaut depuis le 2026-07-02
(rollback : `time_5s`). Le golden réel AVEC les anciens défauts avait été validé PASS juste
avant la bascule (préalable du protocole).

**Recapture du 2026-07-02 (faite — golden réel PASS avant ET après bascule)** :
`twin-engine preview` sur le cas de référence → β = (8,194 ; −0,260 ; **−0,0170**), σ 0,224,
prédiction **31,28 h** [29,95–32,77], LOO MAE 3,1 % (interp 2,7 %), n_eff 7,69.
**Validation clé : β2 −0,0148 → −0,0170 = ×1,149, pour +14,9 % d'écart d'échelle mesuré — le
recalibrage suit exactement la mesure.** La prédiction ralentit de +2,9 % (correction du biais
optimiste de terrain). Cross-check : les `dplus_m` des vrais ultras du preview coïncident au
mètre avec la colonne D+@150m du tableau diag_dplus. twin-theory §12 recapturée, golden réel
re-centré, prior `default_dplus_penalty_kmh_per_dpkm` mis à jour (−0,0148 → −0,0170).

**Reste à faire** : régénération du fixture Montagnhard —
`PYTHONPATH=src python -m tools.regen_montagnhard_fixture <archive>` (enveloppe désormais
FITTÉE → tranche H3) puis ré-épinglage des tests de robustesse et du tableau §4 sur les
nouveaux agrégats (⚠ le prior ayant changé, les lignes `prior_shrunk` du tableau §4 bougeront
aussi — re-générer le tableau complet à ce moment-là, l'ancien reste dans l'historique git).

**Régénération du fixture (2026-07-02, archive réelle, `tools/regen_montagnhard_fixture`)** :
12 activités ≥ 9,5 h (10 765 fichiers non-course ignorés à l'ingestion). Enveloppe **fittée** :
α = 0,1792, E = 1,218, coef = 17,27 (→ H3 résolu, §7). Chiffres sur la nouvelle échelle D+ :

| Config | σ (km/h) | prédiction (h) | MAE | interp | extrap |
|---|---|---|---|---|---|
| [BASELINE] flags off | 1,539 → **1,528** | 19,63 → **20,68** | 25,3 → **24,8** | 17,0 → **18,1** | 37,8 → **34,7** |
| défauts livrés (maximalité soft) | 0,563 → **0,532** | — → **19,04** | 9,1 → **8,8** | 6,9 → **7,3** | 11,0 → **10,0** |

**La conclusion du diagnostic est STABLE sur la nouvelle échelle** : l'échec de référence se
reproduit (24,8 % en baseline) et le filtre de maximalité reste le levier (→ 8,8 %). Tests de
robustesse ré-épinglés sur ces agrégats (l'historique pré-C1 reste dans git).

**Hypothèse sur le cluster +29–40 % (juil.–nov. 2025, archive de référence)** : mise à jour
majeure Coros probable sur la période (l'athlète ne rapporte aucun changement de montre) —
altimétrie firmware modifiée. Cohérent avec un artefact de MESURE que la base distance corrige ;
à re-vérifier si un nouveau cluster apparaît après une future màj.

**Ré-épinglage fait (2026-07-02)** : tests de robustesse et tableaux §1–§4 mis à jour sur les
nouveaux agrégats. Avec l'enveloppe fittée, la séparation de maximalité est encore plus nette :
ultras engagés à r = 0,89–0,99 (poids 0,89–1,0), sortie facile seule à r = 0,72 (poids 0). **C1 est
bouclé de bout en bout : mesuré (+14,9 %) → activé → recapturé (golden réel) → ré-épinglé (fixture).**

