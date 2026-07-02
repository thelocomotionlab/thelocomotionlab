# Revue complète du Locomotion Twin — théorie, chaîne de calcul, plan d'amélioration

> **Statut : PLAN À VALIDER** (juillet 2026). Revue croisée de `docs/twin-theory.md`,
> `services/twin-engine/` (code + tests + DIAGNOSTIC.md) et de la littérature. Une fois les
> arbitrages rendus (colonnes « Décision » du §7), ce document se traduit en prompt
> d'implémentation Claude Code. **Aucun changement de code n'accompagne cette revue.**
>
> Chaque constat porte un identifiant stable (`T*` théorie↔code, `C*` chaîne de calcul,
> `R*` rapport/API, `S*` science de fond, `E*` efficacité) pour pouvoir en discuter item par item.

---

## 0. Résumé exécutif

Le moteur est **sain dans son architecture et dans ses choix scientifiques de base**
(Minetti pour l'équivalence de pente, VC/E comme axes indépendants, régression ultra
personnelle, validation croisée cohérente avec le modèle servi, garde-fous d'honnêteté).
La discipline de laboratoire (golden, fixtures sans PII, flags, DIAGNOSTIC) est au-dessus
des standards habituels. La revue n'a trouvé **aucune erreur de signe ni d'unité** dans le
cœur numérique.

Les problèmes trouvés sont d'un autre ordre, et se regroupent en quatre familles :

1. **La doc promet des garde-fous que le code n'applique pas** (fenêtre VC < 30 min,
   critère « plat » en valeur absolue, qualité altitude, CV incalculable → 🔴) — §2.
2. **L'intervalle de confiance est structurellement trop étroit** : il ne porte que le bruit
   résiduel σ et ignore l'incertitude des coefficients β, donc **le levier d'extrapolation**
   — précisément le mode de défaillance identifié dans DIAGNOSTIC.md. Mesuré : sur une cible
   au-delà du plus long ultra d'entraînement, l'intervalle honnête est **~2× plus large** que
   l'intervalle actuel — §3 (C3).
3. **Des paramètres mesurés chez l'athlète n'alimentent pas le modèle** : la durabilité
   (découplage) est calculée puis seulement narrée — le fade du plan de pacing reste fixe à
   0,085 pour tout le monde ; la « VC+E » du repli n'utilise pas la VC — §2 (T3, T6).
4. **Le rapport dit parfois autre chose que ce que le moteur fait** (date figée, VC mise en
   avant quand elle est jugée non plausible, légende « les incertitudes s'additionnent »
   alors que le calcul est un simple facteur d'échelle, MAE affichée ≠ MAE du verdict) — §4.

Aucun de ces points n'invalide la prédiction de référence (Nice 30,4 h). Mais les corriger
rend le moteur **plus honnête sur des données moins parfaites que celles du cas de
référence** — ce qui est exactement le régime des futurs clients (cf. cas Montagnhard).

---

## 1. Ce qui est déjà bien fait (et qu'il faut préserver)

### 1.1 Architecture et hygiène

- **Chaîne unidirectionnelle claire** : `ingest → canonique 1 Hz → jumeau → calibration →
  prédiction → suffisance → pacing → rapport`. Chaque étage est une fonction pure sur des
  dataclasses, testable seule ; la config est un objet immuable unique (`config.py`), aucun
  chemin en dur, presque aucune constante hors config (exceptions au §4/R6).
- **Le protocole de changement** (flags à défaut conservateur, golden déterministe committé
  + golden réel optionnel, fixture d'agrégats sans PII, tableau A/B `tools/ab_montagnhard.py`,
  carnet DIAGNOSTIC.md avec les pistes rejetées) est ce qui permet à cette revue d'être
  utile : chaque proposition ci-dessous s'y coule.
- **Confidentialité prise au sérieux dès l'ingestion** : anonymisation des noms de fichiers
  (`activity-NNNNN.ext`, les exports Garmin contiennent l'e-mail dans chaque nom), lecture
  en flux mémoire sans extraction disque, purge d'archive après parsing, fixture réduit aux
  agrégats. Le walker générique (zip-dans-zip, pré-filtre par taille sans lecture) et le
  manifeste Strava multilingue (détection des colonnes **par leurs valeurs**, pas par les
  en-têtes localisés) sont des morceaux de robustesse rares.

### 1.2 Choix scientifiques

- **Minetti et al. 2002 est le bon choix** pour l'équivalence métabolique de la pente
  (polynôme quintique, domaine ±45 %), et le code l'applique aux deux bouts de la chaîne
  avec la même fonction (`minetti.py`) : cohérence structurelle entre le coût du parcours
  (Deq) et la vitesse ajustée de l'athlète (v_ga). C'est le même fondement que le GAP de
  Strava — mais appliqué symétriquement, ce qui est plus propre.
- **Les parades anti-bruit de la v_ga sont les bonnes** : pente sur base de distance ±50 m
  (pas par seconde), plafond f ≤ 3, écrêtage de la vitesse brute, léger lissage d'altitude.
  Dériver l'altitude seconde par seconde est LE piège classique de tous les calculs de
  « grade adjusted pace », et il est explicitement évité et documenté.
- **VC et E traités comme deux axes indépendants** (niveau vs déclin) — conforme à la
  physiologie (Poole 2016 ; Jones & Vanhatalo 2017 pour la VC ; Riegel 1981 pour E), et le
  narratif du rapport respecte le sens (E haut = décline plus) de bout en bout — vérifié,
  aucun piège de signe.
- **L'enveloppe record robuste** (altitude requise, plafond physiologique, support ≥ N,
  rejet fenêtré) fait qu'**une seule activité contaminée ne peut plus fixer ni VC ni E** —
  et les tests le verrouillent (`test_twin.py`).
- **Le filtre de maximalité** (DIAGNOSTIC §3.1) est la bonne réponse au vrai problème
  (hétérogénéité d'intention des ultras), avec une structure « rescue » élégante (on
  n'écarte que si tous les signaux concordent), une référence auto-relative invariante à
  l'échelle de l'enveloppe, et une preuve A/B chiffrée (LOO 25,3 % → ~9 %).
- **La LOO est méthodologiquement exemplaire** : mêmes poids (récence × maximalité) et même
  mode de terrain dans chaque pli que dans le fit servi, séparation
  interpolation/extrapolation. L'indice de confiance imprimé reflète le modèle réellement
  utilisé — c'est rare et précieux.
- **Le point fixe T = Deq/v(T)** est la bonne formalisation de « la vitesse dépend de la
  durée qui dépend de la vitesse », l'itération amortie converge, et le Monte-Carlo est
  seedé (reproductible).
- **La dégradation en trois régimes** (régression / blend / enveloppe seule) avec plancher
  N_eff (taille d'échantillon effective de Kish, correctement implémentée) est la bonne
  réponse au « la plupart des athlètes n'ont pas 8 ultras ».
- **Fenêtres horaires plutôt que valeur unique** : psychologiquement et statistiquement
  juste.

### 1.3 Tests

La suite committée épingle exactement ce qu'il faut : géométrie du parcours, chaîne de
prédiction, échec de référence Montagnhard (baseline flags off), no-op du filtre sur le
golden, invariance d'échelle du self_relative, récence neutre à dates égales. **Toute
proposition ci-dessous doit passer cette suite inchangée par défaut** — c'est la règle du
dépôt et elle est bonne.

---

## 2. Incohérences théorie ↔ code (T1–T8)

> Celles-ci se tranchent facilement : soit le code a raison (on corrige la doc), soit la
> doc a raison (on corrige le code, derrière flag). Dans les deux cas l'écart doit
> disparaître, car la doc est le contrat de la méthode.

### T1 — La fenêtre VC du code inclut les efforts courts que la théorie exclut. Paramètre mort.

- **Théorie** (`twin-theory.md` §2.3) : « on **n'utilise pas** les durées < 30 min pour
  estimer la vitesse critique » ; §2.4 : « fenêtre 30–75 min ».
- **Code** : `vc_window_s = [600, 5400]` (10–90 min) — les points 10, 13, 15, 20, 25 min
  entrent dans le fit (`twin/record.py:243`, `twin/model.py:80`). Et le paramètre
  `vc_short_effort_floor_s = 1800`, visiblement prévu pour ce garde-fou, **n'est lu nulle
  part** (grep : config uniquement).
- **Pourquoi c'est important** : les efforts de 10–25 min sont presque toujours courus en
  côte chez un traileur ; c'est le domaine où l'équivalence de Minetti sur-crédite (efforts
  limités par la puissance musculaire, pas par le métabolisme aérobie stationnaire). Le
  filtre « plat » (`|v_ga−v_raw| < 10 %`) limite la casse, mais la doc promet une exclusion
  que le code ne fait pas. Par ailleurs le modèle hyperbolique d = VC·t + D′ est
  classiquement calé sur 2–15 min (Poole 2016) ; l'utiliser sur 10–90 min donne une VC
  « longue durée » plus basse et un D′ sans interprétation — assumé pour l'ultra (VC plus
  conservatrice = plus utile ici), mais à écrire noir sur blanc.
- **Proposition** : brancher `vc_short_effort_floor_s` dans le critère `flat` (défaut **600**
  = comportement actuel, no-op), corriger la doc pour décrire la fenêtre réellement servie,
  et laisser Valentin tester `1800` sur le golden réel avant tout changement de défaut.

### T2 — Le critère « effort plat » est signé, la théorie le veut en valeur absolue.

- **Théorie** §2.4 : efforts plats propres = `|v_ga − v_raw| / v_raw < 10 %`.
- **Code** (`twin/record.py:242`) : `(vga_j - vr_j) / vr_j < flat_thr` — **sans valeur
  absolue**. Un record établi en **descente nette** (v_ga ≪ v_raw, ratio négatif) est classé
  « plat » et entre dans le fit de la VC.
- **Pourquoi c'est important** : en descente, v_ga = v·f avec f ≈ 0,5–0,9 : l'équivalence
  métabolique y est la moins fiable (freinage excentrique, technicité), et ces points tirent
  la VC vers le bas. Chez un athlète alpin dont les meilleurs 30–90 min sont des descentes,
  la VC serait systématiquement sous-estimée sans que rien ne le signale.
- **Proposition** : flag `twin.vc_flat_symmetric` (défaut `false` = actuel) ; vérif golden
  réel ; puis bascule du défaut + recapture si l'effet est nul chez Valentin (probable :
  ses records 30–90 min sont plats).

### T3 — La durabilité est mesurée puis jamais utilisée : le fade du plan est fixe.

- **Théorie** : §8 classe la durabilité dans « **ajusté à partir des données** … → plan » ;
  §2.6 la mesure (découplage ~19–24 % chez Valentin) ; §4 affirme que « les vrais limitants
  d'un ultra sont la durabilité et le ravitaillement — d'où le focus du plan ».
- **Code** : `pacing/plan.py:84` — `delta = cfg.pacing.fade_delta` (0,085, identique pour
  tous). Le `durability_pct` calculé (`twin/model.py:161`) n'alimente **que** le narratif
  (grep : narrative/context/cli uniquement). Le plan d'un « diesel » (découplage 8 %) et
  d'un athlète qui s'use vite (découplage 28 %) ont **le même fade**.
- **Pourquoi c'est important** : c'est LA promesse d'individualisation du produit (§8) qui
  n'est pas tenue sur le plan de pacing — l'élément que l'athlète utilise le jour J.
- **Proposition** : `pacing.fade_source ∈ {config (défaut), durability}`. Mapping pédagogique :
  si l'efficacité chute de X % entre les deux moitiés à effort constant, la vitesse fait de
  même ; un fade linéaire (1+Δ → 1−Δ) réalise une chute relative (1−Δ)/(1+Δ) = 1 − X/100,
  d'où **Δ = X/(200 − X)**, borné par ex. à [0,04 ; 0,13]. Contrôles : X = 15,7 % ↔ Δ = 0,085
  (le défaut actuel est cohérent avec un découplage médian ~16 %) ; X = 20 % ↔ Δ = 0,111.
  Repli sur `fade_delta` si durabilité non mesurable (déjà signalé au rapport).

### T4 — CV incalculable : la théorie dit 🔴, le code peut dire 🟢.

- **Théorie** §10, ligne « Erreur validation croisée » : 🔴 = « non calculable / > 10 % ».
  Mais §3 dit aussi « 1–2 ultras → … (→ souvent 🟠) » — la doc se contredit elle-même.
- **Code** (`sufficiency.py:153-158,171-176`) : critère `level=None` → **exclu du verdict**.
  Un athlète en régime blend (1 ultra) avec historique/volume/efforts longs/FC verts sort
  **🟢 « rapport complet »** sans aucune validation croisée. Le test
  `test_orange_when_few_ultras_and_medium_history` ne protège pas ce cas : son 🟠 vient de
  l'historique (4 mois), pas de la CV manquante.
- **Pourquoi c'est important** : le 🟢 est l'engagement commercial de confiance ; le donner
  sans l'indice de confiance qui le définit (§5 de la théorie) est exactement le genre de
  sur-promesse que le moteur combat partout ailleurs.
- **Proposition** : `sufficiency.cv_missing_policy ∈ {ignore (actuel), cap_orange (recommandé)}` :
  CV non calculable ⇒ verdict plafonné à 🟠 (reste vendable, on prévient). Mettre la doc §10
  en cohérence (« non calculable → au mieux 🟠 ») — c'est la lecture qui réconcilie §3 et §10.

### T5 — Le critère « Qualité (FC/altitude/distance) » ne mesure que la FC.

- **Théorie** §10 : « Qualité (FC/altitude/distance) — majoritaire / partielle / quasi absente ».
- **Code** (`sufficiency.py:126-134`) : fraction d'activités **avec FC** uniquement.
- **Pourquoi c'est important** : l'altitude est plus critique encore que la FC — une
  activité sans altitude est **exclue de la courbe record** (VC/E mal contraints) et sa
  `ga_km` vaut sa distance brute (vitesse ajustée sous-estimée dans la calibration ultra,
  D+ = 0). Un athlète Strava-export dont 60 % des traces n'ont pas d'altitude passerait
  « qualité 🟢 » alors que son jumeau est bancal.
- **Proposition** : niveau = **pire** des deux fractions (FC, altitude), détail affichant
  les deux. (La « distance » est de fait toujours présente — sinon l'activité est rejetée à
  l'ingestion — le libellé de la doc peut le préciser.)

### T6 — Le repli « VC+E » n'utilise pas la VC.

- **Théorie** §3 : « extrapolation par VC et exposant E ».
- **Code** (`calibration.py:88-98`) : les régimes blend/vc_e n'utilisent **que** l'enveloppe
  puissance (coef·t^(−α), soit E) + pénalité D+ + offset. La VC ne participe à la prédiction
  nulle part (elle ne sert qu'au « % de VC » narratif et à la plausibilité).
- **Pourquoi c'est important** : naming trompeur pour le lecteur de la doc ET du code ; et
  une occasion manquée — la VC est une **borne supérieure naturelle** de sanité
  (`v(T_ultra) ≤ ~0,9·VC` pour T > 10 h ; à ~63 % chez Valentin, très loin de saturer).
- **Proposition** : a minima renommer dans la doc (« enveloppe d'endurance (E) recalée » ) ;
  optionnellement ajouter le clamp de sanité `v ≤ vc_ultra_cap_fraction·VC` (défaut : off)
  qui protégerait le blend d'un offset aberrant.

### T7 — `examples/nice-100m.json` est référencé partout mais a été supprimé du dépôt.

- CLAUDE.md l'annonce committé (« carnet de route de référence (golden test) »),
  `test_golden.py:111` le lit, le README du service le mentionne — mais le commit `59aae8b`
  (« màj (sans les fichiers lourds) ») l'a **supprimé** avec les fichiers lourds. C'est un
  fichier de 17 lignes de données publiques (kilométrages officiels des ravitos). Le golden
  réel est donc cassé sur un clone frais, même avec l'archive fournie.
- **Proposition** : le restaurer depuis l'historique (`git show 59aae8b^:…`), tel quel.

### T8 — `official_dplus_m` : champ d'entrée jamais lu ; le « calibré pour reproduire le D+ officiel » est manuel.

- **Théorie** §1.2 : « la fenêtre [de lissage] est **calibrée pour reproduire le D+
  officiel** ». En réalité la fenêtre est une constante (150 m) choisie une fois sur le cas
  Nice ; le champ `RaceSpec.official_dplus_m` (présent, parsé — `course/spec.py:43,79`)
  n'est utilisé nulle part.
- **Pourquoi c'est important** : le D+ lissé est **très** sensible à la fenêtre (c'est une
  variation totale : tout le bruit résiduel s'additionne). 150 m reproduit 8 874 ≈ 8 900 m
  sur la trace Nice ; rien ne garantit cela sur une trace de course plus/moins échantillonnée
  — et `dplus_per_km` est une **entrée de la régression** (β2).
- **Proposition** : quand `official_dplus_m` est fourni, **auto-calibrer la fenêtre** par
  bissection (bornes p.ex. [50 m ; 400 m]) pour reproduire le D+ officiel à ±1 %, sinon
  150 m. Flag `course.smooth_window_mode ∈ {fixed (défaut), fit_official_dplus}`. Le golden
  fournit official_dplus_m=8900 : vérifier que la fenêtre auto ≈ 150 m (belle validation).

---

## 3. Incohérences internes à la chaîne de calcul (C1–C9)

> Ici la doc n'est pas en cause : ce sont des endroits où **deux étages du code ne parlent
> pas la même langue**, ou bien où une approximation silencieuse mérite d'être soit
> corrigée, soit documentée et mesurée.

### C1 — Le D+/km de la calibration et celui de la prédiction ne sont pas à la même échelle. ⚠ à mesurer d'abord

- **Le fait** : le D+ des **activités** vient d'une altitude lissée sur **5 s** (~15–20 m de
  base à allure ultra ; `twin/record.py:84-86,118-119`), le D+ du **parcours** d'une altitude
  lissée sur **150 m** (`course/profile.py:148-150`). Le D+ étant une variation totale, il
  croît mécaniquement quand la fenêtre diminue : la même montagne donne un D+ athlète
  **systématiquement supérieur** au D+ parcours (ordre de grandeur typique baromètre 1 Hz :
  +5 à +20 %).
- **Conséquence** : β2 est **appris** sur un axe D+/km gonflé puis **appliqué** à un D+/km
  dégonflé ; |β2| est sous-estimé au passage (dilution par erreur de mesure sur le
  régresseur) ; la pénalité de terrain appliquée à la course est donc doublement trop douce
  → biais **optimiste** sur les parcours raides. S'ajoute une incohérence de convention de
  pente : la pente activité = Δalt/Δdist_appareil (≈ sinus) vs pente parcours = Δalt/Δx
  horizontal (= tangente) — ~2 % d'écart sur i à 20 %, ~9 % à 45 %.
- **⚠ Protocole** : le fixture Montagnhard ne contient que des agrégats — **cet effet lui est
  invisible** (avertissement explicite du CLAUDE.md). Étape 1 : **mesurer** chez Valentin
  (rejouer l'archive réelle en loggant D+@5s vs D+@150m par ultra ; ajouter cette sortie de
  diagnostic au CLI). Étape 2 seulement : si le biais est confirmé ≥ ~5 %, harmoniser
  (lisser l'altitude d'activité sur une **base de distance** ~150 m — la mécanique
  « searchsorted sur dmono » de la pente ±50 m se réutilise telle quelle), derrière
  `twin.dplus_basis ∈ {time_5s (défaut), distance_150m}`, puis **régénérer le fixture** et
  recapturer le golden réel (procédure DIAGNOSTIC §8). Ne jamais présenter un A/B fixture
  inchangé comme preuve ici.

### C2 — `moving_time_s` compte les pauses de montre comme du mouvement.

- **Le fait** : le canal vitesse canonique est **interpolé à travers les trous
  d'enregistrement** (`ingest/canonical.py:107-118`) : pendant une pause (auto-pause,
  ravito montre stoppée), la vitesse interpolée entre 2,8 m/s et 2,8 m/s… reste 2,8 m/s,
  alors que la distance, elle, fait un plateau. `moving_time_s = Σ(speed > 0,5 m/s)`
  (`twin/record.py:138-142`) compte donc ces pauses comme du mouvement.
- **Conséquence** : le mode `speed_basis=moving` (correctif H2 du DIAGNOSTIC, censé
  dé-diluer l'allure des longs arrêts) est **structurellement émoussé** — il ne voit que les
  arrêts enregistrés, pas les pauses.
- **Proposition** : calculer le mouvement sur la **distance** : `np.diff(dist_m) >
  moving_speed_threshold_ms·Δt` (cohérent avec la base distance de tout le reste). Une ligne,
  gros gain de sens ; le flag `speed_basis` existant devient réellement testable sur archive.

### C3 — L'intervalle Monte-Carlo ignore l'incertitude des paramètres — donc le levier d'extrapolation. ★ le plus gros levier scientifique

- **Le fait** (`predict.py:185-191`) : le MC tire `v ~ N(v_point, σ)` puis `T = Deq/v`.
  Deux choses manquent :
  1. **La rétroaction du point fixe** : un tirage lent allonge T, donc abaisse encore v(T).
     Gain de boucle g = |β1|/v ≈ 0,35/6,58 ≈ 0,053 → amplification 1/(1−g) ≈ +5–6 % de
     largeur et une queue droite plus lourde (vérifié numériquement : I80 1,66 h → 1,74 h
     sur les chiffres du golden).
  2. **La covariance des β** : la loi prédictive d'une régression pondérée est
     `Var = σ²·(1 + x₀ᵀ(XᵀWX)⁻¹x₀)` ; le terme de levier `h₀ = x₀ᵀ(XᵀWX)⁻¹x₀` explose quand
     la cible sort de l'enveloppe des (ln T, D+/km) d'entraînement. **C'est mathématiquement
     le même phénomène que les « plis d'extrapolation »** que le gate honnête marque dans la
     LOO — mais l'intervalle vendu ne le voit pas. Mesuré (8 ultras synthétiques, cible
     ln T = 3,42 > max entraînement 3,18) : I80 passe de **1,7 h à 3,6 h** en incluant le
     levier. Le critère « largeur d'intervalle » du gate honnête ne peut donc pas attraper
     l'extrapolation qu'il est censé attraper : il ne mesure que σ.
- **Proposition** : `prediction.mc_mode ∈ {sigma_only (défaut), predictive}` :
  tirer β ~ N(β̂, σ²(XᵀWX)⁻¹) (pinv si mal conditionné) **+** ε ~ N(0, σ), et re-résoudre le
  point fixe **vectorisé** sur les 5 000 tirages (l'itération amortie s'écrit directement
  sur un tableau numpy ; coût négligeable). Régimes blend/vc_e : inchangés (σ forfaitaire
  déjà élargi). Effets attendus, à vérifier dans `ab_montagnhard` (colonne i80) : golden
  quasi inchangé au centre, intervalle élargi surtout sur cibles extrapolantes ; les seuils
  `interval_rel_width_*` devront éventuellement être re-calibrés — c'est le but : la largeur
  devient **informative**.
- **Pédagogie** : aujourd'hui l'intervalle répond à « quelle est la dispersion de tes courses
  autour de TON modèle supposé exact ? » ; en mode prédictif il répond à « …en avouant qu'on
  n'est pas sûr du modèle, surtout là où tu n'as jamais couru ». Pour un produit qui vend de
  l'honnêteté, la seconde question est la bonne.

### C4 — L'offset du régime blend ignore les poids (récence ET maximalité).

- **Le fait** (`calibration.py:421-430`) : `offset = mean(vga_i − base_i)` **non pondéré**,
  alors que le régime blend est précisément celui où l'on tombe quand N_eff < 3 — c'est-à-dire
  quand les vieux ultras ne doivent plus peser. Cas concret : un athlète avec 3 ultras dont
  une sortie facile (poids maximalité 0) — elle est neutralisée dans la régression, mais
  **récupère un poids plein** dans l'offset du blend si N_eff démote.
- **Proposition** : moyenne pondérée par `w = récence × maximalité` (repli : non pondérée si
  Σw = 0). Les tests actuels du blend (1 ultra) sont insensibles (moyenne d'un élément) —
  ajouter le test du cas démoté.

### C5 — L'heure « d'arrivée » au ravito inclut l'arrêt à ce ravito.

- **Le fait** (`pacing/plan.py:116`) : `arr = clock + mouvement_i + arrêt_i` → l'heure
  affichée est celle du **départ** du ravito, pas de l'arrivée ; `cum_clock`, les fenêtres
  lo/hi et le drapeau nuit héritent du décalage (5–15 min par poste).
- **Proposition** : `arrival = clock + mouvement` (affiché), puis `clock = arrival + arrêt`.
  Le total d'horloge ne bouge pas (arrêt d'arrivée = 0) ; les tests pacing existants restent
  verts, en ajouter un qui fixe la sémantique.

### C6 — Les fenêtres horaires mettent aussi à l'échelle les arrêts.

- **Le fait** (`pacing/plan.py:128-132`) : bandes = percentiles de `cum_clock·(mc/tpred)` où
  cum_clock inclut les arrêts — dans un scénario lent, 1 h 45 d'arrêts devient ~1 h 55, ce
  qui n'a pas de sens physique (on ne reste pas plus longtemps au ravito parce qu'on court
  moins vite — plutôt l'inverse en pratique).
- **Proposition** : n'appliquer le multiplicateur qu'au **mouvement cumulé** et rajouter les
  arrêts cumulés constants : `band_i = percentile(cum_move_i·mult) + cum_stop_i`. Effet :
  fenêtres légèrement plus étroites en début de course (plus juste).

### C7 — Le découplage se calcule sur moitiés de temps écoulé, arrêts compris.

- **Le fait** (`twin/record.py:122-131`) : efficacité = v_ga/FC moyennée par moitié
  d'**indices temps** ; pendant les arrêts, v≈0 avec FC > 60 → efficacité ~0 comptée dans la
  moitié qui contient l'arrêt. Les arrêts étant plus nombreux/longs en 2ᵉ moitié d'ultra, le
  découplage est **gonflé** chez les athlètes qui s'arrêtent — pas chez ceux qui s'usent.
  (Accessoirement : pas d'exclusion d'échauffement, 1ʳᵉ moitié légèrement flattée — pratique
  standard : ignorer les ~10 premières minutes, cf. la littérature découplage, Smyth 2022.)
- **Proposition** : `twin.decouple_basis ∈ {elapsed (défaut), moving}` — ne moyenner que les
  échantillons en mouvement (réutilise C2), optionnellement `decouple_skip_start_s`.
  Cohérent avec T3 (le fade personnalisé mérite un découplage propre).

### C8 — La récence est ancrée sur le dernier ultra, pas sur aujourd'hui ; aucun critère de fraîcheur.

- **Le fait** : `recency_weights` (`calibration.py:156-195`) prend pour référence `max(dates
  des ultras)` : un athlète dont le dernier vrai ultra date de 2019 lui donne un poids 1,0.
  Et le critère « Historique » de suffisance mesure l'**étendue** (min→max), pas la
  **fraîcheur** (max→aujourd'hui/course) : une archive s'arrêtant il y a 8 mois peut être
  🟢 partout. La théorie (§2.7, §9) reconnaît le problème (« recalcul recommandé ») mais
  aucun chiffre ne le porte.
- **Proposition** : (a) nouveau critère de suffisance « Fraîcheur des données » = jours entre
  la dernière activité et la date d'analyse (seuils config, p.ex. 🟢 ≤ 30 j, 🟠 ≤ 90 j),
  date d'analyse injectable (tests) ; (b) option `recency_anchor ∈ {last_ultra (défaut),
  analysis_date}` — en mode analysis_date, tous les ultras d'un athlète « en pause » se
  dévaluent ensemble et le plancher N_eff démote naturellement vers le blend. (b) change le
  golden potentiellement → défaut conservateur, test réel avant bascule.

### C9 — Divers petits écarts de convention (à documenter plutôt qu'à corriger)

- **Deq intégrée sur la distance horizontale** (`course/profile.py:155`) alors que l'abscisse
  officielle est la 3D recalée, et Deq[0] = f₀·5 m au lieu de 0 : ~0,5 % d'écart systématique
  sur parcours alpin, en pratique absorbé par le fait que la calibration athlète a le même
  ordre d'approximation. → une note dans twin-theory §1 suffit (ou intégrer f sur la 3D
  recalée le jour où C1 harmonise les conventions).
- **`_solve_fixed_point` retourne t silencieusement après 200 itérations** sans signal de
  non-convergence (`predict.py:81-93`) → retourner None ou logger (cas pathologique
  seulement).
- **Le critère « efforts longs proches de la cible » compte les artefacts** (montre laissée
  tourner : 12 h à 1,5 km/h) puisqu'il ne filtre que la durée (`sufficiency.py:109-111`) →
  exiger aussi une vga plancher (p.ex. ≥ `genuine_min_ga_kmh/2`).
- **`build_record_curve` avale les exceptions** d'une activité sans l'ajouter à `skipped`
  (`twin/record.py:198-200`) → compter la casse (`reason: "processing_error"`), sinon le
  diagnostic d'archive ment.

---

## 4. Le rapport dit-il ce que le moteur fait ? (R1–R8)

> Audit du rendu (context/narrative/figures/template) et de l'API. Le principe à défendre :
> **chaque phrase du rapport doit être vraie du calcul réellement exécuté.**

- **R1 — Date de rapport figée** : `context.py:156` — `report_date or datetime(2026, 1, 1)`
  et aucun appelant (CLI, jobs) ne passe de date → tous les PDF affichent « 01/01/2026 ».
  Correctif trivial : injecter `datetime.now()` côté runner/CLI (la date n'est pas dans le
  golden). Idem `report_ref="LL-TWIN"`/`v1.0` jamais surchargés → dériver la référence du
  job id.
- **R2 — VC mise en vedette même quand le moteur la juge non plausible** : le garde-fou
  « pas de % de VC » fonctionne, mais l'encadré VC (valeur, allure, D′) et le texte « ta VC
  est ton seuil » s'affichent sans tester `plausible` (`context.py:186-191`,
  `narrative.py:120-127`, template :148-155). Le moteur refuse d'en tirer un ratio mais le
  rapport la met en gros. → masquer/annoter (« estimation non plausible, données courtes
  suspectes ») quand `plausible=False`.
- **R3 — Légende de la bande cumulée fausse** : « les incertitudes s'additionnent au fil des
  heures » (`narrative.py:359-363`) alors que le calcul applique un **facteur d'échelle
  global** (largeur relative constante). Corriger la phrase (« la fourchette croît
  proportionnellement au temps couru ») — ou, si C6/C3 changent la structure, la réécrire
  d'après le calcul.
- **R4 — Deux « % de ta VC » différents sous le même libellé** : intensité prédite/VC
  (synthèse) vs moyenne des ultras passés/VC (`caption_record`). → étiqueter distinctement.
- **R5 — La MAE affichée n'est pas celle du verdict** : le gate honnête décide sur la MAE
  d'interpolation, le rapport n'affiche que la MAE brute (abstract, `cv_pourtoi`,
  `caption_validation`). → afficher les deux chiffres avec les mots du gate (« erreur en
  interpolation X %, brute Y % dont extrapolation Z % ») — c'est plus honnête ET meilleur
  commercialement quand la brute est gonflée par un pli d'extrapolation.
- **R6 — Seuils de présentation en dur** (`narrative.py:23-28` : E_DIESEL 1,12 / E_FADE 1,30 /
  DURAB 15/25 % / VC_FRAC 0,70/0,85 ; `context.py:58,215` ; bande ±5 % de la figure CV
  dupliquant `cv_error_green_pct` ; libellés « 80 % » en dur alors que les percentiles sont
  en config). Contraire à la règle « aucune constante en dur » du CLAUDE.md. → les déplacer
  dans un bloc `narrative` de twin.config.json (mêmes valeurs par défaut), et dériver les
  libellés des percentiles/du seuil configurés (le patron `fade_pct` dérivé de `fade_delta`
  existe déjà — le généraliser). Arrondir la valeur affichée ET comparer la valeur affichée
  aux seuils (éviter « ≈ 70 % » avec deux conseils opposés selon la 3ᵉ décimale).
- **R7 — Concurrence matplotlib** : `figures.py` utilise l'API pyplot **globale** ; deux jobs
  FastAPI simultanés (threadpool anyio) peuvent entrelacer leurs figures (corruption).
  → passer à l'API objet (`Figure`/`FigureCanvasAgg`), zéro état global ; et borner la
  concurrence des jobs (une file, cf. E2).
- **R8 — Le champ `error` des jobs fuit des internals** : le RuntimeError LaTeX embarque
  25 lignes de log avec chemins du conteneur, renvoyées telles quelles par `GET /jobs/{id}`.
  → message public générique + log serveur détaillé. Robustesse associée : au démarrage,
  balayer les jobs `running` orphelins (crash) → `failed`, et purger les `upload/` restants
  (la purge dans `finally` ne survit pas à un SIGKILL — la promesse « supprimées
  immédiatement après analyse » doit tenir aussi en cas de crash).

---

## 5. Lecture théorique de fond (S1–S5) — pistes non triviales

### S1 — La forme fonctionnelle v = β0 + β1·ln T face à la loi de puissance

Le choix actuel (linéaire en ln T) est raisonnable et **empiriquement validé par la LOO**.
Remarques :

- Une loi de puissance (Riegel) s'écrirait `ln v = a − α_ultra·ln T` — même nombre de
  paramètres, jamais négative, et **directement comparable à l'exposant court** du jumeau :
  α_ultra ≈ |β1|/v ≈ 0,35/6,58 ≈ **0,053** chez Valentin, contre **α_court = 0,181** sur
  30 min–6 h. Autrement dit l'athlète décline ~3× moins vite (par e-fold de durée) en
  régime ultra que ce que son enveloppe courte laisse penser — c'est attendu (les domaines
  d'intensité ne sont pas les mêmes), mais ça n'est **documenté nulle part**, et ça a une
  conséquence directe : le **repli blend extrapole avec la pente courte α = 0,181**, donc
  devient nettement **pessimiste** dès que la cible dépasse la durée de l'ultra d'ancrage.
  À documenter (twin-theory §3) et à mesurer (A/B : MAE LOO de `ln v ~ ln T` vs `v ~ ln T`
  sur fixture + réel). Aucun changement de défaut sans preuve.
- Garder en tête le rasoir : avec n = 3–8 points, le choix de forme importe moins que la
  gestion des poids/leviers — déjà traitée par maximalité + gate honnête.

### S2 — Ce que Minetti ne couvre pas (et que le moteur fait bien de plafonner)

Minetti 2002 = coût **métabolique** en régime permanent sur tapis, athlètes entraînés,
±45 %. Trois limites connues, à garder imprimées dans le rapport (elles y sont) :
descente = plafond mécanique/excentrique et non métabolique (Vernillo 2017) ; la fatigue
augmente le coût en fin d'ultra (le fade + la durabilité le portent) ; la technicité
n'existe pas dans le GPX. Le plafond f ≤ 3 et l'écrêtage ±0,45 sont les bons garde-fous.
**Piste S2b (backlog)** : pénalité hypoxique optionnelle — au-dessus de ~1 500 m, la
puissance aérobie chute d'environ 6 %/1 000 m (Wehrlin & Hallén 2006) ; un terme
`−k·max(0, alt−1500)` pondéré par le temps passé, flag off par défaut, rendrait les courses
alpines hautes (UTMB, Hardrock) moins optimistes. À valider sur données réelles avant
d'activer quoi que ce soit.

### S3 — La VC sur 10–90 min est une « VC de terrain », pas la CP de laboratoire

Assumer (documenter) que la fenêtre longue donne une borne **basse** de la VC classique et
un D′ non interprétable (déjà signalé peu fiable). Pour l'usage (narratif % VC + sanité),
c'est le bon compromis ; la littérature récente sur la « résilience » (Jones 2024) justifie
même de préférer une VC longue-durée pour l'ultra. Améliorations légères possibles :
ajuster `v = VC + D′/t` par moindres carrés **sur v** (pondération correcte) plutôt que
`d = VC·t + D′` (le fit sur d donne des R² flatteurs et surpondère les longues durées —
Hinckson & Hopkins 2005) ; et documenter que le bootstrap sur des points d'enveloppe
corrélés sous-estime l'incertitude. Priorité basse : la VC n'entre pas dans la prédiction.

### S4 — L'enveloppe record est un maximum empirique, pas une frontière ajustée

`fit_endurance_exponent` fait un polyfit OLS sur les points record — points qui sont des
**maxima** (statistiques d'ordre), pas des tirages symétriques. Deux raffinements possibles
si un jour l'enveloppe devient plus centrale au produit : régression quantile haute
(τ ≈ 0,9) en log-log, ou ajustement de la frontière concave. Aujourd'hui, avec le
self_relative qui immunise la maximalité contre un biais d'échelle, le gain marginal est
faible. Backlog.

### S5 — Vers des intervalles empiriquement calibrés (conformal léger)

La LOO produit déjà des erreurs hors-échantillon pondérées. Une **couche de calibration
conforme** (split/jackknife+ : élargir l'intervalle pour que ~80 % des ultras LOO tombent
dedans) donnerait une garantie de couverture au sens fréquentiste, complémentaire de C3.
Avec n = 5–8, c'est grossier mais honnête, et ça se **teste** : « l'intervalle 80 % couvre
6/8 de tes propres courses ». À prototyper après C3 (qui corrige déjà le gros du problème).

---

## 6. Efficacité & robustesse d'exécution (E1–E3)

- **E1 — Mémoire d'ingestion** : `ingest_path` matérialise **toutes** les activités
  canoniques (7 canaux float64 à 1 Hz) avant `build_twin` — ~300 Ko/h d'activité, soit
  **3–4 Go** pour l'archive Montagnhard (12 285 fichiers) sur le VPS partagé. Le walker est
  déjà un générateur ; il manque un chemin streaming : consommer chaque activité
  (résumé + contributions record) puis la libérer. Refactor proposé : `build_twin` accepte
  un itérable ; `IngestResult` garde résumés + skipped, pas les tableaux. (API/CLI
  inchangés.) Gain : mémoire ~O(1 activité) au lieu de O(archive).
- **E2 — Concurrence de jobs** : cf. R7/R8 — figures via API objet, file de jobs à
  concurrence 1–2 (le rendu XeLaTeX est déjà multi-secondes ; sérialiser coûte peu),
  balayage au démarrage (jobs orphelins + uploads).
- **E3 — Micro-numérique** (au fil de l'eau, sans priorité) : `np.nanmax` sur fenêtres
  glissantes via `sliding_window_view` si un profil CPU le justifie ; seed MC dérivé du job
  pour éviter des artefacts d'échantillonnage identiques entre rapports (à discuter :
  la reproductibilité par rapport est aussi une feature).

---

## 7. Plan d'implémentation proposé (à valider item par item)

> Règles héritées du dépôt, appliquées partout : chaque changement de comportement derrière
> un **flag** (défaut = comportement actuel), suite pytest verte, tableau
> `python -m tools.ab_montagnhard` collé dans DIAGNOSTIC.md quand la calibration est
> touchée, golden intact (ou décision explicite de recapture par Valentin), fixture
> régénéré si les *features* changent (C1 !).

### Lot P0 — Correctness & honnêteté, sans risque golden (1 PR, ~1 journée)

| # | Item | Fichiers | Flag / défaut | Preuve |
|---|---|---|---|---|
| T7 | Restaurer `examples/nice-100m.json` | examples/ | — | test_golden collecté |
| R1 | Date de rapport réelle + réf de rapport par job | runner, cli, context | — | test narratif |
| R2 | Masquer/annoter la VC si `plausible=False` | context, narrative, template | — | test narratif |
| R3, R4, R5 | Légendes : accumulation→échelle, 2 « % VC » étiquetés, MAE gate+brute affichées | narrative | — | test narratif |
| T4 | CV incalculable ⇒ plafond 🟠 | sufficiency | `cv_missing_policy` = `cap_orange` (nouveau défaut assumé, doc §10 alignée) | test_sufficiency nouveau + existants verts |
| T5 | Qualité = pire(FC, altitude) | sufficiency | — (la doc le promet déjà) | test |
| C4 | Offset blend pondéré | calibration | — (bugfix, régimes non goldenisés) | test cas démoté |
| C5 | Arrivée ravito avant arrêt | pacing/plan | — (sémantique, total inchangé) | test pacing |
| C9d | Compter les activités en échec dans `skipped` | twin/record | — | test |
| T1 | Brancher `vc_short_effort_floor_s` (no-op à 600) + doc §2.3/2.4 corrigée | twin/record, config, doc | défaut 600 = actuel | golden inchangé |
| T2 | Critère plat symétrique | twin/record | `vc_flat_symmetric=false` | golden inchangé |
| R6 | Seuils narratifs → bloc config `narrative`, libellés dérivés | narrative, context, config | mêmes valeurs | tests narratifs |
| R8/E2 | Sanitiser `error` public, balayage au démarrage (jobs orphelins + uploads), figures API objet | api, jobs, report/figures | — | test api |

### Lot P1 — Science, chacun avec preuve A/B (1 PR par item)

| # | Item | Flag / défaut | Preuve exigée | Risque golden |
|---|---|---|---|---|
| C3 | MC prédictif (β-covariance + point fixe vectorisé) | `prediction.mc_mode=sigma_only` | ab_montagnhard (i80 avant/après), test synthétique de couverture, golden inchangé par défaut | nul par défaut ; à activer après re-calibrage des seuils de largeur |
| C2 | moving_time sur diff(dist) | comportement de `speed_basis=moving` seulement | test synthétique avec pause ; mesure réelle H2 chez Valentin | nul (défaut elapsed) |
| T3 | Fade personnalisé par durabilité | `pacing.fade_source=config` | plan Nice avant/après (Δ=0,085 ↔ X=15,7 % : quasi no-op pour Valentin si X≈19–24 → Δ≈0,10–0,13, à voir), bornes | nul par défaut |
| C7 | Découplage en mouvement (+ skip échauffement) | `twin.decouple_basis=elapsed` | mesure réelle (durabilité avant/après) — ⚠ invisible au fixture | nul par défaut |
| C8 | Critère fraîcheur + `recency_anchor` | critère nouveau ; `recency_anchor=last_ultra` | tests ; réel avant bascule anchor | faible (nouveau critère peut passer des verdicts 🟢→🟠 : voulu) |
| C1 | Diagnostic D+@5s vs D+@150m (CLI), puis harmonisation | `twin.dplus_basis=time_5s` | **mesure réelle d'abord** ; si confirmé : fixture régénéré + golden réel recapturé | élevé si activé — c'est un changement de *feature* (protocole complet) |
| E1 | Ingestion streaming | — (interne) | RSS mesurée sur grosse archive ; sorties identiques | nul |
| C6 | Bandes : arrêts non scalés | `pacing.scale_stops=true` (actuel) | test fenêtres | nul par défaut |

### Lot P2 — Backlog théorique (après P0/P1, chacun sur preuve)

- T8 : fenêtre de lissage auto-calibrée sur `official_dplus_m` (validation : retrouver
  ~150 m sur Nice).
- S1 : A/B forme log-log de la régression ultra ; documenter α_court vs α_ultra et le biais
  pessimiste du blend en extrapolation de durée.
- S5 : couche conforme sur la LOO (« l'intervalle couvre k/n de tes propres courses »).
- S2b : terme hypoxique optionnel (courses en haute altitude).
- T6 : clamp de sanité `v ≤ frac·VC` sur les replis + renommage « VC+E » → « enveloppe E ».
- S3 : fit VC sur v (pondération) plutôt que sur d ; note bootstrap.
- S4 : enveloppe par régression quantile.
- C9a : conventions Deq (3D, Deq[0]=0) — avec C1.

### Ce qu'on ne fera pas (déjà tenté et rejeté — DIAGNOSTIC §5, on n'y revient pas)

- Filtrer les ultras à `Deq > Deq_cible` (biais optimiste, détruit le régime cible).
- Pondération par noyau en ln(T) comme levier principal (instable à n = 8).
- Réécrire les fondations physio (Minetti/VC/Riegel/durabilité) : elles sont correctes ;
  tous les correctifs ci-dessus **conservent** ces fondations.

---

## 8. Références

Celles déjà citées par le projet : Minetti et al. 2002 (J Appl Physiol 93:1039) ; Poole et
al. 2016 (MSSE) ; Jones & Vanhatalo 2017 (Sports Med) ; Riegel 1981 (Am Sci 69:285) ;
Maunder et al. 2021 (Sports Med, durabilité) ; Jones 2024 (J Physiol, résilience) ; Smyth
et al. 2022 (découplage marathon, n = 82 303 — déjà dans references.bib) ; NOAA (solaire).

Ajoutées par cette revue :

- **Monod & Scherrer 1965**, Ergonomics 8:329 — le modèle hyperbolique originel (contexte T1/S3).
- **Hinckson & Hopkins 2005**, MSSE 37:696 — sensibilité des estimations CP/D′ à la forme du
  fit (S3).
- **Vernillo et al. 2017**, Sports Med 47:615 — coûts et contraintes de la descente (S2).
- **Wehrlin & Hallén 2006**, Eur J Appl Physiol 96:404 — ~−6 %/1 000 m de puissance aérobie
  en altitude (S2b).
- **Hoffman 2014**, IJSPP 9:1054 — pacing des vainqueurs de 100-miles (positive split
  10–25 %, contexte T3/fade).
- **Kish 1965**, *Survey Sampling* — taille d'échantillon effective (déjà implémentée, §3).
- **Seber & Lee 2003**, *Linear Regression Analysis* — variance prédictive
  σ²(1 + x₀ᵀ(XᵀWX)⁻¹x₀) (C3).
- **Romano, Patterson & Candès 2019**, NeurIPS — Conformalized Quantile Regression (S5) ;
  **Vovk et al. 2005**, *Algorithmic Learning in a Random World* (cadre conforme).
