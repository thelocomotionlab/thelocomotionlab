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

### 5.x Demi-vie de récence plus courte — TESTÉE AU BANC, REJETÉE (2026-08-15)

**Hypothèse** (signal n° 3 du registre) : le biais de progression de Crasse (+17,4 % sur la
Montagnhard 2026) viendrait de `recency_halflife_days = 365`, qui pondère encore à ~50 % des
courses vieilles d'un an et ancre donc le niveau passé.

**Protocole** : `tools/ab_recency`, grille 90/180/270/365/548/730 j, 4 athlètes, 32 courses,
un décodage d'archive par athlète.

**Résultat — l'hypothèse ne tient pas.**

| demi-vie | biais frais | MAE vendus frais | Winkler frais | N_eff | cas en régression (dev) |
|---|---|---|---|---|---|
| 90 | +38,5 % | 18,4 % | 1,285 | 1,9 | 1 |
| 180 | +35,9 % | 10,6 % | 0,841 | 2,2 | 1 |
| 365 (défaut) | +36,6 % | 10,6 % | 0,841 | 2,6 | 6 |
| 730 | +36,8 % | 10,6 % | 0,841 | 2,8 | 6 |

1. **Le biais ne bouge pas** : 0,7 point d'écart entre 180 et 365 j, et il EMPIRE à 90 j.
2. **De 180 à 730 j, rien ne change** sur les cas frais vendus : MAE et Winkler strictement
   identiques. Le levier est inerte.
3. **Sur Crasse lui-même** — l'athlète du biais — la MAE est plate : 58,5 à 59,2 % sur toute
   la grille. Le mécanisme ne le touche pas.
4. **Raccourcir coûte cher** : à 90-180 j, les cas de développement en régime régression
   tombent de 6 à 1 — le moteur bascule dans le repli, plus flou. Biais inchangé, produit
   dégradé.

**Mécanisme du non-effet.** `N_eff` vaut déjà 2,6 à 365 j et seulement 2,8 à 730 j, pour un
`min_ultras_regression` de 3. Les poids sont **déjà** concentrés sur les courses récentes :
raccourcir n'ajoute pas de discrimination, ça ne fait que détruire de la taille d'échantillon.
Le biais résiduel n'est donc pas un artefact de pondération mais un **artefact de petit
échantillon** — 3 à 8 vrais ultras ne suffisent pas à suivre une progression.

**Conséquence** : `recency_halflife_days` reste à **365**. Ne pas re-tenter ce levier seul.
Le terme de tendance explicite est écarté pour la même raison (un 4ᵉ paramètre sur 3 points).
La voie qui reste est l'augmentation du nombre de cas (cohorte) et la fenêtre groupée, pas un
réglage supplémentaire sur les données existantes.

### 5.y Le critère « Qualité » refusait les meilleurs cas — PRÉVENIR au lieu de REFUSER (2026-08-15)

**Découverte (banc homogène, 4 athlètes, 32 courses).** Une fois tous les athlètes rejoués
sous la MÊME config, le motif de refus n°1 est « Qualité (FC / altitude / distance) » :
11 occurrences (6 en dev, 5 en frais), devant le garde-fou domaine. Et le cas qui alerte :

> **Val est refusé 6 fois sur 6** avec des erreurs de **+1,4 / +13,9 / +8,5 / −6,3 / −6,7 /
> −0,3 %** — le meilleur central du banc (~6 % de MAE), invendable.

Au total, **12 refus sur 21 portaient un central à ±15 %** : le garde-fou ne protégeait plus
le client, il le perdait.

**Cause.** La qualité mesure la fraction de l'ARCHIVE ENTIÈRE portant FC et altitude. C'est
une propriété de l'export (Strava sans FC, activités anciennes sans altitude), pas de la
prédiction. Or le moteur neutralise DÉJÀ ces manques là où ils comptent :

* une activité sans altitude est **exclue de la courbe record** (`build_record_curve`,
  motif `no_altitude`) → elle ne peut corrompre ni VC ni E ;
* un vrai ultra sans FC est **conservé et signalé** (`select_genuine_ultras` : « FC absente →
  on ne peut pas vérifier (on garde, signalé) ») ;
* la durabilité dégrade proprement en « non chiffrée », et le rapport le dit.

Refuser en plus, c'est punir deux fois le même risque — sur un signal qui, au banc, ne prédit
pas l'erreur.

**Premier correctif tenté — `cap_orange` (qualité jamais bloquante) : MESURÉ, INSUFFISANT.**
Le banc a tranché en une passe. Gains réels : Val passe de 0 à 3 cas vendables (−6,3 / −6,7 /
−0,3 %), « Qualité » disparaît des motifs de refus, et le bloc développement atteint ses
meilleurs chiffres (MAE vendus **6,1 %**, couverture 80 %, n=10). **Mais les cas FRAIS —
les seuls décisionnels — se dégradent** : MAE vendus 10,6 → **16,4 %**, couverture 50 →
**25 %**. Cause : la course Coursières 100k 2025 de Rapace (archive quasi vide avant la
coupure) devient vendable avec **+35,7 %** d'erreur. La qualité bloquait Val à tort ET Rapace
à raison — par accident.

**Correctif retenu — `quality_policy="cv_gated"` (DÉFAUT).** La qualité est un signal de
REPLI : elle ne dit rien quand la **validation croisée** existe (celle-ci mesure directement
ce que vaut le modèle sur CET athlète, ce qu'aucune fraction de canaux ne saura faire), et
elle redevient un garde-fou légitime quand cette preuve manque. Concrètement : non bloquante
si `prediction.cross_validation` existe, bloquante sinon. Val (validé) reste vendable ;
Rapace (aucune validation possible, moins de 3 vrais ultras aux coupures) reste refusé.
Rollbacks : `cap_orange` (jamais bloquante) et `red` (comportement d'origine).

**Preuves.** Suite committée 267 passed / 1 skipped ; `tools.ab_montagnhard` reproduit le
tableau §4 à l'identique (le correctif ne touche que le VERDICT, aucun chiffre du modèle).

**MESURE TERRAIN (banc du 2026-08-15, 4 athlètes).** Résultat conforme sur le garde-fou,
PARTIEL sur le gain :

| | avant tout correctif | `cap_orange` | `cv_gated` (retenu) |
|---|---|---|---|
| frais — vendus / MAE / couv80 | 2 / 10,6 % / 50 % | 4 / **16,4 %** / **25 %** | 2 / 10,6 % / 50 % |
| dev — vendus / MAE / couv80 | 7 / 6,8 % / 71 % | 10 / 6,1 % / 80 % | **8 / 6,0 % / 75 %** |
| Rapace Coursières (+35,7 %) | refusé | **VENDU** | refusé |
| Val (4 cas à ±14 %) | refusé | vendu | **refusé** |

Bilan honnête : `cv_gated` protège correctement contre le faux positif de Rapace et gagne un
cas vendable (Lavaredo) avec une MAE légèrement meilleure, mais **il ne récupère pas les
quatre cas justes de Val** (+1,4 / +8,5 / −6,3 / −6,7 %). Aux coupures concernées, Val n'a ni
validation croisée ni couverture de canaux : du point de vue du moteur, **son cas est
indiscernable de celui de Rapace** — mêmes signaux d'évidence faible, erreurs réelles opposées.

**Conclusion de la piste (à ne pas re-tenter à 4 athlètes).** Le taux de faux négatifs ne se
règle pas en recâblant les critères entre eux : toute règle testée soit laisse passer Rapace
(+35,7 %), soit bloque Val (+1,4 %). Ce qui les sépare n'est pas observable *au moment de la
prédiction* — seulement après coup. Il faut soit un signal d'évidence NOUVEAU (pas une
recombinaison des existants), soit assez de cas frais pour apprendre le seuil. La deuxième
voie est la seule ouverte aujourd'hui : elle passe par la cohorte.

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

**(a) IMPLÉMENTÉE (2026-07-16, validée par Valentin) :
`twin.despike_rescue_dplus_basis="time"` ("zero" = rollback).** Un canal sauvé dont
l'altitude n'est pas elle-même condamnée (§9.10) récupère ses D± en base TEMPS
(`np.diff(alts)`, somme des montées du canal altitude seul — indépendante de l'alignement) ;
ga reste = brut (f=1, l'humilité sur la vga demeure). Deux approximations assumées et
bornées : échelle time_5s ≈ +15 % vs distance_150m (§9.6) sur CE point uniquement, et vga
toujours sous-estimée (~0,7 km/h sur la Saintélyon). Effet attendu, à lire sur le rerun
Rapace contre le tableau ci-dessus : dpk ≈ 24 restitué → ancre du blend remontée de
|−0,017|·24 ≈ 0,4 km/h → Coursières/UTBV/Nivolet se rapprochent de l'« avant » sans
re-perdre le gain GTDL. Si le rerun contredit, rollback en une valeur de config.

**(a) ADOPTÉE — A/B final (2026-07-16, rerun Rapace, grille de lecture pré-enregistrée)** :

| coupure (réel)               | sans le point | dpk=0     | dpk réel (a) | régime (a)       |
|------------------------------|---------------|-----------|--------------|-------------------|
| Maratour 24 (6,3 h)          | +308,2 %      | +308,2 %  | +308,2 %     | invariant contrôle ✓ |
| Saintélyon 24 (10,9 h)       | +80,8 %       | +80,8 %   | +80,8 %      | invariant contrôle ✓ |
| GTDL 25 (6,0 h)              | +79,9 %       | +48,1 %   | **+29,3 %**  | 1/blend — gain accru |
| Coursières 25 (15,0 h)       | +35,8 %       | +60,3 %   | **+35,7 %**  | 1/blend — retour à l'avant |
| UTBV 25 (11,7 h)             | +1,0 %        | +12,4 %   | **+9,0 %**   | 2/blend — résidu = vga sous-estimée (~0,7 km/h, attendu) |
| Nivolet 26 (7,4 h)           | +10,6 %       | +19,4 %   | **+26,3 %**  | 4/régression σ 1,50 — DÉGRADÉ |

Verdict selon la grille : **adoptée**. Sur les régimes BLEND — là où l'ancre agit — (a)
fait strictement mieux que dpk=0 partout, et mieux que « sans le point » sur les coupures
pauvres (GTDL 79,9 → 29,3). Stats fraîches globales : MAE refusés 75,0 → 68,3 %, biais
central +36,2 → +32,6 %, médiane groupée Rapace 6,52 → 4,56. **Point dur restant, à ne pas
maquiller** : Nivolet — le point sauvé (récence ~0,37, approximatif) fait franchir n_eff
≥ 3 et DÉBLOQUE une bascule blend→régression à 4 points qui se sait mauvaise (σ 1,50,
bandes énormes, cv 25 % → 🔴 refusée par le gate ; zéro surface commerciale). Piste NOTÉE,
non implémentée (1 seul cas) : un point sauvé ne devrait peut-être pas pouvoir déclencher
SEUL la bascule de régime (l'exclure du comptage n_eff de la bascule, pas du fit) — à
re-examiner si un deuxième cas apparaît. NB : la quarantaine Saintélyon a survécu à cette
re-fusion — première épreuve réelle du correctif §9.12, passée.


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


## 10. Chantier Twin v2 (2026-09) — resserrer honnêtement, individualiser, rendre le rapport vendable

> **Cadre.** Audit externe du moteur, du rapport livré pour Nice Côte d'Azur by UTMB 100M (cas
> de référence, Val) et de la concurrence. Diagnostic : le centre est bon (LOO ≈ 6,8 % sur
> 12 ultras) mais les bandes valent ~2,2 × ce qu'une gaussienne au σ implicite donnerait —
> mécanique de l'intervalle (levier d'extrapolation vers 32 h, quantile conforme à n = 12,
> symétrie en heures), pas calibration. **Règle du chantier** : on resserre en apportant de
> l'information dans la zone 25–35 h, en stabilisant le quantile et en cassant la symétrie ;
> jamais en réduisant la couverture nominale, jamais en flattant la largeur. Chaque levier :
> un flag de `twin.config.json`, défaut historique inchangé au bit près tant que la preuve
> n'est pas faite, preuve au banc (4 manifestes, toutes coupures), décision consignée ici
> (§10.x). Compte-rendu du chantier : `docs/twin-chantier-v2-compte-rendu.md`.

### 10.0 Baselines et mesures (Phase 0 — aucun changement de comportement)

**Ce qui est figé.** Aucun flag, `twin.config.json` intact. Golden déterministe inchangé au
chiffre près (`pytest -k golden`), suite complète verte, `tools.ab_montagnhard` identique au
tableau §4. Le registre committé au départ du chantier est copié tel quel dans
`docs/archive/twin-v2/registre-avant.json` : c'est le « avant » de tous les tableaux
avant/après (`tools/registre --compare`). Rejoué par `tools/registre`, il reproduit
exactement le banc du 2026-08-15 (§5.y : frais vendus n=2, MAE 10,6 %, couv80 50 % ; dev
vendus n=8, MAE 6,0 %, couv80 75 %) — le moteur n'a pas bougé depuis.

**Tableau de référence — le « avant » du chantier (`tools/banc`, 2026-09-15, config servie,
doublons fusionnés ; `docs/archive/twin-v2/registre-avant.json`).** Winkler relatif = score
de Winkler ÷ temps réel ; largeur relative = (haut − bas) ÷ central, médiane par ligne. Le
banc brut du départ (registre du 2026-08-15, Lolo doublé, Val sur son ancienne archive) est
conservé sous `registre-avant-doublons.json` ; il donnait frais vendus n=2 · MAE 10,6 % ·
couv80 50 %, dev vendus n=8 · 6,0 % · 75 %.

*Cas frais (décisionnels) — VENDUS (🟢/🟠)*

| athlète | n | MAE % | biais % | couv 50 | couv 80 | Winkler rel 50 | Winkler rel 80 | largeur rel méd 50 | largeur rel méd 80 |
|---|---|---|---|---|---|---|---|---|---|
| Lolo | 2 | 17.2 | -17.2 | 0 % | 0 % | 0.611 | 1.125 | 8.4 % | 16.2 % |
| TOTAL | 2 | 17.2 | -17.2 | 0 % | 0 % | 0.611 | 1.125 | 8.4 % | 16.2 % |

*Cas frais — REFUSÉS (🔴)*

| athlète | n | MAE % | biais % | couv 80 | motifs bloquants |
|---|---|---|---|---|---|
| Lolo | 4 | 9.6 | -9.3 | 50 % | Domaine de calibration ×3 · Erreur validation croisée ×1 · Largeur d'intervalle ×1 |
| Rapace | 5 | 81.7 | 81.7 | 20 % | Qualité (FC / altitude / distance) ×4 · Domaine de calibration ×2 · Efforts longs proches de la cible ×1 · Erreur validation croisée ×1 · Largeur d'intervalle ×1 |
| TOTAL | 9 | 49.6 | 41.3 | 33 % | Domaine de calibration ×5 · Qualité (FC / altitude / distance) ×4 · Erreur validation croisée ×2 · Largeur d'intervalle ×2 · Efforts longs proches de la cible ×1 |

*Cas de développement (indicatifs) — VENDUS (🟢/🟠)*

| athlète | n | MAE % | biais % | couv 50 | couv 80 | Winkler rel 50 | Winkler rel 80 | largeur rel méd 50 | largeur rel méd 80 |
|---|---|---|---|---|---|---|---|---|---|
| Crasse | 7 | 6.8 | 2.6 | 57 % | 71 % | 0.191 | 0.296 | 7.1 % | 13.4 % |
| Val | 4 | 12.9 | 12.9 | 25 % | 50 % | 0.473 | 0.773 | 12.8 % | 24.8 % |
| TOTAL | 11 | 9.0 | 6.3 | 45 % | 64 % | 0.293 | 0.469 | 8.1 % | 15.5 % |

*Cas de développement — REFUSÉS (🔴)*

| athlète | n | MAE % | biais % | couv 80 | motifs bloquants |
|---|---|---|---|---|---|
| Crasse | 6 | 120.3 | 117.0 | 0 % | Domaine de calibration ×4 · Efforts longs proches de la cible ×2 |
| Val | 2 | 7.4 | 1.2 | 50 % | Domaine de calibration ×1 · Largeur d'intervalle ×1 |
| TOTAL | 8 | 92.1 | 88.0 | 12 % | Domaine de calibration ×5 · Efforts longs proches de la cible ×2 · Largeur d'intervalle ×1 |

*Tous les cas — VENDUS (🟢/🟠)* : Crasse 7 (MAE 6,8 %), Lolo 2 (17,2 %), Val 4 (12,9 %) ;
TOTAL n=13, MAE 10,3 %, biais +2,7 %, couv50 38 %, couv80 54 %, Winkler rel 0,342 / 0,570,
largeur rel méd 8,1 % / 15,5 %.

**Lecture du « avant », ce que la Phase 1 doit viser.**
1. **Sur les cas vendus, les bandes SOUS-couvrent** : 38 % dans la fourchette de course
   (50 nominal), 54 % dans les bornes de sécurité (80 nominal). L'audit a raison sur le cas
   de référence (bandes larges, levier d'extrapolation à 32 h) et le banc montre le revers :
   sur les cas courts et bien encadrés, les bandes conformes sont trop étroites. Même
   mécanique, deux symptômes — quantile empirique instable à petit n, symétrie en heures.
   La règle « jamais réduire la couverture nominale » n'en est que plus contraignante.
2. **Bandes dégénérées, cibles de A2/A3** : Lolo/MIUT 2026 (5 vrais ultras, 4 groupés
   10–13 h + 1 long) → fourchette [11,6 – 40,3], sécurité [**0,0** – 51,9] pour un central
   25,97 h juste (+0,6 %) : en lien linéaire, q·sd_rel ≥ 1 rend la borne basse négative. Val/
   Chianti 2025 → [14,4 – 68,2] et [13,3 – 68,2] : borne haute = plafond Deq/v_floor du repli
   MC. Val/Lavaredo (registre brut) : sécurité ±38 % pour une fourchette ±7,5 %.
3. **Biais de progression, deuxième athlète** : Val 2024 avec son historique 2022–2023 →
   Ecotrail +23,8 %, GRF +21,0 % ; puis Saintélyon +5,6 %, Lavaredo +1,0 %, Chianti −6,3 %
   à mesure que les ultras récents s'accumulent. Même signature que Crasse (§5.x) : la
   demi-vie ne le corrige pas (rejeté au banc), c'est l'information sur la pente en durée
   (A1, puis B1) qui doit le porter.
4. **Lolo, une fois dédoublonné, est prédit trop rapide partout** (−4 à −20 %) avec 5 vrais
   ultras : ses deux cas vendus font la totalité de la statistique « frais vendus » (n=2).
   La règle « jamais sur un seul athlète » s'appliquera à chaque décision de la Phase 1 :
   les leviers seront livrés derrière flag et, si la jauge ne tranche pas, activés pour
   le rapport de référence via `TWIN_CONFIG_PATH`, consignés « activés pour Val, défaut non
   basculé ».

**Relance du banc sous la config servie (0.1) — FAIT deux fois (2026-09-15, `tools/banc`,
4 manifestes, 32 courses).** Première passe, sans dédoublonnage : Crasse, Lolo et Rapace
**identiques au chiffre près** à l'instantané brut (deltas nuls, aucun changement de verdict)
— le moteur n'a pas bougé ; Val change partout parce que SON ARCHIVE a changé (export frais,
55 mois au lieu de 17,5) et parce qu'elle est doublée. Seconde passe, doublons fusionnés
(Val : 551 copies, Lolo : 545, Crasse et Rapace : 0) : c'est le tableau de référence
ci-dessus. Effet du dédoublonnage lu au `--compare` : Lolo, 10 → 5 vrais ultras, ses erreurs
bougent de −19,4 → −4,3 % (Coursières Hivernal) à −1,2 → −13,8 % (UTDR), −6,1 → −16,4 %
(UTSM) ; Val, Saintélyon 2024 +1,0 → +5,6 %, Lavaredo +1,2 → +1,0 %, les coupures de 2024
inchangées (les doublons commencent en septembre 2024).

**Recapture de référence sur l'archive fraîche (moteur actuel, dédoublonnée) — le « avant »
du cas Nice.** `twin-engine preview`, 918 activités uniques (1 469 lues, 551 copies), coupure
au 2026-09-15 :

| Grandeur | Recapture 2026-09-15 | PDF livré (même jour) |
|---|---|---|
| central | 32,33 h | 32 h 17 |
| bornes de sécurité (80 %) | 24,46 – 40,20, soit ±24,3 % | 24 h 39 – 39 h 54 |
| fourchette de course (50 %) | 27,49 – 37,17, soit ±15,0 % | 28 h 11 – 36 h 22 |
| σ · LOO (12 plis) | 0,505 km/h · brute 6,9 %, interpolation 7,7 %, extrapolation 4,0 % | 0,50 · 6,8 / 7,6 / 4,0 |
| VC · E · durabilité | 9,75 km/h (2,708 m/s ± 0,19) · 1,167 (α 0,143) · 19,1 % | 9,72 · 1,18 · 19 % |
| β (lien linéaire) · n_eff · intensité | (9,285 ; −0,379 ; −0,0335) · 11,1 · 63,5 % de VC | — |

Les deux colonnes concordent : le PDF avait été produit sur une archive sans doublons. Les
références du golden RÉEL (§12, archive de juillet, 449 activités) restent celles d'une autre
archive ; la question de leur recapture est ouverte (compte-rendu).

**Doublons d'activités — découverte du banc, correctif ACTIVÉ (`twin.dedup_activities=on`,
rollback `off`).** La radiographie (`tools/diag_ultras`) liste chaque effort ≥ 10 h : chez
**Val, toute activité depuis le 2024-09-14 apparaît deux fois** (même départ, même durée à la
seconde, mêmes arrêts, une copie avec FC et une sans) — 22 « vrais ultras » pour 12 réels,
n_eff 20,5 ; chez **Lolo, TOUS les efforts longs sont doublés** (14 lignes pour 7, 10 « vrais
ultras » pour 5), et ce depuis le banc du 2026-08-15 au moins (mêmes n_genuine dans
l'instantané). Crasse et Rapace : aucun doublon. Cause : deux exports qui se recouvrent
(montre + Strava, ancien + nouveau) réunis dans une même archive. Effet : chaque copie
compte deux fois dans la régression, la LOO (les 22 erreurs LOO de Val vont par paires
identiques), le N_eff et le support de la courbe record — le garde-fou « N-ième meilleure »
(§2.3 de twin-theory) est neutralisé par une copie. Correctif dans `record_from_contributions`
: même heure de départ ISO, durée à ±5 s, distance à ±2 % ⇒ une copie, la plus riche (FC,
puis altitude, puis découplage). Sans heure de départ (vieux agrégats, fixtures) rien n'est
fusionné : golden déterministe et tableau §4 inchangés ; tests
`test_duplicate_activities_are_merged_keeping_the_richest_copy` et
`test_duplicate_cannot_fake_record_support`. **Conséquence sur le protocole** : l'instantané
`registre-avant.json` porte les lignes de Lolo doublées ; le banc rejoué avec dédoublonnage
devient le « avant » du chantier (l'instantané brut est conservé sous
`registre-avant-doublons.json`), et la recapture de référence de Val est à refaire.

**Recapture de référence sur l'archive fraîche (moteur actuel, doublons NON fusionnés —
à refaire).** `twin-engine preview` sur `Val/archives` + `examples/nice-100m.json` : 32,59 h,
sécurité [28,05 – 37,14], fourchette [30,17 – 35,02], σ 0,449, LOO 5,8 % sur 22 plis (11
paires identiques), VC 9,30 km/h, E 1,17, durabilité 19,1 %, 1 469 activités. Le PDF livré
(891 activités, 12 ultras) disait 32,28 h, [24,65 – 39,90], [28,18 – 36,37], LOO 6,8 %,
VC 9,72, E 1,18 : les 578 activités d'écart sont les deux années doublées. Chiffres
consignés pour mémoire, pas de référence.

**Rapport de référence livré (PDF du 2026-09-15, archive de 891 activités) — l'état « avant »
du livrable.**

| Grandeur | Valeur imprimée |
|---|---|
| central | 32 h 17 (32,28 h) |
| fourchette de course (50 %) | 28 h 11 – 36 h 22, soit ±12,7 % |
| bornes de sécurité (80 %) | 24 h 39 – 39 h 54, soit ±23,6 % |
| σ résiduel · LOO | 0,50 km/h · brute 6,8 % (interpolation 7,6 %, extrapolation 4,0 %) |
| VC · E · durabilité | 9,72 km/h (2,699 m/s ± 0,15) · 1,18 · 19 % |
| nuit | du km 38 au km 84 (ven. 20:08 → sam. 05:34) |
| plan | mouvement 30 h 52 + arrêts 1 h 25 ; dérive affichée « ≈ −16 % » |

Deux constats de cohérence, à régler avant le recalcul final :
1. les références du golden RÉEL (§12 de twin-theory, capture du 2026-07-02, 449 activités :
   VC 2,952, E 1,244, 31,28 h, MAE 3,1 %) ne sont **pas** celles de l'archive fraîche
   (891 activités : VC 2,699, E 1,18, 32,28 h, MAE 6,8 %). Le golden réel ne peut donc être
   vérifié PASS que sur l'archive de juillet ; sur l'archive fraîche, une **recapture de
   référence « avant »** est nécessaire en Phase 0 (`twin-engine preview` sous le moteur
   actuel, JSON conservé hors git) — sinon aucune bascule de défaut ne pourra être jugée sur
   le cas de référence ;
2. arrêts 1 h 25 imprimés contre 1 h 45 attendus avec `examples/nice-100m.json`
   (15 × 5 min + 3 bases majeures × 10 min) : la spec de course servie pour ce PDF n'est pas
   celle du dépôt. La spec exacte (et la config) du rapport livré sont à récupérer pour que
   le recalcul de Phase 6 compare des choses comparables.

**0.4 Fade : l'incohérence narrative est confirmée dans le code et dans le PDF.**

| Grandeur | Valeur |
|---|---|
| Δ servi (`pacing.fade_source=config`, défaut) | 0,085 |
| dérive affichée (`context.py` : 2Δ/(1+Δ)) | −15,7 %, imprimée « ≈ −16 % » (PDF p. 9) |
| durabilité mesurée de l'athlète | 19 % (PDF p. 3 et 7) ; 20,9 % dans twin-theory §12 |
| Δ qu'aurait servi `fade_source=durability` (X/(200−X)) | 0,105 pour 19 % (−19,0 %) ; 0,117 pour 20,9 % (−20,9 %) |

Le PDF imprime, p. 7 : « 19 % de découplage : la dérive contrôlée du plan est faite pour
toi ». La phrase sort de `durability_pourtoi` (narrative.py) pour toute durabilité dans la
bande « bonne » (15–25 %), alors que le plan ne lit pas ce chiffre : le fade reste le Δ
fixe de la config. La promesse d'individualisation n'est pas tenue sur le livrable du jour J
(déjà noté en §9.3 ; jamais basculé). Correctif = levier fade de la Phase 2 (`fade_source=
durability`, puis source `splits`), à valider sur le plan Nice avant bascule.

**0.2 H2 — écoulé = mouvement + arrêts.** Outil `tools/diag_ultras` (une passe
par archive, agrégats seulement) : par effort ≥ 10 h, écoulé, mouvement (masque distance de
`twin/stops.py`, le même que le moteur), arrêts en % et en min/h, plateaux ≥ 1 min et
≥ 5 min, plus long arrêt, statut au filtre vrais ultras et poids récence × maximalité ; et,
via le manifeste, l'écart **montre − officiel** (une montre en pause ment sur l'écoulé que
la LOO compare). C'est le préalable de B4 : la bascule `speed_basis=moving` et le modèle
d'arrêts ne se décident que sur ces chiffres.

Mesuré le 2026-09-15 (`tools/banc`, banc dédoublonné ; arrêt = plateau de distance ≥ 60 s ;
« sans mouvement » = incrément de distance ≤ 0,5 m/s, la définition de `moving_time_s`).

| athlète | vrais ultras | sans mouvement, % de l'écoulé (méd. · pond.) | idem, min/h (méd. · pond.) | plateaux ≥ 1 min, min/h (méd. · pond.) | plateaux ≥ 5 min par course (méd.) | montre − officiel (méd. · max, min) |
|---|---|---|---|---|---|---|
| Val | 12 | 16,4 · 17,0 | 9,8 · 10,2 | 5,5 · 6,0 | 3,5 | +0,2 · 1,9 (5 courses) |
| Crasse | 9 | 8,1 · 7,3 | 4,9 · 4,4 | 0,4 · 0,4 | 0 | +0,1 · 4,3 (8) |
| Lolo | 5 | 12,8 · 17,1 | 7,7 · 10,3 | 3,8 · 6,3 | 2 | −0,4 · 1,4 (4) |
| Rapace | 4 | 42,7 · 36,9 | 25,6 · 22,1 | 3,5 · 1,9 | 0,5 | −0,1 · 1,0 (3) |

Courses de Val (les seules à peser dans la LOO) : Ecotrail 11,5 % sans mouvement (6,9 min/h),
GRF 10,7 % (6,4), Saintélyon 11,1 % (6,7), Chianti 14,0 % (8,4), Lavaredo 15,7 % (9,4) ;
plateaux ≥ 1 min : 4,1 à 5,2 min/h, 2 à 6 plateaux ≥ 5 min par course. Ses sorties longues
d'entraînement s'arrêtent bien plus (18–27 %), et ses OFF avec sommeil (26,9 h et 38,3 h :
48–50 %) restent hors calibration par le plancher `genuine_min_ga_kmh` — qui a raison.

Lecture :
1. **La montre ne ment pas sur l'écoulé** : écart montre − officiel ≤ 5 min sur les 20 courses
   rapprochées, médiane nulle. La LOO peut comparer à l'écoulé officiel ; aucun auto-pause
   systématique.
2. **Le taux d'arrêt est personnel et très dispersé** : en course, Crasse s'arrête 0,2–0,7 min/h
   (aucun plateau ≥ 5 min sur 8 courses), Val 4–5 min/h, Lolo 2–6, Rapace 3–6. Le plan
   servi (5 min par ravito + 10 aux bases, soit 3,3 min/h sur Nice) n'est juste pour
   personne en particulier : la matière de B4 (taux d'arrêt personnel) est là.
3. **La mesure « sans mouvement » au seuil de vitesse est fragile sur un canal pauvre** :
   Rapace, Saintélyon 2024 (canal distance haché, §9.11) : 74 % « sans mouvement » pour
   6,5 min/h de plateaux ; UTBV : 32 % sans aucun plateau ≥ 1 min (incréments sous le seuil,
   quantification du canal). B4 doit s'appuyer sur les plateaux (arrêts francs) et laisser
   la marche lente dans le mouvement ; `speed_basis=moving` tel quel hériterait de cette
   fragilité.
4. **Lolo/MIUT (25,8 h, sa plus longue course) sort de la calibration à 5,48 km/h contre un
   plancher de 5,5** — à 0,02 km/h près — alors qu'il s'est arrêté 23 % du temps : en base
   mouvement elle serait retenue largement. C'est le cas d'école du « plancher dépendant de
   la durée » (backlog §9.11) que B4 doit régler.

**0.3 Part de nuit.** Même outil, seconde table : part de nuit de chaque vrai
ultra (temps écoulé et temps en mouvement, test jour/nuit du plan, fuseau solaire de la
longitude) et, avec `--course/--race/--hours`, part de nuit de la cible par segment via le
plan réel. La subtilité de C2 : les ultras de calibration contiennent déjà de la nuit en
moyenne — le facteur nuit n'ajustera le total que par le **différentiel** entre la part de
nuit de la cible et cette moyenne pondérée.

| athlète | nuit % écoulé (méd. · pond.) | nuit % mouvement (méd. · pond.) |
|---|---|---|
| Val | 26,8 · 32,5 | 27,6 · 32,7 |
| Crasse | 15,3 · 19,5 | 16,2 · 19,8 |
| Lolo | 21,3 · 25,5 | 22,7 · 26,4 |
| Rapace | 23,0 · 21,6 | 24,1 · 20,2 |
| **cible Nice 100M sur 32,28 h (plan réel)** | 42,9 (horloge) | 43,2 |

Nice, par segment (départ ven. 13:00, soleil 07:20–19:24) : jour jusqu'à AS3 (km 28,9,
18:58) ; segment vers AS4 (km 38) 65 % de nuit, AS5 à AS8 (km 50 → 83,5) 100 %, vers AS9
(km 93,8, 07:58) 75 % ; jour jusqu'à AS14 ; vers AS15 (km 156,5, 19:33) 9 % ; dernier
segment (arrivée 21:16) 100 %. Deux nuits, pas une : le PDF livré écrivait « du km 38 au
km 84 » sur les seuls drapeaux d'arrivée. Pour C2, le différentiel qui ajuste le total vaut
**≈ +10 points** (43 % de la cible contre 32–33 % pondérés sur les ultras de calibration
de Val) ; le reste du facteur nuit est une redistribution à Σ conservée.

**0.5 Passages réels aux points de contrôle.** Outil `tools/passages` :
l'activité du jour de course est retrouvée dans l'archive, le parcours construit comme au
banc (spec ou découpage 10 km), et l'heure de passage à chaque borne de segment relevée par
proximité monotone (rayon 150 m, cohérence avec la distance de la montre, approche la plus
proche du premier passage). Consigné dans le registre sous `passages` (agrégats : des heures
à des km publics), préservé par la re-fusion du banc. C'est la matière du scoring du plan
(Phase 4) — jusqu'ici le banc ne jugeait que l'arrivée.

| athlète | courses avec passages | points trouvés / attendus | écart arrivée relevée − officiel (min) |
|---|---|---|---|
| Val | 6 / 6 | 66 / 66 (1 « closest » à 206 m) | −6 à 0 (Ecotrail −6 : point d'arrivée à 148 m) |
| Crasse | 13 / 13 | 123 / 123 (Chota 2025 retrouvée le lendemain de la date du manifeste, à ± 1 j) | −5 à +4 |
| Lolo | 7 / 7 | 58 / 58 | −2 à 0 |
| Rapace | 6 / 6 | 46 / 51 (Saintélyon 2024 : 4/9, trace de parcours en quarantaine §9.12) | −1 à +2 |

Soit 293 heures de passage réelles sur 298 attendues, 31 courses, presque toutes à ≤ 15 m
du point (rayon 150 m rarement sollicité), consignées dans le registre sous `passages`. La
sélection de l'activité du jour exige une durée entre 0,5 et 1,5 × l'officiel (au premier
passage, Chota 2025 avait pris une sortie d'une heure). La matière du scoring du plan
(Phase 4) existe.

**Outils livrés en Phase 0** (tous couverts par des tests synthétiques, `tests/test_stops.py`,
`test_backtest_tools.py`, `test_pacing.py`, `test_course.py`) : `twin/stops.py` (masque de
mouvement partagé avec `record.py` — refactor sans effet numérique, golden intact — détection
d'arrêts, statistiques), `pacing/sun.py::night_mask/night_share`, `CourseProfile.lat_grid/
lon_grid` + `checkpoint_coords()` (additifs, `to_dict` inchangé), `tools/registre --tableau`
et `--compare`, `tools/diag_ultras`, `tools/passages`, et `tools/banc` qui enchaîne
backtest, radiographie et passages sur UN décodage par archive (résultats identiques aux
outils séparés, vérifié par test) — le premier essai chez Valentin avait buté sur trois
décodages par archive et sur un manifeste (Val) pointant vers un nom d'archive périmé :
les manifestes pointent désormais tous sur le dossier `archives/` de l'athlète, et une
archive introuvable est signalée puis sautée au lieu d'arrêter le banc.

### 10.1 A2 — Lien log : l'erreur d'ultra est multiplicative (flag `calibration.link`, défaut `linear`)

**Constat.** La régression servie est linéaire en vitesse, v = β0 + β1·ln T + β2·D+/km,
σ en km/h, bandes symétriques en heures autour du central. Or l'erreur d'un ultra est
multiplicative et asymétrique — un jour lent coûte des heures, un jour rapide en rend peu —
et le point fixe amplifie les tirages lents (§9.1). Symptômes au banc (§10.0) : Lolo/MIUT,
borne basse de sécurité à **0,0 h** (q·sd_rel ≥ 1 en linéaire) ; les bornes hautes des replis
MC collées au plafond Deq/v_floor.

**Correctif (flag).** `calibration.link=log` : ln v = a + b·ln T + c·D+/km (forme de
Riegel), mêmes poids récence × maximalité, même ridge terrain avec un prior devenu relatif
(`default_dplus_penalty_log_per_dpkm` = −0,0170 ÷ 6,40 = −0,0027 par m/km, twin-theory §12),
plancher de σ relatif (`regression_min_sigma_log` = 0,03 ≈ 0,20 ÷ 6,5). Le point fixe est
ANALYTIQUE : T = exp((ln Deq − a − c·D+/km)/(1 + b)) — plus de plancher de vitesse, plus de
tirages non convergés. Monte-Carlo, LOO, β-covariance et scores conformes sont exprimés dans
ce lien ; l'écart-type prédictif de la cible est celui de ln T par delta-méthode, qui inclut
l'incertitude de la pente ET la rétroaction du point fixe (le lien linéaire les ignore). Les
bandes en heures deviennent T·exp(±h) : la borne basse ne peut plus être négative, et la
borne haute est plus loin du central que la borne basse. `sigma_kmh` reste servi pour
l'affichage (σ relatif × vga moyenne pondérée). Régimes blend/vc_e inchangés (ils ne passent
pas par la régression).

**Ce qui est vérifié par test** (`tests/test_phase1_interval.py`) : un athlète de Riegel exact
est retrouvé au millionième ; point fixe analytique = itératif ; bandes multiplicativement
symétriques et positives ; même récence dans le fit, la LOO et les bandes ; défauts intacts
(golden, tableau §4).

**Preuve au banc (2026-09-15).** `tools/banc`, quatre manifestes, dix variantes rejouées
sur un seul décodage par archive ; le banc servi est identique au « avant » (§10.0) à
l'entrée près (`compare.md` : aucun écart, aucun changement de verdict). Les leviers de la
Phase 1 n'agissent qu'en régime `regression` : **9 coupures sur 30**, dont 6 vendues dans au
moins une variante (Val Chianti et Lavaredo 2025 ; Crasse Coursières 2026, Grand Trail du Lac
2025, Nice 100M 2024, Montagnhard 2026) et 3 refusées partout (Crasse Chota, Lolo MIUT, Rapace
Nivolet). **Les deux cas frais vendus (Lolo, Nice 50k 2023 et UTSM 2023) sont en régime
`blend` et ne bougent dans aucune variante** : la règle (d) interdit tout basculement de
défaut sur ce banc, quelle que soit la variante. Les tableaux ci-dessous sont appariés (mêmes
coupures, mêmes agrégats décodés) ; le tableau par coupure est en §10.4.

| variante | vendus avant, appariés | MAE % | biais % | couv 50 | couv 80 | Winkler rel 50 / 80 | largeur rel méd 50 / 80 |
|---|---|---|---|---|---|---|---|
| avant (linéaire, conforme) | 13 | 10,3 | +2,7 | 38 % | 54 % | 0,342 / 0,570 | 8,1 % / 15,5 % |
| A2 (lien log) | 13 | 10,2 | +2,6 | 31 % | 46 % | 0,344 / 0,581 | 8,6 % / 15,5 % |

| variante | zone d'action (6 coupures `regression` vendues quelque part) | MAE % | biais % | couv 50 | couv 80 | Winkler rel 50 / 80 | largeur rel méd 50 / 80 |
|---|---|---|---|---|---|---|---|
| avant | 6 | 6,7 | +4,0 | 83 % | 83 % | 0,621 / 0,789 | 20,3 % / 38,5 % |
| A2 | 6 | 6,0 | +5,1 | 50 % | 67 % | 0,402 / 0,795 | 18,1 % / 36,5 % |

**Lecture.**
- Ce que le lien log fait seul : le point fixe analytique et l'absence de plancher retirent la
  borne basse nulle de Lolo/MIUT ([0,0 – 51,9] → [16,4 – 39,7], largeur 200 % → 91 % du
  central) ; Val/Chianti, central −6,3 → +2,8 %. C'est tout ce qu'il gagne de mesurable.
- Ce qu'il coûte : **un cas**, Crasse/Montagnhard 2026 (réel 16,07 h, central 18,9) — la bande
  log a sa borne basse plus près du central que la bande linéaire (16,4 contre 15,6), raté de
  0,4 h aux deux niveaux. Les 7 points de couverture perdus sur les 13 sont ce seul cas ;
  Winkler +0,002 / +0,011 : bruit.
- Le repli MC en lien log explose autant qu'en linéaire quand la pente n'est pas identifiée :
  Chianti (5 ultras de 10,5 à 11,3 h, ln T sur 0,08) donne [0,0 – 18,6] au 50 % pour un central
  de 21,05 — les tirages d'une pente non identifiée envoient T vers 0 ou l'infini et le central
  analytique tombe hors de sa propre bande MC. Le lien ne sauve pas un MC sans information sur
  la pente ; le prior le fait (§10.2).
- La dissymétrie du lien (borne haute plus loin du central que la borne basse) va aujourd'hui
  **contre** le biais du central : sur la zone d'action le central est trop lent de +4 à +6 %
  en moyenne et les ratés sont côté rapide (Montagnhard 2026, Coursières 2026, Chota).
  L'asymétrie sera juste quand le central le sera (Phase 2 : progression, récence).
- Recapture de Nice sous A2 : **31,89 h**, sécurité [25,96 – 39,17] (largeur 41 % du central
  contre 49 % avant), fourchette [28,09 – 36,21], LOO 6,8 % (interpolation 7,65, extrapolation
  3,64), σ_log 0,070, β_log (2,237, −0,0425, −0,0048), levier de la cible 3,03, sd_rel 0,146.
  La pente libre vaut −0,04 : quasi plate, l'extrapolation à 32 h repose sur trois ultras de
  15–21 h.

**Décision.** Défaut `linear` **non basculé** (règle d : aucun cas frais touché ; au banc un
seul cas bouge, de 0,4 h). **Activé pour le rapport de référence** comme support de A1
(§10.2, §10.4) : c'est dans ce lien que le prior de durée s'écrit −α sans conversion par v̄,
que les bandes sont bornées par construction et que l'asymétrie est disponible. À égalité de
preuve (A1 linéaire fait 0,534 contre 0,552 en Winkler 80 sur les 13 appariés : un cas), le
lien log est un choix de structure, pas de score, et il est consigné comme tel ; si le banc de
la Phase 2 (central débiaisé) creuse l'écart dans l'autre sens, le linéaire reprend.

### 10.2 A1 — Prior sur la pente en durée, alimenté par le jumeau (flag `calibration.duration_term`, défaut `free`)

**Constat.** La pente en durée b est identifiée par 3 à 12 vrais ultras dont un ou deux
longs : sur le cas de référence le levier de la cible (32 h contre 10–22 h validés) vaut
x₀ᵀ(XᵀWX)⁻¹x₀ ≈ 2 contre ≈ 0,25 pour les plis (sd_rel(cible) ≈ 1,6 × sd_rel(plis)). L'exposant
d'endurance E, mesuré sur des dizaines de points de la courbe record (30 min–6 h), ne sert
aujourd'hui la prédiction qu'en régime blend/vc_e.

**Correctif (flag).** `duration_term=prior_shrunk` : pseudo-observation ridge de b vers −α
(Riegel, `Twin.alpha` ; repli `duration_prior_alpha_population` = 0,16 quand α manque —
médiane des α du banc : Val 0,143 et 0,196 selon l'archive, Crasse 0,179), poids
`duration_shrink_lambda` (2 par défaut quand activé). En lien linéaire le prior vaut −α·v̄.
Même mécanique que `terrain_term` : la pseudo-observation entre dans XᵀWX du fit, de la
covariance ET de chaque pli LOO (cohérence fit/LOO/MC/conforme). `Prediction.leverage` expose
le levier de la cible dans le JSON et le registre.

**Réserve à mesurer, pas à supposer.** L'α de la courbe record (efforts ≤ 6 h, pas tous
maximaux) est plus fort que la pente observée sur les vrais ultras : sur la recapture de Nice,
b_log ≈ −0,379/6,5 ≈ −0,06 contre −α = −0,143. Le prior tire donc vers des prédictions PLUS
LENTES à 32 h. Il peut aggraver le biais de progression (§10.0, lecture 3) : c'est le banc qui
dit si l'information réduit l'erreur ou ajoute un biais — λ balayé sur 1, 2, 5, 10.

**Preuve au banc (2026-09-15).** Variantes `A1` (linéaire), `A2A1`, `A2A1l5`, `A2A1l10`
(même banc que §10.1) ; recaptures de Nice sous `A2` (sans prior) et `A2A1`.

| variante | levier cible Nice | sd_rel cible Nice | vendus MAE % (13 appariés) | biais % | couv 50 / 80 | Winkler rel 50 / 80 |
|---|---|---|---|---|---|---|
| avant (linéaire, sans prior) | non exposé | non exposé | 10,3 | +2,7 | 38 / 54 % | 0,342 / 0,570 |
| A2 (log, sans prior) | 3,03 | 0,146 | 10,2 | +2,6 | 31 / 46 % | 0,344 / 0,581 |
| A1 (linéaire, λ=2) | non recapturé | non recapturé | 10,2 | +3,0 | 31 / 54 % | 0,344 / 0,534 |
| A2A1 (λ=2) | **0,93** | **0,119** | 10,2 | +2,8 | 31 / 46 % | 0,345 / 0,552 |
| A2A1 (λ=5) | non recapturé | non recapturé | 10,2 | +2,9 | 31 / 46 % | 0,345 / 0,552 |
| A2A1 (λ=10) | non recapturé | non recapturé | 10,2 | +2,9 | 31 / 46 % | 0,345 / 0,552 |

| variante | zone d'action (6) | MAE % | biais % | couv 50 | couv 80 | Winkler rel 50 / 80 | largeur rel méd 50 / 80 |
|---|---|---|---|---|---|---|---|
| avant | 6 | 6,7 | +4,0 | 83 % | 83 % | 0,621 / 0,789 | 20,3 % / 38,5 % |
| A1 (linéaire) | 6 | 6,3 | +6,3 | 67 % | 83 % | 0,228 / 0,325 | 14,2 % / 23,1 % |
| A2A1 (λ=2) | 6 | 6,1 | +5,9 | 67 % | 67 % | 0,229 / 0,377 | 12,5 % / 19,1 % |
| A2A1 (λ=5) | 6 | 6,2 | +6,0 | 67 % | 67 % | 0,228 / 0,374 | 12,2 % / 19,1 % |
| A2A1 (λ=10) | 6 | 6,2 | +6,0 | 67 % | 67 % | 0,228 / 0,372 | 12,1 % / 19,1 % |

Levier de la cible par coupure, A2 → A2A1 (n_genuine / n_eff à la coupure) : Chianti 147,9 →
0,70 (5 / 4,7) ; Lavaredo 1,59 → 0,73 (6 / 5,7) ; Chota 9,14 → 1,38 (5 / 4,0) ; Coursières 2026
1,33 → 1,30 (7 / 3,7) ; Grand Trail du Lac 1,98 → 0,65 (5 / 4,0) ; Nice 2024 4,12 → 0,57
(4 / 3,5) ; MIUT 13,6 → 3,06 (5 / 3,4) ; Nivolet 4,12 → 1,92 (4 / 3,5) ; Montagnhard 2026 2,92
→ 2,81 (8 / 3,9).

**Lecture.**
- **C'est le levier qui agit.** Levier de la cible Nice 3,03 → 0,93 (attendu ≈ 1,6 → 1,2 en
  sd_rel : mesuré 0,146 → 0,119), largeur 80 de Nice 41 % → 30 % du central. Sur la zone, le
  levier tombe sous 1,4 partout sauf Montagnhard 2026 (2,8 : pente identifiée par 8 ultras dont
  un très long, le prior n'a rien à y ajouter) et MIUT (3,1) ; Chianti passe de 148 à 0,70.
- **Bandes.** Winkler 80 sur les 13 appariés : 0,570 → 0,534 (A1) / 0,552 (A2A1), les deux
  meilleures valeurs du banc hors variantes A3 ; sur la zone 0,789 → 0,325 / 0,377, largeur
  médiane 80 de 38,5 % à 23 / 19 % du central, couverture 80 conservée (A1) ou −1 cas (A2A1 :
  Montagnhard 2026, le même 0,4 h qu'en §10.1). Crasse/Nice 2024 : sécurité [19,6 – 35,4] →
  [24,6 – 27,8], réel 26,16 dedans, erreur +5,1 → 0,0 %. Val/Chianti : repli MC dégénéré
  [13,3 – 68,2] → conforme [17,5 – 25,1], réel 20,48 dedans, le blocage « largeur d'intervalle »
  tombe et le cas devient vendable 🟠 — la seule bascule de verdict du banc, dans le bon sens.
- **Central.** MAE des 13 appariés 10,3 → 10,2, biais +2,7 → +3,0 ; zone 6,7 → 6,3 / 6,1,
  biais +4,0 → +6,3 / +5,9 : le prior tire vers **plus lent**, comme annoncé. La réserve,
  chiffrée : Val, deux extrapolations 2025 — Chianti +4,0 / +3,8 % et Lavaredo +7,1 / +6,1 %
  (A1 / A2A1) contre −6,3 et +1,0 % sans prior ; Crasse — Nice 2024 0,0 / −0,5 % et Grand Trail
  du Lac +0,5 / 0,0 % contre +5,1 et −1,9 %. Deux cas mieux, deux cas moins bien : **le banc
  ne tranche pas le central, il tranche la bande.** Lolo/MIUT (n_eff 3,4, refusé) : +0,6 →
  +9,4 (log) / +17,6 % (linéaire) — le prior fixe une pente que cinq ultras courts ne
  contraignent pas, et la course a dit « plus plat que α ».
- **λ n'est pas un réglage.** 2, 5 et 10 donnent les mêmes centraux au dixième d'heure et le
  même Winkler au millième : la pente en durée n'est identifiée par les ultras d'aucun athlète
  du banc (plage de ln T de 0,1 à 0,7), dès λ = 2 le prior la fixe et seule sa **valeur** (−α)
  compte. C'est une information qui manquait, pas un lissage.
- **Nice sous A2A1 : 34,33 h**, fourchette [31,34 – 37,61], sécurité [29,62 – 39,79] (largeur
  30 % contre 49 % avant), β_log (2,450, −0,134, −0,0040) — b passe de −0,04 à −0,134 (prior
  −0,143, α de Val) ; LOO 6,8 → 7,4 % (interpolation 7,65 → 8,04, extrapolation 3,64 → 5,10) :
  sur l'historique de Val (10,5–21,3 h) la pente plate colle mieux ; à 32 h personne ne sait,
  et c'est précisément là que le prior porte. **Central +2,0 h** par rapport à l'avant (32,33) :
  c'est la conséquence à assumer, pas un effet de bord.

**Décision.** Défaut `free` **non basculé** (règle d). **Activé pour le rapport de référence**
(`examples/twin.config.reference.json`, §10.4), λ = 2, prior = α du jumeau. Consigné : sur les
deux courses 2025 de Val le prior fait +4 à +6 % trop lent ; entre 34,3 h sous prior et 32,3 h
sans, c'est Nice 2026 qui tranchera, et elle entrera au registre. La bande, elle, est
tranchée : levier 3 → 0,9, largeur 80 de 49 % à 30 % du central, Winkler amélioré partout où
le levier agit, MAE vendue non dégradée.

### 10.3 A3 — Facteur d'échelle studentisé à la place du quantile empirique (`prediction.interval_source=studentized_scale`)

**Constat.** Le conforme normalisé lit un quantile EMPIRIQUE sur n = 12 scores (correction
n+1) : le 80 % est le 11ᵉ score sur 12, la récence réduit encore le n effectif, un seul
mauvais pli fixe la borne. Dégénérescences au registre : largeur nulle (Lolo/Nice 50k :
[10,6 – 10,6]), bornes au plafond, sécurité ±38 % pour une fourchette ±7,5 % (Val/Lavaredo).

**Correctif (flag).** `studentized_scale` : mêmes scores studentisés |erreur|/sd_pred (mêmes
poids récence × maximalité auto-normalisés), mais un FACTEUR D'ÉCHELLE κ = RMS pondéré des
scores, et les quantiles 50/80 lus sur une loi de Student à ν = n_eff − p degrés de liberté
(p = 3 coefficients ; `_stats.py`, Student sans scipy, vérifié contre les tables). Demi-largeur
= t_ν(½ + couverture/2) · κ · sd_pred(cible), bornes selon le lien. Emboîtement 50 ⊂ 80
garanti (même κ, t croissant), repli MC sous 4 plis comme le conforme. **Choix du RMS** : à
n = 12, c'est l'estimateur naturel de l'échelle d'une Student et il utilise chaque pli ; le
MAD (`studentized_scale_mad`, κ = 1,4826 × médiane pondérée) est plus robuste à un pli
aberrant mais plus bruyant — mesuré, pas adopté. `studentized_scale_signed` (κ par signe :
prédit trop lent ⇒ le réel est sous la prédiction ⇒ échelle de la borne basse) mesure
l'asymétrie apprise — probablement trop bruyante à n = 12, à noter. κ et ν sont exposés
(`Prediction.scale_kappa`, `scale_dof`).

**Preuve au banc (2026-09-15).** Variantes `A3` (linéaire), `A2A3`, `A2A1A3`, `A2A1A3mad`,
`A2A1A3signed` (même banc) ; recapture de Nice sous `A2A1A3`.

| variante | vendus MAE % (13 appariés) | couv 50 / 80 | Winkler rel 50 / 80 | largeur rel méd 50 / 80 | bandes dégénérées (sécurité) |
|---|---|---|---|---|---|
| avant (conforme) | 10,3 | 38 / 54 % | 0,342 / 0,570 | 8,1 % / 15,5 % | MIUT [0,0 – 51,9] ; repli MC : Chianti [13,3 – 68,2], Nivolet [5,4 – 33,5] |
| A3 (linéaire) | 10,3 | 31 / 62 % | 0,348 / 0,621 | 8,1 % / 16,9 % | MIUT [**−24,9** – 76,8] ; Chianti et Nivolet inchangés (repli MC) |
| A2A3 | 10,2 | 31 / 62 % | 0,353 / 0,610 | 8,1 % / 16,9 % | MIUT [8,6 – 75,4] ; Chianti [0,0 – 52,6] (MC log) |
| A2A1A3 | 10,2 | 31 / 54 % | 0,342 / 0,558 | 8,1 % / 16,9 % | aucune sur les vendus ; MIUT [13,0 – 61,4] (refusé, n_eff 3,4) |
| A2A1A3 (MAD) | 10,2 | 31 / 54 % | 0,345 / 0,591 | 8,1 % / 16,9 % | MIUT [7,5 – 105,9] |
| A2A1A3 (signé) | 10,2 | 23 / 62 % | 0,334 / 0,549 | 8,1 % / 16,9 % | aucune ; Lavaredo raté au 50 % de 0,16 h ([21,4 – 25,9] pour 21,24) |

| variante | zone d'action (6) | MAE % | biais % | couv 50 | couv 80 | Winkler rel 50 / 80 | largeur rel méd 50 / 80 |
|---|---|---|---|---|---|---|---|
| avant | 6 | 6,7 | +4,0 | 83 % | 83 % | 0,621 / 0,789 | 20,3 % / 38,5 % |
| A3 (linéaire) | 6 | 6,7 | +4,0 | 67 % | 100 % | 0,633 / 0,898 | 22,4 % / 60,2 % |
| A2A3 | 6 | 6,0 | +5,1 | 50 % | 100 % | 0,420 / 0,856 | 21,3 % / 57,7 % |
| A2A1 (rappel) | 6 | 6,1 | +5,9 | 67 % | 67 % | 0,229 / 0,377 | 12,5 % / 19,1 % |
| A2A1A3 | 6 | 6,1 | +5,9 | 67 % | 83 % | 0,220 / 0,405 | 12,7 % / 31,1 % |
| A2A1A3 (MAD) | 6 | 6,1 | +5,9 | 67 % | 83 % | 0,223 / 0,470 | 15,3 % / 39,3 % |
| A2A1A3 (signé) | 6 | 6,1 | +5,9 | 50 % | 100 % | 0,205 / 0,397 | 13,9 % / 35,3 % |

**Lecture.**
- **Seul, le facteur d'échelle élargit.** À n_eff ≈ 3,5–4 (Crasse : 4 à 8 ultras dont la
  récence ne garde que 3,5 effectifs), ν = n_eff − 3 est écrêté à 1 et t₁(0,90) = 3,08 contre un
  quantile empirique de 1,3–1,6 : Nice 2024 [19,6 – 35,4] → [16,6 – 38,4], Grand Trail du Lac
  [9,6 – 10,7] → [9,0 – 11,4]. Couverture 80 à 100 % sur la zone, Winkler 0,789 → 0,898 :
  l'honnêteté du petit n coûte plus au score qu'elle ne rapporte — règle (c) non satisfaite
  seul.
- **Avec le prior (A2A1A3), les bandes reviennent.** Winkler 80 sur les 13 : 0,558 (A2A1
  0,552, avant 0,570), couverture 80 revenue à 54 % — Montagnhard 2026 [13,7 – 26,0] couvre le
  cas que A2A1 ratait de 0,4 h — couverture 50 identique. Zone : couverture 80 à 83 % comme
  avant, largeur médiane 80 à 31 % (avant 38,5 %, A2A1 19 %). A2A1A3 contre A2A1 : un cas
  couvert de plus au 80, +0,006 de Winkler — indiscernables au banc. A2A1A3 contre avant :
  Winkler meilleur aux deux niveaux, couvertures égales, MAE égale — règles (b) et (c)
  satisfaites sur le dev_set.
- **Fin des bandes dégénérées sur les cas vendus** : plus aucune borne au plafond ni nulle.
  MIUT reste large (refusé, n_eff 3,4, levier 3,1) : à ce n, Student dit « large » et il a
  raison.
- **MAD** : plus bruyant à n = 4–12, comme annoncé (Winkler 80 0,591, MIUT [7,5 – 105,9]) —
  rejeté. **Signé** : meilleur Winkler 80 du banc (0,549) **mais** couverture 50 à 23 %
  (Lavaredo raté de 0,16 h, Montagnhard 2026 raté) et un κ par côté estimé sur 2 à 6 plis —
  trop bruyant, rejeté pour l'instant, à remesurer quand la Phase 4 apportera des plis.
- **Nice sous A2A1A3 : 34,33 h**, fourchette [31,98 – 36,87] (14 % du central), sécurité
  [29,83 – 39,52] (28 %), κ = 0,85 (les erreurs LOO sont un peu plus petites que le sd du
  modèle), ν = 8,14, asymétrie −4,5 h / +5,2 h. Contre le conforme A2A1 [29,62 – 39,79] :
  identiques à 0,3 h près — à n_eff 11 les deux lectures se rejoignent, le studentisé n'apporte
  que sa stabilité (le 11ᵉ score sur 12 ne fixe plus la borne).
- **Deux points de code sortis du banc.** (1) Bande linéaire studentisée à borne négative
  (MIUT −24,9 h) : `_bands` plafonne désormais la borne basse linéaire à 0 h — aucun cas servi
  n'y touche (borne basse minimale du banc avant : 0,034 h ; golden intact). (2) ν = n_eff − 3
  ignore l'information du prior (b partiellement fixé ⇒ moins de trois paramètres estimés par
  les données) : ν = n_eff − tr(H) serait plus juste, ne change rien pour Val (8,1 → ≈ 8,6) et
  resserrerait Crasse ; à mesurer si A3 vise un jour le défaut.

**Décision.** Défaut `conformal_normalized` **non basculé** (règle d ; seul, A3 élargit).
**Activé pour le rapport de référence** dans la pile A2A1A3 (§10.4), où il est neutre à
n_eff 11 et rattrape le cas que le prior sur-resserre à petit n. MAD et signé : mesurés, non
retenus (chiffres ci-dessus).


### 10.4 Bilan de la Phase 1 — aucun défaut basculé, trois leviers activés pour le rapport de référence

**Ce que le banc a dit.** Les trois leviers n'agissent qu'en régime `regression`, soit 9
coupures sur 30 ; les deux seuls cas frais vendus (Lolo, régime `blend`) ne bougent pas :
**règle (d), aucun défaut ne bascule**, et la jauge (8–10 cas frais vendables) reste à
construire (Phase 4). Sur le dev_set, l'ordre est net et tient à un seul mécanisme : **la
pente en durée n'est identifiée par les ultras d'aucun athlète** (plage de ln T de 0,1 à
0,7 ; levier de la cible 1,3 à 148 sans prior). Le prior −α (A1) apporte l'information qui
manquait, resserre les bandes là où elles étaient absurdes et déplace le central vers plus
lent ; le lien log (A2) donne le cadre où ce prior s'écrit sans conversion ; l'échelle
studentisée (A3) stabilise le quantile et rend au petit n l'honnêteté que le prior lui prend.

**Par coupure, zone d'action** (central en h, erreur %, bornes de sécurité 80 % ; ✓✓ = réel
dans la fourchette et dans les bornes ; verdict) :

| athlète · course (réel) | avant | A2 | A1 (linéaire) | A2A1 | A2A1A3 | A2A1A3 signé |
|---|---|---|---|---|---|---|
| Val · Chianti 2025 (20,48 h) | 19,20 (−6,3) [13,3–68,2] ✓✓ 🔴 | 21,05 (+2,8) [0,0–52,6] ✗✓ 🔴 | 21,32 (+4,0) [17,5–25,1] ✓✓ 🟠 | 21,27 (+3,8) [17,2–26,3] ✓✓ 🟠 | 21,27 (+3,8) [16,5–27,4] ✓✓ 🟠 | 21,27 (+3,8) [17,9–30,2] ✓✓ 🟠 |
| Val · Lavaredo 2025 (21,24 h) | 21,46 (+1,0) [16,9–26,1] ✓✓ 🟠 | 21,39 (+0,7) [17,1–26,7] ✓✓ 🟠 | 22,76 (+7,1) [18,2–27,3] ✓✓ 🟠 | 22,55 (+6,1) [18,1–28,1] ✓✓ 🟠 | 22,55 (+6,1) [18,6–27,3] ✓✓ 🟠 | 22,55 (+6,1) [20,0–30,6] ✗✓ 🟠 |
| Crasse · Chota 2025 (4,93 h) | 4,43 (−10,1) [4,0–4,8] ✗✗ 🔴 | 4,24 (−14,1) [3,8–4,8] ✗✗ 🔴 | 4,65 (−5,6) [4,4–4,9] ✗✓ 🔴 | 4,52 (−8,3) [4,2–4,8] ✗✗ 🔴 | 4,52 (−8,3) [4,1–5,0] ✗✓ 🔴 | 4,52 (−8,3) [3,8–4,9] ✗✗ 🔴 |
| Crasse · Coursières 100k 2026 (13,29 h) | 14,41 (+8,4) [13,8–15,0] ✗✗ 🟢 | 14,42 (+8,5) [13,8–15,1] ✗✗ 🟢 | 14,41 (+8,4) [13,9–15,0] ✗✗ 🟢 | 14,41 (+8,4) [13,9–15,0] ✗✗ 🟢 | 14,41 (+8,4) [13,5–15,3] ✗✗ 🟢 | 14,41 (+8,4) [12,9–15,0] ✗✓ 🟢 |
| Crasse · Grand Trail du Lac 2025 (10,38 h) | 10,18 (−1,9) [9,6–10,7] ✓✓ 🟢 | 10,10 (−2,7) [9,5–10,8] ✓✓ 🟢 | 10,43 (+0,5) [9,8–11,0] ✓✓ 🟢 | 10,38 (0,0) [9,8–11,0] ✓✓ 🟢 | 10,38 (0,0) [9,5–11,3] ✓✓ 🟢 | 10,38 (0,0) [9,0–11,0] ✓✓ 🟢 |
| Crasse · Nice 100M 2024 (26,16 h) | 27,49 (+5,1) [19,6–35,4] ✓✓ 🟠 | 27,10 (+3,6) [20,7–35,5] ✓✓ 🟠 | 26,17 (0,0) [24,6–27,8] ✓✓ 🟢 | 26,03 (−0,5) [24,7–27,5] ✓✓ 🟢 | 26,03 (−0,5) [23,1–29,3] ✓✓ 🟢 | 26,03 (−0,5) [22,9–29,2] ✓✓ 🟢 |
| Crasse · Montagnhard 2026 (16,07 h) | 18,87 (+17,4) [15,6–22,1] ✓✓ 🟠 | 18,94 (+17,9) [16,4–21,8] ✗✗ 🟠 | 18,88 (+17,5) [15,7–22,1] ✗✓ 🟢 | 18,91 (+17,7) [16,5–21,6] ✗✗ 🟢 | 18,91 (+17,7) [13,7–26,0] ✗✓ 🟠 | 18,91 (+17,7) [12,8–24,0] ✗✓ 🟠 |
| Lolo · MIUT 2026 (25,82 h) | 25,97 (+0,6) [0,0–51,9] ✓✓ 🔴 | 25,54 (−1,1) [16,4–39,7] ✓✓ 🔴 | 30,36 (+17,6) [13,9–46,8] ✓✓ 🔴 | 28,26 (+9,4) [20,9–38,2] ✓✓ 🔴 | 28,26 (+9,4) [13,0–61,4] ✓✓ 🔴 | 28,26 (+9,4) [12,7–60,5] ✓✓ 🔴 |
| Rapace · Nivolet-Revard 2026 (7,43 h) | 9,38 (+26,3) [5,4–33,5] ✗✓ 🔴 | 9,51 (+28,0) [0,0–13,5] ✓✓ 🔴 | 8,84 (+19,1) [5,9–11,8] ✓✓ 🔴 | 8,99 (+21,1) [6,3–12,8] ✓✓ 🔴 | 8,99 (+21,1) [3,8–21,3] ✓✓ 🔴 | 8,99 (+21,1) [4,3–26,2] ✓✓ 🔴 |

Par athlète, vendus avant, appariés (Val n = 4, dont trois coupures 2024 en régime `vc_e`
insensibles aux leviers ; Crasse n = 7) :

| athlète · variante | MAE % | biais % | couv 50 / 80 | Winkler rel 50 / 80 | largeur rel méd 50 / 80 |
|---|---|---|---|---|---|
| Val · avant | 12,9 | +12,9 | 25 / 50 % | 0,473 / 0,773 | 12,8 % / 24,8 % |
| Val · A1 | 14,4 | +14,4 | 25 / 50 % | 0,478 / 0,772 | 12,8 % / 24,8 % |
| Val · A2A1 | 14,1 | +14,1 | 25 / 50 % | 0,467 / 0,783 | 12,8 % / 24,8 % |
| Val · A2A1A3 | 14,1 | +14,1 | 25 / 50 % | 0,467 / 0,767 | 12,8 % / 24,8 % |
| Crasse · avant | 6,8 | +2,6 | 57 / 71 % | 0,191 / 0,296 | 7,1 % / 13,4 % |
| Crasse · A1 | 5,9 | +2,2 | 43 / 71 % | 0,191 / 0,228 | 7,0 % / 13,0 % |
| Crasse · A2A1 | 5,9 | +2,1 | 43 / 57 % | 0,199 / 0,257 | 7,0 % / 13,0 % |
| Crasse · A2A1A3 | 5,9 | +2,1 | 43 / 71 % | 0,194 / 0,278 | 7,0 % / 15,3 % |

Chez Val, la hausse de MAE (12,9 → 14,1) est Lavaredo seule (+1,0 → +6,1 %) ; Chianti, qui
devient vendable à +3,8 %, n'entre pas dans cette paire.

**Configuration de référence.** `services/twin-engine/examples/twin.config.reference.json`
(les clés absentes gardent `twin.config.json`) : `calibration.link=log`,
`calibration.duration_term=prior_shrunk` (λ = 2, α du jumeau),
`prediction.interval_source=studentized_scale`. Servie par `TWIN_CONFIG_PATH=…` ou par les
trois `--set` équivalents (manuel §8). Le golden déterministe, le tableau §4 et le registre
committé restent ceux des défauts.

| cas Nice 100M 2026 (archive fraîche dédoublonnée, 1 469 activités, 12 vrais ultras, n_eff 11,1) | avant (défauts) | référence (A2A1A3) |
|---|---|---|
| central | 32,33 h | **34,33 h** (+2,0 h) |
| fourchette de course (50 %) | 27,49 – 37,17 (30 % du central) | 31,98 – 36,87 (14 %) |
| bornes de sécurité (80 %) | 24,46 – 40,20 (49 %) | 29,83 – 39,52 (28 %), asymétrie −4,5 / +5,2 h |
| LOO MAE (12 plis) | 6,9 % | 7,4 % (interpolation 8,0, extrapolation 5,1) |
| levier / sd_rel de la cible | non exposés | 0,93 / 0,119 (sans prior : 3,03 / 0,146) |
| β | (9,285, −0,379, −0,0335) km/h | (2,450, −0,134, −0,0040) en ln v ; prior b −0,143 |
| κ / ν | — | 0,85 / 8,1 |
| VC · E · durabilité | 9,748 km/h · 1,167 · 19,1 % | inchangés |

Ce que le rapport doit dire, et que le carnet consigne : le central a bougé de +2 h par l'apport
d'une information physiologique (l'exposant de la courbe record) là où douze ultras ne disent
rien de la pente ; sur les deux extrapolations 2025 de Val ce prior était trop lent de 4 à 6 %,
sur celles de Crasse il était juste. La bande, elle, est plus étroite **et** pas moins
couvrante au banc : c'est le résultat de la phase. La course entre au registre comme tous les
autres cas.

**Ce que la Phase 1 ne règle pas**, et qui passe en Phase 2 : le biais du central (+4 à +6 %
trop lent sur la zone d'action, +13 % sur Val 2024 : progression et récence, §10.0 lecture 3),
les arrêts (H2, §10.0 point 0.2) et la nuit (§10.0 point 0.3).

**Note du banc de la Phase 2 (2026-09-15) — une régression attrapée par le banc de base.**
`compare.md` du passage de base contre l'« avant » montrait des bandes déplacées de quelques
dixièmes d'heure à défauts inchangés (Crasse, couverture 50 : 57 → 43 % ; Winkler 80 0,296 →
0,313 ; Val 0,773 → 0,758), sans changement de central ni de verdict. Cause : la réécriture de
la LOO lisait, en lien linéaire, l'écart-type de chaque pli au temps PRÉDIT du pli au lieu du
point de prédicteurs réel de l'ultra (la définition historique des scores conformes servis).
Corrigé et verrouillé par test (`test_linear_fold_sd_is_taken_at_the_real_predictor_point`) ;
le passage de base du second banc doit rendre un `compare.md` sans écart.

### 10.5 B4 — Le temps réel est mouvement + arrêts (flag `calibration.stops_model`, défaut `carved`)

**Constat (§10.0, point 0.2).** La régression servie porte sur la vitesse ÉCOULÉE : les arrêts
de chaque ultra sont dilués dans sa vga, et le plan retranche ensuite une politique uniforme
(5 min par ravito, +10 aux bases : 1 h 45 sur Nice avec la spec, soit 3,3 min/h) d'un temps
prédit qui contient déjà les arrêts personnels de l'athlète. Or le taux d'arrêt est personnel
et très dispersé — en course, plateaux ≥ 1 min : Crasse 0,4 min/h, Val 5,5 · 6,0 (médiane ·
pondérée), Lolo 3,8 · 6,3, Rapace 3,5 · 1,9 — et il est absent du modèle. Deux effets
mesurés : Lolo/MIUT (25,8 h, 23 % du temps à l'arrêt) sort de la calibration à 5,48 km/h
contre un plancher de 5,5, alors qu'en base hors arrêts elle est retenue largement ; et la
mesure « sans mouvement » au seuil de vitesse est fragile sur un canal pauvre (Rapace :
74 % sans mouvement pour 6,5 min/h de plateaux) — la base doit s'appuyer sur les plateaux
francs, pas sur la marche lente.

**Correctif (flag).** `stops_model=personal` : chaque activité porte désormais ses plateaux
de distance ≥ `twin.stop_min_s` (60 s ; `ActivitySummary.stops_s`, `n_stops`) ; la
calibration passe en base **hors plateaux** (écoulé − plateaux ; `GenuineUltra.elapsed_hours`,
`stops_h`, `moving_hours`, `stops_rate`), la régression modélise la vitesse hors arrêts, et le
temps prédit vaut mouvement × (1 + r), r = taux personnel (heures d'arrêt par heure de
mouvement, moyenne pondérée récence × maximalité des vrais ultras ; repli population
`stops_rate_population` = 0,06 sans mesure), avec une élasticité optionnelle à la durée,
r(T) = r̄·(T/T̄)^e (`stops_duration_elasticity`, 0 = taux constant, T̄ = moyenne géométrique
pondérée des heures de mouvement). La dispersion de ln(1 + r) entre ultras entre dans
l'écart-type prédictif (et donc dans les scores conformes ou studentisés) et dans le
Monte-Carlo ; chaque pli LOO prédit le temps de MOUVEMENT de la course retirée, y ajoute les
arrêts au taux des AUTRES ultras, et compare au temps ÉCOULÉ réel. `stops_model=spec` : même
base, mais les arrêts de la cible sont ceux de la politique du plan (la LOO reste au taux
personnel, les ravitos des courses passées étant inconnus). Le plan répartit les arrêts
personnels sur les ravitos au prorata de la politique (`PacingPlan.stops_model`,
`stops_rate`) ; en mode objectif le taux s'applique à la cible. `Prediction.moving_hours`,
`stops_hours`, `stops_rate` sont exposés ; le registre consigne le taux personnel de chaque
coupure quel que soit le modèle servi (`stops_rate_personal`, `stops_ref_hours`).

**Ce que B4 ne fait pas, par construction.** À taux constant, séparer mouvement et arrêts ne
change PAS le temps écoulé prédit : la régression sur la vitesse écoulée absorbe le facteur
1/(1 + r) dans son intercept (vérifié exactement par test en lien log). Ce que le levier
change : la répartition du plan (sur Nice, r̄ ≈ 0,11 h/h pour Val ⇒ ≈ 3,4 h d'arrêts sur
≈ 31 h de mouvement, contre 1 h 45 retranchées aujourd'hui : allures de segment plus rapides,
fenêtres de passage déplacées), le domaine de calibration (MIUT retenue), la décomposition de
la variance, et le central seulement par l'élasticité (à 32 h un athlète qui s'arrête plus
qu'à 13 h). Le banc juge donc le central sur `B4e` et la forme sur `tools/score_plan`.

**Ce qui est vérifié par test** (`tests/test_phase2_temps_reel.py`) : plateaux comptés au
seuil (300 s oui, 30 s non) ; base hors plateaux sans invention (pas de mesure ⇒ écoulé) ;
statistiques pondérées et repli population ; athlète de Riegel à arrêts constants retrouvé
(β, r̄, dispersion nulle), temps écoulé identique au modèle `carved`, LOO exacte, inverse
mouvement ↔ écoulé ; élasticité qui allonge une cible plus longue que la référence ;
dispersion des arrêts qui élargit l'écart-type ; modèle `spec` ; plan qui répartit les arrêts
personnels au prorata (base majeure × 3, rien à l'arrivée), y compris en mode objectif.

**Preuve au banc (2026-09-15, premier passage — INVALIDE, corrigé).** Variantes `B4`,
`B4e`, `B4spec`, `RB4`, `RB4C2` et recapture de Nice sous `RB4`. Le banc a rendu des temps
absurdes (13 vendus appariés : MAE 10,3 → 927 %, tous les verdicts basculés) et la cause est
lisible dans les registres : la base hors plateaux a retiré la seule garde qui écartait les
enregistrements quasi immobiles. Le plancher `genuine_min_ga_kmh` se lisait sur la vitesse de
la base servie — hors plateaux, un bivouac de 30 h avec 1 h de mouvement a une vitesse de
course. Entrants mesurés : Crasse, Chota 2025, 5 → 8 vrais ultras et taux d'arrêt 57 min par
heure de mouvement ; Coursières 2023, 1 → 4 et 498 min/h ; LUT 2021, 0 → 3 et 1 417 min/h ;
Lolo, Coursières hivernal, 1 → 2 et 1 843 min/h ; Val, Nice, 12 → 16 : un OFF de 38,3 h
avec 14,5 h d'arrêts et trois journées consécutives du 22 au 24 août 2026 à 12–15 h avec
2,8–3,3 h d'arrêts. Nice sous `RB4` : 35,85 h [29,24 – 43,95], 16 ultras, LOO 9,5 % dont
trois plis à −25/−32 % (les journées d'étape), taux 10,2 min/h contre 6,2 mesuré sur ses
courses. Ce n'est pas le modèle d'arrêts qui est jugé là, c'est un filtre cassé.

**Correctif.** Le plancher se lit sur la vitesse ÉCOULÉE dès qu'un modèle d'arrêts est servi
(`select_genuine_ultras`) : le domaine ne bouge pas avec B4 — mêmes ultras qu'en `carved`,
vitesse servie hors plateaux. MIUT reste dehors (5,48 contre 5,5 écoulés) : son cas relève du
plancher dépendant de la durée (backlog §9.11), pas de B4. Testé (bivouac 30 h / 1 h refusé,
course à 10 % d'arrêts retenue à sa vitesse hors plateaux, domaine identique). **Ce que le
premier passage dit quand même**, lu sur le banc de base (taux sur les vrais ultras de course,
médianes des coupures) : Val 6,2 min d'arrêt par heure de mouvement (5,7–9,4), Crasse 0,4
(0,3–0,7), Lolo 3,4 (2,5–7,6), Rapace 5,8 (2,7–7,2). Et `tools/score_plan` (§10.7) : répartir
les arrêts personnels au prorata de la politique n'améliore la forme du plan nulle part —
cas frais 1,89 → 1,89 % du temps (Lolo 2,45 → 2,44, Rapace 1,10 → 1,05), dev_set 2,21 → 2,74
(Crasse 2,18 → 2,98, Val 2,26 → 2,29). Chez Crasse, qui ne s'arrête pas, les 5 minutes de la
politique à chaque ravito jouaient le rôle d'un fade plus fort ; enlevées, la dérive réelle
apparaît nue (§10.7).

**Preuve au banc (second passage, 2026-09-15, garde rétablie).** Variantes `B4`, `B4e`,
`B4spec`, `RB4` ; Nice sous `RB4`. Le passage de base rend un `compare.md` sans écart (la
régression de §10.4 bis est fermée). « Taux population 0 » = recombinaison hors ligne des
registres (coupures `vc_e` reprises du banc sans arrêts) ; c'est la valeur adoptée pour
`stops_rate_population` (§ ci-dessous).

| variante | vendus MAE % (13 appariés) | biais % | couv 50 / 80 | Winkler rel 50 / 80 | largeur rel méd 50 / 80 |
|---|---|---|---|---|---|
| avant | 10,3 | +2,7 | 38 / 54 % | 0,342 / 0,570 | 8,1 % / 15,5 % |
| B4 (linéaire) | 11,2 | +3,7 | 31 / 54 % | 0,371 / 0,619 | 10,8 % / 16,2 % |
| B4, taux population 0 | 10,6 | +3,2 | 31 / 54 % | 0,349 / 0,568 | 10,8 % / 16,2 % |
| B4e (élasticité 0,5) | 11,6 | +4,2 | 31 / 54 % | 0,378 / 0,627 | 11,1 % / 16,6 % |
| B4spec | 10,8 | +4,6 | 46 / 62 % | 0,353 / 0,607 | 7,6 % / 14,5 % |
| R (référence, rappel) | 10,2 | +2,8 | 31 / 54 % | 0,342 / 0,558 | 8,1 % / 16,9 % |
| R + B4 | 10,9 | +3,7 | 31 / 62 % | 0,358 / 0,626 | 8,5 % / 20,4 % |
| R + B4, taux population 0 | 10,4 | +3,1 | 31 / 62 % | 0,335 / 0,575 | 8,5 % / 20,4 % |

Zone d'action (7 coupures `regression` vendues quelque part) : avant MAE 5,8, Winkler
0,691 / 0,963 ; R 6,6, 0,268 / 0,614, couv 71 / 86 % ; R + B4 6,9, **0,218 / 0,447**, couv
57 / **100 %**. Cas frais vendus (Lolo, blend) : 17,2 → 17,0 % ; MIUT (refusée avant)
passe 🔴 → 🟠 à +12,2 % sous B4 — la bande [24,3 – 34,7] remplace le repli MC [8,5 – 43,4].

| Nice 100M 2026 | référence (A2A1A3) | RB4 (second passage) |
|---|---|---|
| central / mouvement / arrêts | 34,33 / 34,33 / 0 (politique 1 h 45 retranchée au plan) | 34,18 / 30,36 / 3,82 |
| taux d'arrêt personnel (min par h de mouvement) | — | 7,6 (12 ultras, dispersion 0,044 en ln) |
| bornes de sécurité (largeur, % du central) | 29,83 – 39,52 (28 %) | 30,35 – 38,49 (24 %) |
| fourchette de course | 31,98 – 36,87 | 32,19 – 36,29 |
| LOO MAE (12 plis) / σ_log / sd_rel cible | 7,4 % / 0,074 / 0,119 | 6,2 % / 0,049 / 0,087 |

**Lecture.**
- **Le taux population inventait des arrêts** : en repli `vc_e` (aucun ultra), +6 % sur des
  centraux déjà trop lents (Val Ecotrail +23,8 → +31,2 %, Rapace Orcières +308 → +333). Avec
  0, B4 ne touche ni `vc_e` ni les blend à taux mesuré faible (Crasse : 0,4 min/h).
- **En régression, la décomposition tient sa promesse chez Val** : la vitesse hors plateaux
  est plus régulière que la vitesse écoulée (σ_log 0,074 → 0,049), la dispersion des arrêts
  revient à part (0,044) et le total est plus étroit : LOO 7,4 → 6,2 %, bornes 28 → 24 % du
  central, central −0,15 h. Sur la zone d'action, Winkler 0,614 → 0,447 au 80 % et couverture
  100 %. Mais sur les 13 vendus appariés (blend et vc_e compris), MAE 10,2 → 10,4 (Crasse
  Coursières 2026 +8,4 → +11,7 : la base hors plateaux redistribue ses points), Winkler 50
  meilleur (0,342 → 0,335), 80 moins bon (0,558 → 0,575), couverture 80 +1 cas. **Mixte.**
- **Élasticité** (`B4e`) : dégrade partout (MIUT +12 → +20 %, Val +15 → +16) ; Lavaredo
  (21 h) s'arrête MOINS que la moyenne de Val, MIUT plus — aucune loi commune. Rejetée.
- **`spec`** : plus rapide chez Val (−4,5 % de biais, par hasard sur ses cas 2024 trop lents),
  plus lent chez Crasse (+7,9 %) qui ne prend pas les 5 minutes de la politique. Rejeté.
- **La répartition des arrêts personnels dans le plan** (§10.7) est pire ou égale sur les
  30 courses, y compris avec le fade corrigé (cas frais 1,90 contre 1,77).

**Décision.** Défaut `carved` **non basculé** (règle b : MAE vendue non améliorée, règle d :
cas frais intacts). **Non activé pour le rapport de référence** : le gain sur la bande de Nice
(28 → 24 %) est réel mais le plan que ce modèle répartit est mesuré moins bon, et la règle du
chantier interdit de resserrer ce que la forme dément. `stops_rate_population` passe à 0 :
sans mesure, pas d'arrêts inventés. Ce qui reste acquis : le taux d'arrêt personnel de chaque
athlète est mesuré et consigné (Val 6,2 min par heure de mouvement, Crasse 0,4, Lolo 3,4,
Rapace 5,8) — matière de logistique pour le rapport v2 (Phase 6), pas du modèle de temps.

### 10.6 C2 — La nuit entre dans la régression, en écart à la nuit des ultras (flag `calibration.night_term`, défaut `none`)

**Constat (§10.0, point 0.3).** Les vrais ultras de calibration contiennent déjà de la nuit :
Val 32,7 % du mouvement (moyenne pondérée), Crasse 19,8, Lolo 26,4, Rapace 20,2 ; la cible Nice
en contient 43,2 % (plan réel, deux nuits : km 29 → 94 et dernier segment). Le modèle ne voit
rien de tout cela : la nuit de la cible n'ajuste ni le central ni les bandes, et le rapport
livré n'en parlait que par les drapeaux d'arrivée (« du km 38 au km 84 », une seule nuit).
Le seul terme honnête est un **différentiel** : la cible est plus nocturne que la moyenne des
ultras de l'athlète de ≈ +10 points ; le reste du facteur nuit est une redistribution.

**Correctif (flag).** `night_term=prior_shrunk` : chaque effort long porte sa part de nuit
(`ActivitySummary.night_share`, test jour/nuit du plan au fuseau solaire de la longitude —
la même mesure que la radiographie), et la régression gagne une quatrième colonne, l'écart de
part de nuit de l'ultra à la moyenne pondérée des vrais ultras (`night_deviations` ; un ultra
sans mesure est à l'écart nul). Le coefficient d est tiré vers `night_prior_log_per_share`
(0 par défaut : sans a priori, l'athlète apporte lui-même la preuve de son ralentissement
nocturne) par `night_shrink_lambda` pseudo-observations (2), dans le fit, la covariance
(4 × 4), l'écart-type de la cible (delta-méthode sur quatre coefficients) et chaque pli LOO
(moyenne recalculée sans le pli). La cible reçoit sa part de nuit du calendrier de course
(départ local, position, fuseau de la spec) intégrée sur le temps ÉCOULÉ prédit : le point
fixe est itéré (la nuit dépend du temps, qui dépend de la vitesse, qui dépend de la nuit), le
Monte-Carlo lit la part de nuit de chaque tirage sur une grille interpolée. Sans spec, écart
nul et prédiction inchangée. Terme de régression seulement (blend et vc_e ne le voient pas).
Au banc, les manifestes n'ont pas de spec : le calendrier d'une course est lu dans
l'activité du jour retenue pour les passages (départ, position médiane — des données de
course, pas une performance), consigné sous `race_meta` ; `--no-passages` le désactive.

**Ce qui est vérifié par test** : part de nuit mesurée sur un effort long (nuit de juin à
45° N, départ 22 h), absente sur une sortie courte ; écarts centrés sur la moyenne pondérée et
nuls sans mesure ; athlète synthétique ralenti de 20 % par unité de part de nuit retrouvé au
millième (d = −0,200, covariance 4 × 4, LOO exacte) ; prior fort qui impose sa valeur ; terme
inactif et signalé sans mesure ; une course de nuit prédite plus lente qu'une course de jour
sur le même athlète, part de nuit de la cible et écart exposés, bandes finies et emboîtées ;
sans terme de nuit le calendrier ne change rien.

**Preuve au banc (2026-09-15).** Variantes `C2` (prior 0, λ 2), `C2p` (prior −0,10, λ 5),
`RC2`, `RB4C2` (invalide, cf. §10.5) ; recapture de Nice sous `RC2`. Les manifestes n'ayant
pas de spec, le calendrier de chaque course vient de l'activité du jour (32 coupures sur 34
en portent un).

| variante | vendus MAE % (13 appariés) | biais % | couv 50 / 80 | Winkler rel 50 / 80 | largeur rel méd 50 / 80 | d aux dernières coupures (Val · Crasse · Lolo · Rapace) |
|---|---|---|---|---|---|---|
| avant | 10,3 | +2,7 | 38 / 54 % | 0,342 / 0,570 | 8,1 % / 15,5 % | — |
| C2 (lin., prior 0) | 10,3 | +2,7 | 31 / 54 % | 0,343 / 0,573 | 8,1 % / 15,5 % | +0,05 · −0,03 à −0,05 · −0,005 · −0,06 km/h par unité de part |
| C2p (lin., prior −0,7 km/h, λ 5) | 9,8 | +1,8 | 31 / 54 % | 0,360 / 0,578 | 8,8 % / 15,5 % | −0,70 · −0,76 à −0,85 · −0,67 · −0,77 |
| R (référence, rappel) | 10,2 | +2,8 | 31 / 54 % | 0,342 / 0,558 | 8,1 % / 16,9 % | — |
| RC2 (log, prior 0) | 10,2 | +2,8 | 31 / 54 % | 0,343 / 0,562 | 8,1 % / 16,7 % | +0,006 (Val, Nice) |

Zone d'action (6 coupures `regression` vendues quelque part) : avant MAE 6,7, Winkler
0,621 / 0,789 ; C2 6,8, 0,626 / 0,797 ; C2p 5,9, 0,515 / 0,682 ; RC2 6,1, 0,228 / 0,459
(R : 6,1, 0,220 / 0,405).

**Lecture.**
- **Sans a priori, la nuit ne dit rien.** Le coefficient mesuré est nul ou du mauvais signe :
  chez Val il est POSITIF (+0,05 km/h par unité de part de nuit ; en lien log sur Nice
  +0,006) — ses deux ultras les plus nocturnes (Saintélyon 2024, 71 % ; 19 septembre 2025,
  73 %) sont aussi ses plus rapides, des courses roulantes de nuit. À douze ultras, la part de
  nuit est confondue avec le type de course, et la colonne D+/km ne sépare pas roulant de
  technique. Aucun central ne bouge de plus de 0,7 %.
- **Avec un prior « littérature »** (−10 % à pleine nuit, λ 5), le prior fait tout le travail
  (d ≈ −0,7 km/h partout, les données n'y résistent pas) : MAE des 13 appariés 10,3 → 9,8,
  biais +2,7 → +1,8, mais Winkler 50 dégradé (0,342 → 0,360) et couvertures égales. Il aide
  les courses de JOUR, prédites plus vite que la moyenne nocturne de l'athlète (Crasse
  Coursières 2026 +8,4 → +3,5 %, Montagnhard 2026 +17,4 → +14,3, Rapace Nivolet +26 → +18)
  et dégrade les cibles nocturnes (Val Chianti −6,3 → +7,2, Lolo MIUT +0,6 → +3,9, Crasse
  Grand Trail du Lac −1,9 → −5,0). Sur Nice, la cible est plus nocturne que l'habitude de
  Val (46 % contre 33 %, écart +0,14) : ce prior l'allongerait d'environ 1,5 %, contre
  l'évidence de ses propres données.
- Les cas frais vendus (blend) ne bougent dans aucune variante.
- **Nice sous RC2** : 34,29 h [29,72 – 39,56], d = +0,006, part de nuit de la cible 46 %,
  moyenne des ultras 33 % : identique à la référence à 0,1 h près.

**Décision.** Défaut `none` **non basculé** ; **non activé pour le rapport de référence** :
les données de Val ne portent aucun ralentissement nocturne mesurable, et un prior de
population l'allongerait sans preuve. Le terme reste disponible ; il ne sera reconsidéré
qu'avec un prior mesuré sur plusieurs athlètes (Phase 4) et une colonne de roulance
(technicité) qui lève la confusion.

### 10.7 Fade — La dérive du plan vient des courses de l'athlète (flag `pacing.fade_source`, défaut `config`)

**Constat (§10.0, point 0.4).** Le plan livré sert un Δ fixe de 0,085 (−15,7 % début → fin)
pendant que le texte promet « la dérive contrôlée du plan est faite pour toi » ; la durabilité
mesurée (19 %) aurait donné 0,105. Le fade ne change pas le temps d'arrivée, il déplace les
passages : jusqu'ici aucun outil ne le jugeait, le banc ne notant que l'arrivée. La matière
existe depuis la Phase 0 : 293 heures de passage réelles sur 31 courses.

**Correctif (flag + outil).** `fade_source=splits` : chaque effort long porte son rapport des
moitiés (`ActivitySummary.half_split_ratio` : vga hors plateaux de la seconde moitié de Deq
÷ première) ; sur les vrais ultras, Δ_i = 2(1 − R_i)/(1 + R_i) (un fade linéaire 1 + Δ → 1 − Δ
donne des moitiés moyennes 1 ± Δ/2), moyenne pondérée récence × maximalité
(`fade_delta_from_splits`), bornée [0,04 ; 0,13] ; repli sur `durability` puis sur la
constante, et `PacingPlan.fade_source_used` dit ce qui a servi (le rapport le lit). L'outil
`tools/score_plan` rejoue, du registre seul (durabilité, Δ des moitiés et taux d'arrêt de
chaque coupure y sont consignés), la FORME du plan de chaque course à passages : parcours
comme au rapport, plan ANCRÉ SUR LE TEMPS OFFICIEL (l'erreur de total est retirée), trois
sources de fade × deux modèles d'arrêts, MAE des passages (minutes, % du temps) et biais signé
à mi-course (> 0 : l'athlète était en avance sur le plan). Cas frais (Lolo 7, Rapace 6
courses à passages) et cas de développement séparés : la forme se juge sur un cas refusé aussi
bien que sur un cas vendu — c'est une jauge indépendante du verdict de vente.

**Ce qui est vérifié par test** : rapport des moitiés d'une course à deux vitesses (0,8 hors
plateaux) ; Δ des moitiés pondéré, inconnu ou implausible ignoré ; chaîne de replis
splits → durability → config avec la source servie ; borne basse pour un athlète qui accélère ;
le scoreur retrouve exactement (MAE nulle) la forme qui a produit les passages et pénalise les
autres.

**Preuve au banc (2026-09-15).** `tools/score_plan` sur le registre enrichi : 30 courses à
passages (12 cas frais, 18 de développement), trois sources de fade × deux modèles d'arrêts,
plan ancré sur le temps officiel.

| groupe | fade | arrêts | n | MAE passages, % du temps | MAE, min | biais mi-course, min |
|---|---|---|---|---|---|---|
| cas frais | config | carved | 12 | 1,89 | 14,4 | +16,6 |
| cas frais | durability | carved | 12 | 2,02 | 15,2 | +18,8 |
| cas frais | splits | carved | 12 | 1,91 | 14,4 | +16,6 |
| cas frais | config | personal | 10 | 1,89 | 14,7 | +17,5 |
| cas frais | splits | personal | 10 | 1,87 | 14,5 | +17,6 |
| dev_set | config | carved | 18 | 2,21 | 17,7 | +24,9 |
| dev_set | durability | carved | 18 | 2,07 | 17,0 | +23,8 |
| dev_set | splits | carved | 18 | 1,80 | 14,1 | +17,4 |
| dev_set | config | personal | 14 | 2,74 | 21,9 | +29,0 |
| tous | config | carved | 30 | 2,08 | 16,4 | +21,6 |
| tous | splits | carved | 30 | 1,84 | 14,2 | +17,1 |

Par athlète (fade `config` → `splits`, arrêts `carved`) : Val 2,26 → 2,10 (biais +26 → +19 min),
Crasse 2,18 → 1,64 (+24 → +17), Lolo 2,45 → 2,35 (+25 → +22), Rapace 1,10 → 1,30 (+5 → +10).
Δ des moitiés mesuré, NON borné, médiane des coupures : Val 0,136, Crasse 0,245, Lolo 0,108,
Rapace −0,148 ; servi par `splits` après la borne [0,04 ; 0,13] : Val 0,13, Crasse 0,13,
Lolo 0,108, Rapace 0,04.

**Lecture.**
- **Le fait dominant n'est pas la source du fade, c'est son amplitude** : à mi-course les
  athlètes sont EN AVANCE sur le plan de 17 à 25 minutes, 27 courses sur 30, les quatre
  athlètes. Le plan part trop lentement et finit trop vite : la dérive réelle est plus forte
  que Δ = 0,085 (moitiés à −8 %) — Crasse ralentit de 22 % entre ses moitiés (Δ 0,245), Val de
  13 %, Lolo de 10 %. La borne haute 0,13 écrête Crasse à la moitié de sa mesure : `splits`
  réduit le biais (21,6 → 17,1 min) sans le fermer.
- `splits` gagne sur le dev_set (2,21 → 1,80, Crasse 2,18 → 1,64) et fait jeu égal sur les cas
  frais (1,89 contre 1,91 : Lolo mieux, Rapace moins bien). Rapace a un Δ mesuré NÉGATIF
  (il accélérerait) alors que son biais dit qu'il ralentit : le rapport des moitiés se lit sur
  le canal distance, haché chez lui (§9.11) — mesure non fiable pour cet athlète, la borne
  basse 0,04 l'a rattrapé.
- La répartition personnelle des arrêts n'aide nulle part (§10.5) ; chez Crasse, la politique
  du plan compensait par hasard la dérive manquante.

**Test d'amplitude (second passage, `tools/score_plan --set`, quelques secondes).**

| réglage du fade | arrêts du plan | cas frais (12) : MAE % · biais mi-course | dev_set (18) | tous (30) | Val (6) | Crasse (12) | Lolo (7) | Rapace (5) |
|---|---|---|---|---|---|---|---|---|
| Δ = 0,085 (défaut d'avant) | politique | 1,89 · +17 min | 2,21 · +25 | 2,08 · +22 | 2,26 · +26 | 2,18 · +24 | 2,45 · +25 | 1,10 · +5 |
| **Δ = 0,15** | politique | **1,77 · +6** | **1,68 · +13** | **1,72 · +10** | 2,00 · +14 | 1,52 · +13 | 2,18 · +13 | 1,20 · −3 |
| Δ = 0,20 | politique | 2,06 · −2 | 1,63 · +4 | 1,80 · +2 | 1,92 · +4 | 1,49 · +4 | 2,17 · +4 | 1,90 · −10 |
| `splits`, borne 0,30 | politique | 1,91 · +16 | 2,03 · +3 | 1,98 · +8 | 2,06 · +18 | 2,02 · −4 | 2,34 · +21 | 1,30 · +10 |
| `splits`, borne 0,50 | politique | 1,91 · +16 | 2,74 · −1 | 2,41 · +6 | 2,06 · +18 | 3,08 · −10 | 2,34 · +21 | 1,30 · +10 |
| Δ = 0,15 | personnels | 1,90 · +7 | 2,04 · +16 | 1,98 · +12 | 2,08 · +12 | 2,02 · +19 | 2,12 · +15 | 1,57 · −6 |

**Lecture.**
- **C'est l'amplitude, et une constante commune fait mieux que toute personnalisation.**
  Δ = 0,15 améliore les cas frais (1,89 → 1,77 % du temps, biais +17 → +6 min), le dev_set
  (2,21 → 1,68) et trois athlètes sur quatre (Rapace 1,10 → 1,20, biais −3 : il ralentit
  moins). Δ = 0,20 ferme le biais du dev_set mais dégrade les cas frais (Rapace 1,90, −10 min)
  — au-delà de 0,15 on paie sur ce qui est décisionnel. Les optimums par athlète vont de
  ≈ 0,12 (Rapace) à ≈ 0,20 (Val, Crasse, Lolo) : la personnalisation viendra des passages
  eux-mêmes (Phase 4), pas d'une mesure d'archive.
- **Le rapport des moitiés n'est pas le fade du plan** : libéré de sa borne, `splits` sert
  0,25 à Crasse et dégrade sa forme (1,64 → 2,02, puis 3,08 avec la borne 0,50 quand la
  mesure varie d'une coupure à l'autre). Ce que mesure une moitié de course contient le
  parcours, la météo, les arrêts ; ce que le plan répartit est un effort ajusté. Même verdict
  pour `durability` (2,02 sur les cas frais). Deux mesures livrées, aucune retenue.
- **Les arrêts personnels dans le plan restent en dessous de la politique** à Δ = 0,15
  (1,90 contre 1,77 sur les cas frais) : confirmation de §10.5.

**Décision.** Règle pré-enregistrée appliquée : la source qui minimise la MAE des passages
sur les cas frais sans dégrader le dev_set est **`config` avec Δ = 0,15** — **défaut basculé**
(`pacing.fade_delta` 0,085 → 0,15 ; `fade_delta_max` 0,13 → 0,20, la borne au-delà de laquelle
les cas frais se dégradent). Justification d'adoption : (a) le fade ne touche pas la
prédiction, le golden déterministe et le registre sont intacts, la dérive affichée par le
rapport passe de −16 % à −26 % ; (b) MAE de forme des cas frais 1,89 → 1,77 sur 12 courses de
deux athlètes ; (c) biais à mi-course +17 → +6 min ; (d) mesuré sur 30 courses, quatre
athlètes. `fade_source=splits` et `durability` restent des options mesurées, non retenues.
L'ancien 0,085 reste une valeur de config valide (`--set pacing.fade_delta=0.085`).

### 10.8 C3 — Chaleur et altitude déclarées (flag `prediction.environment_term`, défaut `off`)

**Constat.** Rien dans le modèle ne dit à quelle température ni à quelle altitude l'athlète
a couru ses ultras de calibration, ni ce qui l'attend. Sur Nice, départ à 1 593 m, cols à
2 700 m, arrivée au niveau de la mer ; les ultras de Val vont de la plaine (Ecotrail,
Chianti) aux Dolomites (Lavaredo). La chaleur n'est mesurable nulle part dans l'archive.

**Correctif (flag).** `environment_term=declared` : la vitesse de la cible est multipliée par
1 − coût, coût = `heat_cost_per_c` (0,004) × max(chaleur déclarée − 15 °C, 0) +
`altitude_cost_per_km` (0,05) × max(altitude moyenne du parcours − altitude moyenne pondérée
des vrais ultras, 0)/1000. La chaleur est DÉCLARÉE (`heat_c` de la spec) ; l'altitude vient de
la trace (grille lissée) et de l'archive (`ActivitySummary.mean_alt_m` sur les efforts longs,
`GenuineUltra.mean_alt_m`) — un différentiel, comme la nuit : courir plus bas ou plus frais que
d'habitude ne donne aucun bonus. Le facteur entre dans le point fixe (intercept en lien log,
échelle en linéaire), le Monte-Carlo et les bandes suivent ; la LOO ne le voit pas (conditions
des courses passées inconnues). Les coûts sont des ordres de grandeur population, écrits en
config, jamais appris ici. `Prediction.env_factor`, `env_detail` exposés.

**Ce qui est vérifié par test** : facteur 1 et détail vide par défaut ; 30 °C et +1 000 m
donnent 1 − 0,06 − 0,05 ; plus bas et plus frais ⇒ 1 ; temps allongé de f^(−1/(1+b)) sur un
athlète de Riegel, bornes qui suivent ; défauts intacts avec spec chaude et parcours haut.

**Preuve au banc (2026-09-15).** Variante `C3` : différentiel d'altitude seul (aucune chaleur
déclarée au banc), altitude moyenne de chaque parcours contre l'altitude moyenne pondérée
des vrais ultras de l'athlète à la coupure, 0,05 par 1 000 m.

| variante | vendus MAE % (13 appariés) | biais % | couv 50 / 80 | Winkler rel 50 / 80 | largeur rel méd 50 / 80 | coupures où le facteur < 0,99 |
|---|---|---|---|---|---|---|
| avant | 10,3 | +2,7 | 38 / 54 % | 0,342 / 0,570 | 8,1 % / 15,5 % | — |
| C3 | 11,8 | +4,3 | 23 / 46 % | 0,374 / 0,596 | 8,3 % / 15,9 % | 9 sur 30 |

Par coupure : Val Lavaredo (facteur 0,935) +1,0 → +8,3 % ; Crasse Montagnhard 2026 (0,958)
+17,4 → +23,9, sort des bornes de sécurité ; Montagnhard 2023 (0,968) +2,0 → +6,2 ; Chota
(0,941) −10,1 → −3,3, la seule amélioration ; Val Coursières 50k (0,973) +8,6 → +12,4 ; Lolo
MIUT (0,983) +0,6 → +2,8 ; Rapace Nivolet (0,986) +26 → +28. Cas frais vendus intacts.

**Lecture.** Un coût d'altitude en écart à l'habitude de l'athlète n'a aucun appui dans ces
données : ses ultras de calibration couvrent déjà les altitudes où il court, et le central
étant biaisé vers le lent (+3 à +6 % sur la zone d'action), toute pénalité supplémentaire
aggrave. La chaleur, elle, n'est mesurable nulle part dans l'archive : le terme resterait une
déclaration sans preuve possible.

**Décision.** Défaut `off` **non basculé**, **non activé pour le rapport de référence**. Le
flag reste pour une chaleur déclarée par le client, avec son coût population affiché comme
tel ; le différentiel d'altitude est rejeté sur ce banc.

### 10.9 Bilan de la Phase 2 — un défaut basculé (le fade), trois leviers mesurés et non retenus

| levier | flag | banc | décision |
|---|---|---|---|
| B4 arrêts (mouvement + arrêts) | `calibration.stops_model` | mixte : Nice 28 → 24 % de bande, LOO 7,4 → 6,2 %, mais MAE vendue 10,2 → 10,4 et plan moins juste | défaut `carved`, non activé pour Val ; taux personnels consignés pour la logistique ; `stops_rate_population` = 0 |
| C2 nuit | `calibration.night_term` | coefficient nul ou positif sans prior, confusion avec le type de course ; prior population : aide le jour, dégrade la nuit | défaut `none`, non activé |
| Fade | `pacing.fade_delta` | athlètes en avance sur le plan de 17–25 min à mi-course, 27 courses sur 30 ; Δ 0,15 meilleur sur cas frais, dev_set et 3 athlètes sur 4 | **défaut 0,085 → 0,15**, borne 0,20 ; `splits` et `durability` mesurés, non retenus |
| C3 environnement | `prediction.environment_term` | différentiel d'altitude : 8 coupures sur 9 dégradées | défaut `off`, non activé ; chaleur déclarée possible, jamais benchable |

**Configuration de référence** : inchangée (A2A1A3, §10.4) ; le nouveau Δ s'applique à tous
les rapports. Nice 100M 2026 : 34,33 h, fourchette 31,98 – 36,87, sécurité 29,83 – 39,52 ;
plan à dérive −26 % (au lieu de −16 %), arrêts de la politique (1 h 45).

**Ce que la Phase 2 a appris de général.** (1) Le banc de base a servi de garde deux fois :
une régression de bandes (§10.4 bis) et un filtre cassé (§10.5) — c'est lui, pas les tests,
qui les a vus. (2) Une mesure d'archive n'est pas un paramètre du plan : le rapport des moitiés
et le découplage disent quelque chose de l'athlète, pas ce que le plan doit lui faire faire ;
seuls les passages réels jugent le plan. (3) Les leviers de la calibration n'atteignent pas les
cas frais vendus (régime blend) : la jauge décisionnelle reste à construire (Phase 4).

**Ce qui passe en Phase 3** : le biais du central (+4 à +6 % trop lent sur la zone d'action,
+13 % sur Val 2024 : progression et récence), le plancher de vitesse dépendant de la durée
(MIUT à 5,48 contre 5,5), la queue des courses les plus longues (B2) et la courbe d'efficacité
(B1), avec le scoreur de plan et le banc comme juges.

### 10.10 B1 — Efficacité-durée : la pente au-delà de 6 h lue sur toutes les sorties avec FC (flags `calibration.duration_prior_source=efficiency`, `calibration.envelope_tail=efficiency` ; défauts `twin_alpha`, `alpha`)

**Constat.** Trois sources portent la pente en durée, aucune ne regarde la zone 6–35 h :
l'exposant α de la courbe record (30 min–6 h, efforts pas tous maximaux au-delà de 2 h), la
régression sur 3 à 12 ultras (plage de ln T de 0,1 à 0,7), et le prior A1 qui recopie le
premier dans la seconde. Sur le cas de référence α = 0,143 contre une pente observée −0,06 :
le prior tire vers le lent (+4 à +6 % sur la zone d'action, §10.4). En blend et vc_e — tous
les cas frais vendus, Val 2024 à +13 % — l'enveloppe prolonge α jusqu'à 35 h sans autre
information (§10.9, leçon 3).

**Mesure (jumeau, toujours calculée, servie derrière flag).** `Twin.alpha_eff` : sur les
efforts avec FC d'au moins 1 h (`twin.efficiency_min_hours`), ln(vga ÷ (FC − FC0)) =
c − α_eff·ln T, pondéré par récence (même demi-vie que la calibration). La vitesse par
battement de réserve cardiaque ne dépend de l'intensité qu'au second ordre : sa décroissance
avec la durée est l'usure à effort donné, mesurée sur des centaines de sorties et non sur
une poignée de vrais ultras. FC0 : déclarée (`twin.efficiency_hr_rest`) ou profilée — la
valeur de 40 à 100 bpm qui minimise le résidu de l'ajustement, une FC0 fausse laissant dans
le résidu une composante liée à la FC de chaque effort ; profil plat (moins de 2 %) ⇒ 60 bpm,
signalé. Limites dites avant mesure : (1) la dérive cardiaque et les arrêts (base écoulée)
entrent dans α_eff — cohérent avec la base des ultras de la régression ; (2) l'intensité
soutenable décroît elle aussi avec la durée, ce qu'α_eff ne voit pas : α_eff sous-estime la
pente MAXIMALE. C'est donc le banc, pas l'argument, qui dit si l'information vaut mieux
que l'α court.

**Correctif (flags).** `duration_prior_source=efficiency` : le prior A1 tire b vers −α_eff
(repli α historique, puis population ; origine consignée). `envelope_tail=efficiency` : en
blend et vc_e, l'enveloppe décroît en t^−α_eff au-delà de 6 h (raccord continu à
`endurance_window_s[1]`) ; le recalage du blend lit la même enveloppe, si bien qu'à la durée
de l'ultra recalant, sa vitesse est rendue à l'identique. Registre : `model.alpha_eff`,
`alpha_eff_n`, `duration_prior_origin`, `envelope_tail_alpha`. Tests : recouvrement exact à
FC0 déclarée, FC0 profilée retrouvée, enveloppe continue au raccord et recalage conservé,
replis honnêtes (exposant absent ⇒ α historique ⇒ population, chacun signalé).

**Preuve au banc (2026-09-16, `tools/banc`, 4 manifestes, 30 courses ; variantes `E1` sur
défauts, `RB1` sur la pile de référence R = A2A1A3 ; recapture `nice-RB1.json`).** Le banc de
base est identique au « avant » (compare.md sans écart : défauts inchangés). Les exposants
mesurés, par athlète et par coupure (registre `model.alpha_eff`, n = efforts avec FC ≥ 1 h) :

| athlète | α (30 min–6 h) | α_eff, première coupure → dernière | ce que ça dit |
|---|---|---|---|
| Val | 0,13–0,21 | 0,034 (n 56, 2024-03) → 0,065 (n 200, 2025-06) ; 0,067 aujourd'hui | à effort donné, Val décline moitié moins que sa courbe record courte ne le dit |
| Crasse | 0,17–0,18 | 0,50 (n 199, 2021) → 0,17 (2024) → 0,13 (n 686, 2026) | l'exposant se stabilise quand les efforts longs s'accumulent ; en 2021 il ne mesurait que 1 à 3 h |
| Lolo | 0,30–1,32 | 0,65 (n 87, 2022) → 0,29 (2023) → 0,20 (n 300, 2026) | même convergence, sur un athlète dont l'α court est absurde (1,3) |
| Rapace | 0,19–0,37 | absent (aucune FC) | le levier ne le touche pas : repli α, signalé |

Treize cas vendus de base, appariés (même liste quel que soit le verdict de la variante) :

| variante | MAE % | biais % | couv 50 / 80 | Winkler rel 50 / 80 | largeur rel méd 50 / 80 |
|---|---|---|---|---|---|
| base (défauts) | 10,3 | +2,7 | 38 / 54 % | 0,342 / 0,570 | 8,1 / 15,5 % |
| E1 (défauts + queue efficacité) | 9,0 | +1,9 | 38 / 69 % | 0,287 / 0,507 | 8,3 / 15,8 % |
| R (A2A1A3, §10.4) | 10,2 | +2,8 | 31 / 46 % | 0,345 / 0,552 | 12,5 / 19,1 % (zone) |
| RB1 (R + prior efficacité + queue) | **8,6** | +1,7 | 31 / **77 %** | 0,281 / **0,485** | 8,2 / 16,9 % |

Par athlète (appariés) : Val 12,9 → 8,6 (E1) et 9,0 (RB1) contre 14,1 sous R, couverture 80
50 → 75 %, Winkler 80 0,773 → 0,542 ; Crasse 6,8 → 6,7 (E1) et 5,9 (RB1, comme R),
Winkler 80 0,296 → 0,265, couverture 80 71 → 100 % au prix d'une largeur 13,4 → 20,7 % ;
Lolo (les deux cas frais vendus, blend) 17,2 → 17,4 : Nice 50k −18,1 → −16,3, UTSM −16,4 →
−18,5 — le premier levier qui atteint ces cas les laisse à leur biais ; Rapace inchangé (pas
de FC). Val 2024 et zone d'action (erreur du central, base → E1 / RB1 ; R rappelé) :

| coupure (réel) | base | E1 | R | RB1 |
|---|---|---|---|---|
| Val · Ecotrail 2024 (10,46 h, vc_e) | +23,8 | **+6,9** | +23,8 | **+6,9** |
| Val · Coursières 50k 2024 (6,05 h, blend, hors domaine) | +8,6 | +13,5 | +8,6 | +13,5 |
| Val · GRF 2024 (11,29 h, blend) | +21,0 | +20,9 | +21,0 | +20,9 |
| Val · Saintélyon 2024 (11,07 h, blend) | +5,6 | +5,6 | +5,6 | +5,6 |
| Val · Chianti 2025 (20,48 h) | −6,3 | −6,3 | +3,8 | **+0,6** |
| Val · Lavaredo 2025 (21,24 h) | +1,0 | +1,0 | +6,1 | +2,5 |
| Crasse · Nice 100M 2024 (26,16 h) | +5,1 | +5,1 | −0,5 | −0,6 |
| Crasse · Chota 2025 (4,93 h) | −10,1 | −10,1 | −8,3 | −7,4 |
| Crasse · Grand Trail du Lac 2025 (10,38 h) | −1,9 | −1,9 | 0,0 | +1,7 |
| Crasse · Coursières 100k 2026 (13,29 h) | +8,4 | +8,4 | +8,4 | +8,0 |
| Crasse · Montagnhard 2026 (16,07 h) | +17,4 | +17,4 | +17,7 | +16,8 |
| Lolo · MIUT 2026 (25,82 h) | +0,6 | +0,6 | +9,4 | +0,5 |
| Rapace · Nivolet-Revard 2026 (7,43 h) | +26,3 | +26,3 | +21,1 | +21,1 |

Le biais du central de la zone d'action, +4 à +6 % sous R, tombe à +1 à +2 % sous RB1 (Val
Chianti +3,8 → +0,6, Lavaredo +6,1 → +2,5, MIUT +9,4 → +0,5) : le prior A1 tirait vers le
lent parce que l'α court est trop fort ; l'α d'efficacité-durée, plus doux, est celui que la
pente observée demandait. Ecotrail 2024 (vc_e) passe de +23,8 à +6,9 % : la queue de
l'enveloppe à 0,034 corrige l'extrapolation de l'α court 0,21. GRF 2024 ne bouge pas (blend
recalé sur un ultra : l'enveloppe n'y compte que pour la forme).

**Ce que le banc a aussi montré, et qui interdit un défaut.** (1) Les cas frais vendus ne
bougent pas (17,2 → 17,4) : la règle « jamais sur dev_set seul » n'est pas satisfaite. (2)
Sous E1 (défauts), Crasse · Lut 36k 2021 (3,5 h réels, prédite 9,76 h) passe de 🔴 à 🟠 : la
garde du domaine de calibration lit le temps PRÉDIT contre 10 h, et la queue d'enveloppe
déplace ce temps à 10,06 h — la garde lâche un cas à +185 % d'erreur. Ce n'est pas B1 qui
vend ce cas, c'est une garde qui tient à un seuil sur la prédiction au lieu de lire la
demande du parcours ; consigné pour le chantier « trails courts » (§9.9), rien de changé ici.

**Cas de référence (recapture `nice-RB1.json`)** : central **32,43 h** (34,33 sous R : −1,9 h ;
31,89 sous A2 sans prior), fourchette 30,48 – 34,50 (12 %), sécurité 28,69 – 36,65 (25 % ;
asymétrie −3,7 / +4,2 h), LOO 6,4 % (interpolation 7,4, extrapolation 3,2 ; 7,4 / 8,0 / 5,1
sous R), levier 0,90, sd_rel 0,103 (0,93 / 0,119 sous R), κ 0,85, ν 8,1, prior b −0,067
(efficacité, λ 2), β (2,289, −0,065, −0,0046). Les 12 vrais ultras et le jumeau (VC 9,748,
E 1,167, durabilité 19,1 %) sont ceux de R.

**Décision.** Défaut non basculé (cas frais neutres, garde du domaine). **Activé pour le
rapport de référence** : `examples/twin.config.reference.json` porte désormais
`calibration.duration_prior_source=efficiency` et `calibration.envelope_tail=efficiency`
(cinq clés), consigné « activé pour Val, défaut non basculé » — mieux ou égal sur trois
athlètes (Val, Crasse, Lolo), sans effet sur le quatrième. La combinaison avec P (`RB1P`) est
rejetée avec P (§10.12).

### 10.11 B2 — Queue de la courbe record : les fenêtres de 10 à 36 h des plus longues courses (flags `calibration.duration_prior_source=record_tail`, `calibration.envelope_tail=record_tail` ; défauts inchangés)

**Constat.** La courbe record s'arrête à 8 h : les meilleures fenêtres de 10, 12, 16, 20,
24 h — ce qu'un athlète a réellement soutenu au cœur de ses plus longues courses — ne sont
lues nulle part, alors qu'elles sont la seule mesure directe de la zone où la cible se
trouve. Un 24 h fournit un point à 20 h, un 21 h un point à 16 h.

**Mesure (jumeau, toujours calculée).** `twin.record_tail_durations_s` (10, 12, 14, 16, 20,
24, 30, 36 h) : la meilleure fenêtre de vitesse ajustée est mesurée dans chaque activité
comme les durées historiques, mais rangée à part (`RecordCurve.tail_points`) : VC, α
historique et figure du rapport ne la voient pas. N'y contribuent que les efforts qui
passent le filtre « vrai ultra » servi (`genuine_gate_failures`) : un bivouac, un OFF avec
sommeil ou un enregistrement immobile n'y fournissent aucune fenêtre. Même règle de support
que le reste de la courbe (N-ième meilleure). `Twin.alpha_tail` = pente log-log des points
historiques ≥ `record_tail_from_s` (2 h) et de la queue ; None sans fenêtre longue.
Limite dite : la meilleure fenêtre de 12 h dans un 20 h est sous-maximale (l'athlète gérait
20 h), donc α_queue est plus DOUX que la vraie pente maximale — direction contraire au
prior A1, ce que le banc mesure.

**Correctif (flags).** Mêmes deux entrées que B1 avec `record_tail` : prior de b tiré vers
−α_queue, enveloppe des replis en t^−α_queue au-delà de 6 h. Registre : `model.alpha_tail`,
`alpha_tail_n`. Tests : exposant retrouvé sur une courbe synthétique, None sans fenêtre
longue, la queue ne vient que des vrais ultras (support 2, bivouac exclu), fenêtres
absentes sur une sortie courte.

**Preuve au banc (2026-09-16 ; variantes `E2` sur défauts, `RB2` sur R ; recapture
`nice-RB2.json`).** α_queue mesuré (registre `model.alpha_tail`, n = points de 2 h à la plus
longue fenêtre) : Val 0,20–0,34 (dernière coupure 0,22, n 12), Crasse 0,22–0,26 (0,24, n 13),
Lolo 0,38–0,40 (n 12), Rapace 0,13–0,19 (n 10) ; absent chez tous avant leur première course
de 10 h et plus (pas de fenêtre longue). La limite annoncée était à contresens : α_queue est
plus RAIDE que l'α court (0,22 contre 0,14 chez Val, 0,40 contre 0,30 chez Lolo), pas plus
doux — les fenêtres de 2 à 8 h sont les meilleures portions de courses fraîches, les fenêtres
de 10 à 24 h sont des courses entières avec leurs arrêts et leur nuit ; la pente qui les
joint est celle de l'usure d'une course, pas celle du plafond à durée donnée.

| variante | 13 vendus appariés : MAE / biais / couv 80 / Winkler 80 | Lolo frais | zone d'action |
|---|---|---|---|
| base | 10,3 / +2,7 / 54 % / 0,570 | −18,1 · −16,4 | Chianti −6,3, Lavaredo +1,0, MIUT +0,6 |
| E2 | 11,1 / +3,4 / 54 % / 0,630 | −19,7 · −16,4 | inchangée (régression sans prior) |
| R | 10,2 / +2,8 / 46 % / 0,552 | −18,1 · −16,4 | Chianti +3,8, Lavaredo +6,1, MIUT +9,4 |
| RB2 | 12,1 / +4,1 / 62 % / 0,641 | −19,7 · −16,4 | Chianti +10,5, Lavaredo +11,1, MIUT +23,4, Crasse GTL 🟢 → 🔴 |

Val 2024 : Ecotrail inchangé (pas de fenêtre longue avant mars 2024 : repli α), GRF +21,0 →
+28,0. Recapture de Nice sous RB2 : 36,68 h, sécurité 30,95 – 43,46 (34 %), LOO 8,7 %, prior
b −0,219. **Rejeté** : plus lent partout où il agit, bandes plus larges, un vendu de moins.
La mesure reste au registre (elle décrit l'usure en course de chaque athlète, information
pour la Phase 4, pas pour la pente) ; les flags restent, défaut inchangé, non activé.

### 10.12 P — Niveau de l'époque : chaque ultra ramené à la forme actuelle par la VC de son année (flag `calibration.level_anchor`, défaut `none`)

**Constat.** Le biais de progression (Crasse Montagnhard +17 %, Val 2024 +13 %, §10.0
lecture 3) résiste à la demi-vie (§5.x : inerte de 180 à 730 j) et le terme de tendance a été
écarté pour la même raison — un quatrième paramètre sur trois points. L'information qui
manque n'est pas dans les ultras : elle est dans les centaines d'efforts courts de chaque
saison, qui datent le niveau de l'athlète bien plus finement que trois courses.

**Correctif (flag).** `level_anchor=vc_epoch` : pour chaque candidat ultra, la VC de son
époque est ajustée (sans bootstrap) sur la courbe record des `level_anchor_window_days`
jours qui le précèdent (`Twin.level_marks`, par date, calculée depuis les contributions déjà
décodées : aucun re-décodage, aucune fuite au banc puisque la coupure filtre les
contributions avant). La vitesse de l'ultra entre dans la régression ramenée au niveau
actuel : ln v + gain × ln(VC_now ÷ VC_époque) (`level_anchor_gain`, 1 par défaut ;
multiplicatif en lien linéaire). Zéro paramètre de régression ajouté. Le même décalage
sert au recalage du blend et à chaque pli LOO, qui prédit l'ultra retiré À SON ÉPOQUE
(décalage retiré du point fixe) et le compare au réel de l'époque : la LOO reste honnête.
Sans VC d'époque plausible, décalage nul et compté à part ; sans VC actuelle plausible,
terme inactif et signalé. Les poids de maximalité lisent toujours la vitesse courue contre
l'enveloppe actuelle (un vieil ultra progressé reste moins « maximal » qu'aujourd'hui) :
documenté, pas corrigé. Registre : `model.level_n_anchored`, `level_shift_mean_pct`.
Tests : athlète synthétique progressant de 12 % en deux ans — plan actuel retrouvé au
bit près, LOO exacte ; sans recalage, central trop lent et LOO > 1 % ; VC plate ⇒
identique au défaut ; gain 0,5 ⇒ moitié du décalage ; VC d'époque lue sans fuite dans la
fenêtre qui précède la date.

**Risque assumé.** La VC des efforts de 10 à 90 min peut ne pas suivre la forme d'ultra
(un bloc de vitesse monte la VC sans changer l'endurance). La règle « jamais sur un seul
athlète » s'applique : Crasse et Val ont assez d'ultras datés pour trancher, Lolo et Rapace
disent si le levier casse quelque chose ailleurs.

**Preuve au banc (2026-09-16 ; `RP` et `RPh` (gain 0,5) sur R, `RB1P` combinée ; recapture
`nice-RP.json`).** Tous les ultras de toutes les coupures ont trouvé une VC d'époque (aucun
décalage nul), et c'est là que le levier casse : la VC d'époque n'est pas un niveau.

| variante | 13 vendus appariés : MAE / biais / Winkler 80 | Lolo frais | Val Chianti · Lavaredo | Crasse Maquisards 2024 |
|---|---|---|---|---|
| R | 10,2 / +2,8 / 0,552 | −18,1 · −16,4 | +3,8 · +6,1 | −5,6 |
| RP | 16,2 / −2,9 / 1,348 | −34,1 · −45,9 | +7,4 · +10,1 | −25,5 |
| RPh | 13,2 / −0,3 / 0,956 | −26,3 · −33,0 | +5,6 · +8,1 | −16,3 |
| RB1P | 13,7 / −3,9 / 1,243 | −32,3 · −46,0 | +3,9 · +6,1 | — |

Les décalages mesurés disent le mécanisme : Lolo · UTSM 2023, l'unique ultra du blend est
« recalé » de **+44,6 %** (sa VC des 12 mois précédents vaut les deux tiers de sa VC à la
coupure) et la prédiction passe de −16,4 à −45,9 % ; Crasse · Trace des Maquisards 2024,
+24,1 % de décalage moyen, −5,6 → −25,5 % ; Val, décalages **négatifs** de −2 à −10 % (sa VC
d'aujourd'hui est sous celle de 2024–2025), Chianti −6,3 → +7,4, Lavaredo +1,0 → +10,1, Nice
36,71 h (sécurité 31,23 – 43,14, LOO 8,8 %). Trois athlètes sur quatre dégradés ; Rapace
seul s'améliore (+29 → +7,5, +36 → +9), sur un cas 🔴 et une VC sans FC. Verdicts : trois
vendus perdus (Crasse Montagnhard 2026 et Nice 2024, Lolo Nice 50k). Le gain 0,5 divise les
dégâts par deux, il ne change pas le signe.

**Pourquoi.** La VC d'une fenêtre de 12 mois dépend de ce que l'athlète a couru de court et
de plat cette année-là (courses de 10 à 90 min, blocs de vitesse), pas de sa forme d'ultra :
elle bouge de 20 à 45 % là où les ultras, eux, n'ont pas bougé. Le §5.x l'avait dit
autrement : la progression ne se lit pas dans ce que le moteur mesure aujourd'hui.
**Rejeté** ; flag conservé (la mécanique fit / blend / LOO est juste et testée), défaut
inchangé, non activé. La voie qui reste pour le biais de progression est celle du §5.x :
la cohorte et les passages de la Phase 4.

### 10.13 F — Plancher de vitesse dépendant de la durée et garde du plus long arrêt (flags `calibration.genuine_floor=riegel`, `calibration.genuine_max_stop_s` ; défauts `fixed`, 0)

**Constat.** Le plancher 5,5 km/h est le même à 10 h et à 26 h ; Lolo/MIUT (25,8 h, sa plus
longue course) sort de la calibration à 5,48 (§10.0, §10.5). Un plancher qui décroît avec la
durée laisserait entrer les OFF avec sommeil de Val (26,9 h et 38,3 h), que le plancher fixe
écartait à raison (§9.11) : il faut une seconde garde, physique — personne ne s'arrête plus
d'une heure d'affilée dans une course.

**Correctif (flags).** `genuine_floor=riegel` : plancher = 5,5 × (T ÷ 10 h)^−α_plancher
(`genuine_floor_alpha` = 0,16, l'α population de A1) : 5,5 à 10 h, 4,73 à 25,8 h, 4,45 à 38 h,
jamais au-dessus de 5,5 ; lu sur la vitesse ÉCOULÉE quel que soit le modèle d'arrêts
(§10.5). `genuine_max_stop_s` (0 = off ; 3 600 s au banc) : un effort dont le plus long plateau
de distance dépasse le seuil est écarté (`ActivitySummary.longest_stop_s`, mesuré sur toutes
les activités ; un vieil agrégat sans la mesure n'est jamais écarté par cette garde). Une
seule définition du domaine, `genuine_gate_failures`, sert la calibration, la queue de la
courbe record (§10.11) et les deux outils de diagnostic (`diag_archive`, `diag_ultras`), qui
impriment désormais le plancher servi et le plus long arrêt. Registre : `model.genuine_floor`,
`n_genuine`. Tests : valeurs du plancher ; MIUT retenu, OFF de 38 h à 4,6 km/h retenu par le
plancher seul et écarté par la garde, bivouac et 10 h à 5,4 dehors partout ; raisons lisibles.

**Effet attendu et mesure.** Ce levier ne change une coupure que si la plus longue course
d'un athlète précède cette coupure et se trouve entre les deux planchers : sur le banc, il
touche Lolo après MIUT (aucune coupure vendue) et rien d'autre a priori — le `--compare`
dit si `n_genuine` bouge quelque part. Sa valeur est d'abord celle du PROCHAIN rapport de
Lolo : sa plus longue course entre en calibration au lieu d'être ignorée pour 0,02 km/h.

**Preuve au banc (2026-09-16 ; `F` sur défauts, `RF` sur R ; recapture `nice-RF.json`).**
Une seule coupure change de domaine : Lolo · MIUT 2026, 5 → 6 vrais ultras (un effort de
Lolo entre les deux planchers entre en calibration avant MIUT). Erreur du central : +0,6 →
+3,0 % sous F (défauts), +9,4 → +4,7 % sous RF (contre R). Rien d'autre ne bouge au banc
(13 vendus appariés : 10,3 → 10,3 sous F ; RF = R au chiffre près sauf MIUT). Recapture de
Nice sous RF : 13 vrais ultras au lieu de 12 — entre un effort du 2026-08-22 (15,5 h,
62 km, 4 782 m D+, 5,35 km/h écoulés contre un plancher de 5,13 à cette durée, 3 h 16
d'arrêts, altitude moyenne 1 740 m), dont le pli LOO vaut −18 % : ce n'est pas une course
mais une journée de montagne, que le plancher fixe écartait et que la garde du sommeil ne
voit pas (aucun plateau d'une heure). Central 34,38 h (34,33 sous R), sécurité 29,85 –
39,60, LOO 7,4 % (extrapolation 5,1 → 6,3).

**Décision.** Le levier fait ce qu'il doit sur le cas d'école (MIUT) et laisse entrer ce
qu'il ne doit pas chez Val : la garde du sommeil ne suffit pas à dire « course ». Défaut
inchangé, non activé ; flags conservés. Ce qui manque est un signal de course, pas de
vitesse : la Phase 4 (données publiques de la course) saura dire qu'un effort est une
course inscrite — c'est là que le plancher dépendant de la durée trouvera sa garde.

### 10.14 Bilan de la Phase 3 — un levier activé pour la référence (B1), trois mesurés et non retenus

| levier | flags | banc | décision |
|---|---|---|---|
| B1 efficacité-durée | `duration_prior_source=efficiency`, `envelope_tail=efficiency` | 13 vendus : MAE 10,3 → 8,6, Winkler 80 0,570 → 0,485, couverture 80 54 → 77 % ; zone d'action +4 à +6 % → +1 à +2 % ; Val Ecotrail +23,8 → +6,9 ; cas frais neutres (17,2 → 17,4) | défaut non basculé ; **activé pour le rapport de référence** |
| B2 queue de la courbe record | `…=record_tail` | plus raide que l'α court, plus lent partout, bandes plus larges | rejeté ; mesure conservée au registre |
| P niveau de l'époque | `level_anchor=vc_epoch` | trois athlètes sur quatre dégradés, décalages de −10 à +45 % sans rapport avec la forme d'ultra | rejeté |
| F plancher dépendant de la durée | `genuine_floor=riegel`, `genuine_max_stop_s` | MIUT +9,4 → +4,7 sous R ; une journée de montagne de Val entre en calibration | non retenu ; attend un signal de course (Phase 4) |

**Configuration de référence** : A2A1A3 + B1 (cinq clés). Nice 100M 2026 : **32,43 h**,
fourchette 30,48 – 34,50, sécurité 28,69 – 36,65 (25 %), LOO 6,4 % ; plan à dérive −26 %,
arrêts de la politique. Le central a bougé de −1,9 h par rapport à R : le prior sur la
pente reste, sa source change — l'exposant lu sur des centaines d'efforts à effort donné
(0,067) remplace celui de la courbe record courte (0,143), et il est du côté que douze
ultras réclamaient.

**Ce que la Phase 3 a appris de général.** (1) L'information sur la pente au-delà de 6 h
existe dans l'archive, mais une seule des deux lectures est la bonne : la vitesse par
battement de réserve cardiaque (à effort donné) porte sur la pente ; les fenêtres
longues portent sur l'usure en course. (2) La VC d'une année n'est pas le niveau d'un
athlète : elle mesure sa pratique courte. (3) Le domaine de calibration a besoin d'un
signal de course, pas d'un plancher plus fin — et la garde du domaine, qui lit un temps
prédit contre 10 h, tient à un seuil. (4) Les cas frais vendus restent au même biais sous
tous les leviers : ce qui les fera bouger n'est plus dans l'archive de l'athlète.

**Ce qui passe en Phase 4** : les données publiques de la course (B3, import CSV manuel
d'abord) — signal de course pour le domaine, passages réels pour le fade par athlète,
cohorte pour la jauge décisionnelle ; la garde du domaine à reprendre sur la demande du
parcours ; le golden réel §12 à recapturer sur l'archive fraîche à la clôture du chantier.

**Phase 4 abandonnée (2026-09-16, décision de Valentin : pas d'export CSV par course).** Le
signal de course, le fade appris du terrain et la garde du domaine sur la demande du parcours
restent au backlog ; la suite est la Phase 5, le coût de pente personnel (C1).

### 10.15 C1 — Coût de pente personnel : le surcoût de Minetti à l'échelle de l'athlète (flag `calibration.slope_cost`, défaut `minetti`)

**Constat.** Chaque seconde d'archive et chaque mètre de parcours passent par la même loi fixe
(Minetti 2002) : un mètre à la pente i vaut f(i) mètres à plat, pour tout le monde. La seule
correction personnelle est le terme de terrain de la régression, β2·D+/km, identifié sur 3 à
12 ultras et tiré vers un prior population négatif (−0,0170 km/h par m/km, −0,0027 en log) :
les ultras vallonnés sont plus lents en vitesse ajustée que les plats, donc la loi crédite
trop la pente à allure d'ultra, ou pas assez la descente. Ce qui manque n'est pas un autre
prior sur trois points : c'est la mesure, sur les centaines d'heures de pente avec FC de
chaque archive, de combien CET athlète est plus lent en montée et plus rapide en descente
que sur le plat à effort égal.

**Mesure (jumeau, toujours calculée ; servie derrière flag).** Au décodage, pour chaque
seconde en mouvement avec FC ≥ 100 bpm et pente exploitable, la vitesse brute et la FC lue
30 s plus tard (`twin.slope_hr_lag_s`, retard de la réponse cardiaque) sont sommées par
tranche de pente de 2,5 % jusqu'à ±30 % (`ActivitySummary.slope_bins` : secondes, Σ ln v,
Σ ln(FC − 60), Σ 1/(FC − 60) — la correction au premier ordre vers la FC0 profilée de B1) ;
aucun tableau 1 Hz conservé, le banc rejoue sans re-décoder. `fit_slope_cost` : pour chaque
activité avec au moins 10 min de plat, l'écart intra-activité d_b = ⟨ln v − ln(FC − FC0)⟩_b −
⟨…⟩_plat, mis en commun pondéré par les secondes ; f_personnel(b) = exp(−D_b) ; κ = pente
des moindres carrés de f_personnel − 1 sur f_Minetti − 1, par côté, pondérée par les
secondes ; None sous `slope_cost_min_hours` (20 h) de mesure par côté, borné dans
[0,5 ; 2] (valeur brute au détail). En parallèle, l'équivalent plat de chaque activité est
décomposé exactement en brut + surcoût de montée + surcoût de descente
(`ga_up_excess_km`, `ga_down_excess_km`), et le Deq du parcours de même sur sa grille
(`CourseProfile.base_grid_m`, `excess_up_grid_m`, `excess_down_grid_m`, par segment
`excess_up_km`, `excess_down_km`).

**Correctif (flag).** `slope_cost=personal` : la vitesse ajustée de chaque effort de la
calibration vaut (brut + κ_montée × surcoût de montée + κ_descente × surcoût de descente) ÷
durée, le plancher du domaine la juge ainsi, et le parcours est servi sous les mêmes
facteurs (`CourseProfile.with_slope_cost`, technicité comprise, segments et plan
recalculés) — un seul coût de pente des deux côtés de la prédiction. Les fenêtres de la
courbe record gardent Minetti : VC, exposants et poids de maximalité ne bougent pas
(documenté : la maximalité compare une vitesse personnelle à une enveloppe de loi).
Un côté non mesuré vaut 1, signalé ; sans FC (Rapace), loi conservée, signalé. Registre :
`model.slope_kappa_up/down`, `slope_hours_up/down`, `slope_cost`, `course.slope_kappa` ;
JSON : `twin.slope_kappa_*`, `calibration.slope_cost`, `course.slope_kappa` ; rapport : une
note « ton coût de pente, mesuré » (heures, écart à ±10 %, facteurs, Deq servi) quand le
levier est servi. Tests : identité de la décomposition, κ retrouvés au bit près depuis des
sommes exactes et à 0,03 près par le chemin de décodage (pente sur base ±50 m, FC décalée),
loi rendue à κ = (1, 1), calibration et domaine sous κ, parcours sous κ (identité, segments,
technicité, profil sans décomposition rendu tel quel), pipeline servi derrière le flag seul.

**Limites dites avant mesure.** (1) Le décalage de 30 s est une constante physiologique
moyenne : les débuts de montée sont bruités, pas biaisés à l'échelle de centaines
d'heures. (2) En descente le facteur mesure une limite mécanique et technique (quadriceps,
terrain), pas un coût énergétique — c'est ce que la prédiction doit savoir. (3) Sur un
parcours dont la pente sort de la plage mesurée (> 30 %), la loi reprend. (4) Le levier
change le Deq de la cible ET la vitesse des ultras : son effet net sur le central dépend
de l'écart de profil entre la cible et les courses de l'athlète, ce que seul le banc dit.

**Preuve au banc (2026-09-16 ; `C1` sur défauts, `RC1` sur la pile de référence à cinq clés
R5 = A2A1A3 + B1 ; scoreur sous C1 ; recapture `nice-RC1.json`).** Base identique au « avant ».

Les facteurs mesurés (registre `model.slope_kappa_*`, dernière coupure de chaque athlète ;
heures de mesure avec FC en montée / descente) :

| athlète | κ montée | κ descente | heures montée / descente | lecture |
|---|---|---|---|---|
| Val | 0,63 → 0,55 (Nice 2026) | **0,50 (borne)** | 196 / 149 (382 / 280 à Nice) | à réserve cardiaque égale, il monte bien plus vite que la loi ne l'attend et ne descend pas plus vite que sur le plat |
| Crasse | 0,50 → 0,72 (2021 → 2026) | **0,50 (borne)** | 372 / 282 | même signature ; le facteur de montée croît avec les années (marche en côte → course) |
| Lolo | 0,50 → 0,63 | **0,50 (borne)** | 196 / 160 | idem |
| Rapace | — | — | 0 / 0 (pas de FC) | loi conservée, signalé |

Trois athlètes sur trois : κ_descente COLLÉ à la borne basse 0,5 — la « remise » de Minetti en
descente (f = 0,60 à −10 %) n'existe pas sur le terrain, l'athlète descend à peine plus vite
que sur le plat ; et κ_montée entre 0,5 et 0,7 : la loi de la course surestime le coût des
côtes quand on y marche. Le Deq de Nice passe de 200,1 à 184,8 km (−7,6 %) et la vga des
ultras vallonnés baisse d'autant (2025-03-01 : 7,18 → 6,72 km/h) : les deux côtés bougent
ensemble, le central ne bouge presque pas.

| variante | 13 vendus appariés : MAE / biais / couv 50 / couv 80 / Winkler 50 / 80 | Lolo frais | plan (cas frais, MAE % · biais mi-course) |
|---|---|---|---|
| base | 10,3 / +2,7 / 38 / 54 / 0,342 / 0,570 | −18,1 · −16,4 | 1,77 · +6 min |
| C1 | 10,3 / +2,9 / 54 / 62 / 0,367 / 0,626 | −23,6 (🔴) · −18,0 | 1,83 · −2,5 min |
| R5 | 8,6 / +1,7 / 31 / 77 / 0,281 / 0,485 | −16,3 · −18,5 | — |
| RC1 | 9,0 / +2,2 / 46 / 69 / 0,316 / 0,567 | −21,4 (🔴) · −20,1 | — |

Par athlète (RC1 contre R5) : Val 9,0 → 9,7 (Winkler 80 0,542 → 0,598), Crasse 5,9 → 5,2
(0,265 → 0,289), Lolo 17,4 → 20,7. Zone d'action : Chianti +0,6 → +2,0, Lavaredo +2,5 →
+3,2, MIUT +0,5 → −4,2, Nice 2024 −0,6 → −0,5, Montagnhard +16,8 → +15,7. Verdicts : Lolo
Nice 50k 2023 vendu → refusé ; sous C1 seul, Crasse Tour des 8 Refuges 2022 (10,35 h réels,
prédit 16,5 h au lieu de 20,4) passe de 🔴 à 🟠 à +60 % — encore une garde qui lit une
prédiction (« efforts longs proches de la cible » : la moitié d'une cible plus courte). Sur
la régression, σ et le levier montent partout (Val Lavaredo : levier 0,72 → 0,82, sd_rel
0,113 → 0,117 ; MIUT 3,0 → 3,3) : la vitesse personnelle est jugée par les poids de
maximalité contre une enveloppe restée sous la loi, n_eff baisse (Nice : 11,1 → 9,6).
Recapture de Nice sous RC1 : 32,53 h (32,43 sous R5), sécurité 27,84 – 38,01 (31 % au lieu
de 25 %), LOO 7,8 % (6,4), levier 1,39 (0,90), β2 −0,0066 (−0,0046 : le terrain ne tombe
pas vers 0, il grossit).

**Lecture.** Le levier mesure quelque chose de vrai et de stable (trois athlètes, même
signature, des centaines d'heures), mais tel qu'il est écrit il dégrade tout ce qu'on juge :
Winkler, cas frais, forme du plan, largeur. Deux raisons lisibles : (1) la forme de la loi
n'est pas la bonne en descente — un facteur sur le surcoût de Minetti ne peut pas dire
« pas de remise du tout », il bute sur sa borne ; (2) la vitesse personnelle entre dans une
calibration dont l'enveloppe, la maximalité et le prior de terrain sont restés sous la loi.
**Décision différée au retour de Nice** (consigne de Valentin, 2026-09-16) : défaut
`minetti`, non activé pour la référence ; κ restent mesurés et consignés à chaque coupure.

### 10.16 Décision 1 (2026-09-16) — la pile de référence devient le défaut servi

**Constat (consigne de Valentin).** La règle d'adoption du chantier (« jamais sur le seul
dev_set, jamais sur un athlète ») est insatisfaisable avec quatre athlètes et deux cas frais
vendables : elle a figé tous les défauts alors que la pile de référence — A2 lien log, A1
prior sur la pente, A3 échelle studentisée, B1 efficacité-durée — améliore chaque métrique
sur les 13 vendus (MAE 10,3 → 8,6 %, couverture 80 54 → 77 %, Winkler 80 0,570 → 0,485,
§10.10) et n'est rejetée nulle part. Ce n'est pas une dérogation à la méthode, c'est une
décision sur le régime de décision : les cinq clés passent en défaut, les anciennes valeurs
restent un rollback nommé, et une règle de retour est pré-enregistrée.

**Ce qui change.** `twin.config.json` et `config.py` : `calibration.link=log`,
`duration_term=prior_shrunk`, `duration_prior_source=efficiency`, `envelope_tail=efficiency`,
`prediction.interval_source=studentized_scale`. Rollback nommé :
`examples/twin.config.historique.json` (linear, free, twin_alpha, alpha, conformal_normalized) ;
`examples/twin.config.reference.json` est désormais identique aux défauts et ne change plus
rien (gardé comme trace). Les baselines historiques — `tools/ab_montagnhard`,
`tools/regen_montagnhard_fixture`, `tests/test_montagnhard_robustness` — épinglent
explicitement les cinq anciennes clés : le tableau §4 est reproduit à l'identique (vérifié,
2026-09-16). Les tests de chaque levier (Phases 1, 2, 3) repartent d'un `HIST` = anciens
défauts, pour continuer à isoler chaque levier ; les tests des défauts servis disent la
nouvelle pile ; suite 338 passés, 1 sauté (golden réel, archive absente ici).

**Golden déterministe (recapturé).** Le fixture est un PLAN LINÉAIRE parfait (cinq agrégats
de même date, `_plane`, α = 0,18) : sous les nouveaux défauts un modèle en log avec prior sur
la pente ne peut pas le reproduire au bit près — la MAE LOO passe de 0,74 à 2,63 %, et c'est
attendu (le prior tire b vers −0,18 sur des données dont la pente log vaut ≈ −0,06 ; α_eff est
absent sur des agrégats, le prior lit donc α du jumeau). Nouvelles valeurs : β (2,437, −0,168,
−0,0009) en ln v, prior b −0,18 (λ 2), 33,05 h (31,01 sous les anciens défauts), 6,055 km/h,
bandes studentisées κ 0,77, ν 2 : sécurité 30,80 – 35,46, fourchette 32,05 – 34,07. Les
anciennes valeurs (β 9,011 / −0,457 / −0,0186, 31,01 h, conforme 30,38 – 31,64, MAE 0,74 %)
restent épinglées par `test_prediction_chain_golden_historique` sous le rollback : le
rollback rend l'ancien comportement au chiffre près.

**Golden réel §12 (recapturé sur l'archive fraîche dédoublonnée, `nice-RB1.json` = les
nouveaux défauts).** Deux causes d'écart avec la référence de juillet, séparées :

| grandeur | juillet 2026 (449 activités, anciens défauts) | archive fraîche, anciens défauts (« avant », §10.0) | archive fraîche, nouveaux défauts (§12 recapturé) |
|---|---|---|---|
| activités exploitées · vrais ultras | 449 · 8 | 918 · 12 | 918 · 12 |
| VC | 2,952 m/s (10,63 km/h) | 2,708 m/s (9,748 km/h) | 2,708 m/s |
| E (α) · durabilité | 1,244 (0,196) · 20,9 % | 1,167 (0,143) · 19,1 % | 1,167 (0,143) · 19,1 % |
| central | 31,28 h | 32,33 h | **32,43 h** |
| fourchette de course | — | 27,49 – 37,17 (30 %) | 30,48 – 34,50 (12 %) |
| sécurité 80 % | 29,95 – 32,77 (MC) | 24,46 – 40,20 (49 %) | 28,69 – 36,65 (25 %) |
| LOO | 3,1 % (n 8) | 6,9 % (n 12) | 6,4 % (interpolation 7,4, extrapolation 3,2) |
| pente servie | linéaire, libre | linéaire, libre | log, prior −0,067 (efficacité-durée, λ 2), levier 0,90, κ 0,85, ν 8,1 |

L'ARCHIVE explique VC, E et durabilité (deux fois plus d'activités, 55 mois, doublons
fusionnés) et le passage de 31,28 à 32,33 h ; les DÉFAUTS expliquent 32,33 → 32,43 h et les
bandes deux fois plus étroites à couverture mesurée meilleure (§10.10). Le test
`test_nice_100m_reference` porte ces valeurs (tolérances inchangées) ; il sera vérifié PASS
chez Valentin sur l'archive fraîche (voie A).

**Règle de retour pré-enregistrée** (`docs/twin-registre-couverture.md`) : à 10 nouvelles
courses COURUES par des athlètes hors dev_set, si la MAE des vendus ou le Winkler 80 sont
pires sous les nouveaux défauts que sous les anciens (rejoués au banc à l'identique), on
revient aux anciens ; aucune autre condition, aucun cas isolé.

**Registre rejoué sous les nouveaux défauts — officiel (banc de base relancé chez Valentin
le 2026-09-16, registre e1743c3).** Le golden réel `test_nice_100m_reference` est PASS sur
l'archive fraîche (469 s). `tools/registre --compare docs/archive/twin-v2/registre-avant.json`
sur le registre rejoué rend, au chiffre près, la variante `RB1` de la Phase 3 (même config) :

| groupe (vendus) | n | MAE % | biais % | couv 50 / 80 | Winkler rel 50 / 80 | largeur rel méd 50 / 80 |
|---|---|---|---|---|---|---|
| frais (Lolo) | 2 → 2 | 17,2 → 17,4 | −17,2 → −17,4 | 0 / 0 → 0 / 0 | 0,611 / 1,125 → 0,617 / 1,143 | 8,4 / 16,2 → 8,4 / 16,1 |
| dev · Val | 4 → 5 | 12,9 → 7,3 | +12,9 → +7,3 | 25 / 50 → 60 / 80 | 0,473 / 0,773 → 0,280 / 0,530 | 12,8 / 24,8 → 14,5 / 28,0 |
| dev · Crasse | 7 → 8 | 6,8 → 28,3 | +2,6 → +25,8 | 57 / 71 → 25 / 88 | 0,191 / 0,296 → 1,006 / 2,012 | 7,1 / 13,4 → 7,7 / 22,0 |
| tous | 13 → 15 | 10,3 → 19,8 | +2,7 → +13,9 | 38 / 54 → 33 / 73 | 0,342 / 0,570 → 0,712 / 1,402 | 8,1 / 15,5 → 8,3 / 20,7 |

Lecture : les deux vendus de plus sont Val · Chianti 2025 (🔴 → 🟠, +0,6 %, un vrai gain) et
Crasse · Lut 36k 2021 (🔴 → 🟠, +185 %, l'artefact de la garde du domaine décrit en §10.10,
que la Décision 2 corrige) ; sur les 13 vendus de l'« avant », appariés, la pile fait 8,6 %
de MAE et 0,485 de Winkler 80 (§10.10). Par course, le rejoué reproduit RB1 : Val ·
Ecotrail +6,9 (🟠, ✓80), Coursières 50k 🔴 +13,5 (hors domaine), GRF +20,9, Saintélyon
+5,6, Chianti +0,6, Lavaredo +2,5 ; Crasse · Nice 2024 🟢 −0,6,
Grand Trail du Lac +1,7, Coursières 2026 +8,0, Lut 36k 2021 🟠 +184,6 ; Lolo · Nice 50k
−16,3, UTSM −18,5, MIUT 🔴 +0,5 (erreur de validation croisée, largeur) ; Rapace 6/6 🔴.
Décision 1 close.
