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

`calibration.terrain_term ∈ {free, none, prior_shrunk (défaut depuis 2026-07-03, §9.7)}`. La vga est
**déjà** ajustée à la pente ; laisser `β2·(D+/km)` libre re-compte partiellement le terrain. `none`
(β2 = 0) ramène la MAE à 21,7 % à lui seul ; `prior_shrunk` (ridge de β2 vers le prior population,
`terrain_shrink_lambda=50`) atténue le levier D+/km = 104. Effet **modeste seul**, utile surtout en
combinaison (§4 : 8,8 → 8,3 avec la maximalité).

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
| **maximalité soft + prior_shrunk [DÉFAUT livré depuis 2026-07-03, §9.7]** | 0,532 | 0,19 | **8,3** | 7,1 | 9,3 | 🟠 |
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


### 9.7 Commercialiser l'incertitude : double bande, scénarios, ridge β2, conforme normalisé (S5-présentation)

**Constat (rapport Montagnhard réel, 2026-07-03).** L'intervalle 80 % servi couvrait
[15 h 14 – 28 h 07], soit ~13 h de dispersion : honnête (extrapolation en durée ET en terrain,
MAE LOO 8,8 %), mais invendable comme « fenêtre d'arrivée » unique. Réduire la couverture pour
resserrer serait un mensonge ; la réponse est (a) de la **présentation** — deux bandes, deux
usages — et (b) deux leviers **statistiques** légitimes.

**Décisions (mêmes règles pour tous les athlètes, cas étroits inclus — réf. Nice ~0,19) :**

1. **Double bande (défaut).** Les fenêtres PAR SEGMENT du plan passent des percentiles de la
   prédiction (10/90) à la **fourchette de course** (`pacing.plan_window_low/high_pct`, défaut
   interquartile 25–75 : une course sur deux s'y joue) — l'outil de PILOTAGE. L'intervalle de
   la prédiction (80 %) devient les **bornes de sécurité** — LOGISTIQUE (barrières, assistance,
   retour), converties en heures de passage (`PacingPlan.safety_lo/hi_clock`). Le rapport
   étiquette chaque bande par son USAGE et n'affiche jamais l'une pour l'autre ; tous les
   libellés (« 50 % », « 80 % ») sont dérivés de la config.
2. **Mode scénarios** (`pacing.scenario_rel_width=0,35`) : quand (hi−lo)/T dépasse le seuil, le
   rapport ajoute une table rapide/central/prudent par segment (bornes de la fourchette de
   course) + consigne de RECALAGE en course (« repère ta colonne dès les premiers ravitos »).
   Nice (~0,19) ne l'affiche pas ; Montagnhard (~0,62) oui.
3. **Correctif d'affichage** : une fenêtre dont une borne change de jour perdait le préfixe du
   jour (« sam. 20:13–09:07 » laissait croire à un 09:07 samedi) ; désormais les jours ne sont
   omis que si les DEUX bornes tombent le jour de l'arrivée centrale.
4. **`terrain_term=prior_shrunk` par défaut** (λ=50, rollback `free`) : β2 est le coefficient le
   moins identifié ; le ridge vers le prior population améliore MAE (8,8 → 8,3, interp 7,3 → 7,1,
   extrap 10,0 → 9,3) ET largeur (§4). No-op attendu sur le cas de référence (son β2 libre −0,0170
   ≈ le prior, qu'il définit) — golden réel à re-vérifier chez Valentin par acquit.
5. **Conforme normalisé derrière flag** (`prediction.interval_source=conformal_normalized`,
   défaut `mc`) : scores studentisés |erreur LOO|/sd_pred du pli (quantile pondéré conservateur,
   Tibshirani 2019), mis à l'échelle du sd prédictif de la CIBLE (même levier x₀ᵀ(XᵀWX)⁻¹x₀ que
   le MC). La couverture vient des erreurs RÉELLES, la géométrie du levier est conservée.
   Garde-fou : jamais plus étroit que la fourchette de course ; repli `mc` à < 4 plis
   normalisables (traçé dans `Prediction.interval_source`).

**Preuve (fixture, défauts servis = maximalité soft + prior_shrunk + MC prédictif) :**

| Présentation (Montagnhard) | bornes (h) | largeur |
|---|---|---|
| avant (terrain libre, MC 80 %) | [15,23 – 28,10] | 12,87 h |
| défaut servi (prior_shrunk, MC 80 %) — bornes de sécurité | [15,39 – 27,18] | 11,79 h |
| **fourchette de course 25–75 (servie, pilote le plan)** | **[16,88 – 22,08]** | **5,19 h** |
| conforme normalisé (flag) — bornes de sécurité | [15,39 – 22,52] | 7,14 h |

(Sur `terrain=free`, le conforme donne [14,94 – 23,15] = 8,21 h — la mesure exploratoire
pré-implémentation est reproduite au centième, l'implémentation est validée.) Centre 18,96 h
(free : 19,04 h), MAE 8,3 %. Golden déterministe ré-épinglé sous prior_shrunk (β 9,011/−0,457/
−0,0186, 31,010 h, MAE LOO 0,74 — les plis ridgés varient moins) ; anciens pins en commentaire.

**Pourquoi PAS « montrer le 50 % parce qu'il est plus pertinent ».** Les deux bandes répondent à
deux questions différentes (où se jouera probablement ta course / qu'est-ce qui reste possible) ;
aucune n'est « plus vraie ». Remplacer le 80 % par le 50 % sans le dire reviendrait à changer la
couverture pour flatter la largeur — exclu. Seule la table de scénarios est conditionnée à la
largeur, parce qu'elle est un OUTIL rendu utile par la dispersion, pas une re-présentation de
l'intervalle.

### 9.8 Bandes conformes PAR DÉFAUT — le MC prédictif dégénère sur les calibrations faibles (S5 activé)

**Constat déclencheur (2 cas réels, 2026-07-03).**
1. **MIUT (« Lolo », données tronquées au 20/04, course courue le 26/04)** : central **26 h 04**
   pour un réel de **25 h 49 (−1,0 %)** — mais fourchette de course « 18 h 58 – 71 h 55 » et
   sécurité « 16 h 36 – 71 h 55 ». Les deux bornes hautes = **71,9 h = Deq/v_floor = 143,8/2,0** :
   le plafond mathématique du simulateur, pas une statistique. P75 ET P90 au plafond ⇒ **≥ 25 %
   des tirages prédictifs collés au plancher de vitesse**. Mécanisme : 5 ultras dont 4 groupés
   (10–13 h) + 1 seul long (21,5 h, prédit +65 % en LOO) ⇒ la pente ln T est identifiée par UN
   point ⇒ β-covariance énorme ⇒ les tirages à pente très négative s'effondrent via le point
   fixe jusqu'au plancher. La LARGEUR dit quelque chose de vrai ; la FORME (masse au plafond)
   est un artefact.
2. **Montagnhard (rapport réel)** : central 19 h 14, fourchette de course ≈ 16 h 50 – 22 h 30 —
   large au regard de l'attente de l'athlète, et pilotée par la loi supposée du MC plutôt que
   par ses erreurs démontrées.

**Décision : `prediction.interval_source=conformal_normalized` PAR DÉFAUT, et la source pilote
désormais LES DEUX bandes** (sécurité 80 % ET fourchette de course 50 % — mêmes scores, quantiles
0,80/0,50, emboîtement garanti). Le pacing décline la fourchette servie en multiplicateurs de
scénario global (`Prediction.plan_low/high_h` → fenêtres des segments, scénarios, figure cumul) ;
en mode `mc` le comportement est identique au bit près (le multiplicateur commute avec le
percentile). Repli automatique des deux bandes sur les percentiles MC : régimes blend/vc_e ou
< 4 plis normalisables. Rollback : `interval_source=mc`.

**Choix technique consigné — quantile pondéré.** La variante stricte de Tibshirani 2019 (masse
brute Σw des plis + poids du point cible) DÉGÉNÈRE dès que la récence écrase Σw (fixture :
Σw ≈ 2,5 pour 7 plis ⇒ q(0,50) = q(0,80) = score max, bandes confondues). Retenu : poids
récence×maximalité **auto-normalisés au nombre de plis** (ils règlent la représentativité des
plis, cohérent avec la MAE LOO pondérée servie) + correction d'échantillon fini n+1 ; à poids
égaux = conforme split standard ⌈(n+1)q⌉ (golden déterministe inchangé). L'alternative « poids
unitaires » donnerait des bandes plus étroites (q50 fixture 0,70 vs 1,07) mais jetterait
l'information « les plis récents sont les plus mal prédits » — écartée par cohérence.

**Preuve (fixture Montagnhard, défauts servis) :**

| Bande | avant (mc) | après (conforme) |
|---|---|---|
| fourchette de course (50 %) | [16,88 – 22,08] (5,19 h) | [15,81 – 22,11] (**6,30 h**, légèrement PLUS large : ses erreurs LOO récentes-pondérées débordent l'IQR du modèle) |
| bornes de sécurité (80 %) | [15,39 – 27,18] (11,79 h) | [15,39 – 22,52] (**7,14 h**, −4,6 h : la queue droite paramétrique jamais observée disparaît) |

Centre 18,96 h et MAE 8,3 % inchangés (seule la LARGEUR affichée change). Tableau §4 : inchangé
(baselines épinglées `interval_source=mc` dans `tools/ab_montagnhard`, `tools/regen_…` et
`test_montagnhard_robustness`). Golden déterministe : bandes re-épinglées (athlète synthétique
quasi parfait, erreurs LOO ~0,7 % ⇒ sécurité [30,38 – 31,64], fourchette [30,81 – 31,21] —
l'honnêteté calibrée sur SES erreurs) ; centre/β/MAE inchangés. Golden réel : centre et MAE non
touchés (les pins ne portent pas sur l'intervalle) — à re-vérifier chez Valentin ; §12 annonce
des bornes plus étroites à la prochaine recapture (MAE 3,1 %).

**Effet de bord assumé** : le critère de suffisance « largeur relative d'intervalle » juge
désormais l'intervalle SERVI (conforme) — fixture : largeur relative 0,62 (MC sigma_only
historique) → 0,38 ; c'est voulu, le critère doit juger ce qu'on vend.

**Attentes à cadrer (Montagnhard)** : aucune méthode calibrée ne sortira « ±1 h » de CES données
— ses propres erreurs hors-échantillon (MAE pondérée 8,3 %, pire sur les plis récents) valent
±1,5–2 h au mieux sur 19 h. Si le réel tombe à ±1 h du central, c'est une entrée de plus au
**registre de couverture** (`docs/twin-registre-couverture.md`, créé avec MIUT en entrée n° 1 et
une règle de décision pré-enregistrée : recalibration uniquement à ≥ 8–10 cas, au score de
Winkler, jamais sur un cas isolé).

**Backlog lié** : garde-fou « part de tirages au plancher » à signaler dans le rapport quand le
repli MC est servi (blend/vc_e — le conforme, lui, n'est plus exposé au plafond) ; champ
`cutoff_h` du carnet de route pour borner le scénario « prudent » à la barrière horaire ;
conforme GROUPÉ inter-athlètes quand le registre aura ≥ 8–10 entrées.

### 9.9 Premier banc multi-athlètes (33 cas) : garde-fou domaine ACTIVÉ, fenêtre empirique prête

**Matière (2026-07-15).** Registre à 33 entrées, 4 athlètes (Val + Crasse en développement ;
Lolo + Rapace frais). Nouveaux outils de lecture : split « VENDU (🟢/🟠) vs refusé (🔴) »
(la statistique commerciale), quarantaine motivée (1 entrée : trace Rapace/Saintélyon à
l'altitude aplatie, D+/km lu 6,3 vs ~26 réel), repli σ/v pour normaliser les régimes sans
β-covariance.

**Ce que le banc a montré :**
1. **Le garde-fou d'honnêteté fonctionne** : cas frais refusés (🔴) MAE 72,8 % vs vendus
   10,2 % — les six cas Rapace (archive quasi vide avant mi-2025, jusqu'à +308 % d'erreur,
   central au plancher Deq/v_floor) étaient TOUS refusés.
2. **Trou du filet mesuré** : cibles COURTES (< domaine ≥ 10 h) en régime enveloppe —
   +59 %/+176 % chez Crasse avec verdict 🟠, donc VENDABLES. → **`sufficiency.domain_gate=on`
   PAR DÉFAUT** (nouveau critère 🔴 « Domaine de calibration » quand la cible prédite est
   sous `genuine_min_hours` ; rollback off). Aucune cible ultra n'est affectée ; à retirer
   quand le chantier « trails courts » livrera un domaine court calibré.
3. **Sous-couverture des bandes vendues** : couverture 80 % = 40 % sur les cas frais vendus
   (n=5 — direction claire, décision à la jauge). Renversement complet de l'intuition
   initiale « fourchettes trop larges » (fondée sur les cas de développement).

**Plomberie de la fenêtre EMPIRIQUE groupée (activation à la jauge, pas avant) :**
`interval_source="pooled"` — bandes = central × (1 ± q·sd_rel(cible)), sd_rel = levier
complet en régression, σ/v en repli (même normaliseur que le registre) ; quantiles
`prediction.pooled_q50/q80` appris du bloc « conditions vendables » de `tools/registre`
(frais actuels : q50 0,88 / q80 4,84 — n=5 sur 1 athlète, PAS de quoi apprendre).
Défaut : None → repli percentiles MC. La bascule = renseigner deux nombres en config à
≥ 8-10 cas frais vendables dans le domaine (règle pré-enregistrée), rien d'autre.

**Jauge : 2 cas frais vendables dans le domaine / 8 requis.** Priorité : recruter des
athlètes RICHES en données (≥ 18 mois d'historique continu, ≥ 3 courses ≥ 10 h finies,
FC présente) — un athlète pauvre (Rapace) ne produit que des refus, informatifs mais non
décisionnels.

### 9.10 Altitude corrompue : une course prise pour une rando lente (garde-fou ga/brut, ACTIVÉ)

**Découverte (radiographie + audit, 2026-07-16, athlète Rapace).** Sa Saintélyon 2024
(72 km, 10 h 56, FIT) était PRÉSENTE dans l'archive mais écartée du filtre « vrais ultras »
pour **vga 2,99 km/h** alors que sa vitesse brute vaut 6,6 km/h. Ratio équivalent-plat/brut
= 0,45 : physiquement impossible (il faudrait descendre à ~−10 % pendant 11 h — le minimum
de Minetti est ~0,5 et une course n'est jamais une descente continue). L'altitude de CE
fichier est corrompue (effondrement continu) → l'ajustement de pente a divisé son équivalent
plat par deux → la course est passée sous `genuine_min_ga_kmh` et a disparu de la
calibration. Le moteur plafonnait le facteur de pente vers le HAUT (`f_cap`, anti-bruit)
mais rien ne le protégeait vers le bas.

**Correctif : `twin.ga_plausibility_floor=0.7` / `ga_plausibility_min_hours=4.0` (ACTIVÉ,
0 = rollback).** Toute activité ≥ 4 h dont l'équivalent plat < 0,7 × distance brute :
altitude déclarée inutilisable → f=1 (équivalent plat = distance brute), D± mis à zéro (on
n'invente pas un dénivelé depuis une altitude fausse), `has_altitude=False` (exclue de la
courbe record comme les activités sans altitude). Une descente raide COURTE (< 4 h) reste
comptée normalement. Sans effet sur données saines (ratios réels ≈ 1,0-1,3) : golden
déterministe inchangé (199 tests), golden réel à re-vérifier par acquit.

**Effet attendu chez les athlètes du banc** : la Saintélyon 2024 de Rapace redevient un
vrai ultra (vga 6,6) à toutes les coupures postérieures — ses régimes/backtests changent ;
le GRF 2024 de Val (écarté sans explication au n_gen=1 de novembre 2024) est soupçonné du
même mal — l'audit `tools/diag_archive` le dira. Relancer les backtests (idempotent) et
recommitter le registre.

**CORRECTION (2026-07-16, audit étendu « trois distances »)** : la Saintélyon 2024 de
Rapace relève en réalité du canal DISTANCE (§9.11 — brut 71,5 km, dé-spiké 28,6 km), PAS de
l'altitude : le ratio ga/dé-spiké y est normal, c'est le dé-spikeur qui ampute. Le garde-fou
ga/brut de CE paragraphe reste actif (il protège d'un vrai mode de défaillance — altitude en
chute continue — simplement pas de celui-ci) ; aucune victime connue à ce jour dans le banc.

**Au passage, l'audit a aussi montré** : (a) le 83 km GPX du 15/11/2024 de Rapace reste
invisible (sport « inconnu » — politique `running_only` sur GPX sans étiquette : décision à
prendre, cf. backlog) ; (b) tous les ultras de Rapace sont SANS FC → découplage et
garde-fou FC de maximalité inertes pour lui (le filtre travaille au seul ratio r) ; (c) sa
sortie longue du 14/03/2026 (12 h 42, vga 6,28) est retenue comme vrai ultra — c'est le
CAS D'ÉCOLE du filtre de maximalité : une sortie d'entraînement sous le plafond sera
down-pondérée par r, pas par une exclusion binaire.


### 9.11 Canal distance « en rafales » : l'écrêtage anti-spikes amputait une course entière (ACTIVÉ)

**Preuve (audit trois distances, 2026-07-16, Saintélyon 2024 de Rapace)** : brut **71,5 km**,
dé-spiké **28,6 km** (−60 %), ga 32,7 → vga 2,99 km/h → écartée du filtre vrais ultras pour
lenteur. Le FIT enregistre la distance PAR PAQUETS (rafales dépassant ``v_max_ms`` à l'échelle
de la seconde) ; l'écrêtage par-seconde, prévu pour quelques artefacts GPS, jette ici la
majorité de la distance d'une course réelle dont le TOTAL est parfaitement plausible
(71,5 km / 10,9 h = 6,6 km/h).

**Correctif : `twin.despike_rescue_floor=0.8` / `despike_rescue_min_hours=4.0` /
`despike_rescue_max_raw_kmh=12.0` / `despike_rescue_min_bursts=20` (ACTIVÉ, floor=0 =
rollback).** Une activité LONGUE qui perd plus de 20 % de sa distance brute à l'écrêtage,
avec un total brut plausible pour de la course (≤ 12 km/h), garde sa distance brute NON
écrêtée — et est **exclue de la courbe record** (vga/vraw NaN : les fenêtres de vitesse
par-seconde d'un canal haché sont des artefacts ; seule la N-ième meilleure d'un tel canal
pourrait polluer VC/E). Le résumé (distance, vga moyenne, D±, durabilité) reste servi à la
calibration. Le double verrou durée × total-plausible empêche de « sauver » un vélo mal
étiqueté ou un vrai fichier à distance gonflée (total > 12 km/h → écrêtage historique
conservé).

**Troisième verrou (revue adversariale avant merge) : rafales vs téléportation.** Une montre
mise en PAUSE pendant un déplacement (20 km de voiture puis reprise) satisfait les deux
premiers verrous sur une sortie ≥ 4 h lente : perte > 20 %, total ≤ 12 km/h — mais sa
distance brute est FAUSSE et la sauver gonflerait la calibration. Signature discriminante :
la téléportation forme **UN bloc écrêté contigu** (même interpolée à 1 Hz sur un trou
d'horodatage — d'où compter les FRONTS MONTANTS, pas les secondes écrêtées), alors qu'un
canal en rafales en compte des centaines (Saintélyon : 1 paquet/quelques secondes sur 10,9 h).
Le sauvetage exige ≥ `min_bursts` (20) fronts distincts ; en deçà, écrêtage historique
conservé (test : bond unique de 20 km sur 6 h à 5,4 km/h → PAS sauvé). Chaque sauvetage est
tracé en log (date, brut/écrêté, nb rafales).

**Effet attendu** : la Saintélyon 2024 de Rapace redevient un vrai ultra (vga ≈ 7,4) ;
l'audit `tools/diag_archive` le reflète immédiatement ; relancer les backtests Rapace
(idempotent) — ses coupures post-nov-2024 changent de régime. Golden : aucun fichier sain
touché (le déclencheur exige −20 % d'écrêtage sur ≥ 4 h — jamais observé sur données
propres) ; à re-vérifier chez Valentin par acquit.

**Reclassement au passage (précision de Valentin)** : les 26,9 h et 38,3 h de Val écartées
par le plancher `genuine_min_ga_kmh` sont des OFF en autonomie AVEC SOMMEIL (Réunion,
Vercors) — le plancher a donc eu RAISON (dormir casse la relation T→v du modèle en temps
écoulé). Le chantier « plancher dépendant de la durée » redescend au backlog, lié à
`speed_basis=moving` (qui neutraliserait le sommeil) et à surveiller au premier vrai
30 h+ couru (l'Échappée Belle de Crasse : vga attendue ~6,2, au-dessus du plancher — OK).

**CORRECTION (2026-07-16, retour terrain immédiat) : `min_bursts` 20 → 3.** Le rerun de
l'audit chez Valentin après merge montre que le sauvetage **n'a PAS tiré** sur la Saintélyon
(toujours vga 2,99) : les trois premiers verrous passent manifestement (perte 60 %, 10,9 h,
6,6 km/h) — par élimination, le fichier compte **moins de 20 blocs écrêtés distincts**. Mon
hypothèse « rafales par-seconde nombreuses » était une supposition, pas une mesure : la
casse réelle peut être en BLOCS de l'échelle de la minute (horodatage partiellement gelé
puis rattrapé — fichier converti par IA), que l'interpolation 1 Hz fusionne en quelques
plages contiguës. Le seuil calibré sur la supposition refusait le cas réel qu'il devait
servir. Recalibrage : le discriminant ne refuse plus QUE la signature téléportation
(1-2 blocs contigus = montre en pause pendant un déplacement, test : 2 × 10 km de voiture
→ refusé) ; et pour ne plus jamais calibrer à l'aveugle, `despike_stats()` (record.py)
devient la source unique de décision et `tools/diag_archive` **affiche les variables
mesurées** (nb de blocs, secondes écrêtées, part de la perte du plus gros bloc) sur tout
canal suspect — sauvé ou refusé, avec la raison. Si le prochain rerun refuse encore, la
sortie dira exactement pourquoi, et on tranchera sur chiffres. Dommage résiduel d'un faux
sauvetage borné par construction : activité hors courbe record, résumé seulement — et il
faudrait encore ≥ 10 h et vga ≥ 5,5 pour atteindre la régression ultra.

**CORRECTION 2 (2026-07-16, rerun post-recalibrage) : un canal sauvé subit les MÊMES replis
que §9.10 (f=1, D± nuls, has_altitude=False).** Le sauvetage a tiré — **7 blocs mesurés**
(le seuil 3 est validé ; l'hypothèse « centaines de rafales » doublement invalidée) — mais
a produit un point EMPOISONNÉ : **ga 150,5 km pour 71,5 brut (×2,10** ; sain : ×1,12-1,18
sur les autres ultras de Rapace**), vga 13,80 km/h** — un 10,9 h « élite » qui aurait tiré
la calibration vers l'optimisme, pire que l'exclusion de départ. Cause : l'ajustement
Minetti pondère f par les incréments de distance, or sur un canal haché la pente
échantillonnée PENDANT les blocs de rattrapage est du bruit (altitude et distance gelées
puis rattrapées ensemble → pentes fictives raides, et f_cap ne borne que par échantillon,
pas le total). Le garde-fou §9.10 ne voit rien : il ne surveille que l'effondrement
(ga/brut < 0,7), pas l'explosion. Repli : sur un canal sauvé, seuls le TOTAL et la durée
sont dignes de confiance → équivalent plat = distance brute (f=1), D± nuls,
has_altitude=False (l'exclusion de la courbe record était déjà acquise). Prix assumé,
identique à §9.10 : son D+/km entre à 0 dans la régression — biais pessimiste léger et
honnête, préférable à un ga fictif ×2,1. vga attendue au prochain rerun : 71,5/10,9 ≈
**6,6** — au-dessus du plancher 5,5 : la course entre enfin en calibration.

**VÉRIFIÉ (2026-07-16, rerun final chez Valentin)** : « VRAI ULTRA retenu (brut 71,5 ·
dé-spiké 71,5 · ga 71,5 · **vga 6,56** · canal distance haché SAUVÉ §9.11, 7 blocs
écrêtés) » — conforme à la prédiction au centième. Rapace passe de 3 à 4 vrais ultras ;
ses backtests aux coupures post-nov-2024 sont à relancer (idempotent) et le registre à
recommitter. Chantier clos.

**IMPACT BANC (2026-07-16, mesuré — diff du registre avant/après re-fusion Rapace)** :

| coupure la veille de (réel)     | avant     | après     | n_gen / régime                      |
|---------------------------------|-----------|-----------|-------------------------------------|
| Maratour Orcières 24 (6,3 h)    | +308,2 %  | +308,2 %  | 0/vc_e (coupure avant la Saintélyon)|
| Saintélyon 24 (10,9 h)          | +80,8 %   | +80,8 %   | 0/vc_e (anti-fuite : pas d'elle-même)|
| Grand Tour du Lac 25 (6,0 h)    | +79,9 %   | +48,1 %   | 0/vc_e → 1/blend — **amélioré**     |
| Coursières 100k 25 (15,0 h)     | +35,8 %   | +60,3 %   | 0/vc_e → 1/blend — **dégradé**      |
| UTBV 80 km 25 (11,7 h)          | +1,0 %    | +12,4 %   | 1 → 2/blend — **dégradé**           |
| Nivolet-Revard 26 (7,4 h)       | +10,6 %   | +19,4 %   | 3 (n_eff 2,87)/blend → 4 (3,47)/régression, σ 0,45→1,52 — **dégradé** |

Bilan : 1 amélioré, 3 dégradés, 2 invariants (attendus). Tous 🔴 avant comme après
(3 hors-domaine, les autres sans CV possible) → **l'ensemble VENDU est intact** (n=5,
MAE 10,2 %) : signal de développement, aucune conséquence commerciale. Mécanisme (lu dans
calibration.py) : le point sauvé entre à vga 6,56 (f=1 sous-estime l'équivalent plat réel
~7,3 d'une course qui grimpe) ET dpk=0 ; or l'offset du blend = vga − (v_env + penalty·dpk)
— dpk=0 supprime le rabais D+ de la base et la vga sous-estimée en retire autant : ancre
doublement pessimiste, propagée aux coupures suivantes (UTBV +11 % plus lent). Dans la
régression (Nivolet), le point débloque n_eff ≥ 3 mais gonfle σ (0,45 → 1,52). Pistes, à
trancher sur A/B de ces mêmes coupures (protocole : pas de décision sur 1 athlète ×
4 coupures) : **(a)** D± réels base TEMPS pour un canal sauvé — le total du D+ ne dépend
pas de l'alignement altitude↔distance ; répare la moitié « dpk=0 » du biais, garde
l'humilité sur vga (recommandée) ; **(b)** flag « point sauvé hors calibration » — revient
à l'avant : meilleur ici sur 3/4, mais re-crée le trou n_gen=0 des coupures précoces
(GTDL +79,9 %) ; **(c)** statu quo — pessimisme assumé sur les régimes faibles, que le
gate refuse de toute façon.


### 9.12 Re-fusion du registre : la quarantaine ne survivait pas (CORRIGÉ)

**Preuve (2026-07-16, diff du registre)** : la re-fusion Rapace (mise à jour idempotente
sur (athlète, course, date)) remplaçait la ligne ENTIÈRE — la quarantaine de la Saintélyon
(« trace FIT→GPX à l'altitude aplatie (D+/km 6,3 lu vs ~26 réel) — parcours inutilisable »)
a disparu silencieusement, et la course (+80,8 %) est re-rentrée dans les stats fraîches
(quarantaine 1 → 0, MAE refusés et médiane groupée Rapace faussés). Violation directe du
protocole « une quarantaine ne disparaît jamais silencieusement ».

**Correctif** : `merge_registre` (tools/backtest.py) préserve désormais les champs de
CURATION portés par l'ancienne ligne et que la machine ne régénère pas (`quarantine`,
annotations futures) ; la quarantaine Saintélyon est restaurée dans le registre committé ;
verrou : `test_merge_registre_preserves_manual_curation`. Stats fraîches corrigées :
quarantaine 1, finies 11, VENDU intact (n=5, MAE 10,2 %).

**À ne pas confondre** : cette quarantaine concerne la trace de PARCOURS du manifeste
(conversion IA, altitude aplatie) — pas l'archive de l'athlète, dont le canal distance est
réparé par §9.11. La course redeviendra scorable quand une vraie trace GPX du parcours
remplacera la conversion IA (à demander à Rapace).
