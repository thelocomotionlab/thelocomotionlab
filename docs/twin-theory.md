# Locomotion Twin — théorie & pratique

> Document de référence de la méthode. À lire **avant** de coder/durcir le moteur (`services/twin-engine/`).
> Il décrit ce que fait le pipeline, **pourquoi**, et distingue ce qui est **règle fixe**, ce qui est
> **ajusté à partir des données de chaque athlète**, et ce qui est **garde-fou d'honnêteté**.
>
> Les valeurs chiffrées sont celles du **cas de référence** (Valentin, Nice by UTMB 100M) : elles
> servent d'ancrage de non-régression (« golden test »), **pas** de constantes universelles.

---

## 0. Idée en une phrase

À partir de **l'archive d'entraînement** d'un·e athlète et de **la trace GPX** d'une course, on estime un
« **jumeau** » physiologique, on le confronte au **coût de la pente** le long du parcours, on **prédit**
un temps d'arrivée **dont on mesure la fiabilité sur les propres courses de l'athlète**, et on produit
un **plan de pacing par segment avec fenêtres horaires**.

```mermaid
flowchart LR
  A[Archive multi-marques] --> I[Ingestion → schéma canonique]
  G[Trace GPX] --> C[Parcours: pente, Minetti, Deq, segments]
  I --> T[Jumeau: VC, exposant E, durabilité]
  I --> U[Calibration ultra v(T, D+)]
  T --> S[Test de suffisance 🟢/🟠/🔴]
  U --> S
  C --> P[Prédiction auto-cohérente T = Deq / v(T)]
  U --> P
  P --> V[Validation croisée leave-one-out → indice de confiance]
  P --> PL[Plan par segment: fade + fenêtres + horaires/nuit]
  V --> R[Rapport LaTeX]
  PL --> R
```

---

## 1. Le parcours : de la trace GPX à la demande

**Entrée** : une trace GPX + la liste des points de découpage (km officiels des ravitaillements).

1. **Distance.** Distance horizontale cumulée par **haversine** entre points ; distance **3D** =
   √(horizontal² + Δaltitude²). La 3D colle en général à la distance officielle ; on **réaligne**
   l'abscisse sur le carnet de route (rescale linéaire de la 3D vers la distance officielle).
2. **Lissage de l'altimétrie.** Ré-échantillonnage sur grille régulière (pas 5 m) puis **moyenne
   glissante** (fenêtre ~150 m). La fenêtre est **calibrée pour reproduire le D+ officiel** (ancrage de
   bon sens). *Règle fixe.*
3. **Pente** `i(x)` = dérivée de l'altitude lissée vs distance, **écrêtée à ±0,45** (domaine de validité
   de Minetti).
4. **Coût de la pente (Minetti et al., 2002).** Coût énergétique de la course en fonction de la pente :

   `Cr(i) = 155.4·i⁵ − 30.4·i⁴ − 43.3·i³ + 46.3·i² + 19.5·i + 3.6`  (J·kg⁻¹·m⁻¹, `Cr(0)=3.6`)

   **Facteur de pente** `f(i) = Cr(i) / 3.6` = « combien de mètres à plat coûte un mètre de pente `i` ».
5. **Distance équivalente à plat** : `Deq = ∫ f(i(x)) dx`. C'est elle, et non la distance brute, qui
   gouverne le temps de course.
6. **Découpage** aux km des ravitaillements → par segment : distance réelle, D+, D−, pente moyenne,
   `Deq`, altitude de fin.

**Cas de référence** : 165 km / 8 874 m D+ lissé (officiel 8 900) / 10 461 m D− / **Deq = 200,1 km**.

---

## 2. Le jumeau : des données aux paramètres physiologiques

### 2.1 Ingestion → schéma canonique
Tous les formats (Garmin/Coros/Suunto `.fit`, Strava bulk export, Polar `.tcx/.gpx`…) sont normalisés
vers **un schéma unique** (1 enregistrement/seconde : `t, dist_m, speed_ms, hr, alt_m, lat, lon`). **Tout
le reste du moteur ne consomme que ce schéma** — jamais « par marque ».

### 2.2 Vitesse ajustée à la pente
Pour comparer des efforts sur terrains différents, chaque seconde est convertie en **vitesse équivalente
à plat** : `v_ga = v_raw · f(i)`. En montée (`f>1`), l'allure lente « vaut » une allure plate plus rapide.

> **Piège majeur (et sa parade) :** dériver l'altitude seconde-par-seconde amplifie le bruit
> (±1 m d'altitude ÷ petit pas de distance → fausses pentes raides → `f` qui explose). **Parade :**
> calculer la pente sur une **base de distance de ±50 m** (pas par seconde), **plafonner `f` à 3,0**
> (≈ +25 % ; au-delà on marche), écrêter la vitesse brute, léger lissage d'altitude. *Règles fixes.*

### 2.3 Courbe record ajustée
On accumule la **distance ajustée** `d_ga = Σ f·Δdist`, puis pour chaque durée `T` la meilleure moyenne
glissante de chaque activité `v_ga(T) = max_t (d_ga[t+T] − d_ga[t]) / T`, agrégées en une **enveloppe
robuste** sur toutes les activités.

> **Robustesse de l'enveloppe (garde-fou, §8).** Une **seule** activité contaminée (vélo mal étiqueté,
> trace bruyante, activité **sans altitude** traitée à tort comme plate) ne doit jamais fixer VC ni
> l'exposant. Quatre règles fixes, toutes en config :
> 1. **altitude requise** — sans altitude on ne peut pas ajuster à la pente → activité **exclue** de la
>    courbe record (mais **conservée** dans les résumés pour la calibration et la durabilité) ;
> 2. **plafond physiologique** `vc_max_plausible_ms` — un point « plat » plus rapide est rejeté avant
>    l'ajustement de la VC ;
> 3. **support minimal** `record_min_support` — un point record n'est retenu que s'il est soutenu par au
>    moins N activités : on garde la **N-ième meilleure** (repli sur la meilleure disponible aux durées
>    rares), jamais le pic isolé ;
> 4. **rejet fenêtré** `record_reject_speed_ms` / `record_reject_window_s` — une activité qui soutient une
>    vitesse brute impossible pour de la course sur une fenêtre longue est **écartée** (log « skipped »).
>
> L'exposant d'endurance se lisant sur la même enveloppe, ces règles corrigent **en même temps** une VC
> et un exposant surévalués.

> **Honnêteté méthodologique (garde-fou) :** l'ajustement de Minetti est une **équivalence métabolique
> de régime permanent, valable en aérobie**. Pour les efforts **courts**, presque toujours menés en
> côte et limités par la puissance musculaire, il **surestime** l'équivalent plat. Le fit de la VC
> est donc borné en durée : plancher `vc_short_effort_floor_s` (et fenêtre `vc_window_s`), auquel
> s'ajoute le filtre « plat » (§2.4) qui n'accepte que les points où l'ajustement pèse peu. **Valeur
> livrée : plancher à 10 min** (= début de fenêtre, tel que le golden a été capturé) ; le monter à
> **30 min** est le réglage « théorie stricte », à valider sur le golden réel avant d'en faire le
> défaut. Sans conséquence pour l'ultra, couru très loin sous la VC.

### 2.4 Vitesse critique (VC) et réserve D′
Modèle hyperbolique `d = VC·t + D′` (donc `v(t) = VC + D′/t`), ajusté sur les **efforts plats propres**
(critère `(v_ga − v_raw)/v_raw < 10 %` — **signé** tel que livré/capturé ; `vc_flat_symmetric` applique
la **valeur absolue**, qui écarte aussi les records en descente nette, recommandé après validation sur
le golden réel), sur la fenêtre `vc_window_s` (livrée **10–90 min**, cf. plancher §2.3). Incertitude par
*bootstrap*. NB : calée sur des durées bien plus longues que la CP de laboratoire (2–15 min, Poole 2016),
cette « VC de terrain » est volontairement **conservatrice** et son `D′` n'est pas interprétable
(signalé peu fiable) — le bon compromis pour l'ultra.

**Cas de référence (recapture 2026-07-02)** : **VC = 2,952 m/s (10,63 km/h, 5:39/km), ±0,04**.
`D′ ≈ 1 339 m ±103` — **volontairement signalée comme peu fiable** (le modèle est étiré au-delà de
son domaine 2–15 min) ; **sans importance pour un 100M** couru bien en deçà de la VC.

> **Garde-fou d'honnêteté.** Si la VC ajustée reste **au-dessus** de `vc_max_plausible_ms`, elle est
> marquée **non plausible** (`from_flat_efforts = False`, confiance réduite) et le rapport **n'affiche
> pas de « % de VC »** : mieux vaut ne rien dire qu'un ratio d'intensité trompeur.

### 2.5 Exposant d'endurance E
Loi de puissance sur l'enveloppe longue (30 min–6 h) : `v_ga ∝ t^(−α)`, d'où l'exposant de Riegel
`E = 1/(1−α)`. Il mesure **à quelle vitesse l'allure soutenable décline quand la durée s'allonge** —
**pas** la vitesse pure (c'est la **VC** qui la mesure ; les deux axes sont **indépendants**). Sens de
lecture : **un E bas (proche de 1) = tient très bien l'allure (« diesel ») ; un E plus haut = décline
plus nettement.**
**Cas de référence (recapture 2026-07-02)** : `α = 0,196`, **E = 1,244** — exposant **modéré**, profil **plutôt endurant**
(un E plus bas tiendrait encore mieux l'allure ; un E plus haut déclinerait davantage). Le texte du
rapport est **généré à partir de la valeur** avec ce même vocabulaire (déclin, jamais vitesse).

### 2.6 Durabilité
**Découplage intra-course** : baisse de l'efficacité (vitesse ajustée / FC) en seconde moitié vs première
moitié, sur les longues sorties. **Cas de référence (recapture 2026-07-02)** : **20,9 %** (médiane des efforts ≥ 10 h).

### 2.7 État de forme
Volume/charge récents (descripteur). **Garde-fou** : les données s'arrêtent souvent des semaines avant
la course → la prédiction suppose la forme du moment, et **doit être recalculée** à l'approche.

---

## 3. Calibration ultra (le moteur de la prédiction)

On isole les **vrais ultras engagés** par des **conditions explicites** : durée > 10 h, vitesse ajustée
≥ 5,5 km/h, découplage < 30 % (exclut reconnaissances et randos). On ajuste alors la **vitesse ajustée
moyenne de course** en fonction de la durée et du dénivelé :

`v_ga[km/h] = β0 + β1·ln(T_heures) + β2·(D+/km)`

**Cas de référence** (8 vrais ultras, recapture 2026-07-02, D+ base distance 150 m — C1) :
`v = 8,194 − 0,260·ln(T) − 0,0170·(D+/km)`, résidu σ = 0,22 km/h.

> **Pondération par récence (non-stationnarité).** Chez un athlète très fourni, les vrais ultras
> s'étalent sur **plusieurs saisons de formes différentes** ; les pondérer à poids égal biaise la
> régression vers une forme moyenne périmée. La régression (et son σ) est donc **pondérée par récence** :
> décroissance exponentielle sur le **temps calendaire**, `w = 0,5^(âge_jours / recency_halflife_days)`
> (défaut **365 j**), robuste aux trous (décroissance temporelle, pas par nombre d'activités). À poids
> égaux (mêmes dates), elle **se réduit exactement** à la régression non pondérée — le golden ne bouge pas.
>
> **Plancher de sur-confiance.** Le régime « régression » n'est retenu que si le **nombre effectif**
> d'ultras `N_eff = (Σw)² / Σw²` atteint `min_ultras_regression`. Sinon (assez d'ultras au total mais
> trop peu de **récents**), on bascule dans le repli « peu d'ultras » à incertitude élargie : la récence
> ne doit jamais fabriquer une régression sûre d'elle sur une poignée de courses récentes.

> **Point de généralisation crucial.** Cette régression suppose **plusieurs** vrais ultras. La plupart
> des athlètes n'en auront pas 8. Le moteur doit donc **dégrader proprement** :
> - **≥ ~3 vrais ultras** → régression personnelle (comme le cas de référence) ;
> - **1–2** → mélange données perso + extrapolation par VC et exposant E, **incertitude élargie** (→ souvent 🟠) ;
> - **0 effort long proche de la durée cible** → extrapolation VC + E seule, **🟠/🔴 selon l'écart**.

---

## 4. Prédiction auto-cohérente

Plus la course est longue, plus la vitesse baisse — mais la durée dépend de cette vitesse. On résout
le **point fixe** :

`T = Deq / v(T)`,  avec `v(T) = β0 + β1·ln(T) + β2·(D+/km du parcours)`

**Incertitude** par **Monte-Carlo** (tirages de `v` dans sa loi prédictive, résidu σ inclus) → intervalle.

> **Deux fourchettes, deux usages (2026-07-03).** Le rapport présente l'incertitude en deux bandes
> étiquetées par leur usage : la **fourchette de course** (couverture nominale 25–75,
> `pacing.plan_window_*` — une course sur deux s'y joue) pilote le plan et les fenêtres par segment ;
> l'intervalle de la prédiction (80 %, `prediction.interval_*_pct`) devient les **bornes de
> sécurité** (logistique : barrières, assistance, retour). Aucune ne remplace l'autre — on ne
> resserre jamais une couverture pour flatter la largeur.
>
> **Source des deux bandes (S5) : conforme normalisé PAR DÉFAUT depuis le 2026-07-03**
> (`prediction.interval_source=conformal_normalized`, rollback `mc`). Les largeurs sont **calées
> sur les erreurs LOO réelles** : score de chaque pli = |erreur relative|/sd prédictif du pli
> (studentisation), quantile pondéré conservateur (poids de récence×maximalité auto-normalisés,
> correction n+1), mis à l'échelle du sd prédictif de la CIBLE — le levier d'extrapolation est
> conservé, l'échelle vient des erreurs démontrées, pas de la loi supposée (Vovk ; Lei 2018 ;
> Romano-Candès 2019). Motif d'activation : sur une calibration faiblement identifiée, le MC
> prédictif dégénère — cas réel MIUT : ≥ 25 % des tirages au plancher de vitesse, bornes hautes
> = plafond mathématique Deq/v_floor (71,9 h pour un central 26 h). Repli automatique des deux
> bandes sur les percentiles MC sans validation croisée (blend/vc_e) ou à moins de 4 plis.
> La **couverture réelle** de ces bandes est suivie sur les courses courues
> (`docs/twin-registre-couverture.md`) — c'est le registre, pas une impression, qui décidera
> des recalibrages futurs.

**Cas de référence (recapture 2026-07-02)** : **T = 31,3 h**, vitesse ajustée moyenne
**6,40 km/h ≈ 60 % de la VC** ; intervalle 80 % **30,0–32,8 h**.

> À ~63 % de la VC, la **réserve D′ n'est jamais le facteur limitant**. Les vrais limitants d'un ultra
> sont la **durabilité** et le **ravitaillement** — d'où le focus du plan sur ces deux points.

---

## 5. Validation croisée (et indice de confiance)

**Leave-one-out** sur les vrais ultras : pour chacun, on **réajuste la régression en l'excluant**, on
prédit son temps, on compare au réel. La moyenne des erreurs **devient l'indice de confiance imprimé
dans le rapport**, et l'un des critères du **test de suffisance**.

> **Cohérence avec le modèle servi.** La LOO applique **exactement la même pondération par récence**
> (§3) — dans chaque ré-ajustement **et** dans l'agrégation MAE/RMSE — pour que l'indice reflète le
> modèle réellement utilisé : sur un athlète non stationnaire, les ultras récents (bien prédits) pèsent
> plus que les anciens, si bien que l'erreur affichée **baisse** quand la récence corrige la forme.
> À poids égaux, la moyenne pondérée redevient une moyenne simple (golden intact).

**Cas de référence (recapture 2026-07-02)** : erreur moyenne **3,1 %** (interpolation **2,7 %**),
RMSE 4,0 % (n = 8 ; 4 plis d'interpolation, 4 d'extrapolation).

---

## 6. Le plan de pacing

- **Effort ajusté constant + fade de durabilité.** On vise une **vitesse ajustée constante** (= effort
  métabolique constant grâce à l'ajustement de pente), avec une **dérive contrôlée** (~−15 % début→fin).
  Forme : `v_i = S · g_i`, `g_i = 1 + Δ·(0,5 − p_i)·2` (p_i = fraction d'avancement en Deq, **Δ ≈ 0,085**),
  `S` normalisé pour que `Σ deq_i / v_i = T_mouvement`. **Option `fade_source=durability`** : Δ dérivé
  du **découplage mesuré** de l'athlète, `Δ = X/(200−X)` borné [0,04 ; 0,13] (le défaut Δ=0,085
  correspond à X≈15,7 % — un découplage « typique ») ; repli sur la constante si la FC manque.
- **Conversion** : par segment, temps de mouvement = `deq_i / v_ga_i` ; allure réelle = temps / distance
  réelle (montées lentes, descentes rapides).
- **Horloge & nuit** : heure de départ + cumul (mouvement + arrêts ravitaillement) → heure de passage ;
  lever/coucher du soleil par l'**algorithme solaire NOAA** → sections de nuit.
- **Fenêtres horaires** : on présente par segment une **plage** d'arrivée et d'allure — la
  **fourchette de course** (bandes Monte-Carlo interquartiles, cf. §4), pas une valeur unique
  (meilleure tenue psychologique en course). L'arrivée finale porte en plus les **bornes de
  sécurité** en heures de passage.
- **Scénarios de course** : quand les bornes de sécurité sont larges relativement à la prédiction
  (`pacing.scenario_rel_width`, défaut 0,35), le rapport ajoute une table **rapide / central /
  prudent** par segment (bornes de la fourchette de course) et la consigne de **recalage** :
  identifier tôt sa colonne et la suivre, plutôt que courir après la colonne centrale.

**Cas de référence (recapture 2026-07-02)** : mouvement 29,5 h + arrêts 1,75 h = **31,3 h**
d'horloge ; départ ven. 13:00, arrivée sam. ~20:17 ; **section de nuit à relire sur le prochain
rapport full** (dépend du nouveau profil horaire).

---

## 7. Rapport

Rendu **LaTeX** (template `locomotionreport`, police **Ubuntu**, XeLaTeX + biber), figures matplotlib
aux couleurs de la marque. Contient : synthèse, parcours, jumeau (pédagogique), prédiction + validation,
plan par segment, intensité/durabilité, **limites assumées**, recommandations.

---

## 8. ★ Ce qui remplace le « jugement humain » (lecture clé pour l'automatisation)

Tout ce qui a pu ressembler à de l'expertise au cas par cas est en réalité l'une de **trois** choses :

| Type | Exemples | Statut |
|---|---|---|
| **Règle fixe** (même code pour tous) | lissage 150 m, écrêtage pente ±0,45, base de pente ±50 m, **base du D+ des activités = distance ~150 m (harmonisée au parcours, C1)**, plafond `f≤3`, plancher de durée VC, conditions des « vrais ultras », Δ du fade, **robustesse record** (altitude requise, plafond VC plausible, support ≥N, rejet fenêtré), **demi-vie de récence** | identique pour chaque athlète |
| **Ajusté à partir des données** | VC, D′, exposant E, durabilité, coefficients β de la régression **pondérée par récence**, prédiction, plan (**Δ du fade si `fade_source=durability`**) | **calculé** par athlète → individualisation automatique |
| **Garde-fou d'honnêteté** | invalidité < 30 min, descentes techniques = plafonds, forme du jour inconnue, D′ peu fiable, marche au-delà de ±25 %, **VC non plausible → pas de « % de VC »**, **plancher N_eff** (pas de régression sûre d'elle sur trop peu d'ultras récents) | cadrage fixe + **test de suffisance** |

**Conséquence :** l'individualisation est **automatique par construction** — d'autres fichiers → d'autres
paramètres → un autre plan. Rien n'est partagé entre clients sauf **la méthode (le code) et la charte**.
Le « est-ce que ça a l'air juste ? » est remplacé par la **validation croisée** (un chiffre) ; le
« ces données suffisent-elles ? » par le **test de suffisance** (🟢/🟠/🔴).

---

## 9. Garde-fous d'honnêteté à imprimer dans chaque rapport

- Forme du jour inconnue si les données s'arrêtent avant la course → **recalcul recommandé**.
- Ajustement de pente **invalide < 30 min** (efforts courts).
- Allures de descente = **plafonds métaboliques** ; la **technicité** du terrain (absente du GPX) peut
  imposer plus lent.
- Minetti **moins valide au-delà de ±25–30 %** (marche active).
- **Météo / nutrition** non modélisées.
- `D′` faiblement contrainte (sans impact en ultra).

---

## 10. Test de suffisance — critères (🟢/🟠/🔴)

Calculé **avant paiement**, sur la donnée normalisée :

| Critère | 🟢 | 🟠 | 🔴 |
|---|---|---|---|
| Historique | ≥ 6 mois | 3–6 mois | < 3 mois |
| Courses exploitables | ≥ ~120 | ~50–120 | < 50 |
| Efforts longs proches de la cible (allure plausible) | ≥ 2 | 1 | 0 |
| Qualité (FC **et** altitude) | majoritaires | partielles | quasi absentes |
| **Erreur validation croisée** | ≤ ~5 % | ~5–10 % **ou non calculable** | > 10 % |

🟢 → rapport complet. 🟠 → on prévient (confiance réduite) ou produit dégradé. 🔴 → **on ne vend pas**.

> **CV non calculable** (régimes blend/VC+E, < 3 vrais ultras) : le verdict est **plafonné à 🟠**
> (`cv_missing_policy=cap_orange`) — jamais 🟢 sans indice de confiance, mais vendable en prévenant.
> C'est la lecture qui réconcilie ce tableau avec §3 (« 1–2 ultras → souvent 🟠 »).

---

## 11. Ce qui reste à durcir (zones de fragilité connues)

1. **Ingestion multi-marques** robuste (exports brouillons, `.gz`, Strava mixte) → tests par format.
2. **Régime « peu d'ultras »** (cf. §3) : fallback VC+E + incertitude élargie, désormais aussi déclenché
   par le **plancher N_eff** (assez d'ultras mais trop peu de récents).
3. **FC absente** : la durabilité (découplage) repose sur la FC → dégrader proprement / signaler.
4. **Profils atypiques** (marche dominante, treadmill, montre bruyante, activité sans altitude) →
   la **robustesse de la courbe record** (§2.3 : altitude requise, support ≥N, rejet fenêtré, plafond
   plausible) les écarte de VC/exposant ; à défaut **être honnête (🟠/🔴)** plutôt que confiant mais faux.
5. **Non-régression** : golden test sur le cas de référence (mêmes entrées → mêmes sorties à tolérance).

---

## 12. Valeurs de référence (golden test — Valentin, Nice 100M)

| Grandeur | Valeur (recapture 2026-07-02, post-C1) |
|---|---|
| Parcours | 165 km (167,2 officiels) / 8 874 m D+ lissé / 10 461 m D− / Deq 200,1 km / D+/km 53,1 |
| Activités exploitables | 419 / 449 · 17,5 mois · fraîcheur 10 j à l'analyse |
| VC | 2,952 m/s (10,63 km/h) ±0,04 |
| D′ | ~1 339 m ±103 (peu fiable) |
| Exposant E | 1,244 (α = 0,196) |
| Durabilité | découplage 20,9 % (médiane des ≥ 10 h) |
| Régression ultra | v = 8,194 − 0,260·ln(h) − 0,0170·(D+/km), σ 0,22 km/h — **D+ base distance 150 m (C1)** |
| Prédiction | 31,28 h · 6,40 km/h ajustée · ~60 % VC |
| Intervalle 80 % | 29,95–32,77 h *(percentiles MC — bandes CONFORMES par défaut depuis le 2026-07-03 : bornes à re-capturer au prochain preview, attendues plus étroites vu la MAE 3,1 %)* |
| Validation croisée | MAE 3,1 % (interp 2,7 %) · RMSE 4,0 % (n = 8, 4 interp / 4 extrap) |
| Plan | arrêts 1,75 h ; départ ven. 13:00, arrivée sam. ~20:17 ; nuit : à relire au prochain full |

> **Recapture du 2026-07-02 (bascule C1)** — ce qui a bougé, et pourquoi :
> * **β2 : −0,0148 → −0,0170 = ×1,149**, pour un écart d'échelle D+ mesuré à **+14,9 %** —
>   le recalibrage suit EXACTEMENT la mesure (validation forte du diagnostic C1) ;
> * β1 −0,35 → −0,26 et σ 0,14 → 0,22 : l'ancien fit était en partie flatté par le bruit
>   d'échelle corrélé absorbé dans les coefficients ;
> * prédiction **30,4 → 31,28 h (+2,9 %)** : correction du biais optimiste de terrain
>   (la pénalité D+ appliquée au parcours était trop douce) ;
> * VC/E/D′ : micro-dérive vs la capture d'origine (notée depuis les scripts `_seed`),
>   **indépendante de C1** (la courbe record ne touche pas au D+) et dans les tolérances du
>   golden. Le golden réel est re-centré sur ces valeurs.

> **Stabilité du golden.** Les durcissements de robustesse (§2.3) et la pondération par récence (§3/§5)
> **ne bougent quasiment pas** ce cas (données propres, ~1,5 an, altitude présente) : sur des dates
> proches la récence redevient neutre, et l'enveloppe robuste sur données denses retient une N-ième
> meilleure ≈ la meilleure. Le golden **déterministe** committé (ultras de même date) est **inchangé au
> chiffre près** ; les réfs du golden **réel** ci-dessus ne sont à recapturer que si les vraies données
> les décalent légèrement — auquel cas on ajuste `recency_halflife_days` avant de relâcher tout seuil.

> Réfs : Minetti 2002 ; Poole 2016 / Jones & Vanhatalo 2017 (VC) ; Riegel 1981 / Drake 2024 (E) ;
> Maunder 2021 / Jones 2024 (durabilité) ; NOAA (solaire).
