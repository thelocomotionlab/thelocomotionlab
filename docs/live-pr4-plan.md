# Plan PR4 — Cartes de partage OG + story (chantier 2, à valider)

> **Statut : PLAN — à valider par Valentin avant le code** (point d'arrêt n°1).
> Référence : brief §7 + §3 (« satori ou canvas, régénérée toutes les 2–5 min vers
> une URL stable + cache-buster dans la meta ; PAS de route edge Cloudflare »),
> design écran 2f (OG 1200×630 · Story 1080×1920, styles exacts relevés).

## 1. Ce que la PR4 livre

1. **`og.png` 1200×630** régénérée périodiquement côté VPS (module du service
   live-journal), servie par Caddy sur `api.thelocomotionlab.com/journal/og.png` ;
   trois variantes selon l'état : **En direct** (maquette 2f complète), **Avant**
   et **Terminé** (sobres, même grammaire).
2. **`story.png` 1080×1920** générée à la demande (endpoint dédié) + **lien de
   téléchargement discret** sur /live (usage manuel Instagram).
3. **`og:image` de /live** pointe sur l'URL stable avec cache-buster.
4. Le site publie **`/live-config.json`** (généré AU BUILD depuis `liveConfig`) :
   le service y lit les paramètres d'aventure — la source unique reste `liveConfig`.

## 2. Décisions techniques (à valider)

- **Rendu : satori + @resvg/resvg-js** (épinglés). satori compose la carte
  (layout type flexbox → SVG, texte vectorisé avec les fontes fournies), resvg
  rasterise en PNG. Zéro dépendance système (binaires prébuilts npm), rendu
  déterministe dans le conteneur. Fontes **Ubuntu** (Regular/Medium/Bold, .ttf,
  licence UFL — fichier de licence committé) dans `services/live-journal/assets/fonts/`
  — la maquette 2f n'utilise QUE Ubuntu.
- **Données** :
  - positions + timer : le service SONDE les artefacts publics de tracking
    (`TRACKING_BASE`, défaut `https://tracking.thelocomotionlab.com`) toutes les
    3 min — en simulation, il lit son propre simulateur (aucun réseau) ;
  - paramètres d'aventure + statut : `SITE_BASE/live-config.json` (nouvelle
    route statique du site — nom, dates, distance, D+, statut, chemin de la
    trace) + la silhouette du profil depuis le `.track.json` déjà public.
    Rafraîchi toutes les heures. **Pas de duplication de config dans l'env du
    VPS** : liveConfig reste LE seul endroit à éditer.
- **Cadence** : régénération toutes les **3 min** quand le direct est actif
  (brief : 2–5 min) ; sinon à la bascule d'état et au démarrage (les variantes
  Avant/Terminé sont quasi statiques). Écriture ATOMIQUE dans
  `DATA_DIR/public/og.png`, servie par Caddy (`Cache-Control: no-cache`,
  matcher ajouté à `api.caddy`).
- **Story à la demande** : `GET /journal/story.png` (proxifié vers le service,
  génération fraîche, garde-fou 10 req/min global) — pas de fichier persistant.
  **Lien discret** en pied de l'état « En cours » (« Télécharger la story »,
  petit, gris).
- **Meta du site** : `og:image = https://api.thelocomotionlab.com/journal/og.png?v=<buildId>`
  (+ variante Twitter). Le site étant 100 % statique, le cache-buster est **par
  build** : chaque déploiement force les scrapers à re-crawler ; entre deux
  déploiements, l'URL stable sert une image fraîche (≤ 3 min) à tout NOUVEAU
  partage — les plateformes qui ont déjà mis en cache gardent leur copie
  quelques heures, limite assumée du 100 % statique (signalée ici).

## 3. Contenu des cartes (styles exacts du 2f)

- **OG « En direct »** : logo + « The Locomotion Lab » · badge EN DIRECT
  terracotta · titre Ubuntu 700 58 px · « **96,4** / 194 km · Dernière étape —
  **Col de l'Aup Martin** (2 761 m) » · barre ambre dégradée 14 px · silhouette
  du profil en pied (aires couverte/restante + marqueur) ·
  « thelocomotionlab.com/live » en bas à droite.
  **« Dernière étape franchie »** = dernier waypoint dépassé (liste `{nom, km}`
  de liveConfig — toujours en attente) ; **fallback propre tant que la liste est
  vide : le segment est omis** (km seuls).
- **Story « En direct »** : badge + titre 88 px + « 194 km · 12 000 m D+ ·
  Jour 2 » · « 49,7 % » en 150 px + barre + parcourus/restants · « Dernière
  étape franchie » + nom en 44 px · silhouette du profil (bottom:120, h:300) ·
  URL centrée. Le contenu critique commence à y=250 (zone sûre haute
  respectée) ; en pied, profil et URL sont décoratifs (maquette telle quelle —
  la zone basse Instagram peut les rogner, assumé par le design).
- **Variantes Avant/Terminé (non maquettées — sobres, même grammaire)** :
  Avant = badge sauge « PROCHAIN DÉPART », titre, dates · distance · D+,
  silhouette sans couverture ; Terminé = badge sauge foncé « TERMINÉ » à coche,
  titre, « Aventure bouclée » + stats finales (si l'archive/stats sont encore
  joignables ; sinon dates + distance).

## 4. Fichiers touchés

```
services/live-journal/
├─ assets/fonts/Ubuntu-{Regular,Medium,Bold}.ttf + UFL.txt   # licence committée
├─ src/og/
│  ├─ data.ts        # sonde tracking + live-config.json du site + .track.json (caches)
│  ├─ cards.tsx?     # non — PAS de JSX : satori accepte un arbre d'objets (reste .ts)
│  ├─ cards.ts       # les trois variantes OG + la story (layout satori, styles 2f)
│  ├─ render.ts      # satori → resvg → PNG (fontes chargées une fois)
│  └─ scheduler.ts   # boucle 3 min (si running) + régénération à la bascule
├─ src/server.ts     # + GET /journal/story.png (garde-fou) ; healthz enrichi (lastOgAt)
└─ test/og.test.ts   # sélection de variante, « dernière étape », layout non-régression
                     #   (snapshot du SVG satori), garde-fous data manquantes

apps/site/
├─ app/live-config.json/route.js   # export statique de liveConfig (public, au build)
└─ app/live/page.jsx               # og:image → api…/journal/og.png?v=<buildId> ;
                                   #   lien « Télécharger la story » (état En cours)

infra/caddy/conf.d/api.caddy       # + /journal/og.png (file_server, no-cache)
                                   # + /journal/story.png (proxy service)
docs/live-pr4-plan.md              # ce plan
```

Dépendances ajoutées (épinglées) : `satori`, `@resvg/resvg-js`. Image Docker :
rien à ajouter (prébuilts npm).

## 5. Recette PR4 (sur simulateur + préversion)

① sim lancé → `og.png` variante « En direct » avec % et km qui évoluent d'une
régénération à l'autre ; ② statut avant/termine → variantes sobres ; ③
`story.png` se télécharge, contenu critique dans la bande centrale (vérif
programmatique des coordonnées + inspection visuelle) ; ④ le HTML buildé de
/live porte la meta `og:image` avec cache-buster ; ⑤ tests + lint + build +
next-on-pages verts. Le partage WhatsApp/Instagram RÉEL se recette après
déploiement (action Valentin, checklist fournie) — un aperçu local type
opengraph.xyz ne voit pas un service non déployé.

## 6. Questions ouvertes pour Valentin

1. **satori + @resvg/resvg-js** (recommandé §2) — OK ?
2. **`/live-config.json` publié par le site** pour que le service lise les
   paramètres d'aventure sans dupliquer liveConfig — OK ?
3. **Lien « Télécharger la story »** discret en pied de l'état En cours — OK ?
4. (Info, pas une question) le cache-buster d'`og:image` est **par build** —
   limite du site 100 % statique, détaillée §2 dernier point.
