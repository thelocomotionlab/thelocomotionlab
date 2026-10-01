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
- Texte public de la page cohorte (relecture juridique), et lecture de la clause 4.6 de l'ODbL
  pour les chiffres tirés d'OSM remis à un athlète.

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
