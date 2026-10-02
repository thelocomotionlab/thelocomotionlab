# Chantier « Terrain, registre, cohorte » — compte-rendu

> Suit le chantier décrit dans `2026-09-terrain-registre-cohorte.md` (même dossier) : ce qui a
> été fait, dans quel ordre, ce qui reste à mesurer chez Valentin, les écarts au prompt décidés
> en session et les questions ouvertes. Il n'édicte aucune règle ; les preuves chiffrées vont au
> carnet (`services/twin-engine/DIAGNOSTIC.md` §10), l'usage au manuel (`docs/manuel-twin.md`).
> Destiné à `docs/archive/` à la clôture.

## Ordre de travail retenu (session du 2026-10-01)

Valentin a demandé de tout faire, dans l'ordre jugé le plus judicieux, sans réécrire le prompt.
Les archives des quatre athlètes et le fichier de course de Nice restent sur sa machine : ici, le
code et ses tests sur du synthétique ; chez lui, les mesures. D'où un ordre qui regroupe tout ce
qui demande un décodage d'archive avant de lui demander un run, pour qu'un seul passage par
archive mesure tout :

1. Décodage : cadence, distance et horloge des fichiers de course (étape 1).
2. Registre refait (étape 2), pour que les runs suivants soient horodatés, marqués et comparables.
3. Mesures par segment aux passages : mouvement, arrêts, minutes marchées.
4. Leviers de répartition qui ne dépendent ni du détecteur ni de la carte : loi de pente
   personnelle servie à la seule répartition, descente sans remise, fatigue de descente.
5. Détecteur de descente hachée et traits personnels (étape 4).
6. **Run 1 chez Valentin** : un décodage par archive pour tout ce qui précède.
7. Cohorte : conservation, purge, consentement (étape 3) — indépendante de la R&D.
8. Carte de technicité (étape 5).
9. Terrain dans le plan et la calibration (étape 6), « demande contre vécu ».
10. **Run 2**, décision au registre, écran Plan (étape 7).

## Écarts au prompt décidés en session

- **Sorties 6 et 7 du script.** Une fenêtre y est « hachée » parce que l'athlète y marche : le
  « terrain » de ces sorties est défini par le comportement, et une douleur aux quadriceps donne
  les mêmes chiffres. Les huit sorties sont épinglées comme valeurs de référence du décodage,
  pas comme cibles du modèle.
- **Le trait « 1 − v(haché) / v(courable) »** mesure une pénalité de marche ; il garde ce nom.
  La sensibilité au terrain se mesure contre une variable de carte, indépendante de l'athlète.
- **Modèle à deux allures** (marche, course) pour la répartition : la probabilité de marcher
  dépend de la pente, du dénivelé négatif déjà descendu, de la nuit et du terrain ; la consigne
  « N min prévues à la marche » en découle et devient une colonne du registre.
- **Seuil de cadence personnel** (mélange à deux composantes sur la cadence en mouvement) à côté
  du seuil fixe du script, qui reste la définition par défaut.
- **Carte** : en plus d'OpenStreetMap, relief, occupation du sol, géologie et géométrie de la
  trace ; l'absence d'étiquette est une modalité ; validation par région entière.
- **Prior du terrain de la régression** (β2) : à revoir quand le terrain entre dans la distance
  équivalente des ultras, sinon il est compté deux fois.
- **Même définition de pente** des deux côtés d'une loi apprise sur les activités et appliquée
  au parcours.
- **« Demande contre vécu »** : kilomètres de descente technique de la course cible, rangés par
  dénivelé négatif déjà descendu, face à ceux des six derniers mois de l'athlète.
- **Modèle des arrêts** : toujours hors périmètre, comme au prompt ; ses mesures entrent au
  registre. À Nice, l'écart d'arrivée vient des arrêts (4 h 13 contre 1 h 15 au plan).

## État au départ (2026-10-01)

- Branche `claude/awesome-fermi-6jfjl2`, partie de `main` (ac2128f).
- `pytest services/twin-engine` : 678 passés, 40 sautés.
- Registre committé : 35 entrées, 4 athlètes ; Lolo et Rapace portent les 13 cas frais
  (`dev_set: false`) ; Nice 100M 2026 préparée, sans temps officiel ni passages.
- Le schéma canonique n'a pas de canal cadence ; le décodeur GPX recalcule la distance par
  haversine et ignore `gpxdata:distance`.
- Mesures faites en session sur la trace du site (`apps/site/public/tracks/nice-100m-2026.gpx`),
  recalée sur OpenStreetMap (≤ 15 m, cap cohérent ; km 90–100 non téléchargés) :

  | Descentes ≤ −8 % | avant km 100 | après km 100 |
  |---|---|---|
  | longueur (trace, lissage 150 m) | 30,2 km, pente moyenne −18,9 % | 23,1 km, −15,3 % |
  | dont plus raide que −25 % | 6,6 km | 1,5 km |
  | altitude moyenne | 1 503 m | 681 m |
  | recalées sur une voie OSM | 90 % | 100 % |
  | `smoothness` renseigné | 0 % | 0 % |
  | `surface` renseigné | 1 % | 21 % (surtout `dirt`) |
  | `sac_scale` renseigné | 47 %, dont 11 % en T3 | 47 %, aucun T3 |
  | `mtb:scale` renseigné | 11 % | 84 % (S2 48 %, S3 8 %) |

  Corrélation altitude ~ kilomètre sur les descentes : −0,72. Virages de plus de 60° par km de
  descente : 2,3 avant, 2,6 après.

## Questions ouvertes

- **Carnet de route de Nice.** Le script de référence (167,2 km, Villefranche-sur-Mer,
  « Collefongue ») et `examples/nice-100m.json` (169,7 km, Plateau St-Michel, « Collelongue »,
  depuis le 2026-09-17) ne décrivent pas les mêmes points de passage. Les sorties 2 et 8
  dépendent de celui qui fait foi ; le plan réellement porté le 25/09 reste à fixer.
- Durée exacte de conservation et ce qui survit à la purge (défauts du prompt en attendant).
- **Les treize tronçons hachés** de l'ébauche ne sont définis nulle part dans le dépôt ;
  `tools/carte activite` en compte selon la définition ci-dessous (« Choix faits ») : si le
  compte diffère, dis-moi d'où venait treize.
- Le RGE ALTI 1 m, l'API IGN, le BRGM, Geofabrik et Overpass ne se joignent pas depuis la
  session : la lecture du RGE ALTI n'est testée que sur des dalles fabriquées, la géologie
  sur une couche fabriquée.
- Texte public de la page cohorte (relecture juridique), et lecture de la clause 4.6 de l'ODbL
  pour les chiffres tirés d'OSM remis à un athlète. Le brouillon « 2026-10 » se relit dans le
  tableau de bord (`/services/twin/tableau-de-bord/cohorte`) ; le publier, c'est passer
  `VERSION_EN_LIGNE` à « 2026-10 » dans `apps/site/lib/twinCohorte.mjs` et remplacer le
  paragraphe et le texte de partage de `app/services/twin/cohorte/page.jsx` par ceux de la
  version, puis activer la purge (`cohorte.purge = active`).
- **Mise en service de la conservation** (opérations sur le VPS, à ton feu vert) : poser
  `TWIN_DEPOT_ARCHIVE_KEY` (`openssl rand -hex 32`, et une copie hors du VPS) avant de
  déployer le dépôt — sans elle il refuse les dépôts ; au premier démarrage avec la clé, les
  archives présentes sont chiffrées sur place. La purge reste en simulation jusqu'à ce que tu
  passes `cohorte.purge` à `active` : regarde d'abord ce qu'elle effacerait.
- `services/twin-depot/scripts/rapatrier-depots.py` crée une copie en clair hors du dépôt et
  purge le VPS : il contredit « un seul endroit ». Le supprimer est une suppression de
  fichier : à ton accord.
- L'export du registre porte le pseudo des athlètes vivants (le prénom par défaut) ; importé
  dans le registre committé, il entre dans l'historique git, que la purge ne peut pas
  anonymiser après coup. À décider : exporter sous identifiant opaque, ou poser un pseudo
  choisi avant tout import.

## Journal

- 2026-10-01 — chantier posé : prompt, compte-rendu, script de référence
  `services/twin-engine/tools/analyses/nice_2026_descentes.py` (tel que reçu).
- 2026-10-01 — **étape 1** (DIAGNOSTIC §10.25) : cadence dans le schéma canonique et les quatre
  adaptateurs, unité lue sur les données (vérifiée par pied sur les exports réels Garmin, Strava,
  Polar) ; distance de la montre d'un GPX gardée à part (`twin.gpx_distance`, défaut inchangé) ;
  horloge réparée pour tous les formats, réparations comptées par activité ; trous
  d'enregistrement portés sur la grille ; script de référence branché sur le décodeur, huit
  sorties épinglées (test actif avec `TWIN_NICE2026_GPX`). Suite : 698 passés, 43 sautés.
  **Chez Valentin** : le test épinglé de Nice.

- 2026-10-01 — **étape 2** (DIAGNOSTIC §10.26) : registre refait sous `docs/twin-registre/` —
  livre banc (un run par passage, commit, empreinte, drapeaux hors défaut), livre servi figé au
  résultat du labo (correction motivée), statuts dev/frais datés et journalisés, quarantaines et
  passages communs aux runs ; ancien fichier archivé et rangé comme run historique ; écrans
  Athlète (bouton) et Registre (statut × niveau). Aucun athlète frais aujourd'hui.

- 2026-10-01 — **mesures par tronçon** (DIAGNOSTIC §10.27) : définitions de l'analyse de
  référence en configuration (`twin.terrain_*`) et dans le moteur ; passages enrichis du
  mouvement, des arrêts et des minutes marchées de chaque tronçon ; bloc `forme` (mouvement
  réel imposé, total prédit) sur les entrées du banc et du livre servi ; entrée servie
  fabriquée depuis le dossier d'une version (`tools/registre --servir`) ; course lue dans le
  fichier de la montre quand l'archive ne la contient pas. Suite : 711 passés, 43 sautés.
  **Chez Valentin** : déposer le fichier de montre de Nice sous
  `_seed/cas_validation/Val/courses/nice-100m-2026-montre.gpx` (chemin du manifeste, temps
  officiel 35:05:00 à corriger à la seconde si besoin), puis le run 1.
- 2026-10-01 — **loi de pente servie à la répartition** (DIAGNOSTIC §10.28) :
  `calibration.slope_cost=personal_pacing` (le total reste sous Minetti),
  `slope_kappa_down_min` (descente sans remise), `slope_curve=bins` (facteur par tranche
  rétréci vers la loi) ; le registre garde la mesure entière, le scoreur rejoue toute loi
  sans archive. Écart de définition de pente activités ↔ parcours mesuré : du second ordre.
  La fatigue de descente attend le détecteur, dont elle tire son paramètre.
- 2026-10-01 — **étape 4, détecteur** (DIAGNOSTIC §10.29) : résumé de descentes au décodage
  (fenêtres du script, identiques au test), traits du jumeau (vitesses fraîches / fatiguées,
  pénalité de marche, fatigue de descente absolue et relative, seuil de cadence personnel,
  probabilité de marcher en descente), levier `pacing.descent_fatigue=dminus`, outil
  `tools/terrain` (archive face à un fichier de course). **Chez Valentin** : les traits de son
  archive à la veille de Nice face au fichier de course, au carnet.
- 2026-10-01 — **run 1 préparé** : `--tableau` et `--compare` lisent la forme du plan (par
  groupe, et entre deux runs) ; Nice 100M 2026 mise à part (`docs/twin-registre/a_part.json`),
  hors de tous les agrégats, rapportée sur sa ligne ; manifeste de Val complété (temps officiel,
  fichier de la montre). Recette du run 1 : `docs/manuel-twin.md`, « Run 1 du chantier
  terrain ».
- 2026-10-01 — **étape 3, cohorte** (DIAGNOSTIC §10.30) : archives chiffrées au repos sur le
  dépôt, version du consentement gardée ; consentement, échéance et provenance du jumeau sur
  l'athlète ; purge quotidienne (en simulation par défaut) qui efface l'athlète échu et rend
  ses entrées du registre anonymes ; jumeaux périmés ré-ingérés un à la fois ; « Rejouer au
  banc » depuis l'écran Athlète ; brouillon de la page cohorte et de sa case (texte
  « 2026-10 ») en aperçu dans le tableau de bord, **pas publié**.
- 2026-10-01 — **étape 5, carte de technicité** (DIAGNOSTIC §10.31) : paquet `twin_engine.carte`
  (tranches de 50 m, géométrie, OSM recalé avec continuité de cap, rugosité Copernicus ou RGE
  ALTI, WorldCover, géologie GeoJSON, couverture, attributions, cache hors git), fenêtres du
  détecteur exposées une à une, modèle logistique régularisé P(hachée) = contrôles + carte,
  validé hors échantillon par activités et par régions, `tools/carte` (parcours, activité,
  modèle). Nice, trace du site : aucune variable renseignée sur les deux moitiés ne rend la
  seconde plus technique (SAC plus facile, relief moins rugueux, descentes moins raides) ;
  seule `mtb:scale`, renseignée presque uniquement après le km 100, y décrit 65 % de S2–S3.
  Suite : 766 passés, 43 sautés. **Chez Valentin** : les tronçons hachés du fichier de la
  montre, le modèle sur son archive et son application à Nice.
- 2026-10-01 — **étape 6, terrain dans le plan et la calibration** (DIAGNOSTIC §10.32) :
  `pacing.terrain` (`declared` reporte la technicité déclarée sur les descentes, `map` sert le
  surcoût de la carte), `prediction.terrain_total=differential`, `calibration.terrain_adjust=deq`
  (avec `terrain_dplus_prior_scale` pour le prior de β2) ; rien n'est servi d'un modèle sans
  signal. Marche prévue en descente par segment (modèle à deux allures) face à la marche
  mesurée dans le bloc `forme` ; passages enrichis du temps et de la marche en descente ;
  demande contre vécu ; `tools/carte terrain` et `banc`, `tools/banc --terrain`. **Chez
  Valentin** : le run 2 (manuel, « Terrain dans le plan et la calibration »).
- 2026-10-01 — **étape 7, exposition** (DIAGNOSTIC §10.33) : profils de configuration
  (défaut, référence vide, expérimental) choisis sur l'écran Plan et en ligne de commande,
  gardés par chaque version et retenus au livre servi (colonne « Profil » du Registre) ;
  consigne « Sur ce segment » de marche prévue en descente (expérimental seulement) ;
  attribution des sources d'une carte (ODbL) sur la feuille, l'annexe, la page de l'athlète
  quand une carte a servi. **Décision** : après le run 2 et les courses servies.

- 2026-10-01 — **en préparant la phase de test** : sous un fichier de configuration partiel
  (`TWIN_CONFIG_PATH`), les profils référence et expérimental se vidaient sans rien dire ; après
  un banc à variantes, « le dernier run » lu par `score_plan`, `terrain` et `registre` pouvait
  être une variante ; une trace hors des extraits OSM donnés recevait la carte comme si toutes
  ses étiquettes étaient « absentes ». Les trois sont corrigés ; `tools/carte modele` et `banc`
  disent la couverture OSM des sorties d'entraînement, et l'ordre des `--osm` ne change plus
  le cache des cartes. Suite : 788 passés, 43 sautés.
- 2026-10-01 — **chez Valentin, la suite avec XeLaTeX** : huit tests des routes du plan
  échouaient depuis le départ de Nice (25/09, 13 h) — leur plan reprenait le carnet de route
  tel quel, et un départ passé fige le plan. Leur course part désormais un mois après le jour
  du test. Suite avec XeLaTeX : 826 passés, 5 sautés (les fichiers réels de Nice).

- 2026-10-02 — **Nice contre LiveTrail** (DIAGNOSTIC §10.34) : le plan du 20/09 venait de
  l'ancien carnet de route (167,2 km) ; hors ravito, le jumeau tient à moins de 1 %, l'écart à
  l'arrivée vient des arrêts au ravito (subis) ; la répartition sous Minetti met 1 h 40 de trop
  dans les montées et 2 h 01 de moins dans les descentes, la loi personnelle mesurée avant la
  course en corrige les deux tiers. Mesure hors ravito au registre et au scoreur
  (`score_plan --variant`).

- 2026-10-02 — **lois de répartition, 30 courses** (DIAGNOSTIC §10.35) : la signature de Nice
  est générale (plan trop long en montée, trop court en descente sous Minetti) ; la loi par
  tranches l'efface (17 courses mieux, 6 moins bien, gain en montagne). **Décision 3** : elle
  entre dans le profil Référence ; l'expérimental perd la descente sans remise et la fatigue de
  descente. `score_plan --residus` pour la suite : l'écart restant par type de tronçon, tiers,
  nuit, dénivelé et durée, montées et descentes croisées avec le tiers, la nuit et le dénivelé.

- 2026-10-02 — **ce qui reste sous la loi par tranches** (DIAGNOSTIC §10.36) : le premier tronçon
  est prévu 9 min trop long (26 courses sur 30), le dernier 6 min (28 sur 31), les autres paient
  la différence. Levier derrière flags, éteint : `pacing.start_share` / `start_gain` (la première
  part de la distance plus vite), `pacing.finish_km` / `finish_gain` (les derniers km plus vite).
  Reconstitué du registre : 7,7 → 6,6 min par tronçon en validation croisée. Le scoreur pondère
  désormais l'écart par le temps (le % moyen gonflait les petits bouts d'arrivée) et lit ce qui
  reste sous une variante (`--residus LOI`).

## Run 1 chez Valentin (à lancer)

Une passe par archive mesure tout ce qui précède. La recette complète est au manuel
(« Run 1 du chantier terrain ») ; dans l'ordre :

1. déposer le fichier de montre de Nice sous
   `_seed/cas_validation/Val/courses/nice-100m-2026-montre.gpx` ;
2. le test épinglé de l'analyse de référence (`TWIN_NICE2026_GPX=… pytest -k nice_2026`) ;
3. `tools/banc` sur les quatre manifestes, base et sept variantes de répartition, comparé au
   registre migré ;
4. `tools/score_plan` sous chaque loi ;
5. `tools/terrain` (Val face à Nice) et `tools/registre --servir` (le dossier du plan du
   20/09) ;
6. la carte de technicité (manuel, « Carte de technicité ») : la trace de Nice, le fichier de
   la montre, le modèle de Val arrêté la veille, appliqué à Nice — il faut l'extra `carte` et
   les extraits Geofabrik des régions de son archive ;
7. committer `docs/twin-registre/` et me rapporter `/tmp/run1/` (markdown, et le modèle de la
   carte, qui ne contient aucune position).

Ce que j'en tirerai : l'effet du décodage seul sur le banc (horloges réparées, cadence), la
forme du plan sous chaque loi hors Nice, les traits de terrain des quatre archives, Val face à
Nice. La décision suit la règle du prompt : un défaut bascule si le plan s'améliore au-delà
de Nice sans dégrader le total sur les cas frais — or aucun athlète n'est frais aujourd'hui :
au mieux, un levier entre dans la configuration de référence de Val.

## Run 2 chez Valentin (après le run 1)

La carte et le terrain se mesurent ensuite, une passe de plus par archive (manuel,
« Carte de technicité » puis « Terrain dans le plan et la calibration ») :

1. installer l'extra `carte` et poser les extraits Geofabrik des régions des archives ;
2. `tools/carte` sur Nice : la trace, le fichier de la montre (les tronçons hachés), le modèle
   de Val arrêté la veille et son application à Nice ;
3. `tools/carte banc` sur les quatre manifestes : un terrain par course, chacun à sa coupure ;
   le tableau dit, course par course, si la carte a un signal hors échantillon ;
4. `tools/banc --terrain` sous les variantes de terrain (répartition, total, calibration,
   prior de β2 réduit), comparées au run de base ;
5. me rapporter les sorties markdown ; committer le registre.

La décision suit la règle du prompt. Sans signal de carte, les variantes de carte rendent le
run de base : la réponse est alors « la carte ne dit rien pour cet athlète », pas un échec.

## Choix faits à la place de Valentin

- Unité canonique de la cadence : pas par minute pour les deux pieds (le script disait 74 par
  pied, il dit désormais 148).
- La réparation d'horloge s'applique à tous les formats sans drapeau : elle ne touche que des
  fichiers dont le temps recule ou saute, que le rééchantillonnage rendait faux en silence.
- La distance de la montre d'un GPX reste derrière un drapeau (défaut : l'haversine, comme
  avant), parce qu'elle change les résultats de toute archive en GPX COROS.
- L'ancien registre est rangé comme run historique en plus d'être archivé, pour que
  `--compare` et les lectures fonctionnent avant les deux runs de départ.
- Dates des statuts : Val au 2026-07-03 (règle pré-enregistrée qui le nomme cas de
  référence), Crasse au 2026-07-15 (notes d'étiquetage), Lolo et Rapace au 2026-10-01.
- Une entrée servie se fige au résultat du **labo** (celui qui fait foi) ; celui de l'athlète
  reste provisoire. Une correction reste possible avec un motif, gardée en historique —
  plutôt qu'une immuabilité absolue qui rendrait une faute de frappe définitive.
- Un arrêt à un ravitaillement compte dans le tronçon qui en repart (arrivée à arrivée),
  comme le plan compte ses arrêts ; les mesures par tronçon du script de référence suivent
  la même convention.
- Les définitions du script (mouvement, arrêt, marche) vivent à côté du masque historique du
  jumeau sans le remplacer : la calibration n'en dépend pas, la prédiction ne bouge pas.
- Sous une loi de pente servie à la seule répartition, le plan affiche la vitesse ajustée
  rapportée au Deq de la loi (elle varie d'un segment à l'autre) plutôt qu'un Deq personnel
  qui ne serait pas celui du total annoncé ailleurs dans le rapport.
- Rétrécissement des tranches vers la loi : 5 h par défaut (une tranche mesurée 5 h compte
  pour moitié) ; c'est un réglage de variante, le banc dira s'il faut le bouger.
- `slope_kappa_down_min` vide par défaut (la borne de montée s'applique, comme avant), pour
  qu'une configuration qui ne règle que `slope_kappa_min` garde son comportement.
- Frontière frais / fatigué des traits : 3000 m de dénivelé négatif déjà descendu (au-delà de
  la plupart des sorties d'entraînement, en deçà de la mi-course d'un 100 miles) ; le script
  coupait Nice au km 100. Minimum d'heures et rétrécissement à 1 h : des réglages de départ
  que les runs diront.
- Fatigue de descente servie au plan : la **relative** (au-delà du ralentissement du reste
  de la sortie au même D−), pour ne pas compter deux fois ce que le fade général dit déjà.
- Seuil de cadence personnel consigné, pas servi : le servir demande de re-décoder.
- Nice 100M 2026 mise à part dans le registre par la règle R&D du prompt (« ce qui est ajusté
  sur Nice se juge ailleurs ») : elle sort de tous les agrégats, arrivée comprise, et se lit
  sur sa ligne.
- Un consentement d'avant la conservation (« 2026-07 », ou sans version) garde sa promesse :
  l'archive part dès l'ingestion ; le jumeau, les plans et la page suivent la même échéance
  de six mois que les autres.
- La purge est livrée en simulation : effacer des données en production est une opération
  destructive, elle attend ton feu vert (`cohorte.purge = active`).
- L'effacement manuel d'un athlète (bouton de la fiche) rend aussi ses entrées anonymes, comme
  la purge — avant, elles restaient sous pseudonyme.
- Le brouillon de la page cohorte se relit derrière la serrure du tableau de bord, formulaire
  en aperçu (il n'envoie rien) ; la case nomme positions, fréquence cardiaque et cadence.
- Carte : un « tronçon haché » est une suite de fenêtres de descente hachées consécutives ; le
  modèle a les contrôles du modèle de marche (pente, D− déjà descendu, nuit), une pénalité L2 sur
  la seule carte choisie par validation croisée sur des activités entières, des régions de
  30 km de proche en proche, une modalité rare (moins de 20 fenêtres) rangée dans « autre ».
  « Signal » demande deux erreurs types de gain hors échantillon (groupées par activité) dans
  les deux validations : un gain plus petit ne distingue pas la carte du hasard.
- MNT par défaut du modèle : Copernicus, lisible partout ; le RGE ALTI (France seule) ne se
  mélange pas avec lui, le TRI dépendant du pas du MNT.
- Surcoût de terrain : (1 + P_carte·r) ÷ (1 + P_réf·r), la pénalité de marche pour
  sensibilité ; le terrain habituel (P_réf) est la moyenne des fenêtres d'apprentissage. Les
  probabilités de carte sont de jour : la nuit reste au modèle de marche et au terme de nuit.
- « Déclaré » à la répartition garde la surcharge totale déclarée et la déplace vers les
  descentes au prorata de la probabilité de marcher — sans modèle de marche, uniformément.
- Sous `terrain_adjust=deq`, la sélection des vrais ultras ne voit pas le terrain (mêmes
  ultras qu'avant), seule leur vitesse servie le porte ; le prior de β2 garde sa valeur par
  défaut (échelle 1) : la variante TA5 du run 2 dira s'il faut la réduire.
- La marche prévue ne compte que les descentes (la consigne de l'écran Plan parle de
  descentes) ; les passages mesurent la marche en descente dans les mêmes fenêtres.
- Loi de la référence : les tranches au rétrécissement par défaut (5 h) plutôt qu'à 2 h,
  presque à égalité en moyenne mais avec moins de courses dégradées (6 contre 8) et une perte
  maximale plus faible (2,4 contre 3,2 min) ; plutôt qu'à 20 h, plus prudent mais qui gagne un
  tiers de moins.
- Profils de configuration : posés dans `twin.config.json` (bloc `profils`, hors de la
  configuration effective : l'empreinte du défaut n'en dépend pas). La **référence** est vide
  tant qu'aucun run n'a gardé de drapeau hors du défaut ; l'**expérimental** porte les leviers
  du chantier qui se servent sans carte (loi de pente à la répartition, descente sans remise,
  fatigue de descente, technicité déclarée sur les descentes). Les termes de carte n'y sont pas :
  le tableau de bord n'a pas de carte.
- La consigne « Sur ce segment » dit « descentes : environ N min prévues à la marche » dès une
  minute prévue (à la minute sous 10 min, aux 5 min au-delà) ; « descente technique » seulement
  là où un profil de carte rend les descentes plus hachées que le terrain habituel.
- Les cartes se gardent dans `services/twin-engine/local-data/carte` (ignoré par git) ; le
  modèle ne porte aucune position, les fenêtres d'apprentissage restent dans ce cache.
- Arrêt « au ravito » : un arrêt fait pendant le séjour dans le rayon de détection du point
  (150 m, celui des passages), avant ou après le passage relevé ; le temps hors ravito garde
  les pauses en route et les trous d'enregistrement, comme le temps de segment du plan. Un
  tronçon est de montée quand son D+ fait au moins deux fois son D− et au moins 20 m par km,
  de descente à l'inverse ; mixte sinon, roulant compris (un tronçon plat passait en montée).
- Un extrait OSM étant donné, une sortie sans aucune voie recalée sort de l'apprentissage, et
  un parcours ou un ultra dont moins de la moitié des descentes est recalée
  (`carte.couverture_osm_min = 0.5`) ne reçoit pas la carte : à Nice, 90 % et 100 % des
  descentes le sont ; une trace hors des extraits, 0 %.
