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

## Phase 1 — la statistique de l'intervalle (branche `twin-v2/phase-1-intervalle`)

**Livré, défauts inchangés (golden intact, tableau §4 intact).**
- A2 `calibration.link=log` : régression sur ln v, point fixe analytique, MC sans plancher,
  LOO/β-covariance/scores dans le lien, écart-type de ln T par delta-méthode (pente et
  rétroaction du point fixe comprises), bandes asymétriques `T·exp(±h)`.
- A1 `calibration.duration_term=prior_shrunk` (+ `duration_shrink_lambda`,
  `duration_prior_source`, `duration_prior_alpha_population`) : ridge de b vers −α dans le
  fit, la covariance et chaque pli ; `Prediction.leverage` et `sd_rel` exposés.
- A3 `prediction.interval_source=studentized_scale` (+ `_mad`, `_signed`) : κ = RMS pondéré
  des scores studentisés, quantiles de Student à n_eff − p ; `_stats.py` sans scipy.
- Outillage : `override_config`, `twin-engine --set`, `tools/banc --variant` (plusieurs
  configs sur un décodage) ; `tools/backtest` lit `sd_rel`/`leverage` du moteur.
- Tests : `tests/test_phase1_interval.py` (21), variantes du banc, `--set`.

**Banc reçu (2026-09-15, dix variantes, trois recaptures de Nice) et décisions
(DIAGNOSTIC §10.1–10.4).**
- Les leviers n'agissent qu'en régime `regression` : 9 coupures sur 30, toutes du dev_set
  sauf deux refusées. Les deux cas frais vendus (Lolo, régime `blend`) ne bougent dans
  aucune variante → **règle (d), aucun défaut basculé**.
- A1 (prior −α) est le levier qui agit : la pente en durée n'est identifiée par les ultras
  d'aucun athlète, λ = 2, 5 et 10 donnent la même chose ; levier de la cible Nice 3,0 → 0,9,
  Winkler 80 des 13 vendus appariés 0,570 → 0,534 (linéaire) / 0,552 (log), Chianti 2025
  devient vendable avec une bande qui couvre ; le central est tiré vers plus lent (Val 2025 :
  +4 à +6 % trop lent ; Crasse : juste). A2 (log) seul ne gagne rien de mesurable et coûte un
  cas de 0,4 h (Montagnhard 2026) ; retenu pour la référence comme cadre du prior. A3 seul
  élargit (Student à ν ≈ 1 à petit n_eff) ; avec le prior il est neutre à n_eff 11 et rend
  la couverture 80 que le prior perd à petit n. MAD et signé : rejetés (chiffres au carnet).
- **Rapport de référence** : `examples/twin.config.reference.json` (log + prior + studentisé ;
  depuis la Phase 3, prior et queue d'enveloppe lus sur l'efficacité-durée) ;
  Nice 2026 : **34,33 h**, fourchette 31,98–36,87, sécurité 29,83–39,52 (28 % du central
  contre 49 % avant), central +2,0 h par rapport aux défauts (32,33 h) — consigné comme
  « activé pour Val, défaut non basculé ».
- Sortis du banc : borne basse des bandes linéaires plafonnée à 0 h (MIUT studentisé donnait
  −24,9 h ; aucun cas servi touché) ; le gabarit nomme la méthode servie.
- Phase 1 close ; le golden déterministe et le tableau §4 sont ceux des défauts, inchangés.

## Phase 2 — le temps réel d'un ultra (même branche `twin-v2/phase-1-intervalle`, à la demande de Valentin)

**Livré, défauts inchangés (golden intact, tableau §4 intact, 310 tests).**
- Mesures par activité (`ActivitySummary`) : plateaux de distance ≥ 60 s (`stops_s`,
  `n_stops`), part de nuit, rapport des moitiés hors plateaux, altitude moyenne (efforts
  ≥ 6 h) ; `GenuineUltra` porte écoulé, arrêts, nuit, moitiés, altitude.
- B4 `calibration.stops_model=personal|spec` (+ `stops_duration_elasticity`,
  `stops_rate_population`) : base hors plateaux, taux personnel pondéré, élasticité, dispersion
  dans l'écart-type et le MC, LOO au taux des autres ultras contre l'écoulé réel ; plan qui
  répartit les arrêts personnels au prorata de la politique ; `Prediction.moving_hours`,
  `stops_hours`, `stops_rate`, `stops_model`.
- C2 `calibration.night_term=prior_shrunk` (+ `night_prior_log_per_share`,
  `night_shrink_lambda`) : quatrième colonne de la régression (écart de part de nuit), prior
  ridge, covariance 4 × 4, delta-méthode, LOO ; nuit de la cible depuis le calendrier de la
  spec, point fixe itéré, MC sur grille ; au banc, calendrier lu dans l'activité du jour
  (`race_meta`).
- Fade `pacing.fade_source=splits` : Δ des moitiés, replis durability → config,
  `PacingPlan.fade_source_used` ; `tools/score_plan` : forme du plan contre les 293 passages
  réels, ancrée sur le temps officiel, fade × arrêts, cas frais séparés.
- C3 `prediction.environment_term=declared` (+ `heat_ref_c`, `heat_cost_per_c`,
  `altitude_cost_per_km`) : chaleur déclarée (`RaceSpec.heat_c`) et différentiel d'altitude,
  facteur dans le point fixe, MC et bandes.
- Outillage : `stops_policy_min` partagé par le plan et la prédiction, `predict_race` reçoit
  la spec, `analyze_preview` aussi ; registre enrichi (`stops_rate_personal`, `fade_delta_splits`,
  `durability_pct`, `night_*`, `moving_h`, `stops_h`, `env_factor`) ; le rapport dit les arrêts
  personnels.
- Tests : `tests/test_phase2_temps_reel.py` (14).

**Premier banc reçu (2026-09-15, dix variantes, scoreur, trois recaptures) — DIAGNOSTIC
§10.5–10.8.**
- **B4 invalide au premier passage** : la base hors plateaux avait retiré la garde du plancher
  de vitesse écoulée ; des enregistrements quasi immobiles (bivouac 38 h, journées d'étape,
  montres laissées tourner) sont entrés comme vrais ultras (taux d'arrêt jusqu'à 1 800 min
  par heure de mouvement, MAE des vendus à 927 %). Garde rétablie sur la vitesse écoulée, le
  domaine ne bouge plus avec le modèle d'arrêts ; second passage demandé (B4, B4e, B4spec,
  RB4, Nice RB4).
- **C2** : sans a priori le coefficient de nuit est nul ou positif (Val +0,05 : ses courses
  nocturnes sont ses plus rapides, confusion avec le type de course) ; avec un prior de
  −10 % à pleine nuit, le prior fait tout, aide les courses de jour et dégrade les cibles
  nocturnes. Défaut non basculé, non activé pour Val (Nice sous RC2 : 34,29 h, identique).
- **C3** : le différentiel d'altitude dégrade 8 coupures sur 9 (MAE 10,3 → 11,8 sur les 13
  vendus). Rejeté ; le flag reste pour une chaleur déclarée.
- **Fade** : sur 30 courses, les athlètes sont en avance sur le plan à mi-course de 17 à
  25 min, 27 fois sur 30 — la dérive réelle est bien plus forte que Δ = 0,085 (Crasse
  ralentit de 22 % entre ses moitiés, Δ mesuré 0,245, écrêté à 0,13). `splits` gagne sur le
  dev_set (2,21 → 1,80 % du temps), égalité sur les cas frais ; la répartition personnelle des
  arrêts n'aide nulle part. Test d'amplitude à faire au scoreur (`--set`, quelques secondes)
  avant de décider la source et la borne.
- **Régression attrapée par le banc de base** : la LOO réécrite lisait l'écart-type des plis
  en lien linéaire au temps prédit au lieu du point réel ; bandes déplacées de quelques
  dixièmes d'heure à défauts inchangés. Corrigée, verrouillée par test.

**Second passage reçu (2026-09-15) — Phase 2 close (DIAGNOSTIC §10.5, §10.7, §10.9).**
- Le passage de base est identique à l'« avant » : la régression des bandes est fermée.
- **B4** sur garde rétablie : mixte. Nice 34,18 h, bande 28 → 24 %, LOO 7,4 → 6,2 % ; mais
  MAE des 13 vendus 10,2 → 10,4, et le plan que ce modèle répartit est mesuré moins juste sur
  les 30 courses. Élasticité et `spec` rejetés. Défaut non basculé, non activé pour Val ;
  `stops_rate_population` = 0 (un taux inventé dégradait les replis vc_e). Les taux personnels
  sont consignés pour la logistique (Val 6,2 min par heure de mouvement).
- **Fade : un défaut basculé.** Δ = 0,15 (au lieu de 0,085) améliore la forme du plan sur les
  cas frais (1,89 → 1,77 % du temps, biais à mi-course +17 → +6 min), le dev_set (2,21 → 1,68)
  et trois athlètes sur quatre ; 0,20 dégrade les cas frais ; `splits` et `durability` ne
  battent pas la constante. Borne haute 0,20. Le rapport affiche désormais une dérive de −26 %.
- Configuration de référence inchangée (A2A1A3) ; le nouveau Δ s'applique à tous.

## Phase 3 — l'information manquante sur la pente (même branche, sur « Fonce sur la suite »)

Diagnostic d'entrée (DIAGNOSTIC §10.9) : central trop lent de 4 à 6 % sur la zone d'action,
de 13 % sur Val 2024 (vc_e), trop rapide de 17 % chez Lolo (blend) ; aucun levier de
calibration n'atteint les cas frais vendus. Cause commune : la pente en durée au-delà de
6 h n'est lue nulle part. Quatre leviers, tous derrière flag, défauts inchangés, code livré
et testé (suite complète verte, golden intact), **banc en attente** :

- **B1 efficacité-durée** (`duration_prior_source=efficiency`, `envelope_tail=efficiency`) :
  α_eff lu sur ln(vga ÷ (FC − FC0)) contre ln T, toutes les sorties avec FC ≥ 1 h, FC0
  profilée ; prior de la pente et queue de l'enveloppe des replis. Premier levier qui touche
  les cas frais de Lolo et les coupures 2024 de Val.
- **B2 queue de la courbe record** (`…=record_tail`) : fenêtres de 10 à 36 h mesurées dans
  les vrais ultras, rangées à part (VC, α, figure intacts) ; α_queue de 2 h à la plus longue.
- **P niveau de l'époque** (`level_anchor=vc_epoch`) : chaque ultra ramené à la forme
  actuelle par la VC des 12 mois qui le précèdent ; zéro paramètre, même décalage dans le fit,
  le blend et chaque pli LOO (prédit à son époque).
- **F plancher dépendant de la durée** (`genuine_floor=riegel`, `genuine_max_stop_s`) :
  5,5 × (T ÷ 10 h)^−0,16 sur l'écoulé, garde du plus long arrêt contre le sommeil ; une seule
  définition du domaine pour la calibration, la queue et les diagnostics.

Registre enrichi (`alpha`, `alpha_eff`, `alpha_tail`, `duration_prior_origin`,
`envelope_tail_alpha`, `level_n_anchored`, `level_shift_mean_pct`, `genuine_floor`) ; rapport :
une note « ce qui a servi pour la pente au-delà de six heures » quand un levier est actif.
Feuille du banc : manuel §8 (variantes E1, E2, F, RB1, RB2, RP, RPh, RF, RB1P ; recaptures
nice-RB1/RB2/RP/RF).

**Banc reçu (2026-09-16) — Phase 3 close (DIAGNOSTIC §10.10–10.14).** Base identique à
l'« avant » ; treize vendus appariés, cas frais, zone d'action, Val 2024, quatre recaptures.
- **B1 efficacité-durée : activé pour la référence, défaut non basculé.** 13 vendus : MAE
  10,3 → 8,6, Winkler 80 0,570 → 0,485, couverture 80 54 → 77 % ; zone d'action +4 à +6 % →
  +1 à +2 % (Chianti +3,8 → +0,6, Lavaredo +6,1 → +2,5, MIUT +9,4 → +0,5) ; Val Ecotrail 2024
  (vc_e) +23,8 → +6,9. Les cas frais restent à leur biais (17,2 → 17,4), et la queue
  d'enveloppe fait passer un cas hors domaine (3,5 h réels, prédit 10,06 h) au travers d'une
  garde qui lit le temps prédit contre 10 h : pas de défaut. Nice : 34,33 → **32,43 h**,
  sécurité 28,69 – 36,65 (25 %), LOO 6,4 %.
- **B2 queue de la courbe record : rejeté.** α_queue plus raide que l'α court (0,22 contre
  0,14 chez Val, 0,40 contre 0,30 chez Lolo) : les fenêtres longues mesurent l'usure d'une
  course entière, pas le plafond ; plus lent partout, bandes plus larges, un vendu de moins.
- **P niveau de l'époque : rejeté.** Trois athlètes sur quatre dégradés (13 vendus MAE 16,2,
  Lolo frais −34 / −46 %) : la VC d'une fenêtre de 12 mois mesure la pratique courte de
  l'année, pas la forme d'ultra (décalages de −10 à +45 %). Gain 0,5 : mêmes signes.
- **F plancher dépendant de la durée : non retenu.** Règle MIUT (+9,4 → +4,7 sous R) et
  laisse entrer chez Val une journée de montagne de 15,5 h (pli LOO −18 %) que la garde du
  sommeil ne voit pas ; attend un signal de course (Phase 4).
- Toutes les mesures (α_eff, α_queue, plus long arrêt) restent au registre et au JSON.

## Phase 4 — abandonnée (décision de Valentin, 2026-09-16)

Les données publiques de la course demandaient un export CSV manuel par course ; Valentin
ne veut pas de ce coût. Aucun code écrit. Ce qui en dépendait reste ouvert : le signal de
course pour le domaine (F, §10.13), le fade appris du terrain, la garde du domaine sur la
demande du parcours, la jauge décisionnelle par la cohorte. On passe à la Phase 5, le coût
de pente personnel (C1).

## Phase 5 — le coût de pente personnel (C1, même branche, sur « fonce vers le développement »)

Constat : une seule loi de pente pour tous, corrigée après coup par un terme de terrain
identifié sur trois à douze ultras. Levier, derrière `calibration.slope_cost=personal`,
défaut inchangé, code livré et testé (suite verte, golden intact), **banc en attente** :
- deux facteurs personnels κ_montée, κ_descente sur le surcoût de Minetti, mesurés sur toutes
  les secondes en pente avec FC (écart intra-activité de vitesse par battement de réserve
  cardiaque entre chaque tranche de pente et le plat), sommes par tranche calculées au
  décodage et rejouables au banc sans re-décoder ;
- décomposition exacte de l'équivalent plat de chaque effort et du Deq du parcours en brut +
  surcoût de montée + surcoût de descente : κ s'applique aux deux côtés de la prédiction,
  segments et plan compris ; VC, exposants et courbe record gardent la loi ;
- registre, JSON et rapport disent les facteurs et les heures de mesure.
Feuille du banc : manuel §8 (variantes C1, RC1 ; scoreur sous C1 ; recapture nice-RC1).

**Banc reçu (2026-09-16) — décision différée au retour de Nice (consigne de Valentin).**
Mesure nette et stable : trois athlètes sur trois montent bien plus vite que la loi ne
l'attend à réserve cardiaque égale (κ montée 0,55 à 0,72) et ne descendent pas plus vite
que sur le plat (κ descente collé à la borne 0,5) ; Nice passe de 200,1 à 184,8 km
équivalents et la vga des ultras vallonnés baisse d'autant, le central ne bouge pas
(32,43 → 32,53 h). Mais tel qu'écrit le levier dégrade tout ce qu'on juge : Winkler 80 des
13 vendus 0,485 → 0,567 sous la référence, cas frais −16 / −19 → −21 / −20, forme du plan
1,77 → 1,83, bandes plus larges, LOO de Nice 6,4 → 7,8 %. Deux causes lisibles, consignées
(DIAGNOSTIC §10.15) : la loi n'a pas la bonne forme en descente, et la vitesse personnelle
entre dans une calibration restée sous la loi (maximalité, enveloppe, prior de terrain).
Défaut `minetti`, non activé ; κ mesurés et consignés à chaque coupure.

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

## Choix faits à la place de Valentin (Phase 1)

12. **Prior terrain en lien log** : −0,0170 ÷ 6,40 = −0,0027 par m/km, dérivé du cas de
    référence de juillet comme le prior linéaire ; plancher de σ relatif 0,03.
13. **Écart-type de la cible en lien log par delta-méthode**, pente et rétroaction du point fixe
    comprises ; en lien linéaire la définition historique (sd de v ÷ v) est conservée pour ne
    pas bouger les bandes servies.
14. **Prior de durée** : α du jumeau d'abord, population 0,16 en repli (médiane des α du banc),
    λ = 2 quand activé, balayé 1/2/5/10 au banc ; en lien linéaire le prior vaut −α·v̄.
15. **Échelle studentisée** : RMS pondéré plutôt que MAD (mesuré à part), ν = n_eff − p avec
    p = 3, loi de Student implémentée sans scipy (bêta incomplète, dichotomie).
16. **Trois leviers en un commit moteur** plutôt que trois commits : ils partagent
    `predict.py`, réécrit une fois ; chaque levier a son flag et ses tests.
17. **Pile de référence = A2A1A3** (log + prior + studentisé) plutôt que A1 linéaire, qui fait
    0,534 contre 0,552 de Winkler 80 sur les 13 vendus appariés : l'écart est un cas à 0,4 h ;
    le lien log est un choix de structure (prior en −α sans conversion, bandes bornées,
    asymétrie), consigné comme tel ; le linéaire reprend si la Phase 2 creuse l'écart.
18. **Le central de Nice bouge de +2 h sous le prior** : c'est la règle du chantier
    (« activé pour Val, défaut non basculé ») appliquée à la lettre ; le banc dit 2 cas
    contre 2 sur le central, il tranche la bande. La course tranchera le central.
19. **Fichier de config partiel** (`examples/twin.config.reference.json`, trois clés) plutôt
    qu'une copie complète de `twin.config.json` : le chargeur complète par les défauts, qui
    sont identiques au fichier (testé), et le diff dit exactement ce qui est activé.

## Choix faits à la place de Valentin (Phase 2)

20. **Base « plateaux » plutôt que `speed_basis=moving`** : les arrêts francs sont des plateaux
    de distance ≥ 60 s, la marche lente reste du mouvement (la mesure au seuil de vitesse
    ment sur un canal pauvre, §10.0). Un seul flag, `calibration.stops_model`, pilote la base
    et le modèle ; `twin.speed_basis` reste l'ancien flag, inchangé.
21. **Taux d'arrêt par heure de MOUVEMENT** (r = arrêts/mouvement), pas par heure écoulée : le
    temps prédit s'écrit mouvement × (1 + r) et l'inverse est exact.
22. **Élasticité des arrêts à la durée en config, pas ajustée** : 12 ultras de 10 à 21 h ne
    disent rien de fiable sur les arrêts à 32 h ; e = 0,5 est une variante du banc, 0 le défaut
    quand le levier est activé.
23. **La nuit comme colonne de régression à prior ridge**, plutôt qu'un facteur appliqué après
    coup : même mécanique que terrain et durée, donc cohérence fit / LOO / MC / bandes
    gratuite, et le différentiel (nuit de la cible − nuit habituelle) tombe de la centrée.
    Prior 0 par défaut : sans a priori, l'athlète apporte lui-même la preuve ; un prior
    « littérature » (−0,10 par unité de part de nuit, λ 5) est une variante mesurée.
24. **Calendrier des courses du banc lu dans l'activité du jour** (départ, position médiane,
    fuseau solaire) faute de spec : ce sont des données de course, pas une performance ; consigné
    sous `race_meta` (position au centième de degré).
25. **Le score de forme s'ancre sur le temps officiel** : l'erreur de total appartient au banc,
    la forme au scoreur ; mesures en % du temps et en minutes, biais signé à mi-course.
26. **Coûts d'environnement population** (0,4 %/°C au-dessus de 15 °C, 5 %/1 000 m au-dessus
    de l'altitude habituelle) : écrits en config comme ordres de grandeur, jamais appris ;
    aucun bonus pour plus bas ou plus frais.
27. **`cum_clock_exact_h` sur chaque segment du plan**, hors du JSON servi : le cumul affiché
    est arrondi au centième d'heure, trop grossier pour juger un fade.
28. **Le plancher de vitesse des vrais ultras se lit sur l'écoulé même en base hors plateaux** :
    le banc a montré que la vitesse hors plateaux d'un bivouac est celle d'une course ; le
    domaine de calibration ne dépend donc pas du modèle d'arrêts (MIUT reste dehors, son cas
    relève du plancher dépendant de la durée).
29. **`tools/score_plan --set`** : l'amplitude du fade se teste en secondes depuis le registre,
    sans relancer une heure de décodage.
30. **Δ du fade à 0,15 pour tous** plutôt qu'un Δ par athlète : la grille 0,085 / 0,15 / 0,20
    ne permet pas mieux que le point médian, les optimums par athlète (0,12 à 0,20) attendent
    les passages de la Phase 4 pour être appris là où ils se mesurent.
31. **`stops_rate_population` = 0** : sans ultra mesuré, pas d'arrêts ajoutés — le banc a montré
    qu'un taux inventé de 6 % dégradait tous les replis vc_e.
32. **B4 non activé pour le rapport de référence malgré une bande plus étroite** : la règle du
    chantier ne resserre pas ce que la forme du plan dément (arrêts personnels répartis :
    1,90 contre 1,77 sur les cas frais).

## Choix faits à la place de Valentin (Phase 3)

33. **FC0 profilée plutôt que régressée** : l'ordonnée à l'origine de FC ~ vga sur les efforts
    courts est biaisée par la durée (les longues sorties sont plus lentes à FC donnée) ;
    la FC0 qui minimise le résidu de l'ajustement efficacité-durée n'a pas ce défaut, et un
    profil plat retombe sur 60 bpm, signalé.
34. **Les fenêtres longues ne viennent que des vrais ultras** (filtre servi) : sans cette
    garde, l'OFF de 38 h avec sommeil fournirait les seules fenêtres de 30 et 36 h de Val.
35. **La queue de la courbe record est rangée à part** (`tail_points`) : VC, exposant
    historique et figure du rapport ne bougent pas au défaut ; `record_durations_s` reste
    intact.
36. **Le recalage de niveau ne touche pas les poids de maximalité** : ils lisent la vitesse
    courue contre l'enveloppe actuelle. Documenté ; à revoir si le banc adopte le levier.
37. **α_plancher = α population de A1 (0,16)**, pas un réglage supplémentaire ; et la garde
    du sommeil à 60 min de plateau, valeur physique (personne ne s'arrête plus d'une heure en
    course), off par défaut.
38. **`envelope_tail` dans le bloc calibration** et non twin : le banc refuse toute variante
    du bloc twin (les agrégats décodés en dépendent) ; les réglages de MESURE (durées de la
    queue, fenêtre d'efficacité, FC0 déclarée) restent dans twin et ne varient pas au banc.
39. **B1 activé pour la référence sans bascule du défaut** : mieux ou égal sur trois
    athlètes et sans effet sur le quatrième, mais les cas frais vendus sont neutres et la
    règle « jamais sur dev_set seul » tient ; la garde du domaine, qui lâche un cas hors
    domaine dès que la prédiction franchit 10 h, n'est pas corrigée dans cette phase (elle
    relève du chantier « trails courts » et d'un signal de course).
40. **Les mesures rejetées restent mesurées** (α_queue, VC d'époque via le flag, plus long
    arrêt) : un registre qui les porte permet de les relire quand la Phase 4 apportera les
    passages et le signal de course, sans relancer un décodage.

## Choix faits à la place de Valentin (Phase 5)

41. **Deux facteurs, pas une courbe** : κ par côté sur le surcoût de la loi plutôt qu'un
    facteur libre par tranche de pente ; la loi garde sa forme, l'athlète en règle
    l'amplitude, et deux nombres se lisent dans un rapport.
42. **Écarts intra-activité** plutôt que moyennes brutes par tranche : la forme du jour et
    la fatigue s'annulent entre les tranches d'une même sortie.
43. **FC décalée de 30 s** et FC ≥ 100 bpm : constantes de mesure dans le bloc twin, hors
    banc ; la FC0 profilée de B1 sert de réserve cardiaque, corrigée au premier ordre depuis
    des sommes prises à 60 bpm.
44. **La courbe record reste sous la loi** : VC, exposants et maximalité ne changent pas
    avec κ ; le levier vise la calibration et le parcours, là où le coût de pente entre
    dans la prédiction.
45. **Le Deq personnalisé est porté par le profil de parcours** (`with_slope_cost`) et non par
    la prédiction : prédiction, plan, figures, rapport et scoreur lisent le même parcours.

## Questions ouvertes

- **Garde du domaine de calibration.** Elle lit le temps PRÉDIT contre 10 h : un cas hors
  domaine (36 km, 3,5 h réels) prédit 9,76 h est refusé, prédit 10,06 h il est vendu à +185 %
  d'erreur (Phase 3, E1). La garde doit lire la demande du parcours (Deq, durée attendue à
  l'allure de l'athlète) et non la sortie du modèle ; à traiter avec le chantier « trails
  courts » ou dès que la Phase 4 apporte un signal de course.

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
- **Degrés de liberté de l'échelle studentisée sous prior.** ν = n_eff − 3 ignore que le
  prior fixe partiellement b ; ν = n_eff − tr(H) serait plus juste, sans effet pour Val
  (8,1 → ≈ 8,6), resserrant à petit n_eff. À mesurer si A3 vise un jour le défaut.
- **Le repli MC sans prior explose dans les deux liens** quand la pente n'est pas identifiée
  (Chianti : [13,3 – 68,2] en linéaire, [0,0 – 52,6] en log). Le prior le corrige ; le repli
  lui-même (bornes au plafond, central hors de sa bande) reste tel quel tant qu'un cas servi
  n'y passe pas.
- **Arrêts de Nice** : le taux personnel de Val (7,6 min par heure de mouvement sur ses 12
  ultras) donne 3,8 h d'arrêts sur 30,4 h de mouvement, contre 1 h 45 retranchées par la
  politique du plan. Le rapport v2 (Phase 6) doit dire ce budget d'arrêts comme information de
  logistique, sans en faire la répartition du plan (mesurée moins juste).
- **Phase 4.** Import CSV manuel par défaut ; LiveTrail seulement après vérification de ses
  conditions d'utilisation.
- **Annexe en ligne** : page du site (décidé) ; support à implémenter en Phase 6.
- **Polices** : instances statiques Ubuntu Sans produites par `fonttools varLib.instancer`,
  abandon d'UbuntuMono au profit des chiffres tabulaires (décidé) ; à faire en Phase 6.

## Rejeté

- **Arrêts personnels dans le modèle de temps (B4)** : MAE des 13 vendus 10,2 → 10,4, plan
  moins juste ; élasticité 0,5 (MIUT +12 → +20 %) et arrêts de la spec (Crasse +7,9 % de biais)
  rejetés.
- **Fade personnalisé (`splits`, `durability`)** : 1,91 et 2,02 contre 1,77 pour la constante
  0,15 sur les cas frais ; `splits` sans borne dégrade Crasse (1,64 → 2,02 puis 3,08).
- **Différentiel d'altitude (C3)** : 0,05 par 1 000 m au-dessus de l'altitude habituelle des
  ultras dégrade 8 coupures sur 9 (MAE des 13 vendus 10,3 → 11,8, Lavaredo +1,0 → +8,3 %) ;
  le central est déjà biaisé vers le lent.
- **Terme de nuit avec prior de population (C2p)** : le prior fait tout le travail (les données
  n'identifient pas d), aide les courses de jour, dégrade les cibles nocturnes ; Winkler 50
  dégradé.
- **Répartition personnelle des arrêts dans le plan** : forme du plan pire ou égale sur les
  30 courses (dev_set 2,21 → 2,74 % du temps).
- **Échelle studentisée MAD** (`studentized_scale_mad`) : Winkler 80 0,591 contre 0,558 (RMS)
  sur les 13 vendus appariés, MIUT [7,5 – 105,9] — plus bruyant à n = 4–12, comme prévu.
- **Échelle studentisée signée** : meilleur Winkler 80 du banc (0,549) mais couverture 50 à
  23 % (Lavaredo raté de 0,16 h, Montagnhard 2026 raté), κ par côté sur 2 à 6 plis ; à
  remesurer quand la Phase 4 apportera des plis.
- **λ = 5 et 10 du prior de durée** : identiques à λ = 2 au dixième d'heure et au millième de
  Winkler — la pente n'est pas identifiée, la valeur du prior compte, pas son poids.
- **Échelle studentisée sans prior** (A3, A2A3) : couverture 80 à 100 % sur la zone d'action
  pour un Winkler dégradé (0,789 → 0,898 / 0,856) — l'honnêteté du petit n sans l'information
  qui manque.
