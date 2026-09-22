# L'API du tableau de bord Locomotion Twin — récapitulatif à valider

Ce document décrit ce que le tableau de bord et la page athlète demanderont au serveur, comment chaque demande est protégée, et ce qui se passe derrière. Il part de ce qui existe déjà sur la branche `twin-v2/rapport-v4` et ne le remplace pas : il l'organise.

---

## 1. Le principe en trois phrases

**Le tableau de bord écrit des carnets de route et lit des dossiers.** Il ne touche ni au moteur, ni au gabarit du rapport, ni au format de la spec. Le PDF sort du même `run_job` que le CLI.

**Un seul objet fait foi : le dossier.** Produit par l'ingestion puis la génération, il contient tout ce qu'il faut pour refaire les documents sans l'archive. Qu'il vienne du tableau de bord ou de ton ordinateur, c'est le même fichier.

**Deux publics, deux serrures.** Toi, par un jeton d'administration sur des routes `/tableau-de-bord/…`. L'athlète, par une clé dans le lien de sa page, sur des routes `/plans/…`. Rien d'autre n'est exposé.

---

## 2. Ce qui existe déjà, et ce qu'on en fait

| Existant | Où | Devient |
|---|---|---|
| `POST /jobs`, `GET /jobs/{id}`, `GET /jobs/{id}/report` | moteur (FastAPI) | conservés : c'est la file de travail asynchrone |
| `POST /rendu` — refaire les documents depuis un dossier avec `reglages`, `crew`, `nutrition` | moteur | devient `POST /plans/{ref}/amend` ; même code |
| `POST /preview` — lire un GPX, en tirer le profil | moteur | sert l'éditeur de course (étape Trace) |
| `POST /fiche` — feuille seule | moteur | intégrée à la génération, plus de route à part |
| `POST /twin/depots` (upload), `GET /twin/depots`, `GET /twin/depots/{id}/archive`, `DELETE /twin/depots/{id}` | service de dépôt (Node) | inchangés ; le moteur les appelle en interne |
| `docs/twin-registre-couverture.json` | fichier committé | devient une vue calculée depuis les plans ; le fichier committé reste la version publiée |
| `dossier.py` (version 1) | moteur | inchangé ; c'est le format pivot |

Rien de ce qui existe n'est réécrit. On ajoute une couche « tableau de bord » devant.

---

## 3. Les trois objets

### 3.1 Athlète

Ce qu'une personne est pour le laboratoire, indépendamment de toute course.

```
Athlete
  id              identifiant interne, stable
  pseudo          nom court affiché (« Val »)
  email           canal de contact ; c'est aussi ce qui le reconnaît à sa deuxième course
  prenom, montre  tels que saisis au dépôt
  consent_at      date du consentement, copiée du dépôt
  archive         { nom, taille, sha256, recue_le }   — l'archive elle-même n'est pas dans l'objet
  ingestion       { statut: recu | en_cours | ingere | illisible, le, erreur }
  jumeau          { vc_kmh, E, durabilite_pct, n_vrais_ultras, n_avec_fc, donnees_jusquau,
                    plus_long_h, plus_gros_dplus_m }         — vide tant que non ingéré
  niveau          { nom: base | calibre, raisons: [ … ] }   — calculé à l'ingestion
  plans           [ ref, … ]
```

Sur le disque : `athletes/{id}/athlete.json`, `jumeau.json`, `calibration.json`. L'archive vit dans le dépôt le temps de l'ingestion, puis chez toi (rapatriement), jamais durablement sur le VPS.

### 3.2 Course

Le carnet de route d'une épreuve, dans une édition donnée. Construit une fois, partagé par tous ses athlètes.

```
Course
  id, slug        « nice-100m-2026 »
  nom, edition    « Nice Côte d'Azur by UTMB · 100M », 2026
  depart_le       date et heure avec fuseau
  lat, lon        tirés du GPX (point de référence pour le soleil)
  gpx             { nom, points, avec_altitude }
  geometrie       { distance_km, dplus_m, dminus_m, alt_max, alt_min }   — calculée par le moteur
  officiel        { dplus_m, distance_km?, dminus_m? }                  — saisis, jamais inventés
  seuil_ecart_pct
  ravitaillements [ { index, nom, km, base_majeure, assistance, arret_min }, … ]
  technicite_pct, chaleur_pct
  phases          [ { nom, du_km, au_km }, … ]
  soleil          { coucher, lever }                                     — calculés
  statut          brouillon | publiee
  athletes        nombre d'inscrits (calculé)
```

Sur le disque : `courses/{id}/course.json`, `trace.gpx`, `profil.json`. **`course.json` se traduit en `RaceSpec` sans perte** : c'est la même information que ton `examples/nice-100m.json`, avec des noms de champs en français côté tableau de bord et l'anglais actuel côté moteur. Le moteur ne voit que des `RaceSpec`.

### 3.3 Plan

Un athlète × une course × des réglages. C'est l'objet qui a des versions, des documents et une page.

```
Plan
  ref             « LL-NICE26-VAL-… », stable, dérivée athlète+course+édition, jamais du job
  athlete_id, course_id
  version         1, 2, 3 …   — une par génération
  statut          a_composer | genere | publie | envoye | fige | resultat
  reglages        { mode: prediction | objectif, cible_h, politique_arrets,
                    assistance: [ { index, note } ], nutrition: { eau_l_h, glucides_g_h } }
  amendements     { arrets: { index: min }, notes: { index: texte }, nutrition }   — ceux de l'athlète
  prediction      { central_h, fourchette: [lo, hi], bornes: [lo, hi], arrivee_le, niveau }
  documents       { pdf, feuille_pdf, ics, gpx }   — chemins, par version
  publie_le, envoye_le
  cles            { partage, prive }               — les deux clés de la page
  resultat        { officiel_h | null, abandon: bool, saisi_par: athlete | labo | null }
```

Sur le disque : `plans/{ref}/plan.json` et `plans/{ref}/v{n}/` avec `dossier.json`, `plan.pdf`, `feuille.pdf`, `plan.ics`, `plan.gpx`.

**Une génération crée une version ; un amendement de l'athlète refait les documents dans la version courante** (les réglages du plan n'ont pas changé, seuls les siens). Le tableau de bord voit ses amendements.

### 3.4 Et deux objets de service

```
Demande   { id, plan_ref, quoi, pourquoi, recue_le, statut: ouverte | repondue }
Job       { id, type: ingestion | generation | amendement, statut: en_file | en_cours | fini | echec,
            avancement: texte, resultat, erreur }
```

### 3.5 Où c'est rangé

Les objets sont des fichiers JSON sur le volume `twin_engine_data` : **le fichier est la vérité**. Aucune base de données : au démarrage, le moteur relit les fichiers et garde en mémoire l'index qui sert à chercher et trier (statuts, dates, références). Rien à administrer, aucune donnée qui n'existe ailleurs que dans les fichiers.

---

## 4. Les serrures

### 4.1 Toi — routes `/twin/tableau-de-bord/…`

- **Devant les pages** : Cloudflare Access sur `thelocomotionlab.com/services/twin/tableau-de-bord*`, règle « email = le tien ». Personne n'atteint la page sans passer par là.
- **Devant l'API** : en-tête `Authorization: Bearer <TWIN_ADMIN_TOKEN>`, vérifié par le moteur sur chaque route `/tableau-de-bord/…`. Même pattern que `ATELIER_ADMIN_TOKEN`. Tu le colles une fois dans le tableau de bord, il vit en `sessionStorage`.

### 4.2 L'athlète — routes `/twin/plans/{ref}/…`

Chaque plan a **deux clés**, dérivées de la référence et d'un secret serveur (HMAC, 32 caractères), passées en paramètre `k` dans l'URL :

- la clé **de partage** : lit la partie partageable (plan, feuille, profil, assistance). C'est le lien que l'athlète donne à son assistance.
- la clé **privée** : lit tout, amende, demande, saisit le résultat. C'est le lien qu'il reçoit par email.

Une clé n'est valable que pour son plan. Une route demandée avec la mauvaise clé répond 404, pas 403 : elle ne confirme pas que la référence existe.

### 4.3 L'interne — jamais exposé

Le moteur appelle le dépôt sur le réseau Docker (`twin-depot:3000`) avec `TWIN_DEPOT_ADMIN_TOKEN`. L'ingestion, les jobs et les archives ne sont joignables que par le tableau de bord. Caddy ne route que `/twin/tableau-de-bord/*`, `/twin/plans/*` et `/twin/jobs/*` vers le moteur.

---

## 5. Les routes, par écran

Convention : `verbe chemin` — *qui* — ce qu'on envoie → ce qu'on reçoit — ce qui se passe.

### 5.1 File

`GET /tableau-de-bord/file` — toi — rien → `{ compteurs, dossiers: [ … ], demandes: [ … ] }`
Chaque dossier porte l'athlète, la course visée, le départ, le statut et **le verbe suivant** (`ingerer`, `composer`, `publier`, `envoyer`, `saisir_resultat`). Les compteurs partitionnent la liste. Les demandes ouvertes sont listées à part.

**Le dépôt prévient le moteur** à la fin de chaque upload (un appel interne `POST /twin/internal/deposits`, secret partagé) : le nouveau dépôt crée un Athlète en statut `recu` et met une ingestion en file. Aucun sondage périodique. La File a un bouton « rafraîchir » qui interroge `GET /twin/depots` en interne et rattrape ce qui aurait manqué. Tu n'as rien à déclencher ; tu vois arriver.

### 5.2 Athlète

`GET /tableau-de-bord/athletes/{id}` — toi → l'objet complet, avec ses plans.
`POST /tableau-de-bord/athletes/{id}/ingest` — toi → `{ job_id }` — l'archive est lue depuis le dépôt (ou depuis le fichier déjà rapatrié si tu la renvoies), le jumeau et la calibration se calculent, le niveau est posé. Une ingestion à la fois sur le VPS ; les suivantes attendent.
`DELETE /tableau-de-bord/athletes/{id}` — toi → 204 — archive, jumeau, plans, page : tout est supprimé. Le registre garde ses entrées sous pseudonyme.
`POST /tableau-de-bord/athletes/{id}/archive` — toi — un fichier → `{ job_id }` — pour ré-ingérer avec une archive que tu as chez toi, quand le moteur a changé.

### 5.3 Bibliothèque et éditeur de course

`GET /tableau-de-bord/courses` · `POST /tableau-de-bord/courses` `{ nom, edition, depart_le }` → `{ id }` (brouillon).
`GET /tableau-de-bord/courses/{id}` · `PUT /tableau-de-bord/courses/{id}` — l'objet entier, à chaque enregistrement.
`POST /tableau-de-bord/courses/{id}/gpx` — un fichier → `{ geometrie, profil, waypoints, lat, lon, soleil }` — le moteur lit la trace, lisse l'altitude, renvoie le profil pour l'écran et les waypoints trouvés pour « importer ».
`POST /tableau-de-bord/courses/{id}/publish` → la course sort du brouillon ; les plans existants gardent leur version.
`POST /tableau-de-bord/courses/{id}/duplicate` `{ edition, depart_le }` → une nouvelle course en brouillon avec la même trace et les mêmes ravitaillements.
`DELETE /tableau-de-bord/courses/{id}` — refusé si un plan y est rattaché.

### 5.4 Plan

`POST /tableau-de-bord/plans` `{ athlete_id, course_id, reglages }` → `{ ref, job_id }` — crée le plan et lance la version 1.
`GET /tableau-de-bord/plans/{ref}` → l'objet, la version courante, les cinq chiffres, les documents, les versions.
`POST /tableau-de-bord/plans/{ref}/generate` `{ reglages }` → `{ job_id }` — nouvelle version.
`POST /tableau-de-bord/plans/{ref}/publish` → les deux clés sont posées, la page répond. Rien ne part.
`POST /tableau-de-bord/plans/{ref}/send` `{ objet, corps }` → un email à l'athlète, PDF joint, `{lien}` remplacé par le lien privé. Refusé si non publié.
`POST /tableau-de-bord/plans/{ref}/restore/{version}` → la version choisie redevient courante, ses documents avec.
`PUT /tableau-de-bord/plans/{ref}/result` `{ officiel_h | abandon }` → l'entrée de registre se crée.
`GET /tableau-de-bord/plans/{ref}/pdf` (et `feuille.pdf`, `ics`, `gpx`) → les fichiers de la version courante.
`POST /tableau-de-bord/plans/import` — un `dossier.json` et ses PDF produits **chez toi par le CLI** → `{ ref }` — c'est le chemin « lancer depuis mon ordi » : le plan entre dans le tableau de bord comme s'il y était né.

### 5.5 Demandes

`GET /tableau-de-bord/requests` · `POST /tableau-de-bord/requests/{id}/answer` `{ reponse }` → email à l'athlète, demande marquée répondue.

### 5.6 Registre

`GET /tableau-de-bord/registre` → `{ base: { entrees, erreur_moyenne, fourchette, bornes }, calibre: { … }, lignes: [ … ] }` — calculé depuis les plans qui ont un résultat, par niveau servi. Un export JSON dans le format du fichier committé.

### 5.7 Jobs

`GET /jobs/{id}` — toi → `{ statut, avancement, resultat, erreur }` — le tableau de bord interroge toutes les deux secondes. L'interface montre l'état et l'avancement renvoyés par le job ; elle n'annonce aucune durée.

### 5.8 La page de l'athlète

`GET /plans/{ref}?k=…` → le contenu de la page. Clé de partage : la partie partageable. Clé privée : tout, plus les amendements courants et le résultat.
`GET /plans/{ref}/pdf?k=…` (et `feuille.pdf`) → les fichiers. Les deux clés y ont droit.
`POST /plans/{ref}/amend?k=privée` `{ arrets, notes, nutrition }` → `{ job_id }` — les documents se refont dans la version courante. **Fermé après l'heure de départ.**
`POST /plans/{ref}/requests?k=privée` `{ quoi, pourquoi }` → la demande entre dans ta file.
`PUT /plans/{ref}/result?k=privée` `{ officiel_h | abandon }` → facultatif : par défaut c'est toi qui saisis depuis le classement officiel ; l'abandon est une valeur possible.

---

## 6. Les trois parcours, en séquence

### 6.1 Un dépôt arrive

1. L'athlète dépose sur `/services/twin/cohorte` — inchangé. Le dépôt stocke l'archive et t'envoie l'email habituel.
2. Le dépôt prévient le moteur à la fin de l'upload : l'Athlète est créé (`recu`), l'ingestion mise en file.
3. L'ingestion tourne : lecture de l'archive, jumeau, calibration, niveau. L'Athlète passe `ingere`. Le verbe suivant devient `composer`.
4. Tu ouvres la File. Si sa course est en bibliothèque, tu composes ; sinon tu la crées d'abord — une fois pour tous ceux qui la courent.
5. Tu rapatries l'archive chez toi (script existant), le dépôt se purge.

### 6.2 Un plan se fait

1. `POST /tableau-de-bord/plans` — la version 1 se génère, tu suis le job.
2. Aperçu : les cinq chiffres et le PDF. Pas bon ? tu changes un réglage, `generate` → version 2.
3. `publish` : la page répond à ses deux liens. `send` : l'email part avec le PDF et le lien privé.
4. L'athlète amende sur sa page jusqu'au départ ; chaque amendement refait ses documents. S'il veut autre chose, sa demande arrive dans ta file.
5. Au départ, la page se fige.

### 6.3 La course est courue

1. Le lendemain, la File affiche « résultat à saisir ». Tu le prends sur le classement officiel — ou l'athlète l'a déjà saisi.
2. L'entrée de registre se crée, avec le niveau servi.
3. Sa page montre le prédit contre le réel, et l'invite à préparer la suivante : son jumeau est là, rien à redéposer.

---

## 7. Ce que le tableau de bord ne fait jamais

- Il n'ouvre pas `report.tex.j2`, ne modifie ni le moteur ni le format de `RaceSpec` ni celui du dossier. Les cinq pages du rapport sont identiques à celles du CLI ; le PDF livré les assemble avec la feuille et les fiches, sans les toucher.
- Il n'invente aucune valeur : un champ vide reste vide, jusque dans le PDF.
- Il n'expose ni archive, ni job, ni ingestion à l'extérieur.
- Il ne décide pas du niveau : le moteur le pose à l'ingestion, le tableau de bord l’affiche.
- Il n'envoie rien sans que tu aies cliqué « Envoyer ».

---

## 8. Décisions prises

1. **Le PDF unique** : rapport (cinq pages, inchangé) + feuille + fiches d'assistance, assemblés à la génération. La feuille seule reste téléchargeable à part.
2. **Le dépôt prévient le moteur** à l'upload ; pas de sondage périodique ; bouton « rafraîchir » en secours.
3. **Pas de base de données** : fichiers JSON, index en mémoire reconstruit au démarrage.
4. **Deux clés** par plan, 404 sur mauvaise clé, pages exclues de l'indexation (`X-Robots-Tag`, `robots.txt`, `Referrer-Policy: no-referrer`, aucun lien public).
5. **Le résultat** saisi par Valentin par défaut, par l'athlète s'il veut ; abandon possible.
6. **Aucune durée annoncée** pour une ingestion, une génération ou un amendement.
7. **Annuler** après toute suppression dans l'éditeur.
