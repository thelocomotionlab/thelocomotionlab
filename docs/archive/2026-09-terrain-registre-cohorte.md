# Chantier « Terrain, registre, cohorte » — Locomotion Twin

Valentin a couru Nice Côte d'Azur by UTMB 100M le 25/09/2026 en **35 h 05** (plan central 33 h 38). Après le km 100, il n'a plus pu courir une grande partie des descentes à cause de la caillasse. Son fichier de montre le confirme, et le moteur ne sait pas l'exprimer : la technicité n'y est qu'un pourcentage déclaré, uniforme du départ à l'arrivée.

Ce chantier refait le registre, passe la conservation des archives de la cohorte à six mois, et intègre le terrain au moteur. On est en recherche et développement : on tente beaucoup, on mesure tout, et c'est le registre qui dit ce qui marche.

**Pièces** : `services/twin-engine/tools/analyses/nice_2026_descentes.py` (analyse de référence : ses constantes sont les définitions, ses huit sorties les valeurs cibles) et le fichier de course de Val dans `local-data/` (GPX COROS à la seconde, hors git).

**À lire** : `CLAUDE.md` ; `DIAGNOSTIC.md` §10.15 ; `docs/twin-registre-couverture.md` ; `twin_engine/registre.py`, `tools/{backtest,registre,passages}.py` ; `tableau_de_bord/{registre,ingestion,jumeau,objets,magasin}.py` ; `course/{profile,spec}.py`, `twin/record.py`, `calibration.py`, `pacing/{plan,sun}.py` ; `twin.config.json` ; `apps/site/app/services/twin/cohorte/page.jsx` ; `services/twin-depot`.

---

## Comment on travaille

Ce fichier vit dans `docs/chantiers/2026-09-terrain-registre-cohorte.md` ; tiens à jour à côté `…-compte-rendu.md`. Une nouvelle session reprend là où le compte-rendu s'arrête.

**Un seul plan, un seul accord, puis tu enchaînes.** Tu me présentes un plan court de l'ensemble ; après mon accord, tu déroules l'ordre de travail ci-dessous sans attendre de validation entre les étapes, un commit par étape, le compte-rendu à jour au fil de l'eau. Tu ne t'arrêtes que dans trois cas :
1. un blocage que tu ne peux pas lever seul (accès réseau, fichier absent) — tu avances sur ce qui n'en dépend pas ;
2. un résultat qui contredit le principe d'une étape (le détecteur ne trouve rien, aucune étiquette ne porte de signal) — tu rapportes les chiffres et proposes la suite ;
3. avant de rendre public quoi que ce soit : le texte de la page cohorte attend ma décision.

**Règles**
- **Aucun barème inventé.** Une étiquette OpenStreetMap, une rugosité, une classe d'occupation du sol sont des variables d'entrée, jamais des scores. Leur coût s'estime sur des données, jamais à la main. Sans signal, tu le dis.
- **Tout se trace.** Chaque nouveauté vit derrière un drapeau de `twin.config.json`. La configuration de référence de Val peut porter tous les drapeaux expérimentaux utiles ; chaque entrée du registre garde la configuration qui l'a produite. Les **défauts** — ceux des plans de la cohorte — ne basculent que sur preuve au registre.
- **Le squelette du rapport ne bouge pas.**
- **Le total et la répartition sont deux questions.** Servi dans la calibration, le coût de pente personnel a dégradé la prédiction d'arrivée de Val au banc (LOO 6,4 → 7,8 %). Le terrain change la répartition ; il ne change le total que de façon symétrique (ultras passés et cible traités pareil) ou par différence.
- **Ce qui est ajusté sur Nice se juge ailleurs**, Nice rapportée à part.
- `pytest` vert à chaque commit, entrées au carnet (§10 suivant), `docs/manuel-twin.md` à jour. Archives, fichiers de course et caches hors de git.

---

## Ce qu'on sait — sorties du script

1. Arrêts 4 h 13, mouvement 30 h 51, contre 1 h 15 et 32 h 22 au plan : Val a bougé **4,7 % plus vite que prévu**.
2. Mouvement réel / plan : 0,70 à 0,78 sur les grandes montées ; 1,31 sur la descente d'Isola, 1,39 sur celle de Tourrette-Levens.
3. Descente marchée : **7 % avant le km 100, 35 % après**.
4. Descente « hachée » : 20 % des fenêtres avant le km 100 (0 h 56), **69 % après (3 h 07)**. Bascules course ↔ marche : 0,43 puis 1,22 par minute. FC après le km 100 : 147 en descente courable, 133 en hachée.
5. À pente égale, après le km 100 : descente courable 10 à 25 % plus lente qu'avant, hachée 30 à 35 %.
6. Descentes après le km 100 : 67 min perdues = **36 de fatigue + 31 de terrain**.
7. Surcoût du terrain haché : **8 % frais, 18 % fatigué**.
8. Forme du plan, mouvement réel imposé (erreur moyenne / pire segment / pire cumul, minutes) : Minetti 19 / 48 / 51 ; κ mesurés avant la course 9 / 26 / 26 ; κ avec descente sans borne 7 / 16 / 19.

---

## Ordre de travail

**1. Le fichier de course.** Le décodeur lit ce GPX COROS (`gpxdata:hr`, `cadence`, `distance`) et répare ses trois accidents d'horloge (horodatage isolé aberrant, recul d'horloge, les deux enchaînés) avec `reparer_horloge` du script, un test synthétique par accident, départ et arrivée conservés. Le script tourne sur l'activité décodée par le moteur ; ses huit sorties sont épinglées dans un test actif si `TWIN_NICE2026_GPX` est défini.

**2. Le registre, refait de fond en comble.** Aujourd'hui il mélange ce qu'on rejoue et ce qu'on a promis, écrit `dev_set: false` en dur pour toute entrée du tableau de bord, et ne juge que l'heure d'arrivée.
- *Un schéma, deux livres.* Le **banc**, rétrospectif, se régénère à volonté : chaque passage est un run horodaté, marqué du commit, de l'empreinte de configuration et des drapeaux hors défaut, sans jamais écraser le précédent. Le **servi**, prospectif, est immuable une fois le résultat saisi.
- *Statut des athlètes.* `dev` ou `frais`, porté par l'athlète avec sa date de bascule. Val, Crasse, Lolo, Rapace : `dev`. Un bouton « Marquer comme cas de développement », journalisé. Une décision ne compte que les athlètes frais à sa date, et les nomme.
- *La forme du plan jugée.* Toute entrée avec des temps de passage réels reçoit les mesures de la sortie 8, mouvement réel imposé puis total prédit, plus arrêts et mouvement réels contre ceux du plan.
- *Lectures.* `tools/registre` et l'écran Registre séparent toujours livre × statut × niveau ; `--compare` oppose deux runs.
- *Migration.* L'ancien JSON part dans `docs/archive/`. Deux runs de départ sur les quatre manifestes : défauts actuels et configuration de référence. Nice 2026 entre au servi (`dev`, avec ses passages), comparée au plan du 20/09 sauf indication contraire de ma part. Protocole réécrit dans `docs/twin-registre-couverture.md`, avec une section « R&D ».

**3. La cohorte : six mois de conservation.** Les données déposées sont conservées six mois pour le développement du Twin, puis purgées. Aujourd'hui la page promet l'inverse et `ingestion.py` supprime l'archive.
- L'athlète porte `consentement_version`, `consentement_le`, `conservation_jusquau`. Durée en configuration (`cohorte.conservation_jours`, 183 par défaut), avec une option désactivée par défaut pour prolonger jusqu'à un mois après la course visée.
- Archive conservée chiffrée au repos, en un seul endroit, jamais lisible sans la clé.
- Purge quotidienne : archive, activités, traces, jumeau, calibration, plans et page disparaissent ; les entrées du registre deviennent anonymes (identifiant opaque, aucun champ assimilable à une trace) ; journal de purge en agrégats. Le tableau de bord affiche l'échéance de chaque athlète et alerte quand sa course tombe après.
- Le jumeau porte le commit et l'empreinte de configuration qui l'ont produit ; le tableau de bord marque les athlètes périmés et propose « ré-ingérer les périmés », un à la fois, tant que l'archive est conservée.
- Banc depuis le tableau de bord : l'écran Athlète liste les vrais ultras détectés (date, durée, distance, D+), on saisit le temps officiel, « Rejouer au banc » fabrique le manifeste (la trace de l'activité sert de parcours) et lance le walk-forward sur l'archive conservée.
- Le nouveau texte de la page cohorte et sa case de consentement (qui mentionne la fréquence cardiaque) sont écrits, testés, **mais pas publiés** tant que je n'ai pas validé.

**4. Le détecteur de descente hachée.** Au décodage, pour toute activité avec cadence, un résumé sur le modèle de `slope_bins`, sans tableau à la seconde conservé : par classe de pente × courable / haché × dénivelé négatif déjà descendu — secondes, distance, part marchée, bascules, FC. Définitions du script en constantes `twin.terrain_*`. Dans le jumeau, deux traits rétrécis, `None` sous un minimum d'heures : **fatigue en descente** et **sensibilité au terrain** (1 − v(haché) / v(courable) à pente égale, fraîche et fatiguée). Unité de cadence vérifiée par source (par pied dans ce GPX). Valeurs de Val sur son archive consignées face à Nice. Limite à écrire : une douleur aux quadriceps produit aussi des arrêts courts.

**5. La carte de technicité, en open source.** Par tranche de 50 m de toute trace (grille de `CourseProfile`) : OpenStreetMap (extrait Geofabrik sous ODbL, pyosmium ou osmnx ; recalage au chemin le plus proche dans 15 m avec continuité de cap, GraphHopper ou Valhalla seulement si besoin ; `highway` dont `steps`, `sac_scale`, `mtb:scale`, `surface`, `smoothness`, `trail_visibility`, `tracktype`, distance de recalage) ; rugosité du relief (RGE ALTI 1 m de l'IGN en France, Copernicus GLO-30 ailleurs) ; occupation du sol facultative (ESA WorldCover). Caches hors git, attributions conservées, couverture mesurée par course. Appliquée à Nice, au fichier de Val, à tous les ultras de calibration de chaque athlète et à leurs activités avec cadence. Au carnet : la seconde moitié de Nice est-elle plus technique que la première ? Les treize tronçons hachés coïncident-ils avec des sections étiquetées ou rugueuses ? Puis un modèle simple et régularisé variables → technicité, ajusté sur les fenêtres étiquetées par le détecteur, validé activité par activité.

**6. Le modèle de descente, et le terrain dans la calibration.** Chaque terme derrière son drapeau :
- courbe de descente personnelle qui sait dire « aucune remise » (`calibration.slope_kappa_down_min`, essai à 0, ou courbe par tranche rétrécie vers Minetti) ; `calibration.slope_cost=personal_pacing` pour répartir sans toucher la calibration ;
- fatigue en descente, `pacing.descent_fatigue ∈ {none, dminus}`, paramètre issu du détecteur ;
- surcoût de terrain, `pacing.terrain ∈ {none, declared, map}`, technicité du tronçon × sensibilité de l'athlète, amplifiée par le dénivelé négatif cumulé, descentes seulement sauf preuve contraire ;
- terrain dans la calibration, `calibration.terrain_adjust ∈ {off, deq}` : la distance équivalente de chaque ultra passé intègre le coût de terrain comme elle intègre la pente, la cible pareil — si une part des écarts de validation croisée vient du sol, σ et les bandes doivent baisser ;
- en alternative, `prediction.terrain_total ∈ {off, differential}`.

**7. Runs, décision, exposition.** Runs du banc sous les combinaisons utiles, comparés par `--compare` : forme du plan sur toutes les courses avec temps de passage, total sur le banc habituel, toujours par statut et par niveau. Un défaut bascule si le plan s'améliore au-delà de Nice sans dégrader le total sur les cas frais ; sinon le drapeau reste dans la configuration de référence. Sur l'écran Plan : une consigne « Sur ce segment » calculée par le terrain (« descente technique : environ N min prévues à la marche ») et un choix de profil de configuration (défaut, référence, expérimental) que le registre retient. Attribution ODbL sur toute donnée OpenStreetMap imprimée.

---

**Hors périmètre** : le modèle des arrêts (chantier suivant ; ses mesures entrent au registre dès l'étape 2), l'affichage de la carte dans l'éditeur de course, les pages du rapport.

**Décisions en attente — elles ne bloquent rien** : la durée exacte de conservation et ce qui survit à la purge (défauts ci-dessus en attendant), le texte public de la page cohorte (relecture juridique à prévoir), le plan réellement porté le 25/09.
