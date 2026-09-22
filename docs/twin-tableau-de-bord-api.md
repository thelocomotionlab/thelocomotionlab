# Chantier « Tableau de bord » — Locomotion Twin

Tu construis l'outil qui permet à Valentin de traiter les dépôts d'archives, décrire les courses, générer, publier et envoyer les plans sans ligne de commande — et la page où chaque athlète lit son plan, l'amende et, s'il le veut, saisit son résultat. Deux documents font foi et sont à copier dans le dépôt avant tout : `docs/twin-tableau-de-bord-api.md` (le récapitulatif de l'API, fourni) et la maquette `Console Locomotion Twin.dc.html` (fournie), à ranger sous `docs/design/twin-tableau-de-bord/`. Dans ces deux documents, le mot **« console » est remplacé partout par « tableau de bord »** ; c'est le seul changement à y faire.

Lis ensuite `CLAUDE.md`, `docs/manuel-twin.md`, `services/twin-engine/src/twin_engine/{api,jobs,dossier.py}`, `services/twin-depot/src`, `infra/compose.yml`, `infra/caddy/conf.d/api.caddy`, `apps/site/app/services/twin/**`, et `packages/ui/src/{styles/theme.css,components/Button.tsx,components/Field.tsx,components/contenu/BadgeEtat.tsx,components/contenu/Tableau.tsx}`.

---

## 0. Ce qui ne bouge pas

- **Le rapport.** Ni `report.tex.j2`, ni `locomotionreport.cls`, ni `figures.py`, ni `narrative.py`, ni le moteur, ni le format de `RaceSpec`, ni celui du dossier. Le tableau de bord écrit un `RaceSpec` depuis une Course et lit un dossier. Le PDF sort du même `run_job` que le CLI. Test exigé : un plan généré par le tableau de bord et le même plan généré par le CLI donnent un dossier identique et un rapport dont les cinq pages sont identiques (golden déterministe).
- **La page de dépôt** `/services/twin/cohorte` et le service `twin-depot`, sauf l'ajout du §2.3.
- **Le CLI**, qui reste un chemin de premier rang.

## 1. Décisions prises — ne pas rouvrir

- Nom : **Tableau de bord**. Pages sous `apps/site/app/services/twin/tableau-de-bord/`, API sous `/twin/tableau-de-bord/…`. Aucune occurrence de « console » dans le code, les textes, les routes ou les docs.
- **Un seul PDF** par version : les cinq pages du rapport, puis la feuille, puis les fiches d'assistance, assemblés à la génération sans modification des pages. La feuille seule reste un fichier téléchargeable à part.
- **Pas de base de données.** Les objets sont des fichiers JSON sur `twin_engine_data` ; le moteur les relit au démarrage et garde l'index en mémoire.
- **Le dépôt prévient le moteur** à la fin de chaque upload (appel interne, §2.3). Aucun sondage périodique.
- **Le résultat** est saisi par Valentin depuis le classement officiel ; le champ de l'athlète est facultatif ; **abandon** est une valeur possible.
- **Aucune durée annoncée** pour une ingestion, une génération ou un amendement : l'interface montre un état en cours et l'avancement renvoyé par le job, jamais « quelques secondes » ni « environ une minute ».
- Le message de génération ne parle pas du moteur qui « rejoue les ultras ». Un état en cours dit ce qu'il fait au présent, en trois mots.
- **Annuler après supprimer** : toute suppression d'un élément dans l'éditeur (ravitaillement, phase) laisse un toast « Annuler » pendant quelques secondes. La suppression d'un athlète reste une confirmation explicite ; celle d'une course est refusée si un plan y est rattaché.

## 2. Phase 1 — le socle

### 2.1 Serrures

- Cloudflare Access : documente dans `docs/manuel-twin.md` les trois étapes pour protéger `thelocomotionlab.com/services/twin/tableau-de-bord*` (application auto-hébergée, règle email). Tu ne peux pas le configurer toi-même ; Valentin le fait.
- Moteur : `TWIN_ADMIN_TOKEN` en variable d'environnement, vérifié en `Authorization: Bearer` sur toute route `/twin/tableau-de-bord/*`. Même pattern que `ATELIER_ADMIN_TOKEN`. Une route sans jeton ou avec un mauvais jeton répond 401 sans détail.
- Athlète : deux clés par plan, `partage` et `privee`, HMAC-SHA256 de `ref + usage` avec `TWIN_KEYS_SECRET`, 32 caractères hexadécimaux, passées en `?k=`. Mauvaise clé ou référence inconnue → **404**, jamais 403. Limite les tentatives par IP sur `/twin/plans/*` (dans le moteur, en mémoire).
- Caddy : décommente et complète `api.caddy` pour ne router vers le moteur que `/twin/tableau-de-bord/*`, `/twin/plans/*` et `/twin/jobs/*`. Ingestion, archives et routes internes ne sont pas exposées.

### 2.2 Objets et stockage

Implémente les trois objets et les deux objets de service **tels que décrits dans le récapitulatif** (§3), avec les mêmes noms de champs. Arborescence : `athletes/{id}/`, `courses/{id}/`, `plans/{ref}/v{n}/`, `requests/`. Une référence de plan se dérive de l'athlète, de la course et de l'édition — jamais de l'id de job. Un test vérifie que la référence est stable d'une génération à l'autre.

### 2.3 Le dépôt prévient le moteur

Dans `twin-depot`, à la fin d'un upload réussi : `POST http://twin-engine:8000/twin/internal/deposits` avec un secret partagé `TWIN_INTERNAL_SECRET` et l'id du dépôt. Le moteur crée l'Athlète (`recu`), copie l'identité et la date de consentement, et met l'ingestion en file. Si l'appel échoue, le dépôt réessaie trois fois puis le note ; la File du tableau de bord a un bouton « rafraîchir » qui interroge `GET /twin/depots` en interne et rattrape ce qui manque.

### 2.4 File de jobs

Un seul job à la fois sur le VPS, types `ingestion | generation | amendement`, états `en_file | en_cours | fini | echec`, un champ `avancement` textuel mis à jour par le moteur. `GET /twin/jobs/{id}` conservé. Ajoute dans `infra/compose.yml` des limites de CPU et de mémoire au service `twin-engine` ; note dans le compte-rendu ce que tu as choisi et pourquoi, et signale que les specs du VPS restent à vérifier.

### 2.5 Ingestion depuis le dépôt

`POST /twin/tableau-de-bord/athletes/{id}/ingest` : le moteur télécharge l'archive sur `twin-depot:3000` avec `TWIN_DEPOT_ADMIN_TOKEN`, l'ingère dans un répertoire temporaire, écrit `jumeau.json` et `calibration.json`, pose le niveau, supprime le temporaire. Le rapatriement chez Valentin (`rapatrier-depots.py`) reste le chemin de sauvegarde ; il n'est pas automatisé ici.

### 2.6 Import d'un dossier fait au CLI

`POST /twin/tableau-de-bord/plans/import` : un `dossier.json` et ses fichiers produits localement créent un Plan comme s'il était né dans le tableau de bord. C'est le chemin « lancer depuis mon ordinateur ». Le dépôt ssh existant devient inutile ; retire-le dans la même phase.

### 2.7 Écrans File et Athlète

Pages client (Cloudflare Pages) sous `apps/site/app/services/twin/tableau-de-bord/`, appelant `api.thelocomotionlab.com`. Le jeton se colle une fois et vit en `sessionStorage`. Composition selon les planches *File* et *Athlète* de la maquette : compteurs qui partitionnent, verbe suivant en dernière colonne, section Demandes, fiche athlète avec consentement, niveau et raisons, suppression confirmée.

**Charte, sans exception** : uniquement les composants de `packages/ui` (`Button` pour toute action, `Field` pour tout champ, `BadgeEtat` pour tout statut, `Tableau` pour toute table) et les tokens de `theme.css`. Aucune couleur, police, ombre ou arrondi en dur dans le code du tableau de bord ; le test du site qui l'interdit s'étend à ces pages. Les états sélectionnés reprennent la variante primaire de `Button` (ambre plein, texte blanc). Statuts : ocre pour ce qui s'annonce, bleu-vert pour ce qui se déroule, terracotta pour ce qui est derrière.

## 3. Phase 2 — la bibliothèque et l'éditeur de course

Routes du récapitulatif §5.3. `POST /courses/{id}/gpx` réutilise `/preview` : profil lissé, géométrie, waypoints trouvés, lat/lon, heures de soleil. L'éditeur suit les trois planches *Trace*, *Ravitaillements*, *Horloge et terrain* : identité (nom, édition, date) demandée à la création avant la trace ; ravitaillements posés au clic, déplacés au glisser, **kilomètre éditable** qui déplace le marqueur ; « Importer les waypoints du GPX » ; inspecteur à droite pour l'élément choisi ; phases en bandes nommées. Distance officielle : champ vide s'il n'est pas saisi, écart calculé sur le D+ seulement. Technicité et chaleur avec unité et une ligne d'aide. Enregistrement en brouillon à chaque changement, « Publier » pour sortir du brouillon ; « Dupliquer en édition suivante ».

Test : une Course construite dans l'éditeur, exportée en `RaceSpec`, est identique au `examples/nice-100m.json` de référence sur tous les champs qu'il porte.

## 4. Phase 3 — le plan et la page de l'athlète

### 4.1 Plan

Routes du récapitulatif §5.4 et §5.5. Écran *Plan* : le choix à gauche (athlète, course, mode prédiction ou objectif, cible, politique d'arrêts **avec le taux mesuré de l'athlète et ce qu'il donnerait sur cette course**, assistance possible, nutrition), l'aperçu au centre (les cinq chiffres, le PDF dans un cadre), les actions à droite dans l'ordre Publier → Envoyer, et les versions avec retour. « Envoyer » est refusé tant que la version n'est pas publiée. L'email part par le même relais que le dépôt, PDF unique joint, `{lien}` remplacé par le lien **privé**.

### 4.2 Page de l'athlète

`apps/site/app/services/twin/plan/[ref]/` remplace `annexe/[ref]` : page client qui lit `GET /twin/plans/{ref}?k=…`. Retire le prérendu (`dynamicParams`, `public/twin-annexes`). Composition selon les quatre planches *Le plan, avant / après la course*, desktop et téléphone : cadre partagé (lu par les deux clés) et cadre « toi seul » (clé privée), arrêts éditables dans la colonne du tableau, barre « Refaire mes documents » collée dès qu'un réglage change, formulaire « Demander une autre modification » qui crée une Demande dans la File, ligne qui dit quand les amendements se ferment. `POST /plans/{ref}/amend` réutilise le code de `/rendu` ; fermé après l'heure de départ, ce que le moteur vérifie lui-même. « Copier le lien » copie **le lien de partage**, jamais le privé.

### 4.3 Non-indexation — avec un test

- Sans clé valide : 404, sans page de connexion ni message.
- En-têtes sur `/services/twin/plan/*` et `/services/twin/tableau-de-bord/*` : `X-Robots-Tag: noindex, nofollow` et `Referrer-Policy: no-referrer` (fichier `_headers` de Cloudflare Pages), plus la balise `robots` dans la page.
- `robots.txt` exclut les deux préfixes ; aucun de ces chemins n'apparaît dans le sitemap ni dans un lien du site public.
- Test automatisé : requête sans clé → 404 ; en-têtes présents ; `robots.txt` et sitemap vérifiés.

## 5. Phase 4 — le registre vivant

Routes §5.6 et le résultat (§5.4, §5.8). Écran *Registre* : synthèse **par niveau servi** (plan de base, plan calibré), lignes avec prédit, réel, écart, dans la fourchette, dans les bornes ; les plans dont la date est passée sans résultat en tête, saisie en ligne, abandon possible. Export dans le format de `docs/twin-registre-couverture.json` ; le fichier committé reste la version publiée, mis à jour par Valentin à la main. `PUT /plans/{ref}/result?k=privee` pour l'athlète, facultatif ; page « après la course » selon la maquette.

## 6. Hors périmètre

Le régime `base` du moteur (prédiction sur archive mince) est un chantier moteur séparé, avec preuve au banc ; ici le tableau de bord affiche le niveau que `sufficiency` renvoie, sous les deux mots *Plan de base* / *Plan calibré*. Le libre-service, le paiement et les comptes athlètes ne sont pas dans ce chantier. L'ingestion automatique du rapatriement non plus.

## 7. Méthode

Une branche par phase, un plan court avant le code, l'OK de Valentin, puis le code. À chaque phase : `pytest services/twin-engine` vert, golden intact, `pnpm -F site build lint test` verts, `docs/manuel-twin.md` mis à jour (nouvelles routes, variables d'environnement, étapes Cloudflare Access), une ligne au compte-rendu. Les variables nouvelles (`TWIN_ADMIN_TOKEN`, `TWIN_KEYS_SECRET`, `TWIN_INTERNAL_SECRET`) sont documentées dans `infra/.env.example` et jamais committées.

À me demander tôt : les specs du VPS (CPU, mémoire, disque) pour fixer les limites du §2.4 ; le relais email utilisé par le dépôt, s'il n'est pas évident ; toute divergence entre la maquette et le récapitulatif — le récapitulatif l'emporte sur les données, la maquette sur la composition.

Commence par le plan de la Phase 1.
