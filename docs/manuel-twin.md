# Manuel — Locomotion Twin (moteur d'analyse)

> Mode d'emploi **vivant** du moteur `services/twin-engine`. À mettre à jour à chaque évolution.
> La méthode scientifique (VC, exposant d'endurance, durabilité, Minetti, pacing) est dans
> [`docs/twin-theory.md`](./twin-theory.md) — ce document-ci ne couvre que **l'usage**.
>
> Dernière mise à jour (2026-09-15) : outils de la Phase 0 du chantier v2 (tableau de
> référence et avant/après du registre, radiographie arrêts/nuit des vrais ultras, passages
> réels aux points de contrôle). Avant : mode backtest `--until`, outils de registre, lecture
> des deux bandes (intervalles conformes par défaut depuis le 2026-07-03).

## 1. À quoi ça sert

À partir de **l'archive d'entraînement** d'un·e athlète + la **trace GPX** d'une course cible, le
moteur :
1. estime un « jumeau » physiologique (vitesse critique `VC`, exposant d'endurance `E`, durabilité) ;
2. confronte ce jumeau au coût de la pente le long du parcours (Minetti → distance équivalente `Deq`) ;
3. prédit un **temps d'arrivée** validé par validation croisée sur les propres courses de l'athlète ;
4. rend un **verdict de suffisance** (🟢/🟠/🔴) et un **plan de pacing par segment** avec fenêtres horaires ;
5. produit un **rapport PDF** (LaTeX/XeLaTeX) pédagogique.

Deux profondeurs :
- **`preview`** : rapide, sans PDF → verdict + fourchette de temps. C'est ce qu'on montre **avant paiement**.
- **`full`** : `preview` + pacing + figures + **rapport PDF**.

## 2. Formats d'archive acceptés (ingestion)

Tout est normalisé vers **un schéma canonique** (1 enregistrement/seconde) ; le reste du moteur ne
raisonne jamais « par marque ». On ne conserve que la **course à pied** (le sport est lu **dans** le
fichier, jamais d'après son nom) ; l'archive brute est **supprimée juste après l'analyse**.

| Source | Ce qu'on dépose | Détails |
|---|---|---|
| **Fichier unique** | `.fit`, `.tcx`, `.gpx` (éventuellement `.gz`) | Coros/Garmin/Suunto/Polar… |
| **Coros / Garmin (montre)** | un `.zip` de traces | déballé, `.gz` décompressés automatiquement |
| **Garmin RGPD** (« Exporter toutes vos données ») | le `.zip` global | zips imbriqués gérés ; fichiers de bruit (monitoring…) ignorés |
| **Polar Flow** (« Export your data ») | le `.zip` | JSON propriétaire ; seules les *training-sessions* avec échantillons sont lues |
| **Strava** (« Download your archive ») | le `.zip` | lit `activities/` + `activities.csv` (en-tête **localisé** géré) ; `media/`, `routes/`, CSV racine ignorés |
| **Dossier** | un répertoire | parcouru récursivement |

Ce qui est **écarté** dans tous les cas : vélo, natation, rando, ski, musculation, sport en salle,
séances sans données de locomotion, et tout ce qui n'est pas une trace exploitable.

Deux exports qui se recouvrent (montre + Strava, ancien + nouveau) peuvent être déposés
ensemble : une activité présente deux fois (même départ à la seconde, même durée, même
distance) n'est comptée qu'une fois, la copie la plus riche (FC, altitude) est gardée
(`twin.dedup_activities`, rollback `off`). Le journal dit combien de copies ont été
fusionnées.

## 3. Utilisation en ligne de commande (CLI)

Installation dev (une fois) :

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -e "services/twin-engine[dev]"
```

La commande `twin-engine` est alors disponible.

**Aperçu (verdict + fourchette, pas de PDF) :**

```bash
twin-engine preview \
  --training  chemin/vers/archive.zip \
  --course    chemin/vers/parcours.gpx \
  --athlete   "Prénom Nom" \
  --purge      # supprime l'archive après parsing (recommandé)
```

> `--race` est **optionnel**. Sans lui (**mode GPX-only**) : la distance, le D+/D- et le
> profil viennent **directement de la trace GPX**, et le parcours est découpé
> **automatiquement tous les 10 km**. Ajoute `--race spec.json` seulement pour fournir les
> vrais ravitaillements, l'heure de départ et la position (horaires/nuit) — voir §6.

**Rapport complet (figures + PDF) :**

```bash
twin-engine full \
  --training chemin/vers/archive.zip \
  --course   chemin/vers/parcours.gpx \
  --out      chemin/vers/sortie/ \
  --athlete  "Prénom Nom"
  # --no-pdf         pour s'arrêter aux figures (sans compiler le PDF)
  # --feuille-seule  pour ne compiler que la feuille à emporter (réimpression de dernière minute)
```

Le `preview` imprime un JSON (verdict, prédiction, jumeau, parcours) + un résumé lisible. Le `full`
écrit les figures et le PDF dans `--out`, plus ce qui accompagne le rapport (v3) :

| fichier | ce que c'est |
|---|---|
| `rapport.pdf` | le rapport, quatre pages — couverture, ta course, le plan, ton profil (sa source reste dans `tex/`) |
| `feuille.pdf` | la feuille à emporter : A4 paysage recto-verso, deux tableaux et rien d'autre (marche au recto, assistance au verso) |
| `plan.ics` | le calendrier : un événement par point d'assistance |
| `plan.gpx` | la trace avec un point de passage horodaté par point d'assistance |
| `annexe.json` | l'annexe en ligne |

Le dossier de sortie se réutilise sans précaution : les auxiliaires LaTeX de la compilation
précédente sont effacés avant chaque passe (un `.aux` d'un ancien gabarit faisait mourir XeLaTeX
sur « Undefined control sequence » en accusant le document neuf).

`--ref` fixe la référence du rapport ; sans elle, elle est **tirée au hasard** — c'est elle qui rend
l'adresse de l'annexe non devinable. Pour publier l'annexe : copier `annexe.json` dans
`apps/site/public/twin-annexes/<référence>.json` et déployer le site ; la page
`/services/twin/annexe/<référence>` est prérendue, en `noindex`, hors navigation, hors plan de site et
hors recherche. La retirer, c'est supprimer le fichier et redéployer.

Les points d'assistance viennent de `crew` dans la spec de course (§6), puis de
`crew_access_indices` ; sans déclaration, le moteur prend les bases majeures et la feuille **dit**
que ces points sont supposés.

Un rapport ne se rend pas avec des noms de ravitaillement bouchons (« AS3 », « PC 12 », un kilomètre
répété) : le rendu s'arrête avec la liste des noms fautifs. Mets les vrais noms du carnet de course
dans `aid_names`.

> `--race` est **optionnel** (défaut : aucun → mode GPX-only, distance issue de la trace et
> découpage automatique en segments). `examples/nice-100m.json` est un exemple de spec : pour une
> course avec carnet de route, copie ce fichier et adapte les champs (voir §6).

**Mode backtest (`--until`, `preview` et `full`)** : `--until 2026-05-30` écarte toutes les
activités postérieures (et non datées) — le moteur « remonte le temps » à la veille d'une course
passée pour comparer sa prédiction au temps réel. C'est l'outil du registre de couverture (§7).

## 4. Utilisation via l'API (HTTP)

L'API FastAPI est **interne** en prod (l'app `twin` qui la consommera n'existe pas encore —
côté site, seuls la page `/services/twin` et la page de dépôt de la cohorte
`/services/twin/cohorte` sont en ligne ; les archives déposées arrivent sur le VPS via le
service `twin-depot`, pas par cette API). En local, on l'expose pour tester :

```bash
docker compose -f services/twin-engine/compose.local.yml up --build
# → http://localhost:8000/health      (sonde)
# → http://localhost:8000/docs        (OpenAPI interactif)
```

Endpoints :

| Méthode & route | Rôle |
|---|---|
| `GET /health` | sonde de vie |
| `POST /preview` | archive + GPX + spec de course → verdict + fourchette (synchrone, sans PDF). ⚠️ côté HTTP le champ `race` est **requis** (contrairement au CLI où `--race` est optionnel) |
| `POST /jobs` | lance une analyse **complète** en tâche de fond → renvoie un `job_id` |
| `GET /jobs/{id}` | état du job + résultat (quand prêt) |
| `GET /jobs/{id}/report` | télécharge le **PDF** du rapport |

Les jobs et leurs sorties vivent dans le volume de données (`/data` : `jobs.sqlite` + PDF). Les
archives brutes envoyées sont purgées après parsing.

## 5. Où vont les données / confidentialité

- **Archives d'entraînement supprimées immédiatement après analyse** (garde-fou CLAUDE.md). On ne
  garde que le rapport (le temps du SAV) et un minimum de métadonnées.
- Les **noms de fichiers sont anonymisés** à l'ingestion (les exports RGPD peuvent contenir l'e-mail
  de l'athlète) ; poids, notes privées, descriptions et identifiants d'appareil ne sont **jamais lus**.
- En local, les données de test vont dans `services/twin-engine/local-data/` (git-ignoré).

## 6. Décrire une course cible (`--race`, optionnel)

**Sans `--race`** : mode GPX-only — distance, D+/D-, profil et Deq viennent de la trace ;
découpage automatique tous les 10 km (réglable via `CourseParams.default_segment_km`).

**Avec `--race spec.json`** (cf. `examples/nice-100m.json`) : pour des ravitaillements et des
horaires réels. Tous les champs sont **optionnels** — ne mets que ce que tu veux préciser :

| Champ | Sens | Si absent |
|---|---|---|
| `name` | nom de la course | « Course » |
| `aid_km` | positions (km) des ravitaillements, départ inclus | découpage auto tous les 10 km |
| `aid_names` | noms des points correspondants | « Départ » / « km N » / « Arrivée » |
| `start_time` | départ (ISO 8601 avec fuseau) | pas d'horaires ni de calcul jour/nuit |
| `lat`, `lon`, `tz_offset_h` | point de départ + décalage horaire (soleil/nuit) | idem |
| `major_base_indices` | indices des bases-vie majeures (arrêts longs) | aucune base majeure |
| `technicity_pct` | **majoration de coût déclarée** pour la technicité du terrain (%) | 0 — le moteur ne devine pas |
| `crew` | points d'assistance du **règlement**, `[{aid_index, note}]` indexés sur `aid_names` | repli sur `crew_access_indices`, puis sur les bases majeures, annoncé comme supposé |
| `nutrition` | débits **déclarés** `{water_l_per_h, carbs_g_per_h}` | colonnes eau et ravito vides, à remplir au stylo |
| `phases` | découpe de la course, `[{name, note, from_aid_index}]` | deux parties, coupées au ravitaillement le plus proche de la mi-temps prédite |

`crew` prime sur `crew_access_indices` (les segments dont la **fin** est ouverte à l'assistance) :
la feuille, le calendrier et les points GPX s'y calent. Une `note` vide imprime une case à remplir.

`nutrition` n'est jamais devinée : sans les **deux** débits, le moteur ne calcule rien et les
colonnes restent blanches. Avec les deux, il calcule par segment sur la durée prévue (arrêts
compris) et donne les totaux au verso de la feuille.

### Technicité du terrain (`technicity_pct` / `--technicity`)

Le GPX ne porte que la **géométrie**. Minetti traduit la **pente** en coût métabolique en
supposant un sol roulant : à D+/km égal, une piste et une arête chaotique sont traitées
identiquement. Sur un parcours très technique (pierriers, chaos, mains courantes), les temps
réels sont donc **plus lents que prédit**.

`--technicity 13` déclare que ce parcours coûte ~13 % de plus, à pente égale, que les courses
de référence de l'athlète : toute la distance équivalente est majorée d'autant. C'est une
**hypothèse d'entrée assumée**, jamais une mesure — le rapport l'affiche comme telle, dans un
encadré dédié et dans les limites. Sans déclaration (défaut 0), le rapport avertit au contraire
que la technicité n'est pas prise en compte.

Ordre de grandeur : un écart de X % sur le temps visé correspond à ~X % de majoration.

> ⚠️ Ce qui vient **toujours du GPX** (jamais du JSON) : le **D+/D-**, le profil, la pente,
> le Deq (avant majoration). Fournir `aid_km` **recale** seulement la distance totale sur le km officiel et
> nomme les segments. (`official_dplus_m` n'est pas utilisé par le moteur.)

La **trace GPX du parcours** est fournie à part (`--course`) et n'est pas committée.

## 7. Lire la fourchette : les deux bandes

> **Le rapport v3** (quatre pages, feuille à emporter, ICS, GPX, annexe en ligne) est décrit
> dans `docs/twin-theory.md` §7 et dans `DIAGNOSTIC.md` §10.20 ; sa charte vient de `packages/ui`
> via `report/charte.py`, et ses
> polices sont des instances statiques d'Ubuntu Sans régénérables par
> `PYTHONPATH=src python -m tools.instance_fonts`.

> **Le verdict 🟢 est conditionnel** (Décision 3, DIAGNOSTIC §10.18) : il n'est servi que si le
> parcours est dans le domaine de calibration, si l'archive compte au moins trois vrais ultras
> dont un avec fréquence cardiaque, et si les données sont fraîches. Sinon 🟠, vendu, avec la
> raison écrite dans `sufficiency.reasons`. Clés `sufficiency.green_policy` (`zone_action` /
> `criteria`), `green_min_genuine`, `green_min_genuine_hr`.

Depuis le 2026-09-16 (Décision 1 du chantier v2, DIAGNOSTIC §10.16), les intervalles servis
par défaut sont **studentisés** en **lien log** : la régression porte sur le logarithme de la
vitesse avec un prior sur la pente en durée lu sur l'efficacité-durée de l'athlète, la
largeur des bandes est un facteur d'échelle κ sur les erreurs de validation croisée, lu sur
une loi de Student à ν degrés de liberté (n_eff − 3), et les bandes sont **asymétriques en
heures** (la borne haute plus loin du central que la borne basse : T·exp(±h)). Le JSON dit
`prediction.scale_kappa`, `scale_dof`, `sd_rel`, `leverage` ; le rapport nomme la méthode. Le
comportement de juillet 2026 (lien linéaire, pente libre, bandes **conformes normalisées**) est
le rollback nommé : `TWIN_CONFIG_PATH=examples/twin.config.historique.json` (ou cinq `--set`) ;
la règle de retour est pré-enregistrée dans `docs/twin-registre-couverture.md`. Dans les deux
cas le rapport affiche **deux bandes, deux usages** :

- **Fourchette de course (25–75 %)** — la bande de PILOTAGE : c'est dans cette fenêtre qu'on
  construit le pacing et qu'on juge « en avance / en retard » pendant la course.
- **Bornes de sécurité (80 %)** — la bande LOGISTIQUE : barrières horaires, assistance,
  récupération — « il est très improbable d'arriver hors de ça ».

Si la dispersion est grande (> 0,35), le rapport ajoute une table de scénarios
rapide / central / prudent. Ne jamais présenter la borne de sécurité comme un objectif.

Trois leviers de la Phase 1 du chantier v2 (DIAGNOSTIC §10.1–10.4) ont été livrés derrière des
flags et servis d'abord pour le seul **rapport de référence** (`examples/twin.config.reference.json`,
§8) ; ils sont les défauts depuis la Décision 1 : en lien log (`calibration.link=log`) les deux
bandes gardent leurs couvertures nominales mais deviennent **asymétriques en heures**, la
borne haute plus loin du central que la borne basse ; le prior sur la pente en durée
(`calibration.duration_term=prior_shrunk`) tire la pente vers −α, l'exposant de la courbe
record, ce qui resserre les bandes en extrapolation et déplace le central vers plus lent ;
avec `prediction.interval_source=studentized_scale`, les largeurs viennent d'un facteur
d'échelle sur les erreurs de validation croisée lu sur une loi de Student, au lieu du
quantile empirique — même vocabulaire, mêmes usages. Le rapport nomme la méthode servie
(« prédiction conforme » ou « facteur d'échelle studentisé »).

Quatre leviers de la Phase 2 (DIAGNOSTIC §10.5–10.8), derrière des flags, défauts inchangés
tant que le banc n'a pas parlé : `calibration.stops_model=personal` sépare le temps de
mouvement des arrêts (taux personnel mesuré sur les ultras de l'athlète, réparti sur les
ravitos ; le rapport le dit) ; `calibration.night_term=prior_shrunk` fait entrer la nuit de
la cible, en écart à la nuit habituelle de ses ultras, dans le central et les bandes (il faut
`start_time`, `lat`, `lon` dans la spec) ; `pacing.fade_source=splits` dérive la dérive du
plan des moitiés de ses courses ; `prediction.environment_term=declared` applique une
chaleur déclarée (`heat_c` de la spec) et l'altitude du parcours en écart à celle de ses
ultras. Le banc a tranché (DIAGNOSTIC §10.9) : seul le Δ du fade change de défaut
(`pacing.fade_delta` 0,085 → 0,15, `fade_delta_max` 0,13 → 0,20, le plan sert désormais une
dérive de −26 % entre départ et arrivée) ; les trois autres leviers restent derrière leur
flag, défaut inchangé, et la config de référence de Valentin n'en active aucun.

Quatre leviers de la Phase 3 (l'information manquante sur la pente au-delà de 6 h ;
DIAGNOSTIC §10.10–10.13), derrière des flags, défauts inchangés tant que le banc n'a pas
parlé : `calibration.duration_prior_source=efficiency|record_tail` fait tirer la pente de la
régression vers l'exposant d'efficacité-durée (`Twin.alpha_eff`, toutes les sorties avec FC
≥ 1 h) ou vers celui de la queue de la courbe record (`Twin.alpha_tail`, fenêtres de 10 à 36 h
des vrais ultras) ; `calibration.envelope_tail=efficiency|record_tail` fait décroître
l'enveloppe des replis blend et vc_e avec le même exposant au-delà de 6 h ;
`calibration.level_anchor=vc_epoch` ramène chaque ultra à la forme actuelle par la VC de son
année (`level_anchor_gain`, `level_anchor_window_days`) ; `calibration.genuine_floor=riegel`
fait décroître le plancher des vrais ultras avec la durée (5,5 à 10 h, 4,7 à 26 h) et
`calibration.genuine_max_stop_s=3600` écarte les efforts au plus long plateau d'une heure ou
plus (sommeil). Les deux exposants et le plus long arrêt sont mesurés et consignés quel que
soit le flag (JSON `twin.alpha_eff`, `twin.alpha_tail` ; registre `model.alpha_eff`,
`alpha_tail`, `duration_prior_origin`, `envelope_tail_alpha`, `level_n_anchored`,
`level_shift_mean_pct`, `genuine_floor`) ; `tools/diag_archive` et `tools/diag_ultras`
impriment le plancher servi et le plus long arrêt de chaque effort long. Le banc a tranché
(DIAGNOSTIC §10.14) : B1 (`duration_prior_source=efficiency`, `envelope_tail=efficiency`) a
d'abord été activé pour le rapport de référence, puis est passé en défaut avec la pile de
référence (Décision 1, §10.16) ; B2, P et F restent derrière leur flag, non activés.

Levier de la Phase 5 (coût de pente personnel, C1 ; DIAGNOSTIC §10.15), derrière flag, défaut
inchangé : `calibration.slope_cost=personal` remet le surcoût de pente de Minetti à l'échelle
de l'athlète (κ montée et descente, `twin.slope_kappa_up/down`, mesurés sur ses secondes en
pente avec FC ; `slope_cost_min_hours`, `slope_kappa_min/max`), sur la vitesse ajustée de ses
efforts comme sur le Deq du parcours ; les réglages de mesure (`twin.slope_bin_pct`,
`slope_max_pct`, `slope_hr_min_bpm`, `slope_hr_lag_s`) ne varient pas au banc. Le rapport
porte alors une note « ton coût de pente, mesuré » ; le registre porte `model.slope_kappa_*`,
`slope_hours_*`, `slope_cost` et `course.slope_kappa`.

### Mode objectif ([ADR 0002](./adr/0002-mode-objectif-plan-sur-cible.md))

À la demande de la cohorte (« je vise 31 h, donne-moi le plan »), le moteur sait ancrer le plan sur
une **durée visée** au lieu du temps prédit. **Utilisable dès maintenant** : ajoute `target_hours`
à la spec de course et lance un `full` normal.

```json
{ "name": "L'Échappée Belle", "target_hours": "31h", "start_time": "…", "aid_km": [ … ] }
```

…ou, sans toucher au JSON, avec **`--target`** (qui prime sur la spec) :

```bash
twin-engine preview --training <archive> --course <parcours.gpx> --target 31h     # verdict seul
twin-engine full    --training <archive> --course <parcours.gpx> --race <spec.json> \
                    --target 31h --out ./out                                       # + rapport
```

Côté **API**, `target_hours` est un champ de formulaire optionnel de `POST /preview` et
`POST /jobs` (prioritaire sur la spec postée) — un objectif illisible renvoie **422**.

Toutes les saisies acceptent `31h`, `31h30`, `31:00:00` ou un nombre d'heures. Le `preview` rend le
**verdict de faisabilité sans PDF** (c'est la réponse à donner avant paiement) ; le `full` ajoute la
section **« Ton objectif face à ton jumeau »**, répartit le plan sur la cible et change le
vocabulaire des fenêtres (voir ci-dessous). Sans objectif, tout est **exactement** comme avant.

À retenir :

- la **prédiction n'est jamais remplacée** — le mode objectif s'ajoute à côté d'elle, et le registre
  de couverture continue de ne consigner que la prédiction ;
- les fenêtres par segment changent de nature : **fenêtre de passage** (tolérance d'exécution fixe,
  `target.tolerance_pct`), plus une bande de probabilité — donc jamais de « 50 % » ni « 80 % » à
  leur sujet ;
- une cible plus rapide que la borne de sécurité basse ne donne **pas** de plan mais un écart chiffré
  (objectif d'entraînement), et la garde du domaine (`sufficiency.domain_gate`) reste prioritaire sur
  toute cible : elle lit la **demande du parcours** (Deq ÷ vitesse de référence de l'athlète, contre
  10 h majorées de `domain_margin_pct`), un parcours sous le domaine est `hors_domaine` quel que soit
  l'objectif, et un objectif court sur un parcours long est `hors_portee`, pas hors domaine.

## 8. Développement & tests

```bash
pytest services/twin-engine                 # suite complète
```

Le **golden test** (course de Nice 100M) ne s'active que si les vraies données sont fournies :

```bash
TWIN_NICE_ARCHIVE=/chemin/archive.zip TWIN_NICE_GPX=/chemin/parcours.gpx \
  pytest services/twin-engine -k nice
```

Les fixtures d'ingestion (Garmin/Polar/Strava, anonymisées) sont committées dans
`services/twin-engine/tests/fixtures/` et tournent en CI sans données réelles.

**Outils d'évaluation** (depuis `services/twin-engine`) :

```bash
PYTHONPATH=src python -m tools.ab_montagnhard      # A/B σ/MAE/interp/extrap — preuve obligatoire avant merge
PYTHONPATH=src python -m tools.backtest <manifest> # walk-forward --until : prédiction veille de course vs réel
PYTHONPATH=src python -m tools.registre [--json]   # couverture des intervalles, biais, score de Winkler
PYTHONPATH=src python -m tools.ab_recency <manifests…>  # balaye la demi-vie de récence (biais de progression)
PYTHONPATH=src python -m tools.registre --frontiere # jusqu'où resserrer les bandes sans perdre la couverture
PYTHONPATH=src python -m tools.registre --tableau   # tableau de référence (markdown) : par athlète et total,
                                                    #   vendus/refusés, MAE, biais, couvertures, Winkler relatif,
                                                    #   largeur relative médiane — à coller dans DIAGNOSTIC
PYTHONPATH=src python -m tools.registre --compare AVANT.json   # avant → après : deltas par athlète (vendus),
                                                    #   changements de verdict, erreur entrée par entrée
PYTHONPATH=src python -m tools.diag_ultras <archive> --manifest <manifeste>   # vrais ultras : arrêts (H2),
                                                    #   part de nuit (C2), écart montre − officiel ; agrégats
                                                    #   pondérés comme la calibration (récence × maximalité)
PYTHONPATH=src python -m tools.diag_ultras --course <gpx> --race <spec.json> --hours 32.3   # part de nuit
                                                    #   de la CIBLE, par segment, via le plan réel
PYTHONPATH=src python -m tools.passages <manifestes…>   # heures de passage RÉELLES aux points de contrôle des
                                                    #   courses passées → champ `passages` du registre
PYTHONPATH=src python -m tools.banc <manifestes…> --out <dossier>   # les trois précédents + backtest en UNE passe
                                                    #   par archive, sorties markdown/JSON dans le dossier
PYTHONPATH=src python -m tools.banc <manifestes…> --out <dossier> --variant NOM:bloc.clé=valeur,…
                                                    #   + rejeu de toutes les coupures sous une config
                                                    #   surchargée (A/B), sur le même décodage
twin-engine preview … --set bloc.clé=valeur         # même surcharge pour un cas isolé (répétable)
```

> **Avant / après (chantier v2).** Le registre committé au départ du chantier est figé dans
> `docs/archive/twin-v2/registre-avant.json`. Toute preuve d'un levier se lit par
> `tools/registre --compare docs/archive/twin-v2/registre-avant.json` après avoir rejoué le
> banc : MAE des cas vendus, couvertures, Winkler, largeurs — par athlète, jamais sur un seul.

**Mesures préalables du chantier v2 (Phase 0), à lancer chez Valentin** — les archives
(`_seed/cas_validation/<Athlète>/archives/`, une archive par dossier, ~1,9 Go en tout) ne
quittent pas sa machine ; les outils n'impriment que des agrégats. Un seul décodage par
archive (`tools/banc`), long sur une grosse archive Coros (le compteur avance tous les
100 fichiers — ne pas interrompre). Depuis `services/twin-engine`, venv de la racine activé :

```bash
M="_seed/manifest-val.json _seed/manifest-crasse.json _seed/manifest-lolo.json _seed/manifest-rapace.json"
# 0.1 + 0.2 + 0.5 en une passe par archive : banc (toutes coupures), arrêts/nuit, passages,
#     puis tableau.md et compare.md (avant/après) dans le dossier de sortie
PYTHONPATH=src python -m tools.banc $M --out /tmp/p0
# 0.3 — part de nuit de la cible (central du rapport livré : 32 h 17) ; la trace cible est
#     dans _seed/cas_validation/Val/courses/
NICE_GPX=$(ls _seed/cas_validation/Val/courses/*.gpx | grep -i nice | head -1); echo "$NICE_GPX"
PYTHONPATH=src python -m tools.diag_ultras --course "$NICE_GPX" --race examples/nice-100m.json --hours 32.28 > /tmp/p0/nuit-nice.md
# référence « avant » du cas Nice sur l'archive de Val et le moteur actuel (JSON hors git)
mkdir -p local-data
twin-engine preview --training _seed/cas_validation/Val/archives --course "$NICE_GPX" --race examples/nice-100m.json > local-data/nice-avant-v2.json
```

Les sorties de `/tmp/p0/` sont du markdown à coller dans le carnet (DIAGNOSTIC §10.0) ;
seuls le registre et les manifestes (agrégats, chemins) se committent. L'instantané
`docs/archive/twin-v2/registre-avant.json` est le banc rejoué SOUS DÉDOUBLONNAGE ; le banc
brut du départ du chantier, où Lolo était doublé, est conservé sous
`registre-avant-doublons.json`.

**Banc de la Phase 1 (leviers de l'intervalle), une relance pour toutes les variantes** —
les variantes ne touchent que la calibration et la prédiction, donc un seul décodage :

```bash
M="_seed/manifest-val.json _seed/manifest-crasse.json _seed/manifest-lolo.json _seed/manifest-rapace.json"
PYTHONPATH=src python -m tools.banc $M --out /tmp/p1 --no-diag --no-passages \
  --variant A2:calibration.link=log \
  --variant A1:calibration.duration_term=prior_shrunk \
  --variant A2A1:calibration.link=log,calibration.duration_term=prior_shrunk \
  --variant A2A1l5:calibration.link=log,calibration.duration_term=prior_shrunk,calibration.duration_shrink_lambda=5 \
  --variant A2A1l10:calibration.link=log,calibration.duration_term=prior_shrunk,calibration.duration_shrink_lambda=10 \
  --variant A3:prediction.interval_source=studentized_scale \
  --variant A2A3:calibration.link=log,prediction.interval_source=studentized_scale \
  --variant A2A1A3:calibration.link=log,calibration.duration_term=prior_shrunk,prediction.interval_source=studentized_scale \
  --variant A2A1A3mad:calibration.link=log,calibration.duration_term=prior_shrunk,prediction.interval_source=studentized_scale_mad \
  --variant A2A1A3signed:calibration.link=log,calibration.duration_term=prior_shrunk,prediction.interval_source=studentized_scale_signed
# cas de référence sous les variantes candidates (une passe d'archive chacune)
NICE_GPX=_seed/cas_validation/Val/courses/nice-100m-2026.gpx
twin-engine preview --training _seed/cas_validation/Val/archives --course "$NICE_GPX" --race examples/nice-100m.json \
  --set calibration.link=log > local-data/nice-A2.json
twin-engine preview --training _seed/cas_validation/Val/archives --course "$NICE_GPX" --race examples/nice-100m.json \
  --set calibration.link=log --set calibration.duration_term=prior_shrunk > local-data/nice-A2A1.json
twin-engine preview --training _seed/cas_validation/Val/archives --course "$NICE_GPX" --race examples/nice-100m.json \
  --set calibration.link=log --set calibration.duration_term=prior_shrunk \
  --set prediction.interval_source=studentized_scale > local-data/nice-A2A1A3.json
```

`compare-<nom>.md` compare chaque variante au banc servi DU MÊME passage (agrégats décodés
identiques) ; `tableau-<nom>.md` donne ses colonnes de référence. Rien de tout cela n'entre
dans le registre committé.

**Résultat de la Phase 1 (2026-09-15, DIAGNOSTIC §10.4)** : aucun défaut basculé ; les trois
leviers sont servis pour le rapport de référence par un fichier de config partiel (les clés
absentes gardent `twin.config.json`) :

```bash
# rapport de référence : lien log + prior de durée + échelle studentisée
TWIN_CONFIG_PATH=examples/twin.config.reference.json twin-engine full \
  --training _seed/cas_validation/Val/archives --course "$NICE_GPX" --race examples/nice-100m.json \
  --athlete Val --out local-data/out/nice-2026
# strictement équivalent, sans fichier :
twin-engine full … --set calibration.link=log --set calibration.duration_term=prior_shrunk \
  --set prediction.interval_source=studentized_scale
# sans rien : les défauts (central 32,3 h, bornes 24,5–40,2) ; avec : 34,3 h, bornes 29,8–39,5
```

Le JSON du `preview` sous cette config expose ce que le rapport utilise : `calibration.link`,
`calibration.duration_prior` (b, λ, origine), `prediction.leverage` et `sd_rel` (levier de la
cible), `scale_kappa` et `scale_dof` (échelle et degrés de liberté de la Student). `tools/backtest`,
`tools/diag_ultras` et `tools/passages` restent utilisables séparément ; `tools/banc` donne
exactement les mêmes résultats (test `test_banc_one_pass_matches_the_separate_tools`).

**Banc de la Phase 2 (temps réel : arrêts, nuit, fade, environnement ; DIAGNOSTIC §10.5–10.8),
une relance pour toutes les variantes** — SANS `--no-passages` : le calendrier des courses
(départ, position) est lu dans l'activité du jour retenue pour les passages et sert au terme
de nuit de la cible ; le banc de base enrichit le registre (taux d'arrêt personnel, Δ des
moitiés, durabilité de chaque coupure), à committer ensuite :

```bash
R="calibration.link=log,calibration.duration_term=prior_shrunk,prediction.interval_source=studentized_scale"
M="_seed/manifest-val.json _seed/manifest-crasse.json _seed/manifest-lolo.json _seed/manifest-rapace.json"
PYTHONPATH=src python -m tools.banc $M --out /tmp/p2 --no-diag \
  --variant B4:calibration.stops_model=personal \
  --variant B4e:calibration.stops_model=personal,calibration.stops_duration_elasticity=0.5 \
  --variant B4spec:calibration.stops_model=spec \
  --variant C2:calibration.night_term=prior_shrunk \
  --variant C2p:calibration.night_term=prior_shrunk,calibration.night_prior_log_per_share=-0.1,calibration.night_shrink_lambda=5 \
  --variant C3:prediction.environment_term=declared \
  --variant R:$R \
  --variant RB4:$R,calibration.stops_model=personal \
  --variant RC2:$R,calibration.night_term=prior_shrunk \
  --variant RB4C2:$R,calibration.stops_model=personal,calibration.night_term=prior_shrunk
# forme du plan contre les passages réels, du registre enrichi (quelques secondes, sans archive)
PYTHONPATH=src python -m tools.score_plan $M --out /tmp/p2/score_plan.md
# cas de référence (la spec de Nice porte départ, position et fuseau : le terme de nuit s'y applique)
NICE_GPX=_seed/cas_validation/Val/courses/nice-100m-2026.gpx
for v in RB4:calibration.stops_model=personal RC2:calibration.night_term=prior_shrunk \
         RB4C2:calibration.stops_model=personal,calibration.night_term=prior_shrunk; do
  name=${v%%:*}; extra=${v#*:}
  TWIN_CONFIG_PATH=examples/twin.config.reference.json twin-engine preview \
    --training _seed/cas_validation/Val/archives --course "$NICE_GPX" --race examples/nice-100m.json \
    $(for kv in ${extra//,/ }; do printf -- '--set %s ' "$kv"; done) > local-data/nice-$name.json
done
```

**Second passage de la Phase 2 (garde des vrais ultras rétablie ; DIAGNOSTIC §10.5, §10.7)** :
seuls les leviers d'arrêts sont relancés, le scoreur teste l'amplitude du fade en secondes.

```bash
R="calibration.link=log,calibration.duration_term=prior_shrunk,prediction.interval_source=studentized_scale"
M="_seed/manifest-val.json _seed/manifest-crasse.json _seed/manifest-lolo.json _seed/manifest-rapace.json"
PYTHONPATH=src python -m tools.banc $M --out /tmp/p2b --no-diag \
  --variant B4:calibration.stops_model=personal \
  --variant B4e:calibration.stops_model=personal,calibration.stops_duration_elasticity=0.5 \
  --variant B4spec:calibration.stops_model=spec \
  --variant RB4:$R,calibration.stops_model=personal
for v in "" "--set pacing.fade_delta=0.15" "--set pacing.fade_delta=0.20" \
         "--set pacing.fade_source=splits --set pacing.fade_delta_max=0.30" \
         "--set pacing.fade_source=splits --set pacing.fade_delta_max=0.50"; do
  PYTHONPATH=src python -m tools.score_plan $M $v --out "/tmp/p2b/score_plan${v//[^0-9a-z]/}.md"
done
NICE_GPX=_seed/cas_validation/Val/courses/nice-100m-2026.gpx
TWIN_CONFIG_PATH=examples/twin.config.reference.json twin-engine preview \
  --training _seed/cas_validation/Val/archives --course "$NICE_GPX" --race examples/nice-100m.json \
  --set calibration.stops_model=personal > local-data/nice-RB4b.json
git add ../../docs/twin-registre-couverture.json && git commit -m "Phase 2 : registre du second passage" && git push
```

**Banc de la Phase 3 (information manquante sur la pente : B1 efficacité-durée, B2 queue de la
courbe record, P niveau de l'époque, F plancher dépendant de la durée ; DIAGNOSTIC §10.10–10.13),
une relance pour toutes les variantes** — le banc de base enrichit le registre des deux
exposants mesurés (à committer ensuite) ; `E1`/`E2`/`F` sur les défauts, le reste sur la pile de
référence ; quatre recaptures de Nice :

```bash
R="calibration.link=log,calibration.duration_term=prior_shrunk,prediction.interval_source=studentized_scale"
F="calibration.genuine_floor=riegel,calibration.genuine_max_stop_s=3600"
M="_seed/manifest-val.json _seed/manifest-crasse.json _seed/manifest-lolo.json _seed/manifest-rapace.json"
PYTHONPATH=src python -m tools.banc $M --out /tmp/p3 --no-diag \
  --variant E1:calibration.envelope_tail=efficiency \
  --variant E2:calibration.envelope_tail=record_tail \
  --variant F:$F \
  --variant RB1:$R,calibration.duration_prior_source=efficiency,calibration.envelope_tail=efficiency \
  --variant RB2:$R,calibration.duration_prior_source=record_tail,calibration.envelope_tail=record_tail \
  --variant RP:$R,calibration.level_anchor=vc_epoch \
  --variant RPh:$R,calibration.level_anchor=vc_epoch,calibration.level_anchor_gain=0.5 \
  --variant RF:$R,$F \
  --variant RB1P:$R,calibration.duration_prior_source=efficiency,calibration.envelope_tail=efficiency,calibration.level_anchor=vc_epoch
NICE_GPX=_seed/cas_validation/Val/courses/nice-100m-2026.gpx
for v in RB1:calibration.duration_prior_source=efficiency,calibration.envelope_tail=efficiency \
         RB2:calibration.duration_prior_source=record_tail,calibration.envelope_tail=record_tail \
         RP:calibration.level_anchor=vc_epoch RF:$F; do
  name=${v%%:*}; extra=${v#*:}
  TWIN_CONFIG_PATH=examples/twin.config.reference.json twin-engine preview \
    --training _seed/cas_validation/Val/archives --course "$NICE_GPX" --race examples/nice-100m.json \
    $(for kv in ${extra//,/ }; do printf -- '--set %s ' "$kv"; done) > local-data/nice-$name.json
done
git add ../../docs/twin-registre-couverture.json && git commit -m "Phase 3 : registre enrichi par le banc de base" && git push
```

Le JSON de chaque preview porte `twin.alpha_eff`, `twin.alpha_tail`, `calibration.duration_prior`
(origine), `calibration.envelope_tail`, `calibration.level_anchor` (décalages par ultra) et, sous
`genuine_floor=riegel`, une liste `calibration.genuine` éventuellement plus longue ; le `compare.md`
du banc dit où `n_genuine` a bougé.

**Banc de la Phase 5 (coût de pente personnel ; DIAGNOSTIC §10.15), une relance** — `C1` sur
défauts, `RC1` sur la pile de référence à cinq clés ; le scoreur de plan rejoue la forme sous le
coût personnel depuis le registre ; recapture de Nice :

```bash
R5="calibration.link=log,calibration.duration_term=prior_shrunk,prediction.interval_source=studentized_scale,calibration.duration_prior_source=efficiency,calibration.envelope_tail=efficiency"
M="_seed/manifest-val.json _seed/manifest-crasse.json _seed/manifest-lolo.json _seed/manifest-rapace.json"
PYTHONPATH=src python -m tools.banc $M --out /tmp/p5 --no-diag \
  --variant C1:calibration.slope_cost=personal \
  --variant RC1:$R5,calibration.slope_cost=personal
PYTHONPATH=src python -m tools.score_plan $M --out /tmp/p5/score_plan.md
PYTHONPATH=src python -m tools.score_plan $M --set calibration.slope_cost=personal --out /tmp/p5/score_plan_C1.md
NICE_GPX=_seed/cas_validation/Val/courses/nice-100m-2026.gpx
TWIN_CONFIG_PATH=examples/twin.config.reference.json twin-engine preview \
  --training _seed/cas_validation/Val/archives --course "$NICE_GPX" --race examples/nice-100m.json \
  --set calibration.slope_cost=personal > local-data/nice-RC1.json
git add ../../docs/twin-registre-couverture.json && git commit -m "Phase 5 : registre enrichi par le banc de base" && git push
```

`registre-<nom>.json` de chaque variante porte, par coupure, `model.stops_rate_personal`,
`stops_ref_hours`, `night_share_mean`, `night_coef`, `fade_delta_splits`, `durability_pct`, et
`prediction.moving_h`, `stops_h`, `night_share_target`, `night_dev`, `env_factor` ; le JSON de
Nice porte `calibration.stops`, `calibration.night`, `prediction.moving_hours`, `stops_hours`,
`night_share_target`, `env_detail`. Un rapport `full` sous `stops_model=personal` dit que les
arrêts sont ceux de l'athlète et lit `plan.fade_source_used`.

**Banc de la Décision 2 (garde du domaine sur la demande du parcours ; DIAGNOSTIC §10.17), une
relance** — le défaut `demand` rejoue le registre ; `ENV` lit l'enveloppe servie à 10 h au lieu
de la médiane des vrais ultras, `PRED` l'ancienne lecture (temps prédit). Les deux comptes de la
ligne « garde du domaine (sur l'oracle) » de `tableau.md` doivent valoir 0 sous le défaut :

```bash
M="_seed/manifest-val.json _seed/manifest-crasse.json _seed/manifest-lolo.json _seed/manifest-rapace.json"
PYTHONPATH=src python -m tools.banc $M --out /tmp/d2 --no-diag \
  --variant ENV:sufficiency.domain_speed=envelope \
  --variant PRED:sufficiency.domain_gate=predicted
grep -h "garde du domaine" /tmp/d2/tableau.md /tmp/d2/tableau-ENV.md /tmp/d2/tableau-PRED.md
PYTHONPATH=src python -m tools.registre --compare ../../docs/archive/twin-v2/registre-avant.json > /tmp/d2/compare-D2.md
git add ../../docs/twin-registre-couverture.json && git commit -m "Décision 2 : registre rejoué sous la garde du domaine sur la demande" && git push
```

Chaque entrée du registre porte `domain_demand` (durée attendue, vitesse de référence et son
origine — `ultras`, `plancher` ou `enveloppe` —, seuil, `below`) à côté de l'oracle
`below_domain` (temps réel sous 10 h) ; le JSON d'un `preview` porte `sufficiency.domain`.

## 9. Déploiement (rappel)

L'infra est **du code** (`infra/`). Le service `twin-engine` est déjà décrit dans `infra/compose.yml`
(interne, volume `twin_engine_data`, route Caddy publique en *draft* désactivée). L'image se
construit et se pousse sur GHCR **automatiquement** via `.github/workflows/deploy-vps.yml` à chaque
push sur `main` touchant `services/twin-engine/**`. Voir `docs/runbook-vps.md` pour l'exploitation.
