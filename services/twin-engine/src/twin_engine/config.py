"""Chargement de la configuration du moteur.

Règle d'or (calquée sur services/tracking-cache/src/config.ts) :
  * les **chemins** viennent de l'environnement (``DATA_DIR``, ``TWIN_CONFIG_PATH``) —
    AUCUN chemin en dur dans le code ;
  * les **constantes scientifiques** viennent de ``twin.config.json`` (versionné,
    cf. twin-theory §8) avec des valeurs par défaut codées ici en filet de sécurité ;
  * aucun secret n'est lu ici (le moteur n'en a pas à ce stade).

Tout le reste du moteur reçoit un objet :class:`Config` immuable — jamais de lecture
d'environnement ou de fichier ailleurs.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Any


# --------------------------------------------------------------------------- #
# Sous-blocs de configuration (1 dataclass par section de twin.config.json).
# Les valeurs ici sont les DÉFAUTS du cas de référence (twin-theory §12) : elles
# servent de filet si une clé manque dans le JSON.
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class CourseParams:
    grid_step_m: float = 5.0
    smooth_window_m: float = 150.0
    grade_clip: float = 0.45
    cr0: float = 3.6
    # Découpage automatique quand la course ne fournit pas de ravitaillements (mode GPX-only).
    default_segment_km: float = 10.0
    # Seuil qui sépare montée, terrain roulant et descente quand le rapport ventile le temps
    # prévu. C'est un CHOIX déclaré, pas une mesure : le rapport le nomme dans sa légende.
    flat_grade_pct: float = 5.0


@dataclass(frozen=True)
class TwinParams:
    grade_base_m: float = 50.0
    f_cap: float = 3.0
    v_max_ms: float = 7.0
    alt_smooth_s: int = 5
    record_durations_s: tuple[int, ...] = (
        30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 780, 900, 1200, 1500,
        1800, 2400, 3000, 3600, 4500, 5400, 7200, 9000, 10800, 14400, 18000,
        21600, 28800,
    )
    vc_flat_threshold: float = 0.10
    # critère « effort plat propre » : (v_ga − v_raw)/v_raw < seuil. Par défaut le ratio est
    # SIGNÉ (comportement avec lequel le golden a été capturé) : un record en descente nette
    # (v_ga ≪ v_raw) passe le critère. ``vc_flat_symmetric=true`` applique la VALEUR ABSOLUE
    # (twin-theory §2.4) — recommandé, à valider sur le golden réel avant bascule du défaut.
    vc_flat_symmetric: bool = False
    vc_window_s: tuple[int, int] = (600, 5400)
    vc_bootstrap_n: int = 2000
    vc_bootstrap_seed: int = 0
    # plancher de durée du fit VC (garde-fou twin-theory §2.3 : les efforts courts, presque
    # toujours en côte, sont sur-crédités par Minetti). 600 = début de fenêtre (no-op, valeur
    # de capture du golden) ; 1800 = réglage « théorie stricte » à valider sur le golden réel.
    vc_short_effort_floor_s: int = 600
    # --- locomotion vs arrêts (twin-theory §2, Problème « écoulé ≫ mouvement ») -----------
    # ``elapsed`` (défaut, comportement actuel) : durée = temps écoulé de bout en bout.
    # ``moving`` : durée = temps en mouvement (secondes où la vitesse dépasse le seuil), pour
    #   ne pas diluer l'allure des ultras avec les longs arrêts (ravitos, sommeil). Repli
    #   automatique sur ``elapsed`` quand le temps de mouvement n'a pas pu être mesuré.
    speed_basis: str = "elapsed"
    moving_speed_threshold_ms: float = 0.5    # vitesse au-dessus de laquelle on compte « en mouvement »
    # --- arrêts francs et mesures des efforts longs (chantier v2, Phase 2) ------------------
    # Un arrêt = plateau de distance d'au moins ``stop_min_s`` (ravito, pause) ; la marche
    # très lente reste du mouvement — la mesure « sans mouvement » au seuil de vitesse est
    # fragile sur un canal pauvre (DIAGNOSTIC §10.0). ``long_effort_min_hours`` borne les
    # mesures coûteuses ou sans objet sur les sorties courtes : part de nuit (test solaire du
    # plan), rapport des moitiés (fade réel), altitude moyenne.
    stop_min_s: float = 60.0
    long_effort_min_hours: float = 6.0
    # --- fenêtres longues de la courbe record et efficacité-durée (chantier v2, Phase 3) ----
    # ``record_tail_durations_s`` : durées AU-DELÀ de ``record_durations_s`` (10 à 36 h) où la
    #   meilleure fenêtre de vitesse ajustée est mesurée dans les plus longues sorties qui
    #   passent le filtre « vrai ultra » ; elles forment la QUEUE de la courbe record
    #   (``RecordCurve.tail_points``), séparée des points historiques (VC, exposant et figure
    #   du rapport inchangés). ``record_tail_from_s`` : début de l'ajustement log-log de
    #   l'exposant de queue α_queue (points historiques ≥ ce seuil + queue).
    record_tail_durations_s: tuple[int, ...] = (36000, 43200, 50400, 57600, 72000, 86400,
                                                 108000, 129600)
    record_tail_from_s: float = 7200.0
    # ``efficiency_min_hours`` : efforts avec FC qui entrent dans l'ajustement efficacité-durée
    #   ln(vga ÷ (FC − FC0)) = c − α_eff·ln T (α_eff, jumeau), pondéré par récence. FC0 =
    #   ordonnée à l'origine de la relation FC ~ vga de l'athlète sur ses efforts de 20 min
    #   à 3 h (``efficiency_hr_rest`` = 0), ou valeur déclarée en bpm.
    efficiency_min_hours: float = 1.0
    efficiency_hr_rest: float = 0.0
    # --- coût de pente personnel : sommes par tranche de pente (chantier v2, Phase 5, C1) ---
    # À chaque seconde en mouvement avec FC (≥ slope_hr_min_bpm), la vitesse brute et la FC
    # lue ``slope_hr_lag_s`` plus tard (la FC répond à la charge avec retard) sont sommées
    # par tranche de pente de ``slope_bin_pct`` jusqu'à ±``slope_max_pct`` : de quoi lire, à
    # réserve cardiaque égale, de combien l'athlète est plus lent ou plus rapide à chaque
    # pente que sur le plat (Twin.slope_kappa_up / _down), sans conserver de tableau 1 Hz.
    slope_bin_pct: float = 2.5
    slope_max_pct: float = 30.0
    slope_hr_min_bpm: float = 100.0
    slope_hr_lag_s: int = 30
    # --- robustesse de la courbe record (Problème A : VC/exposant aberrants) ---
    vc_max_plausible_ms: float = 6.0          # plafond physiologique : un point « plat » plus rapide
    #                                           est rejeté avant l'ajustement VC ; une VC au-dessus
    #                                           est marquée non plausible (confiance réduite, pas de % VC).
    record_min_support: int = 2               # nb min d'activités soutenant un point record (sinon
    #                                           on retient la N-ième meilleure → une seule activité
    #                                           contaminée ne peut plus fixer VC ni l'exposant).
    record_reject_speed_ms: float = 6.5       # vitesse brute soutenue impossible pour de la course :
    record_reject_window_s: int = 600         #   toute fenêtre ≥ ce seuil écarte l'activité (vélo/artefact).
    endurance_window_s: tuple[int, int] = (1800, 21600)
    decouple_min_duration_s: int = 4500       # durée min pour CALCULER le découplage
    durability_min_hours: float = 10.0        # durabilité reportée sur les efforts longs (ultras)
    # --- base du découplage (revue C7) ------------------------------------------------------
    # ``elapsed`` (défaut historique) : moyennes sur TOUTES les secondes, arrêts compris — les
    #   ravitos (v≈0, FC>60) plombent l'efficacité de la moitié qui les contient (la 2e en
    #   ultra) : le découplage mesure alors en partie l'ARRÊT, pas l'usure physiologique.
    # ``moving`` : seuls les échantillons en mouvement comptent (même seuil que moving_time).
    # ``decouple_skip_start_s`` ignore l'échauffement (dérive FC initiale) ; 0 = historique.
    decouple_basis: str = "elapsed"           # {elapsed, moving}
    decouple_skip_start_s: int = 0
    # --- base du D+ des activités (revue C1) ------------------------------------------------
    # Le D+ athlète (altitude lissée ~5 s ≈ 15-20 m de base à allure ultra) et le D+ parcours
    # (fenêtre 150 m) ne sont PAS à la même échelle : le D+ est une variation totale, il gonfle
    # quand la fenêtre diminue → β2 est APPRIS sur un axe D+/km gonflé puis APPLIQUÉ à l'axe
    # dégonflé du parcours (pénalité terrain trop douce, biais optimiste sur parcours raides).
    # DÉFAUT = ``distance_150m`` depuis le 2026-07-02 : mesure sur l'archive réelle de référence
    # (tools/diag_dplus, 30 activités ≥ 5 h) → écart médian +14,9 % (min +8,3 %, max +39,9 %),
    # trois fois le seuil de déclenchement (DIAGNOSTIC §9.6). Rollback : ``time_5s``.
    # Recapture des références de régression (twin-theory §12) et régénération du fixture
    # Montagnhard : tools/regen_montagnhard_fixture (archive réelle requise).
    dplus_basis: str = "distance_150m"        # {time_5s, distance_150m}
    dplus_smooth_window_m: float = 150.0
    # --- plausibilité du ratio équivalent-plat / distance brute (banc 2026-07, §9.10) -----
    # Personne ne descend à −10 % pendant des heures : une activité LONGUE dont l'équivalent
    # plat vaut moins de ``floor`` × la distance brute trahit une altitude corrompue (cas
    # réel : FIT à l'altitude effondrée → vga 2,99 km/h pour 6,6 réels → course prise pour
    # une rando et écartée de la calibration). Repli : altitude déclarée inutilisable —
    # équivalent plat = distance brute (f=1), D± nuls, has_altitude=False. 0 = désactivé.
    ga_plausibility_floor: float = 0.7
    ga_plausibility_min_hours: float = 4.0
    # --- sauvetage du canal distance haché (banc 2026-07, §9.11) ---------------------------
    # L'écrêtage anti-spikes par seconde (v_max_ms) est prévu pour QUELQUES artefacts ; sur
    # un enregistrement « en rafales » (canal distance par paquets), il ampute la distance
    # entière — cas réel : course de 71,5 km réduite à 28,6 km (−60 %) puis écartée de la
    # calibration pour lenteur. Si une activité LONGUE perd plus de (1−floor) de sa distance
    # brute À TOTAL PLAUSIBLE pour de la course (≤ max_raw_kmh), on garde la distance brute
    # non écrêtée et on EXCLUT l'activité de la courbe record (fenêtres par-seconde non
    # fiables) — le résumé (calibration/durabilité) est conservé. 0 = désactivé.
    despike_rescue_floor: float = 0.8
    despike_rescue_min_hours: float = 4.0
    despike_rescue_max_raw_kmh: float = 12.0
    # Discriminant téléportation : une montre mise en pause pendant un déplacement (voiture,
    # télécabine) produit 1-2 blocs écrêtés contigus (même interpolés sur un trou
    # d'horodatage) dont la distance est FAUSSE — la sauver gonflerait la calibration. On
    # refuse UNIQUEMENT cette signature (< min_bursts blocs). Retour terrain (§9.11) : la
    # casse réelle peut être en BLOCS de minutes, pas en rafales par-seconde — un seuil
    # « nombreuses rafales » (20) refusait le cas réel qu'il devait servir.
    despike_rescue_min_bursts: int = 3
    # D± d'un canal sauvé : le TOTAL du D± ne dépend que du canal altitude (somme des
    # montées, base temps) — récupérable même quand l'alignement altitude↔distance est
    # cassé, alors que dpk=0 faussait l'ancre du blend et la régression (impact banc
    # §9.11 : −0,017 km/h par m/km manquant). "zero" = rollback (D± nuls).
    despike_rescue_dplus_basis: str = "time"
    # --- doublons d'activités (chantier v2, Phase 0, DIAGNOSTIC §10.0) ------------------
    # Deux exports qui se recouvrent (montre + Strava, ancien + nouveau) livrent la même
    # activité deux fois. Mesuré au banc : Val, toute activité depuis 2024-09 en double
    # (22 « vrais ultras » pour 12 réels, n_eff 20,5) ; Lolo, TOUS ses efforts longs en
    # double. Une copie compte deux fois dans la régression, la LOO, le N_eff et le support
    # de la courbe record (le garde-fou « N-ième meilleure » est neutralisé par une copie).
    # ``on`` : même heure de départ (à la seconde), durée à ±5 s, distance à ±2 % ⇒ une
    # seule copie conservée, la plus riche (FC, puis altitude, puis découplage mesuré).
    # Sans heure de départ (vieux agrégats), rien n'est fusionné. Rollback : ``off``.
    dedup_activities: str = "on"              # {on, off}


@dataclass(frozen=True)
class CalibrationParams:
    genuine_min_hours: float = 10.0
    genuine_min_ga_kmh: float = 5.5
    genuine_max_decouple_pct: float = 30.0
    # --- plancher de vitesse dépendant de la durée (Phase 3, F) ---------------------------
    # ``fixed`` (défaut) : plancher genuine_min_ga_kmh à toute durée. ``riegel`` : le plancher
    #   décroît avec le temps écoulé, min_ga × (T ÷ genuine_min_hours)^(−genuine_floor_alpha)
    #   (5,5 à 10 h, 4,7 à 26 h, 4,4 à 38 h pour α = 0,16). ``genuine_max_stop_s`` > 0 écarte
    #   les efforts dont le plus long plateau dépasse ce seuil (sommeil, bivouac) ; 0 = off.
    genuine_floor: str = "fixed"                         # {fixed, riegel}
    genuine_floor_alpha: float = 0.16
    genuine_max_stop_s: float = 0.0
    min_ultras_regression: int = 3
    # pondération par récence (Problème B : non-stationnarité des ultras sur plusieurs saisons)
    recency_halflife_days: float = 365.0                 # demi-vie de la décroissance exponentielle
    #                                                      temporelle (≤ 0 → pondération désactivée) ;
    #                                                      appliquée à l'identique dans la régression ET
    #                                                      la validation croisée leave-one-out. Le régime
    #                                                      régression n'est retenu que si le nombre EFFECTIF
    #                                                      d'ultras (N_eff = (Σw)²/Σw²) ≥ min_ultras_regression.
    # --- filtre de maximalité (Problème C : hétérogénéité d'intention des ultras) ----------
    # Le modèle v(T) suppose des efforts MAXIMAUX ; mêler des sorties faciles (footings longs)
    # gonfle σ et casse la validation croisée. On homogénéise via l'intensité relative au plafond
    # d'endurance de l'athlète : r_i = vga_i / (enveloppe_vga(T_i)·3.6). ``off`` = ancien
    # comportement (poids 1 partout) ; ``soft_weight`` = pondération douce w=clip((r−floor)/(ref−floor))
    # (DÉFAUT ACTIVÉ, cf. twin.config.json) ; ``hard_filter`` = retrait franc des efforts non engagés.
    # Le poids est appliqué À L'IDENTIQUE dans le fit ET la LOO (comme la récence). Second signal
    # anti-faux-positif (course dure mais raide) : la FC normalisée à la FC max des ultras ne peut
    # que REMONTER le poids (jamais le baisser). NB : sur le golden, les ultras étant near-maximaux,
    # tous les poids valent 1 → régression inchangée (le golden reste intact même activé).
    maximality_mode: str = "soft_weight"                 # {off, soft_weight, hard_filter}
    maximality_r_floor: float = 0.80                     # r ≤ floor → effort jugé non engagé (poids 0)
    maximality_r_ref: float = 0.95                       # r ≥ ref  → effort pleinement engagé (poids 1)
    maximality_hr_floor: float = 0.85                    # FC/FCmax(ultras) ≤ floor → ne rattrape pas
    maximality_hr_ref: float = 0.95                      # FC/FCmax(ultras) ≥ ref  → rattrape à 1 (course dure)
    # référence de l'intensité relative (§A — robustesse inter-athlètes, sans réglage par athlète) :
    #   ``envelope_absolute`` = r comparé au seul plafond extrapolé (sensible à un biais d'extrapolation
    #     de l'enveloppe : si elle sur-estime le plafond, des efforts MAXIMAUX peuvent passer sous le
    #     seuil et être écartés à tort) ;
    #   ``self_relative`` (DÉFAUT) = r comparé AUSSI à un pôle robuste (quantile) des propres ultras de
    #     l'athlète → invariant à l'échelle de l'enveloppe. Ce signal relatif ne peut que REMONTER le
    #     poids (rescue) : il protège les efforts maximaux d'une enveloppe biaisée sans jamais casser le
    #     no-op (un athlète « propre », tous ses efforts au plafond, garde tous ses poids à 1).
    maximality_reference: str = "self_relative"          # {envelope_absolute, self_relative}
    maximality_self_quantile: float = 0.90               # pôle robuste des r de l'athlète (self_relative)
    # --- terme de terrain β2·(D+/km) : anti double-comptage (la vga est DÉJÀ ajustée pente) ----
    # ``free`` (défaut, actuel) : β2 libre. ``none`` : β2=0 (la pente est déjà dans la vga).
    # ``prior_shrunk`` : ridge de β2 vers le prior population, atténue les points de levier terrain.
    # DÉFAUT ``prior_shrunk`` depuis le 2026-07-03 (revue) : β2 est le coefficient le moins
    # identifié (n_eff faible, levier terrain) ; le ridge vers le prior population améliore À LA
    # FOIS la MAE LOO (8,8 → 8,3 sur le fixture) et la largeur d'intervalle (−8 %). No-op sur le
    # cas de référence (son β2 libre ≈ le prior, qu'il définit). Rollback : ``free``.
    terrain_term: str = "prior_shrunk"                   # {free, none, prior_shrunk}
    terrain_shrink_lambda: float = 50.0                  # force du ridge (n. de pseudo-obs vers le prior)
    # repli « peu d'ultras » (twin-theory §3). Prior population (β2) = β2 du cas de référence,
    # RECAPTURÉ le 2026-07-02 sur l'échelle D+ « distance 150 m » (C1) — l'ancien −0.0148
    # datait de l'échelle 5 s (rapport ×1,149 = exactement l'écart d'échelle mesuré).
    default_dplus_penalty_kmh_per_dpkm: float = -0.0170
    regression_min_sigma_kmh: float = 0.20               # plancher de σ (anti-surconfiance)
    blend_sigma_kmh: float = 0.45                        # 1–2 ultras : incertitude élargie
    vc_e_sigma_kmh: float = 0.80                         # 0 ultra : extrapolation VC+E
    # --- lien de la régression (chantier v2, Phase 1, A2) -----------------------------------
    # ``log`` (DÉFAUT depuis la Décision 1 du chantier v2, 2026-09-16 ; rollback nommé
    #   examples/twin.config.historique.json) : ln v = a + b·ln T + c·D+/km (forme de Riegel)
    #   — l'erreur d'ultra est multiplicative : σ relatif, point fixe ANALYTIQUE
    #   T = exp((ln Deq − a − c·D+/km)/(1+b)) (plus de plancher de vitesse), Monte-Carlo, LOO,
    #   scores conformes et β-covariance exprimés dans ce lien, bandes en heures asymétriques
    #   T·exp(±h). Le prior terrain devient relatif (default_dplus_penalty_log_per_dpkm) et le
    #   plancher de σ aussi.
    # ``linear`` (défaut jusqu'à la Décision 1) : v = β0 + β1·ln T + β2·D+/km, σ en km/h,
    #   bandes symétriques en heures.
    link: str = "log"                                    # {linear, log}
    # prior terrain en lien log = β2 de référence ÷ vitesse de référence :
    # −0,0170 km/h par m/km ÷ 6,40 km/h (twin-theory §12) = −0,00266 par m/km.
    default_dplus_penalty_log_per_dpkm: float = -0.0027
    regression_min_sigma_log: float = 0.03               # ≈ 0,20 km/h ÷ 6,5 km/h
    # --- prior sur la pente en durée (Phase 1, A1) --------------------------------------------
    # ``free`` (défaut jusqu'à la Décision 1) : b libre — identifié par 3 à 12 points dont un
    #   ou deux longs.
    # ``prior_shrunk`` (DÉFAUT) : pseudo-observation ridge de b vers −α (Riegel : v ∝ T^−α), α lu sur la
    #   courbe record de l'athlète (``twin_alpha``, Twin.alpha, fenêtre 30 min–6 h) ou prior
    #   population (repli si α absent). Entre dans XᵀWX du fit, de la covariance et de chaque
    #   pli LOO, comme terrain_term. En lien linéaire le prior vaut −α × v̄ (v̄ = vga moyenne
    #   pondérée des vrais ultras). Ce que ça ferme : l'exposant d'endurance ne servait la
    #   prédiction qu'en régime blend/vc_e ; ici il réduit le levier de la cible.
    duration_term: str = "prior_shrunk"                  # {free, prior_shrunk}
    duration_shrink_lambda: float = 2.0                  # nb de pseudo-observations vers le prior
    # source de l'α du prior : ``efficiency`` (DÉFAUT : α_eff, efficacité-durée, Phase 3 B1),
    #   ``twin_alpha`` (courbe record 30 min–6 h, défaut jusqu'à la Décision 1), ``record_tail``
    #   (α_queue, fenêtres longues, Phase 3 B2) — chacune retombe sur ``twin_alpha`` puis
    #   ``population`` quand l'exposant demandé manque ; ``population`` = constante ci-dessous.
    duration_prior_source: str = "efficiency"            # {twin_alpha, efficiency, record_tail, population}
    # α population = médiane des α mesurés au banc v2 (Val 0,143 et 0,196 selon l'archive,
    # Crasse 0,179) — ordre de grandeur, jamais une constante universelle.
    duration_prior_alpha_population: float = 0.16
    # --- recalage sur le niveau de l'époque (Phase 3, P) -------------------------------------
    # ``none`` (défaut) : les vrais ultras entrent tels qu'ils ont été courus. ``vc_epoch`` :
    #   la vitesse de chaque ultra est ramenée au niveau actuel par gain × ln(VC_now ÷
    #   VC_époque), VC_époque = vitesse critique de la courbe record des
    #   ``level_anchor_window_days`` jours qui précèdent l'ultra (Twin.level_marks) ; sans VC
    #   d'époque plausible, décalage nul. Même décalage dans le fit, le recalage du blend et
    #   chaque pli LOO (qui prédit l'ultra retiré à SON époque).
    level_anchor: str = "none"                           # {none, vc_epoch}
    level_anchor_window_days: float = 365.0
    level_anchor_gain: float = 1.0
    # --- queue de l'enveloppe des replis blend et vc_e (Phase 3, B1/B2) ----------------------
    # ``efficiency`` (DÉFAUT : α_eff) / ``record_tail`` (α_queue) : au-delà de
    #   twin.endurance_window_s[1] l'enveloppe décroît avec l'exposant mesuré, raccord continu ;
    #   repli sur ``alpha`` quand l'exposant demandé manque (signalé dans les notes).
    # ``alpha`` (défaut jusqu'à la Décision 1) : l'exposant 30 min–6 h continue au-delà de 6 h.
    envelope_tail: str = "efficiency"                    # {alpha, efficiency, record_tail}
    # --- coût de pente personnel (Phase 5, C1) -----------------------------------------------
    # ``minetti`` (défaut) : la loi fixe pour tous. ``personal`` : le surcoût de pente de la loi
    #   est multiplié par κ_montée en montée et κ_descente en descente, mesurés sur les secondes
    #   avec FC de l'athlète (Twin.slope_kappa_*), et appliqué à la vitesse ajustée de chaque
    #   effort de la calibration ET au Deq du parcours (décomposition exacte : plat + surcoût
    #   de montée + surcoût de descente). Un côté sans ``slope_cost_min_hours`` heures de
    #   mesure garde κ = 1 ; κ est borné dans [slope_kappa_min, slope_kappa_max] (signalé).
    slope_cost: str = "minetti"                          # {minetti, personal}
    slope_cost_min_hours: float = 20.0
    slope_kappa_min: float = 0.5
    slope_kappa_max: float = 2.0
    # --- arrêts (Phase 2, B4) ---------------------------------------------------------------
    # ``carved`` (défaut historique) : la régression porte sur la vitesse ÉCOULÉE (arrêts
    #   compris) et le plan retranche sa politique d'arrêts (5 min par ravito, +10 aux bases)
    #   du temps prédit.
    # ``personal`` : la régression porte sur la vitesse hors plateaux (base « plateaux » :
    #   écoulé − arrêts ≥ twin.stop_min_s) ; le temps prédit = mouvement × (1 + r), r = taux
    #   d'arrêt PERSONNEL (heures d'arrêt par heure de mouvement, moyenne pondérée récence ×
    #   maximalité des vrais ultras) avec une élasticité optionnelle à la durée,
    #   r(T) = r̄ · (T/T̄)^e. Appliqué à l'identique dans chaque pli LOO (r sans le pli) ; la
    #   dispersion de ln(1 + r) entre ultras entre dans l'écart-type prédictif.
    # ``spec`` : même base, mais les arrêts de la cible sont ceux de la politique du plan
    #   (ravitos de la spec) ; la LOO reste au taux personnel (les ravitos des courses passées
    #   ne sont pas connus).
    stops_model: str = "carved"                          # {carved, personal, spec}
    stops_duration_elasticity: float = 0.0               # e de r(T) = r̄·(T/T̄)^e (0 = taux constant)
    stops_rate_population: float = 0.0                   # repli quand aucun ultra ne porte d'arrêts mesurés
    #                                                      (0 = aucun arrêt ajouté au temps de mouvement)
    # --- nuit (Phase 2, C2) -----------------------------------------------------------------
    # ``none`` (défaut) : la nuit n'entre pas dans la régression.
    # ``prior_shrunk`` : quatrième colonne (part de nuit de l'ultra − part de nuit moyenne
    #   pondérée des vrais ultras), coefficient d tiré vers ``night_prior_log_per_share`` par
    #   ``night_shrink_lambda`` pseudo-observations, dans le fit, la covariance et chaque pli.
    #   La cible reçoit sa part de nuit du calendrier de course (départ, position, fuseau de
    #   la spec) intégrée sur le temps prédit — point fixe itéré ; sans spec, écart nul. En
    #   lien linéaire le prior vaut d_pop × v̄. Un ultra sans part de nuit mesurable est à la
    #   moyenne (écart nul).
    night_term: str = "none"                             # {none, prior_shrunk}
    night_prior_log_per_share: float = 0.0               # ln v par unité de part de nuit (0 = sans a priori)
    night_shrink_lambda: float = 2.0


@dataclass(frozen=True)
class PredictionParams:
    mc_n: int = 5000
    mc_seed: int = 1
    interval_low_pct: int = 10
    interval_high_pct: int = 90
    v_floor_kmh: float = 2.0
    # --- source d'incertitude du Monte-Carlo (revue 2026-07, C3) --------------------------
    # ``sigma_only`` (comportement historique) : tirages v = v(T*) + ε, ε ~ N(0, σ) — seul le
    #   bruit résiduel est propagé ; l'intervalle ne voit NI le levier d'extrapolation
    #   (incertitude des β) NI la rétroaction T↔v.
    # ``predictive`` (DÉFAUT depuis le 2026-07-02, régime régression uniquement) :
    #   β ~ N(β̂, σ²(XᵀWX)⁻¹) + ε ~ N(0, σ), point fixe T = Deq/v(T) re-résolu PAR TIRAGE
    #   (vectorisé). L'intervalle s'élargit là où la cible sort de l'enveloppe des
    #   (ln T, D+/km) d'entraînement — le phénomène que le gate honnête marque en LOO.
    #   Validation sur le cas de référence (capture 2026-07-02) : Nice est une extrapolation
    #   de durée (31,3 h vs 21,3 h max des vrais ultras, levier h₀≈2,7) → intervalle 80 %
    #   [30,0–32,8] → [≈28,9–34,7] (rel 0,19, critère largeur toujours 🟢) ; fixture
    #   Montagnhard : i80 0,19 → 0,68 (critère largeur 🟠, voulu). Rollback : sigma_only.
    #   Blend/vc_e : repli automatique sur sigma_only.
    mc_mode: str = "predictive"                          # {sigma_only, predictive}
    # --- source des DEUX bandes servies (S5, conforme normalisé — revue 2026-07) ------------
    # ``mc`` : percentiles du Monte-Carlo (paramétrique) — 10/90 pour les bornes de sécurité,
    # 25/75 pour la fourchette de course. ``conformal_normalized`` (DÉFAUT depuis 2026-07-03,
    # activé sur cas réels MIUT + Montagnhard) : mêmes couvertures nominales, mais étalonnées
    # sur les erreurs LOO réelles — quantile pondéré des scores |erreur|/sd_pred, remis à
    # l'échelle de l'écart-type prédictif de la CIBLE (levier d'extrapolation conservé ;
    # Vovk ; Romano-Candès ; Tibshirani 2019). Motif d'activation : le MC prédictif DÉGÉNÈRE
    # sur les calibrations faiblement identifiées (cas MIUT réel : ≥ 25 % des tirages au
    # plancher de vitesse ⇒ bornes hautes = plafond Deq/v_floor = 71,9 h pour un central 26 h).
    # Le conforme reste fini et calé sur les erreurs démontrées. Repli automatique des DEUX
    # bandes sur ``mc`` sans validation croisée (blend/vc_e) ou à moins de 4 plis. Rollback : mc.
    # --- facteur d'échelle studentisé (Phase 1, A3) ------------------------------------------
    # ``studentized_scale`` (DÉFAUT depuis la Décision 1 du chantier v2, 2026-09-16 ; le
    #   conforme normalisé reste le rollback nommé, examples/twin.config.historique.json) :
    #   au lieu du quantile EMPIRIQUE des scores LOO (à n = 12 le 80 %
    #   est le 11ᵉ score sur 12, un seul mauvais pli fixe la borne, largeur nulle ou au plafond
    #   sur les registres dégénérés), on estime un facteur d'échelle κ = RMS pondéré des scores
    #   studentisés |erreur|/sd_pred (mêmes poids récence × maximalité) et on lit les quantiles
    #   50/80 sur une loi de Student à n_eff − p degrés de liberté, mis à l'échelle du sd
    #   prédictif de la CIBLE. ``studentized_scale_mad`` : κ = 1,4826 × médiane pondérée des
    #   scores (variante robuste, mesurée) ; ``studentized_scale_signed`` : κ séparé par signe
    #   d'erreur (asymétrie apprise, mesurée). Repli MC sous 4 plis, comme le conforme.
    interval_source: str = "studentized_scale"           # {mc, conformal_normalized, pooled,
    #                                                       studentized_scale, studentized_scale_mad,
    #                                                       studentized_scale_signed}
    # --- fenêtre EMPIRIQUE groupée (``pooled`` — plomberie prête, revue §9.9) ----------------
    # Quantiles des scores normalisés |erreur|/sd_rel APPRIS DU REGISTRE (tools/registre,
    # bloc « conditions vendables ») : bandes = central × (1 ± q·sd_rel(cible)), sd_rel =
    # levier complet en régression, σ/v en repli (même normaliseur que le registre).
    # None (défaut) = pas encore appris → ``pooled`` retombe sur les percentiles MC.
    # À renseigner À LA JAUGE (≥ 8-10 cas frais vendables dans le domaine), jamais à
    # l'intuition — règle pré-enregistrée de docs/twin-registre-couverture.md.
    pooled_q50: float | None = None
    pooled_q80: float | None = None
    # --- environnement déclaré (Phase 2, C3) --------------------------------------------------
    # ``off`` (défaut) : rien. ``declared`` : la vitesse de la cible est multipliée par
    #   1 − coût, coût = heat_cost_per_c × max(heat_c − heat_ref_c, 0) + altitude_cost_per_km
    #   × max(altitude moyenne du parcours − altitude moyenne pondérée des vrais ultras, 0)/1000.
    #   La chaleur est DÉCLARÉE dans la spec (``heat_c``), l'altitude vient de la trace ; les
    #   coûts sont des ordres de grandeur population, jamais appris ici. Central, Monte-Carlo
    #   et bandes suivent (facteur dans le point fixe) ; la LOO ne le voit pas (conditions des
    #   courses passées inconnues).
    environment_term: str = "off"                        # {off, declared}
    heat_ref_c: float = 15.0
    heat_cost_per_c: float = 0.004
    altitude_cost_per_km: float = 0.05


@dataclass(frozen=True)
class PacingParams:
    # Δ du fade linéaire servi par défaut (vitesse 1+Δ → 1−Δ le long de la distance
    # équivalente) ; 0,15 correspond à un découplage d'efficacité X ≈ 26 % entre les deux
    # moitiés (Δ = X/(200−X), voir ``durability`` ci-dessous).
    fade_delta: float = 0.15
    # --- source du fade (revue 2026-07, T3) -----------------------------------------------
    # ``config`` (défaut, comportement historique) : Δ = fade_delta identique pour tous.
    # ``durability`` : Δ dérivé du DÉCOUPLAGE MESURÉ de l'athlète — si l'efficacité chute de
    #   X % entre les deux moitiés à effort constant, la vitesse fait de même ; un fade
    #   linéaire (1+Δ → 1−Δ) réalise (1−Δ)/(1+Δ) = 1 − X/100, d'où Δ = X/(200−X), borné
    #   [fade_delta_min, fade_delta_max]. Repli sur fade_delta si durabilité non mesurable.
    #   Contrôle de cohérence : Δ = 0,085 correspond à X ≈ 15,7 %, Δ = 0,15 à X ≈ 26 %.
    # ``splits`` (Phase 2) : Δ dérivé du RAPPORT DES MOITIÉS mesuré sur les vrais ultras de
    #   l'athlète (vitesse ajustée hors plateaux de la seconde moitié de Deq ÷ première),
    #   Δ_i = 2(1 − R_i)/(1 + R_i), moyenne pondérée récence × maximalité, borné ; repli sur
    #   ``durability`` puis sur ``fade_delta`` (``PacingPlan.fade_source_used`` dit lequel a servi).
    fade_source: str = "config"          # {config, durability, splits}
    fade_delta_min: float = 0.04
    fade_delta_max: float = 0.20
    default_stop_min: float = 5.0
    major_base_extra_min: float = 10.0
    # --- fenêtres horaires (revue C6) : ``true`` (défaut historique) met à l'échelle TOUT le
    # cumul (arrêts compris) par le multiplicateur Monte-Carlo — un scénario lent « rallonge »
    # donc les ravitos, ce qui n'a pas de sens physique. ``false`` : seul le MOUVEMENT est mis
    # à l'échelle, les arrêts déjà passés s'ajoutent constants (fenêtres un peu plus justes).
    scale_stops: bool = True
    # --- double bande (S5-présentation, 2026-07-03) -----------------------------------------
    # Les fenêtres PAR SEGMENT du plan utilisent la « fourchette de course » (bande de
    # PLANIFICATION, couverture nominale 25-75 : une course sur deux s'y joue) ; l'intervalle
    # de la PRÉDICTION (interval_low/high_pct, défaut 80 %) devient les « bornes de sécurité »
    # (logistique/proches). Deux questions différentes, deux bandes étiquetées par leur USAGE —
    # on n'affiche jamais l'une en la faisant passer pour l'autre. La SOURCE des deux bandes
    # (percentiles MC ou conforme normalisé) suit ``prediction.interval_source``.
    plan_window_low_pct: int = 25
    plan_window_high_pct: int = 75
    # au-delà de cette largeur relative des bornes de sécurité ((hi−lo)/T), le rapport ASSUME
    # la largeur en une phrase (une dispersion large est une information sur l'historique de
    # l'athlète face à ce parcours, pas un défaut du plan). Les trois scénarios, eux, sont
    # toujours servis : le plan v2 les décline en colonnes. Cas étroits (réf. Nice ~0,19) :
    # pas de phrase.
    wide_interval_rel_width: float = 0.35


@dataclass(frozen=True)
class NarrativeParams:
    """Seuils de PRÉSENTATION du rapport (choix des mots, jamais de la science).

    Ils changent le texte livré au client → ce sont des constantes de comportement, donc
    elles vivent en config comme les autres (règle CLAUDE.md « aucune constante en dur »).
    Les valeurs par défaut sont calées pour que le cas de référence (E≈1,22, découplage
    ~21 %, intensité ~63 % VC) tombe au milieu des catégories."""

    e_diesel: float = 1.12               # E ≤ → « très endurant / diesel »
    e_fade: float = 1.30                 # E ≥ → « décline plus nettement sur la durée »
    durability_excellent_pct: float = 15.0   # découplage ≤ → « excellente »
    durability_good_pct: float = 25.0        # ≤ → « bonne », au-delà → « à surveiller »
    vc_frac_low: float = 0.70            # intensité/VC < → « très loin du plafond »
    vc_frac_sustained: float = 0.85      # < → « confortable » ; ≥ → « engagée »
    recent_weeks: int = 4                # semaines de volume récent affichées
    minetti_example_grade: float = 0.15  # pente de l'exemple pédagogique Minetti (±)


@dataclass(frozen=True)
class SufficiencyParams:
    history_months_green: float = 6.0
    history_months_orange: float = 3.0
    usable_green: int = 120
    usable_orange: int = 50
    long_efforts_green: int = 2
    long_efforts_orange: int = 1
    cv_error_green_pct: float = 5.0
    cv_error_orange_pct: float = 10.0
    long_effort_min_fraction: float = 0.5
    quality_green_frac: float = 0.5
    quality_orange_frac: float = 0.15
    # --- gate honnête tolérant à l'influence (§4.3) --------------------------------------
    # ``strict`` (ancien comportement) : le verdict s'appuie sur la MAE brute de validation croisée
    #   (un seul pli d'extrapolation peut basculer le vendable). ``honest`` (DÉFAUT ACTIVÉ) : le
    #   verdict s'appuie sur la MAE d'INTERPOLATION (plis dont le point retiré reste dans l'enveloppe
    #   des prédicteurs) + une sanité sur la largeur relative de l'intervalle — cohérent avec
    #   « Limites assumées ». N'ajoute qu'un critère et change la source de la MAE de suffisance.
    gate_policy: str = "honest"                          # {strict, honest}
    interval_rel_width_green: float = 0.5                # (haut−bas)/central ≤ → 🟢 (honest)
    interval_rel_width_orange: float = 1.0               # ≤ → 🟠, au-delà → 🔴 (honest)
    # --- CV incalculable (régimes blend/vc_e) : jamais 🟢 sans indice de confiance ------------
    # ``cap_orange`` (défaut, réconcilie twin-theory §3 « 1–2 ultras → souvent 🟠 » et §10) :
    #   le verdict est plafonné à 🟠 quand la validation croisée n'est pas calculable — on vend,
    #   on prévient. ``ignore`` = ancien comportement (le critère absent n'entrait pas au verdict,
    #   un athlète sans AUCUNE validation pouvait sortir 🟢).
    cv_missing_policy: str = "cap_orange"                # {cap_orange, ignore}
    # --- qualité des canaux : PRÉVENIR, pas REFUSER (banc 2026-08-15) ------------------------
    # La fraction d'activités avec FC/altitude décrit l'ARCHIVE ENTIÈRE, pas la prédiction — et
    # le moteur gère déjà l'absence de ces canaux LÀ OÙ ELLE COMPTE : une activité sans altitude
    # est exclue de la courbe record (donc ne corrompt ni VC ni E), un ultra sans FC est conservé
    # mais signalé, la durabilité dégrade proprement en « non chiffrée ». Refuser en plus, c'est
    # punir deux fois le même risque. Le banc l'a confirmé : « Qualité » est le 1er motif de refus
    # (11 cas sur 4 athlètes) et bloque des cas dont le central tombe à ±15 % — dont Val, 6/6
    # refusé pour ~6 % de MAE, le meilleur central du banc.
    # Mais elle bloquait AUSSI, par accident, les archives réellement trop pauvres : au banc,
    # la rendre inoffensive a fait passer vendable une course à +35,7 % (Rapace, archive quasi
    # vide avant la coupure). La qualité est donc un signal de REPLI : elle ne dit rien quand
    # la validation croisée existe déjà — celle-ci prouve directement que le modèle marche sur
    # CET athlète — et elle redevient un garde-fou légitime quand il n'y a rien d'autre.
    # ``cv_gated`` (DÉFAUT) : non bloquante SI une validation croisée existe, bloquante sinon.
    # ``cap_orange`` : jamais bloquante.  ``red`` : ancien comportement (rollback).
    quality_policy: str = "cv_gated"                     # {cv_gated, cap_orange, red}
    # --- garde-fou DOMAINE (banc d'essai 2026-07, DIAGNOSTIC §9.9 ; Décision 2, §10.17) ------
    # Le moteur est calibré sur les efforts ≥ calibration.genuine_min_hours ; une cible
    # nettement plus courte est une extrapolation vers le bas HORS PÉRIMÈTRE. Mesuré au banc :
    # erreurs +59 à +308 % sur des cibles < 8 h, dont deux VENDUES 🟠.
    # ``demand`` (DÉFAUT) lit la DEMANDE du parcours : durée attendue = Deq ÷ vitesse de
    #   référence de l'athlète (calibration.domain_demand), comparée au seuil majoré de
    #   domain_margin_pct. La garde ne dépend d'aucune sortie du modèle : un changement de
    #   calibration ne peut plus ouvrir ni fermer le domaine (au banc, une queue d'enveloppe
    #   avait déplacé un temps prédit de 9,76 à 10,06 h et vendu, à +185 % d'erreur, un 36 km
    #   couru en 3,5 h).
    # ``predicted`` (ancien comportement ; ``on`` accepté comme synonyme) lit le temps PRÉDIT
    #   contre le seuil. ``off`` désactive.
    domain_gate: str = "demand"                          # {demand, predicted, off}
    # Vitesse de référence de la demande. ``observed`` : médiane de la vitesse ajustée ÉCOULÉE
    # des vrais ultras de l'athlète (même filtre que la calibration, même base que le seuil),
    # jamais sous le plancher « vrai ultra » ; sans vrai ultra, le plancher lui-même
    # (calibration.genuine_min_ga_kmh) — la définition du domaine : un parcours qu'aucun ultra
    # calibré ne mettrait genuine_min_hours à couvrir n'est pas un ultra. ``envelope`` :
    # l'enveloppe servie à genuine_min_hours (queue comprise), repli sur ``observed`` sans
    # enveloppe — hors régression c'est la prédiction elle-même, donc une lecture du modèle.
    domain_speed: str = "observed"                       # {observed, envelope}
    # Marge sur le seuil : hors domaine si durée attendue < genuine_min_hours × (1 + marge).
    # 5 % (10,5 h) passe entre le cas hors domaine le plus long du registre (9,4 h attendues)
    # et le cas dans le domaine le plus court (10,7 h) ; 10 % refuserait deux vendus justes.
    domain_margin_pct: float = 5.0
    # --- 🟢 conditionnel (Décision 3, DIAGNOSTIC §10.18) --------------------------------------
    # Le 🟢 est l'engagement de confiance : il n'est servi que dans la zone d'action mesurée au
    # banc — parcours dans le domaine, au moins green_min_genuine vrais ultras dont
    # green_min_genuine_hr avec fréquence cardiaque (durabilité, coût de pente et efficacité-
    # durée en dépendent), fraîcheur des données 🟢. En dessous, 🟠 au mieux : on vend, on
    # prévient. Un plafond dans l'esprit de §5.y, aucun critère recâblé. ``criteria`` = ancien
    # comportement (le pire des critères décide seul).
    green_policy: str = "zone_action"                    # {zone_action, criteria}
    green_min_genuine: int = 3
    green_min_genuine_hr: int = 1
    # --- fraîcheur des données (revue C8) -----------------------------------------------------
    # Jours entre la DERNIÈRE activité datée et la date d'analyse. Aucun critère ne portait le
    # garde-fou « forme du jour inconnue » (twin-theory §2.7/§9) : une archive s'arrêtant il y a
    # 8 mois pouvait être 🟢 partout (« Historique » mesure l'étendue, pas la fraîcheur).
    # Évalué seulement quand la date d'analyse est connue (pipeline : date du jour) ; ≤ 0 désactive.
    # NB : ancrer la PONDÉRATION de récence sur la date d'analyse serait inerte (facteur commun
    # sur tous les poids — régression, σ et N_eff de Kish invariants d'échelle) : la fraîcheur
    # se juge ici, pas dans les poids.
    freshness_days_green: float = 30.0
    freshness_days_orange: float = 90.0
    # « efforts longs proches de la cible » : un enregistrement-artefact (montre laissée tourner
    # 12 h à ~1 km/h) ne doit pas compter. Plancher d'allure ajustée = cette fraction du seuil
    # « vrai ultra » (calibration.genuine_min_ga_kmh) — 0 restaure l'ancien comportement.
    long_effort_min_ga_fraction: float = 0.5


@dataclass(frozen=True)
class TargetParams:
    """Mode OBJECTIF (ADR 0002) : le plan est ancré sur la cible de l'athlète.

    Le mode ne remplace jamais la prédiction (toujours calculée, affichée et consignée) : il
    ajoute un second rendu du même jumeau. Les fenêtres par segment cessent alors d'être une
    bande de probabilité pour devenir une **fenêtre de passage** (tolérance d'exécution) —
    d'où une constante propre, sans rapport avec ``pacing.plan_window_*``.
    """

    # Demi-largeur de la fenêtre de passage, en % du temps CUMULÉ. Valeur PROVISOIRE, choisie
    # à défaut de mesure : la bonne source est l'écart réel entre plan et passages aux
    # ravitaillements, qu'on n'a pas encore (ADR 0002, « ce qui reste ouvert »). Appliquée au
    # cumul, elle élargit la fenêtre avec la course (±18 min à mi-parcours d'un 31 h, ±46 min
    # à l'arrivée) — comportement voulu.
    tolerance_pct: float = 2.5
    # Cible plus rapide que la borne de sécurité basse → aucun plan servi, on rend l'écart
    # chiffré (objectif d'entraînement). Un plan pour un objectif hors d'atteinte est un plan
    # pour un abandon. Rollback explicite : false.
    refuse_outside_safety: bool = True


@dataclass(frozen=True)
class ReportParams:
    """Livraison du rapport : version du gabarit, adresse de l'annexe en ligne, réglages de
    PRÉSENTATION des pages (segments mis en avant, marge de la barre d'intensité), la preuve
    empirique de la dérive du plan dite en une phrase, et les seuils de la feuille."""

    version: str = "v3.0"
    # une page par référence de rapport ; la référence est non devinable (aléa) et la page
    # n'est ni indexée ni listée — le lien est le secret
    annex_base_url: str = "https://www.thelocomotionlab.com/services/twin/annexe"
    # la barre d'intensité : marge laissée de part et d'autre de l'étendue des ultras, en
    # fraction de cette étendue — sans elle, un repère tombe pile sur le bord de l'axe
    intensity_axis_margin: float = 0.2
    fade_evidence: str = ("sur 30 courses, les coureurs sont en avance sur un plan plat à "
                          "mi-course 27 fois sur 30")
    # consigne par segment : au-delà de ces dénivelés, le segment est mis en avant
    # (terracotta) et porte la consigne qui va avec
    strong_dplus_m: float = 800.0
    strong_dminus_m: float = 1000.0
    # longueur maximale d'une consigne : elle se lit d'un coup d'œil, la nuit, à bout de bras
    consigne_max_chars: int = 60


@dataclass(frozen=True)
class Config:
    data_dir: Path
    course: CourseParams = field(default_factory=CourseParams)
    twin: TwinParams = field(default_factory=TwinParams)
    calibration: CalibrationParams = field(default_factory=CalibrationParams)
    prediction: PredictionParams = field(default_factory=PredictionParams)
    pacing: PacingParams = field(default_factory=PacingParams)
    sufficiency: SufficiencyParams = field(default_factory=SufficiencyParams)
    narrative: NarrativeParams = field(default_factory=NarrativeParams)
    target: TargetParams = field(default_factory=TargetParams)
    report: ReportParams = field(default_factory=ReportParams)


# --------------------------------------------------------------------------- #
# Construction d'un sous-bloc dataclass à partir d'un dict JSON, en ne gardant
# que les clés connues et en coerçant les tuples (JSON ne connaît que les listes).
# --------------------------------------------------------------------------- #
def _build(cls: type, raw: dict[str, Any] | None):
    if not raw:
        return cls()
    known = {f.name: f for f in fields(cls)}
    kwargs: dict[str, Any] = {}
    for key, value in raw.items():
        if key not in known:
            continue  # clé inconnue (ex. "_comment") → ignorée
        default = getattr(cls(), key)
        if isinstance(default, tuple) and isinstance(value, list):
            value = tuple(value)
        kwargs[key] = value
    return cls(**kwargs)


def _default_config_path() -> Path:
    """``twin.config.json`` est posé à la racine du service (à côté de pyproject)."""
    return Path(__file__).resolve().parents[2] / "twin.config.json"


def override_config(cfg: Config, spec: str) -> Config:
    """Variante de config par surcharge « bloc.clé=valeur[,bloc.clé=valeur…] » — l'instrument
    des A/B au banc (``tools/banc --variant``, ``twin-engine --set``). La valeur est typée
    d'après le champ courant (bool, int, float, str) ; une clé inconnue est une erreur, jamais
    un silence."""
    from dataclasses import replace

    out = cfg
    for item in [x.strip() for x in spec.split(",") if x.strip()]:
        if "=" not in item or "." not in item.split("=", 1)[0]:
            raise ValueError(f"surcharge illisible : {item!r} (attendu bloc.clé=valeur)")
        path, raw = item.split("=", 1)
        block_name, key = path.strip().split(".", 1)
        block = getattr(out, block_name, None)
        if block is None or not hasattr(block, "__dataclass_fields__"):
            raise ValueError(f"bloc de config inconnu : {block_name!r}")
        if key not in block.__dataclass_fields__:
            raise ValueError(f"clé inconnue : {block_name}.{key}")
        current = getattr(block, key)
        raw = raw.strip()
        if isinstance(current, bool):
            value: Any = raw.lower() in ("1", "true", "on", "yes", "oui")
        elif isinstance(current, int):
            value = int(raw)
        elif isinstance(current, float) or current is None:
            try:
                value = None if raw.lower() in ("none", "null") else float(raw)
            except ValueError:
                value = raw
        elif isinstance(current, tuple):
            value = tuple(type(current[0])(x) for x in raw.split(";")) if current else tuple(raw.split(";"))
        else:
            value = raw
        out = replace(out, **{block_name: replace(block, **{key: value})})
    return out


def load_config(config_path: str | os.PathLike[str] | None = None) -> Config:
    """Charge la configuration : env (chemins) > twin.config.json (constantes) > défauts."""
    path = Path(
        config_path
        or os.environ.get("TWIN_CONFIG_PATH")
        or _default_config_path()
    )

    raw: dict[str, Any] = {}
    if path.exists():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:  # pragma: no cover - défensif
            raise SystemExit(f"twin.config.json illisible ({path}): {exc}") from exc

    data_dir = Path(os.environ.get("DATA_DIR") or raw.get("data_dir") or "/data")

    return Config(
        data_dir=data_dir,
        course=_build(CourseParams, raw.get("course")),
        twin=_build(TwinParams, raw.get("twin")),
        calibration=_build(CalibrationParams, raw.get("calibration")),
        prediction=_build(PredictionParams, raw.get("prediction")),
        pacing=_build(PacingParams, raw.get("pacing")),
        sufficiency=_build(SufficiencyParams, raw.get("sufficiency")),
        narrative=_build(NarrativeParams, raw.get("narrative")),
        target=_build(TargetParams, raw.get("target")),
        report=_build(ReportParams, raw.get("report")),
    )


__all__ = [
    "Config",
    "override_config",
    "CourseParams",
    "TwinParams",
    "CalibrationParams",
    "PredictionParams",
    "PacingParams",
    "SufficiencyParams",
    "NarrativeParams",
    "TargetParams",
    "ReportParams",
    "load_config",
]
