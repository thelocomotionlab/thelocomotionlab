# Revue intégrale 2026-07 — constats bruts

> Générés par la revue multi-agents du 2026-07-13 (10 relecteurs / 13 ; docs, twin-tools-seed et infra-ci n'ont pas pu tourner — limite de session).
> ⚠️ **Aucun constat n'a encore passé la contre-vérification adversariale** (interrompue par la limite de session). Chaque constat doit être re-vérifié par grep/lecture avant application.


## apps/site — pages, lib, markdown, configs

**Résumé du relecteur** : L'app site (Next.js App Router, JS) est globalement saine et cohérente : lib/contentRoutes.mjs est bien la source unique consommée par les pages, sitemap, llms.txt, search-index et legacyRedirects ; les redirections legacy, la collision de slugs et les routes API fonctionnent comme documenté, et les 21 tests vitest passent. Les défauts relevés sont surtout du code mort et de l'hygiène : environ 11 dépendances de package.json jamais importées (dont puppeteer et framer-motion), deux exports morts dans lib/getRecentActivity.js, un bloc de config `embed`/`nextDeparture` majoritairement mort dans lib/liveConfig.js avec commentaire trompeur, un fichier parasite `log.test` (sortie systemctl) commité, et des incohérences docs↔code (CLAUDE.md mentionne encore « manifeste » et ignore services/live-journal ; .env.example n'énumère pas deux variables NEXT_PUBLIC_ réellement lues). Aucun bug d'affichage n'a été identifié ; tous les correctifs proposés sont neutres pour le HTML rendu, sauf un signalement (getRelatedArticles mélange articles et récits) explicitement marqué display_risk.

### C001 — [medium/doc-obsolete] `CLAUDE.md` (l.32)
- **Défaut** : L'arborescence de CLAUDE.md décrit un état dépassé : la page « manifeste » a été renommée /quete (avec redirection 308 /manifeste → /quete), le service services/live-journal n'apparaît pas dans l'arbre services/, et la redirection /labo est attribuée à lib/legacyRedirects.mjs alors qu'elle est codée en dur dans next.config.mjs.
- **Preuve** : CLAUDE.md liste « manifeste, outils/twin (teaser), live (hub direct)… /labo → 301 (générées au build, lib/legacyRedirects.mjs) » ; or app/quete/page.jsx existe (pas de app/manifeste), next.config.mjs:123-126 porte les règles /labo et /manifeste en dur (permanent:true = 308), et `ls services/` = email-gateway, live-journal, tracking-cache, twin-engine (live-journal absent de CLAUDE.md mais présent dans docs/live-brief.md et le runbook).
- **Action proposée** : Mettre à jour CLAUDE.md : remplacer « manifeste » par « quete (ex-manifeste, 308) », ajouter services/live-journal à l'arbre, préciser que /labo et /manifeste sont des règles en dur de next.config.mjs (308).
- **Statut** : ✅ contre-vérifié et appliqué (commit ff1b4fd)

### C002 — [medium/doc-obsolete] `apps/site/lib/liveConfig.js` (l.60)
- **Défaut** : Le commentaire du bloc `embed` (« Encore utilisé par LiveStatusBlock (title) ») est faux — LiveStatusBlock n'est monté nulle part ; le vrai consommateur d'embed.title est ExplorerLiveIndicator, et les 6 autres champs d'embed plus nextDeparture.{nom,dates,distance,denivele} sont morts.
- **Preuve** : grep "liveConfig.embed" → LiveStatusBlock.jsx:33 (composant jamais importé : grep `from ".*LiveStatusBlock"` = 0) et ExplorerLiveIndicator.jsx:53 (embed.title uniquement). totalDistanceKm/elevationMin/elevationMax/referenceGpx/pollIntervalMs/initialMapStyle du bloc embed : 0 lecture. nextDeparture.nom/dates/distance/denivele : 0 lecture (LiveAvant lit aventure.*) ; shortLabel lu uniquement par le LiveStatusBlock orphelin.
- **Action proposée** : Corriger le commentaire (consommateur réel = ExplorerLiveIndicator) ; proposer la suppression des champs morts d'embed et de nextDeparture après décision sur le sort de LiveStatusBlock.
- **Statut** : ✅ partiellement appliqué — e5059c8 (commentaire corrigé ; suppression des champs morts d'embed/nextDeparture : en attente de validation)

### C003 — [medium/cleanup] `apps/site/log.test` (l.1)
- **Défaut** : Fichier parasite commité à la racine de l'app : la sortie brute de `systemctl list-unit-files` d'une machine Ubuntu (69 lignes de services système), sans aucun rapport avec le site.
- **Preuve** : Contenu = « UNIT FILE STATE PRESET / accounts-daemon.service enabled… 65 unit files listed. » ; `git ls-files` confirme qu'il est tracké (commit aac5c4b). Aucune référence à « log.test » ailleurs dans le repo.
- **Action proposée** : Supprimer le fichier (opération destructive → à valider par Valentin avant commit).
- **Statut** : ✅ contre-vérifié et appliqué (commit 881acc6)

### C004 — [medium/dead-code] `apps/site/package.json` (l.18)
- **Défaut** : Huit dépendances runtime déclarées ne sont jamais importées par le code du site : emailjs-com, framer-motion, markdown-it, marked, proj4, proj4leaflet, remark-breaks, et recharts (fourni par packages/tracking qui le déclare dans ses propres dependencies).
- **Preuve** : grep "from|require|import" sur app/, components/, lib/, markdown/, scripts/ → 0 occurrence pour chacun (emailjs-com:0, framer-motion:0, markdown-it:0, marked:0, proj4:0, proj4leaflet:0, remark-breaks:0, recharts:0). recharts n'est consommé que par packages/tracking/src/*.tsx, et packages/tracking/package.json le déclare déjà (ligne 16). docs/secrets.md confirme qu'EmailJS est débranché (« Si un envoi direct est réactivé… ») ; EmailCapture.jsx utilise fetch() vers un Worker, pas emailjs.
- **Action proposée** : Supprimer ces 8 entrées de dependencies, puis vérifier `pnpm -F site build` + `pnpm -F site lint` avant merge.
- **Statut** : ✅ contre-vérifié et appliqué (commit 90062c2)

### C005 — [medium/dead-code] `apps/site/package.json` (l.56)
- **Défaut** : devDependencies inutilisées : puppeteer (télécharge Chromium à chaque install), autoprefixer (postcss.config.mjs ne référence que @tailwindcss/postcss) et baseline-browser-mapping (aucune référence directe).
- **Preuve** : grep repo entier hors node_modules : puppeteer 0 occurrence hors package.json ; autoprefixer 0 (postcss.config.mjs: plugins: ["@tailwindcss/postcss"]) ; baseline-browser-mapping 0. Aucun script ne les invoque (scripts = dev/build/start/lint/deploy:cf/test/build:track).
- **Action proposée** : Supprimer puppeteer et autoprefixer ; pour baseline-browser-mapping, vérifier d'abord qu'il n'a pas été ajouté pour rafraîchir les données browserslist du build (retirer puis rebuild pour confirmer l'absence de warning).
- **Statut** : ✅ contre-vérifié et appliqué (commit 90062c2)

### C006 — [low/doc-obsolete] `apps/site/.env.example` (l.17)
- **Défaut** : Le modèle .env.example ne documente pas deux variables NEXT_PUBLIC_ réellement lues par le code : NEXT_PUBLIC_LIVE_STATUT (bascule d'état /live) et NEXT_PUBLIC_JOURNAL_API (base API du journal).
- **Preuve** : lib/liveConfig.js:26 `process.env.NEXT_PUBLIC_LIVE_STATUT || "avant"` (le commentaire dit « Surchargeable au build ») et :77-78 `process.env.NEXT_PUBLIC_JOURNAL_API || "https://api.thelocomotionlab.com"`. .env.example ne liste que NEXT_PUBLIC_TRACKING_PROXY et NEXT_PUBLIC_EMAIL_ENDPOINT.
- **Action proposée** : Ajouter les deux variables (avec leurs valeurs par défaut et leur rôle) à .env.example.
- **Statut** : ✅ contre-vérifié et appliqué (commit e5059c8)

### C007 — [low/dead-code] `apps/site/app/globals.css` (l.203)
- **Défaut** : Classe CSS `.pulse-slow` définie mais utilisée nulle part ; `.pulse-fast` n'est utilisée que par components/LiveStatusBlock.jsx, lui-même jamais monté.
- **Preuve** : grep pulse-slow hors globals.css : 0 occurrence dans app/, components/, lib/, markdown/, public/*.md. pulse-fast : 1 occurrence, LiveStatusBlock.jsx:26 (composant orphelin, aucun import).
- **Action proposée** : Supprimer `.pulse-slow` ; garder `.pulse-fast` tant que le sort de LiveStatusBlock n'est pas tranché.
- **Statut** : ✅ contre-vérifié et appliqué (commit e5059c8)

### C008 — [low/dead-code] `apps/site/app/labo/page.jsx` (l.10)
- **Défaut** : La page /labo coexiste avec la redirection next.config.mjs (/labo → /quete) et est donc inatteignable : les redirects() Next sont évalués AVANT le système de fichiers.
- **Preuve** : next.config.mjs:123 `{ source: "/labo", destination: "/quete", permanent: true }` + app/labo/page.jsx qui fait `redirect("/quete")`. Le header du fichier documente le choix : « ce composant n'est normalement plus atteignable, mais le fichier est conservé (règle : pas de suppression) et redirige en ceinture-bretelles ».
- **Action proposée** : Signalement seul : redondance volontaire et documentée, inoffensive. À supprimer seulement si la règle « pas de suppression » est levée par Valentin.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C009 — [low/refactor] `apps/site/app/layout.js` (l.16)
- **Défaut** : L'URL canonique "https://thelocomotionlab.com" est codée en dur dans au moins 9 fichiers au lieu d'une constante partagée.
- **Preuve** : grep : app/layout.js:16 (metadataBase), app/sitemap.js:12, app/llms.txt/route.js:15, app/comprendre/[slug]/page.jsx:16, app/explorer/[slug]/page.jsx:24, app/recherche/page.jsx:9, app/contact/page.jsx:4, app/robots.js:29-30, plus les blocs metadata en littéral de quete/about/outils/live/soutenir/mentions-legales.
- **Action proposée** : Signalement seul : centraliser dans un lib/siteConfig si souhaité — le résultat rendu serait identique, mais c'est un diff large à faire hors de cette passe.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C010 — [low/inconsistency] `apps/site/app/live/page.jsx` (l.24)
- **Défaut** : La description metadata de /live code en dur « Tour des Écrins en autonomie, 20–24 août 2026 », dupliquant liveConfig (nextDeparture/aventure) : au changement d'aventure, la meta restera périmée si on ne pense pas à l'éditer.
- **Preuve** : app/live/page.jsx:23-24 vs lib/liveConfig.js:14-17 (nom: "Tour des Écrins en autonomie", dates: "20–24 août 2026") — même donnée en deux endroits alors que liveConfig se présente comme « LE seul endroit à éditer quand une nouvelle aventure se prépare ».
- **Action proposée** : Composer la description depuis liveConfig (`${aventure.nom}, ${aventure.dates}`) — sortie strictement identique aujourd'hui ; à défaut, ajouter la meta de /live à la checklist du runbook.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C011 — [low/dead-code] `apps/site/app/quete/page.jsx` (l.2)
- **Défaut** : Import `Link` de next/link inutilisé : sa seule utilisation est dans le bloc JSX « Par où commencer » entièrement commenté (lignes 125-152).
- **Preuve** : Ligne 2 `import Link from "next/link";` ; les seuls `<Link` du fichier sont à l'intérieur de `{/* <section> … </section> */}`, donc jamais évalués.
- **Action proposée** : Supprimer l'import (ou le déplacer en commentaire à côté du bloc), sans toucher au bloc commenté qui semble être une réserve éditoriale.
- **Statut** : ✅ contre-vérifié et appliqué (commit e5059c8)

### C012 — [low/cleanup] `apps/site/app/recherche/SearchClient.jsx` (l.133)
- **Défaut** : Le filtre de compatibilité `i.type === "project"` (« ancien index encore en cache navigateur pendant la bascule ») est un shim de transition probablement expirable : le cache de /search-index.json est max-age=300 + SWR 1 jour, et la refonte date de plusieurs mois.
- **Preuve** : SearchClient.jsx:131-134 avec le commentaire « "project" = ancien index encore en cache navigateur pendant la bascule » ; app/search-index.json/route.js:16 `Cache-Control: public, max-age=300, stale-while-revalidate=86400` ; buildSearchIndex n'émet plus que article|recit|projet.
- **Action proposée** : Retirer le `|| i.type === "project"` lors d'un prochain passage (aucun index en circulation ne peut plus contenir "project").
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C013 — [low/dead-code] `apps/site/lib/getRecentActivity.js` (l.178)
- **Défaut** : Les exports getRecentActivity() (ligne 178) et formatRelativeDays() (ligne 198) ne sont importés par aucun fichier du repo.
- **Preuve** : grep -rn "getRecentActivity\|formatRelativeDays" hors node_modules : seuls getRelated.js et carouselItems.js importent ce module, et uniquement getRecentArticles/getRecentProjects/getRecentExplorer. Le docstring de getRecentActivity l'assume : « Utilisé si un jour tu veux un journal global du Labo ». Le composant components/RecentActivity.jsx est lui-même orphelin (aucun import trouvé).
- **Action proposée** : Supprimer les deux exports morts (et signaler l'orphelin components/RecentActivity.jsx à l'agent en charge des composants).
- **Statut** : ✅ contre-vérifié et appliqué (commit e5059c8)

### C014 — [low/cleanup] `apps/site/lib/getRecentActivity.js` (l.145)
- **Défaut** : Dans sortMixedActivity, le tie-breaker aSecond/bSecond utilise un ternaire dont les deux branches sont identiques (a.updatedAt dans les deux cas).
- **Preuve** : Lignes 146-155 : `a.type === "Carnet" ? a.updatedAt?.getTime?.() ?? 0 : a.updatedAt?.getTime?.() ?? 0` — copier-coller, les deux branches sont le même code.
- **Action proposée** : Simplifier en `const aSecond = a.updatedAt?.getTime?.() ?? 0;` (strictement iso-comportement).
- **Statut** : ✅ contre-vérifié et appliqué (commit e5059c8)

### C015 — [low/inconsistency] `apps/site/lib/getRelated.js` (l.26) ⚠️ **risque affichage**
- **Défaut** : getRelatedArticles puise dans readPublishedArticles qui mélange articles (type "article") ET récits (type "recit") sous le label hérité "Carnet" : la section « related » d'un article Comprendre peut pointer vers des récits /explorer et inversement.
- **Preuve** : lib/getRecentActivity.js:68-71 : readPublishedArticles = listArticleEntries().filter(published) sans filtre de kind, mappé type "Carnet". getRelatedArticles est appelé par /comprendre/[slug] ET /explorer/[slug] (récits). Actuellement tous les publiés de public/articles sont des récits, donc l'effet est invisible sur Comprendre — il apparaîtra à la première publication d'un vrai article.
- **Action proposée** : Signalement seul : si le mélange n'est pas voulu, filtrer par kind dans getRelated — mais cela CHANGERAIT les listes « Derniers articles » rendues, donc décision éditoriale à prendre avant tout fix.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C016 — [low/dead-code] `apps/site/next.config.mjs` (l.60)
- **Défaut** : optimizePackageImports liste "framer-motion" qui n'est importé nulle part dans le repo (apps comme packages).
- **Preuve** : grep -rn "framer-motion" hors node_modules : seules occurrences = apps/site/package.json:19 et next.config.mjs:60. Aucun import dans apps/site, packages/ui, packages/tracking.
- **Action proposée** : Retirer "framer-motion" du tableau optimizePackageImports en même temps que la dépendance (cf. finding package.json).
- **Statut** : ✅ contre-vérifié et appliqué (commit 90062c2)

### C017 — [low/cleanup] `apps/site/notes_pratiques.txt` (l.14)
- **Défaut** : Notes personnelles commitées à la racine de l'app, incluant une ancienne conf nginx/Traccar du VPS — en contradiction avec la règle CLAUDE.md « tout ce qui définit l'état du VPS vit dans infra/ » (aucun secret en clair toutefois : le token est un placeholder ${TRACCAR_API_TOKEN}).
- **Preuve** : Lignes 14-69 : bloc `server { listen 443 ssl; server_name tracking.thelocomotionlab.com; … proxy_set_header Authorization "Bearer ${TRACCAR_API_TOKEN}"; }` précédé de conventions d'images. L'infra actuelle utilise Caddy (infra/), pas nginx : contenu doublement périmé.
- **Action proposée** : Déplacer les conventions d'images vers docs/ si utiles, supprimer la conf nginx périmée (validation Valentin avant suppression).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C018 — [low/inconsistency] `apps/site/package.json` (l.54)
- **Défaut** : gray-matter est rangé en devDependencies alors qu'il est importé par lib/contentRoutes.mjs, code exécuté par les pages, le sitemap et next.config.mjs au build.
- **Preuve** : lib/contentRoutes.mjs ligne 17 : `import matter from "gray-matter";` — module consommé par app/page.js, app/sitemap.js, app/llms.txt/route.js, next.config.mjs. Ça fonctionne car le build installe les devDeps, mais sémantiquement c'est une dépendance de build/prod.
- **Action proposée** : Déplacer gray-matter de devDependencies vers dependencies.
- **Statut** : ✅ contre-vérifié et appliqué (commit 90062c2)

### C019 — [low/inconsistency] `apps/site/package.json` (l.53)
- **Défaut** : eslint-config-next est épinglé en 16.0.3 (sans caret) alors que next est en ^16.1.1 : léger décalage de versions entre le framework et sa config lint.
- **Preuve** : package.json:25 `"next": "^16.1.1"` vs :53 `"eslint-config-next": "16.0.3"`.
- **Action proposée** : Aligner eslint-config-next sur la version de next (^16.1.1) lors d'une mise à jour de deps, puis relancer `pnpm -F site lint`.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C020 — [low/refactor] `apps/site/scripts/build-reference-track.mjs` (l.20)
- **Défaut** : Duplication documentée de l'algorithme Douglas-Peucker de lib/simplify.js (copie assumée : « Toute évolution de l'algorithme se fait LÀ-BAS d'abord, puis se recopie ici »).
- **Preuve** : Lignes 20-57 = copie octet-près de perpendicularDistance/simplifyTrack de lib/simplify.js (vérifié par lecture des deux fichiers). Motif invoqué : « le site est en CommonJS par défaut : un .mjs ne peut pas importer ce .js ESM directement » — package.json du site sans "type":"module", donc le motif tient pour les vieux Node (la détection de syntaxe ESM des Node récents le rendrait importable).
- **Action proposée** : Signalement seul : la duplication est consciente et testée (lib/simplify.test.js). Une unification (renommer lib/simplify.js en .mjs ou importer avec la détection ESM de Node ≥22) est possible mais toucherait les imports @/lib/simplify des composants.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C021 — [low/dead-code] `apps/site/tailwind.config.mjs` (l.8)
- **Défaut** : Fichier de config Tailwind jamais chargé : en v4 il faudrait une directive `@config` dans globals.css, qui n'existe pas — le fichier le documente lui-même comme comportement historique préservé.
- **Preuve** : Commentaire du fichier : « ce fichier n'est chargé que si globals.css le référence via @config. Le site ne le fait pas ». grep "@config" dans app/globals.css : 0 occurrence.
- **Action proposée** : Signalement seul : conservation volontaire (modèle pour les futures apps). Surtout NE PAS ajouter @config — cela injecterait le plugin typography et changerait le rendu .prose.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté


## apps/site — components + globals.css

**Résumé du relecteur** : Le sous-système components/ + globals.css d'apps/site est globalement sain et bien commenté, mais porte les cicatrices de la refonte 2026 : quatre composants entiers sont morts (LiveStatusBlock, ProjectsGrid, RecentActivity, le réexport NewsletterSignup) avec leurs classes CSS orphelines (.pulse-slow/.pulse-fast/.no-scrollbar), et sept dépendances de package.json ne sont plus importées. Deux bugs réels mais à impact limité ont été confirmés : le protocole [[MD_CAPTION|…]] émis par les plugins remark n'a plus aucun consommateur dans ProjetBody (latent, masqué par le format multi-lignes des directives publiées) et MapEmbed fuit des écouteurs 'load' à chaque resize ; s'y ajoutent un flash visuel du ShareButton (conflit opacity-0/animate-fade-in non-layeré) et une promesse MathJax potentiellement bloquante dans Plot. Côté charte, les composants live dupliquent en dur les hex des tokens de packages/ui, et la règle h1-h6 en var(--font-heading) reproduit vraisemblablement le piège :root documenté dans theme.css (inopérante mais masquée). Aucun changement n'a été appliqué : chaque fix proposé est classé selon son risque d'altérer l'affichage, les suppressions de code mort étant les seules actions strictement neutres.

### C022 — [medium/dead-code] `apps/site/components/LiveStatusBlock.jsx` (l.14)
- **Défaut** : LiveStatusBlock n'est importé nulle part : son rôle (bloc live en tête de /explorer) est assuré par ExplorerLiveIndicator via ExplorerSections.
- **Preuve** : grep repo-wide 'LiveStatusBlock' → seulement sa propre définition + 2 commentaires (ExplorerLiveIndicator.jsx:5, lib/liveConfig.js:61). /explorer (app/explorer/page.jsx) importe ExplorerSections qui rend ExplorerLiveIndicator, pas LiveStatusBlock. Note : le commentaire liveConfig.js:61 « Encore utilisé par LiveStatusBlock (title) » est doublement trompeur — LiveStatusBlock est mort ET ExplorerLiveIndicator.jsx:53 consomme aussi liveConfig.embed.title.
- **Action proposée** : Supprimer le fichier (après validation) et corriger le commentaire de lib/liveConfig.js pour pointer ExplorerLiveIndicator comme consommateur de embed.title.
- **Statut** : ✅ contre-vérifié et appliqué (commit e5059c8)

### C023 — [medium/dead-code] `apps/site/components/ProjectsGrid.jsx` (l.32)
- **Défaut** : ProjectsGrid n'est importé nulle part et pointe encore vers les routes legacy /projets/<slug> (désormais des 301).
- **Preuve** : grep repo-wide 'ProjectsGrid' → seulement sa définition et docs/archive/refonte-brief.md (doc archivée). Ligne 85 : href={`/projets/${p.slug}`} alors que CLAUDE.md indique que /projets → 301. Son rôle est repris par ExplorerSections (importé par app/explorer/page.jsx).
- **Action proposée** : Supprimer le fichier (après validation).
- **Statut** : ✅ contre-vérifié et appliqué (commit e5059c8)

### C024 — [medium/bug] `apps/site/components/ProjetBody.jsx` (l.198) ⚠️ **risque affichage**
- **Défaut** : Le marqueur [[MD_CAPTION|…]] émis par remarkLiveTracking et remarkPostLiveTracking n'a AUCUN consommateur : quand il se déclenche, le texte brut du marqueur s'affiche littéralement sur la page.
- **Preuve** : grep 'MD_CAPTION' → seulement les 2 émetteurs (markdown/remarkLiveTracking.js:96, remarkPostLiveTracking.js:89, dont le commentaire ligne 34 dit « que ReactMarkdown saura convertir dans ProjetClient » — composant qui n'existe plus). Le renderer p de ProjetBody gère LIVE_TRACKING_BLOCK, POST_LIVE_TRACKING_BLOCK, PLOT_BLOCK mais pas MD_CAPTION. Actuellement masqué : toutes les directives publiées (ex. public/projets/traversee-reunion.md:341) sont multi-lignes → parsées comme HTML inline (le tag incomplet en 1re ligne ne satisfait pas le bloc HTML CommonMark type 7), donc parent.children[index+1] n'est jamais le paragraphe-légende. Une directive sur UNE ligne suivie d'une légende italique afficherait « [[MD_CAPTION|…]] » en clair.
- **Action proposée** : Décision à prendre : soit implémenter le cas [[MD_CAPTION| dans le renderer p de ProjetBody (rendre <p class="md-caption"><em>…), soit retirer l'émission dans les deux plugins remark (le chemin case 5 « em only » couvre déjà les légendes). Ne rien changer sans tester sur le contenu publié.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C025 — [medium/dead-code] `apps/site/components/RecentActivity.jsx` (l.50)
- **Défaut** : RecentActivity (carrousel de cartes) n'est importé par aucune page ni aucun composant.
- **Preuve** : grep repo-wide 'RecentActivity' → seulement sa définition, docs/archive/* (docs archivées) et lib/getRecentActivity.js (lib homonyme, importée par getRelated.js et carouselItems.js — indépendante du composant). Les carrousels actuels sont ExplorerCarousel (accueil, /live). Il duplique aussi parseFrenchDate/pickLastNotes avec ProjectsGrid, lui aussi mort.
- **Action proposée** : Supprimer le fichier (après validation). Attention à ne PAS toucher lib/getRecentActivity.js qui, lui, est vivant.
- **Statut** : ✅ contre-vérifié et appliqué (commit e5059c8)

### C026 — [medium/inconsistency] `apps/site/components/SoutenirSection.jsx` (l.17) ⚠️ **risque affichage**
- **Défaut** : SoutenirSection duplique le flux de capture email au lieu d'utiliser EmailCapture : endpoint legacy codé en dur, pas de honeypot, pas de champ source, pas de bascule NEXT_PUBLIC_EMAIL_ENDPOINT (double opt-in) — contredit l'en-tête d'EmailCapture (« formulaire de capture email unique du site »).
- **Preuve** : SoutenirSection.jsx:18 fetch('https://send-email.thelocomotionlab.workers.dev/') codé en dur ; pas de champ website (honeypot) ni de source, message de succès de l'ancien flux (lignes 114-121). EmailCapture.jsx:19-23 gère LEGACY_ENDPOINT vs gateway et envoie {email, source, website}. Une bascule d'env vers la passerelle laisserait /soutenir sur l'ancien Worker, sans double opt-in.
- **Action proposée** : Signalement : remplacer le formulaire inline par <EmailCapture source="soutenir" …> — mais cela change le HTML rendu et les textes d'état, donc à valider visuellement.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C027 — [low/dead-code] `apps/site/app/globals.css` (l.203)
- **Défaut** : Classes CSS orphelines : .pulse-slow n'est utilisée nulle part ; .pulse-fast et .no-scrollbar ne sont utilisées QUE par des composants eux-mêmes morts.
- **Preuve** : grep repo-wide : '.pulse-slow' → 0 usage hors définition (globals.css:203) ; 'pulse-fast' → uniquement LiveStatusBlock.jsx:26 (composant mort) ; 'no-scrollbar' → uniquement RecentActivity.jsx:172 (composant mort). .ll-vscroll / .ll-vscroll-md-none sont vivants (page.js:161, ExplorerCarousel.jsx:122).
- **Action proposée** : Supprimer .pulse-slow immédiatement ; supprimer .pulse-fast et .no-scrollbar en même temps que LiveStatusBlock et RecentActivity.
- **Statut** : ✅ contre-vérifié et appliqué (commit e5059c8)

### C028 — [low/inconsistency] `apps/site/app/globals.css` (l.80) ⚠️ **risque affichage**
- **Défaut** : La règle @layer base h1-h6 { font-family: var(--font-heading) } tombe très probablement dans le piège documenté par theme.css lui-même (var(--font-ubuntu) irrésoluble au niveau :root) → règle silencieusement inopérante, masquée parce que le body est déjà en Ubuntu.
- **Preuve** : packages/ui/src/styles/theme.css:61-67 explique que --font-heading est en @theme inline PRÉCISÉMENT parce que « Un @theme classique résout var(--font-ubuntu) SUR :root, où elle n'existe pas → token invalide » (next/font pose --font-ubuntu sur <body>, layout.js:51). Consommer var(--font-heading) en CSS brut reproduit ce problème. Incohérence interne : .prose h1-h6 (globals.css:217) contourne, lui, en dupliquant la définition du token (`var(--font-ubuntu), ui-sans-serif, system-ui`) hors de packages/ui.
- **Action proposée** : Signalement seul : vérifier dans le CSS compilé si var(--font-heading) se résout ; si non, aligner les deux règles sur la même stratégie (chaîne var(--font-ubuntu)… partout, ou utilitaire font-heading). Ne pas toucher sans contrôle visuel — la typo des titres est concernée.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C029 — [low/inconsistency] `apps/site/app/globals.css` (l.431) ⚠️ **risque affichage**
- **Défaut** : remarkSplit émet des classes dédiées (.md-split-caption, .md-split--caption-left/right) qu'aucun CSS ne consomme ; globals.css cible les légendes de split via le sélecteur fragile p:last-child:has(> em):not(:has(> img)) à la place.
- **Preuve** : grep 'md-split-caption|md-split--caption' → uniquement markdown/remarkSplit.js (lignes 165, 188, 191) ; globals.css:287-296 et 347-352 utilisent `.md-split.md-split--with-caption .md-split-col p:last-child:has(> em):not(:has(> img))` alors que la classe .md-split-caption est posée exactement sur ce paragraphe.
- **Action proposée** : Signalement seul : soit simplifier les sélecteurs CSS vers p.md-split-caption (à iso-rendu, à vérifier), soit cesser d'émettre les classes inutilisées dans remarkSplit. Tout changement de sélecteur doit être validé visuellement sur les articles avec :::split.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C030 — [low/dead-code] `apps/site/components/Citation.jsx` (l.32)
- **Défaut** : La classe `citation-ref` posée sur le <sup> des citations n'a aucune règle CSS associée dans tout le repo.
- **Preuve** : grep repo-wide 'citation-ref' → une seule occurrence : Citation.jsx:32 <sup className="citation-ref">. Aucune définition dans globals.css ni ailleurs (le style effectif vient de `.prose sup`, globals.css:129).
- **Action proposée** : Signalement seul : soit retirer la classe (change l'attribut class du DOM, pas le rendu), soit la conserver comme hook sémantique documenté.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C031 — [low/cleanup] `apps/site/components/ContactForm.jsx` (l.100)
- **Défaut** : URL du Worker d'envoi codée en dur (https://send-email.thelocomotionlab.workers.dev/) au lieu de passer par une variable d'environnement comme le fait EmailCapture.
- **Preuve** : ContactForm.jsx:99-101 fetch("https://send-email.thelocomotionlab.workers.dev/"…) ; EmailCapture.jsx:20 utilise process.env.NEXT_PUBLIC_EMAIL_ENDPOINT || LEGACY_ENDPOINT. Les couleurs #EFB159 dans le HTML d'email (lignes 85-94) sont acceptables (les emails ne peuvent pas consommer les tokens CSS).
- **Action proposée** : Introduire une constante/env (défaut = URL actuelle) pour aligner sur EmailCapture. Aucun changement de rendu.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C032 — [low/bug] `apps/site/components/MapEmbed.jsx` (l.116)
- **Défaut** : Fuite d'écouteurs : la fonction de cleanup retournée par syncHeight() (removeEventListener 'load' sur l'image sœur) est jetée — syncHeight étant aussi le handler resize, un NOUVEAU listener 'load' est ajouté à chaque resize et jamais retiré.
- **Preuve** : Dans l'effet lignes 90-127 : `siblingImg.addEventListener("load", setHeight); return () => siblingImg.removeEventListener(...)` — ce return est celui de la fonction interne syncHeight, pas de l'effet. Les deux appels (`syncHeight();` ligne 124 et `window.addEventListener("resize", syncHeight)` ligne 125) ignorent la valeur de retour ; le cleanup de l'effet ne retire que le listener resize. Chaque resize crée une nouvelle closure setHeight attachée à l'image.
- **Action proposée** : Restructurer l'effet pour attacher le listener 'load' une seule fois et le retirer dans le cleanup de l'effet. Comportement visuel inchangé (les listeners dupliqués posent tous la même hauteur).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C033 — [low/cleanup] `apps/site/components/MapEmbed.jsx` (l.204)
- **Défaut** : Couleur de trace "#FF3B3B" dupliquée dans deux effets (chargement GPX et re-pose après changement de style) au lieu d'une constante module.
- **Preuve** : `const color = "#FF3B3B";` apparaît à la ligne 204 (effet loadGPX) et à la ligne 256 (effet setStyle) — une divergence future entre les deux passerait inaperçue.
- **Action proposée** : Hisser en constante module (TRACK_COLOR) à valeur identique. Zéro changement de rendu.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C034 — [low/cleanup] `apps/site/components/Navbar.jsx` (l.22)
- **Défaut** : Feature flag résolu : SHOW_OUTILS = true depuis la PR2, la mécanique hidden/filter de NAV_ITEMS est du code mort.
- **Preuve** : Navbar.jsx:20-22 : « Menu Outils livré masqué en PR1, activé en PR2 » + const SHOW_OUTILS = true ; ligne 32 hidden: !SHOW_OUTILS (toujours false) ; ligne 46 .filter((item) => !item.hidden) ne filtre plus rien.
- **Action proposée** : Supprimer le flag, la propriété hidden et le .filter — NAV_ITEMS reste strictement identique, zéro changement de HTML rendu.
- **Statut** : ✅ contre-vérifié et appliqué (commit e5059c8)

### C035 — [low/dead-code] `apps/site/components/NewsletterSignup.jsx` (l.5)
- **Défaut** : Le réexport de compatibilité NewsletterSignup → EmailCapture n'a plus aucun importeur.
- **Preuve** : grep repo-wide 'NewsletterSignup' → seulement le fichier lui-même, le commentaire d'EmailCapture.jsx:3 et docs/archive/* . Toutes les pages importent directement @/components/EmailCapture (quete, comprendre, outils/twin, page.js).
- **Action proposée** : Supprimer le fichier (après validation) — la période de compatibilité est terminée.
- **Statut** : ✅ contre-vérifié et appliqué (commit e5059c8)

### C036 — [low/bug] `apps/site/components/Plot.jsx` (l.32)
- **Défaut** : ensureMathJax : si le script MathJax existe déjà mais a échoué (ou est déjà chargé sans exposer MathJax.Hub), la promesse n'est jamais résolue — Promise.all bloque et le graphique ne se rend jamais (même sans TeX).
- **Preuve** : Lignes 32-36 : `const existing = document.getElementById(MATHJAX_SCRIPT_ID); if (existing) { existing.addEventListener("load", …) ; return; }` — pas d'écouteur 'error', et si l'événement load a déjà eu lieu, il ne se redéclenchera pas → resolve jamais appelé. Lignes 177-184 : Plotly.newPlot n'est appelé qu'après Promise.all([..., ensureMathJax()]). Scénario : CDN MathJax bloqué, deux blocs <plot> TeX sur la page → le second reste vide définitivement.
- **Action proposée** : Ajouter l'écouteur 'error' et un test « déjà chargé » (window.MathJax?.Hub) dans la branche existing. Rendu nominal inchangé ; seul le cas réseau dégradé s'améliore.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C037 — [low/doc-obsolete] `apps/site/components/PlotLazy.jsx` (l.4)
- **Défaut** : Le commentaire affirme qu'un bloc <plot> peut être présent « dans un article ou un projet », mais seul le pipeline projets (ProjetBody) inclut remarkPlot — les articles (ArticleBody) ne supportent pas <plot>.
- **Preuve** : PlotLazy.jsx:4 « quand un bloc <plot> est présent dans un article ou un projet » ; ArticleBody.jsx:112-122 remarkPlugins = [remarkGfm, remarkImageOptions, remarkFootnotes, remarkCitations, remarkDirective, remarkSplit, remarkMath] (pas de remarkPlot) ; ProjetBody.jsx:185 inclut remarkPlot. PlotLazy n'est importé que par ProjetBody.
- **Action proposée** : Corriger le commentaire (« dans un projet »). Zéro impact rendu.
- **Statut** : ✅ contre-vérifié et appliqué (commit e5059c8)

### C038 — [low/inconsistency] `apps/site/components/ProjetBody.jsx` (l.67) ⚠️ **risque affichage**
- **Défaut** : Deux compteurs de figures différents : ProjetBody numérote {{fig:nom}} en scannant le texte brut avec /<plot\b[^>]*>/gi (compte aussi les <plot> commentés ou dans des fences), tandis que remarkPlot numérote les nœuds mdast html — un <plot> commenté décalerait tous les liens {{fig:N}} par rapport aux ancres #fig-N réelles.
- **Preuve** : ProjetBody.jsx:67 `content.matchAll(/<plot\b[^>]*>/gi)` sur le markdown brut ; markdown/remarkPlot.js:21-27 `visit(tree,"html")` + startsWith("<plot") — un `<!-- <plot …> -->` est compté par le premier, pas par le second. Aujourd'hui inoffensif : un seul <plot> publié (public/projets/saison-trail-2026.md:304) et une seule référence {{fig:km-2026}} (ligne 302).
- **Action proposée** : Signalement seul : aligner les deux comptages (ex. exclure les commentaires HTML dans la regex) le jour où plusieurs plots coexistent ; aucun contenu actuel n'est affecté.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C039 — [low/bug] `apps/site/components/ShareButton.jsx` (l.137) ⚠️ **risque affichage**
- **Défaut** : Flash visuel au chargement : `.animate-fade-in { opacity: 1 }` (règle non-layerée de globals.css:605) écrase l'utilitaire layered `opacity-0`, et l'animationDelay de 0.3s n'a pas de fill backwards → le bouton est visible 0.3s, saute à opacity 0, puis re-fade-in.
- **Preuve** : ShareButton baseClasses contient `opacity-0 animate-fade-in` + style={{ animationDelay: "0.3s" }} (lignes 137/148). globals.css:605 : `.animate-fade-in { opacity: 1; animation: fade-in 0.35s ease-out forwards; }` — règle hors @layer, donc prioritaire sur l'utilitaire Tailwind `.opacity-0` (layer utilities). Sans `animation-fill-mode: backwards`, pendant le delay l'animation n'applique rien → opacity calculée = 1.
- **Action proposée** : Signalement : corriger (ex. fill-mode both, ou retirer opacity:1 de la classe) supprimerait un glitch mais CHANGE le comportement visible au chargement — à valider visuellement avant tout fix.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C040 — [low/cleanup] `apps/site/components/Tooltip.jsx` (l.61)
- **Défaut** : Classe Tailwind invalide `font-inherit` sur le bouton du tooltip : aucune règle CSS n'est générée (le preflight Tailwind pose déjà font: inherit sur button).
- **Preuve** : Tooltip.jsx:61 className="inline bg-transparent border-0 p-0 m-0 text-inherit font-inherit cursor-pointer" — `font-inherit` n'est ni une utilité font-family ni font-weight valide en Tailwind v4 ; grep repo : aucune définition custom. text-inherit, lui, est valide.
- **Action proposée** : Retirer la classe morte (aucun CSS associé → zéro changement de rendu).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C041 — [low/inconsistency] `apps/site/components/Tooltip.jsx` (l.50) ⚠️ **risque affichage**
- **Défaut** : HTML invalide : Citation rend un <a href="#ref-…"> comme enfant du <button> de Tooltip (contenu interactif imbriqué dans du contenu interactif) — problème de validité et d'accessibilité (double cible focusable/cliquable).
- **Preuve** : Citation.jsx:36-50 : <Tooltip entry={entry}><a href={`#ref-${id}`}…>…</a></Tooltip> ; Tooltip.jsx:50-64 enveloppe children dans <button type="button" onClick={toggle}>. Résultat DOM : <button><a href>…</a></button>, interdit par la spec HTML (l'anchor navigue ET le button toggle).
- **Action proposée** : Signalement seul : restructurer (ex. rendre le <a> porteur des handlers, ou role=button sur un <span>) modifierait le DOM rendu — à valider visuellement et au clavier.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C042 — [low/inconsistency] `apps/site/components/live/LiveMap.jsx` (l.137)
- **Défaut** : Les composants live dupliquent en dur les valeurs hex des tokens de packages/ui (#8CB9BD, #B67352, #EFB159, #9A6044, #6E9CA0, #D89A3D, #FEFBF6) : un changement de charte dans packages/ui ne se propagerait pas à ces endroits.
- **Preuve** : LiveMap.jsx MARKER_COLORS/TRACE_COLORS/halos #FEFBF6 (l.84-153) ; JournalCard.jsx dotColor #8CB9BD/#B67352/#EFB159 (l.19-23) ; ProfileCard.jsx strokes #9A6044/#D89A3D/#B67352/#FEFBF6 (l.82-103) ; FreshnessPill.jsx stroke #9A6044 (l.20) ; LiveTermine.jsx strokes #6E9CA0/#9A6044 (l.97,137) ; MessageCard.jsx stroke #6E9CA0 (l.147) ; AudioPlayer.jsx fill #FEFBF6 (l.110-115). Tous identiques aux tokens de packages/ui/src/styles/theme.css:11-28. CLAUDE.md : « La charte vient de packages/ui et de nulle part ailleurs ».
- **Action proposée** : Signalement : remplacer par var(--color-brand-*) (valide dans les attributs SVG et les styles inline/cssText) à valeur strictement identique. Rendu inchangé si fait à l'identique.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C043 — [low/cleanup] `apps/site/package.json` (l.18)
- **Défaut** : Sept dépendances déclarées ne sont importées nulle part dans le code du site : emailjs-com, framer-motion, marked, markdown-it, proj4, proj4leaflet, remark-breaks.
- **Preuve** : grep récursif sur app/, components/, lib/, markdown/, scripts/ (hors node_modules) : zéro import pour chacune ; framer-motion n'apparaît que dans next.config.mjs:60 (optimizePackageImports) sans aucun import réel. Découvert en vérifiant les dépendances des composants (MapEmbed→@tmcw/togeojson, Plot→plotly.js-dist-min : bien utilisées, elles).
- **Action proposée** : Retirer ces dépendances de package.json (et l'entrée framer-motion d'optimizePackageImports), puis vérifier `pnpm build` du site avant merge. Aucun impact sur le rendu.
- **Statut** : ✅ contre-vérifié et appliqué (commit 90062c2)


## packages/ui + apps/_template

**Résumé du relecteur** : packages/ui est sain et réellement partagé : les 3 composants (Button, Field, PageShell) sont consommés (ContactForm du site pour Button/Field, apps/_template pour PageShell), les polices auto-hébergées sont valides (magic wOF2 vérifié, pas de Geist nulle part) et les tokens @theme sont la source unique effective. Le point noir est la chaîne « preset Tailwind » : sans aucun @config dans le repo, tailwind-preset.js, apps/site/tailwind.config.mjs et la dépendance @tailwindcss/typography sont du code mort assumé par les commentaires mais jamais activé, pas même par le template censé montrer la voie. theme.css contient par ailleurs des tokens jamais consommés dont deux (--background-size-grid-*) ne peuvent structurellement plus fonctionner en Tailwind v4, et un token trompeur (--font-serif: "Ubuntu Serif", police inexistante, qui rend Georgia dans le Tooltip du site). apps/_template est conforme aux conventions (TS, charte ui, standalone Docker buildé par deploy-vps.yml) à un warning ESLint près ; les docs (manuel-monorepo.md, CLAUDE.md) décrivent en revanche un état légèrement décalé du code réel.

### C044 — [medium/inconsistency] `packages/ui/src/styles/theme.css` (l.71) ⚠️ **risque affichage**
- **Défaut** : Le token --font-serif pointe sur "Ubuntu Serif", une police qui n'existe pas (ni dans la famille Ubuntu ni chargée par fonts.ts), donc toute classe font-serif rend en réalité Georgia.
- **Preuve** : theme.css:71 `--font-serif: "Ubuntu Serif", Georgia, serif;`. fonts.ts ne déclare que Ubuntu, Lora et Ubuntu Mono (aucune @font-face "Ubuntu Serif" dans le repo). Unique consommateur : apps/site/components/Tooltip.jsx:72 (`font-serif`) → rendu effectif = Georgia. La charte définit pourtant Lora comme serif d'accent (token --font-lora séparé, CLAUDE.md « Ubuntu + Lora »).
- **Action proposée** : Signalement seul : décider si le rendu Georgia du Tooltip est voulu. Si oui, corriger la VALEUR est interdit (affichage) mais on peut ajouter un commentaire expliquant que le fallback Georgia est le rendu effectif ; si non, pointer le token vers var(--font-lora) — ce qui changerait la police du Tooltip.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C045 — [medium/dead-code] `packages/ui/src/tailwind-preset.js` (l.12)
- **Défaut** : La chaîne preset Tailwind est morte : aucun @config dans aucun CSS du repo, donc tailwind-preset.js, apps/site/tailwind.config.mjs et la dépendance @tailwindcss/typography ne sont jamais chargés par Tailwind v4.
- **Preuve** : grep '@config' sur tous les *.css → 0 résultat (la seule mention est le commentaire du preset lui-même). Seul importeur du preset : apps/site/tailwind.config.mjs:12, fichier que Tailwind v4 ne lit jamais sans @config (ses propres commentaires l.8-10 le confirment : « le plugin typography n'est pas injecté »). @tailwindcss/typography figure pourtant dans dependencies de packages/ui/package.json:16 (et devDeps du site:49). De plus apps/_template, censé être le modèle des futures apps, n'a ni tailwind.config.mjs ni @config — la raison d'être affichée du preset (« pour que les futures apps puissent l'activer ») n'est concrétisée nulle part.
- **Action proposée** : Décision à trancher : soit supprimer le vestige (tailwind-preset.js, l'export "./tailwind-preset" de packages/ui/package.json, apps/site/tailwind.config.mjs, la dépendance @tailwindcss/typography côté ui et site, + mise à jour CLAUDE.md:50) — CSS de sortie identique car le plugin n'a jamais été injecté ; soit le garder comme placeholder documenté. Ne PAS l'activer via @config (ça injecterait typography → changement de rendu).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C046 — [low/doc-obsolete] `CLAUDE.md` (l.38)
- **Défaut** : L'arborescence de CLAUDE.md liste apps/twin qui n'existe pas dans l'arbre de travail et omet apps/_template, pourtant central aux conventions et buildé par le workflow deploy-vps.
- **Preuve** : CLAUDE.md:38 « └─ twin/ # Locomotion Twin (Next + TS) » et lignes 39-46 (pages + api). `ls apps/` → uniquement `_template` et `site`. grep '_template' dans CLAUDE.md → 0 occurrence, alors que .github/workflows/deploy-vps.yml:10,34 build son image et que manuel-monorepo.md:225 en fait le point de départ des nouvelles apps. (Idem services/live-journal, présent sur disque et dans le workflow mais absent de l'arborescence CLAUDE.md.)
- **Action proposée** : Mettre à jour l'arborescence de CLAUDE.md : ajouter apps/_template (et services/live-journal), et marquer apps/twin comme « à venir » ou le retirer tant qu'il n'existe pas. Doc uniquement.
- **Statut** : ✅ contre-vérifié et appliqué (commit ff1b4fd)

### C047 — [low/cleanup] `apps/_template/postcss.config.mjs` (l.3)
- **Défaut** : Export default anonyme dans postcss.config.mjs → warning ESLint import/no-anonymous-default-export à chaque lint du template, alors que le site assigne d'abord une variable.
- **Preuve** : apps/_template/.turbo/turbo-lint.log : « postcss.config.mjs 3:1 warning Assign object to a variable before exporting as module default import/no-anonymous-default-export — 1 problem (0 errors, 1 warning) ». apps/site/postcss.config.mjs fait `const config = {...}; export default config;` sans warning.
- **Action proposée** : Aligner sur le site : `const config = { plugins: ["@tailwindcss/postcss"] }; export default config;`. Config de build, aucun impact sur le rendu.
- **Statut** : ✅ contre-vérifié et appliqué (commit 0298778)

### C048 — [low/doc-obsolete] `docs/manuel-monorepo.md` (l.240)
- **Défaut** : Le manuel décrit un import de polices (`import { ubuntu, lora }`) que le template n'utilise pas : apps/_template/app/layout.tsx importe `fontVariables`, et la charte inclut aussi ubuntuMono.
- **Preuve** : manuel-monorepo.md:240 : « app/layout.tsx | importe les polices de marque : import { ubuntu, lora } from "@locomotionlab/ui/fonts" ». Réalité : apps/_template/app/layout.tsx:3 `import { fontVariables } from "@locomotionlab/ui/fonts";` posé sur <body> (l.13). Le site (apps/site/app/layout.js:7) importe lui { ubuntu, lora, ubuntuMono }.
- **Action proposée** : Mettre à jour la ligne du tableau pour refléter fontVariables (et mentionner ubuntuMono). Doc uniquement, zéro impact rendu.
- **Statut** : ✅ contre-vérifié et appliqué (commit ff1b4fd)

### C049 — [low/inconsistency] `packages/ui/src/components/Button.tsx` (l.36)
- **Défaut** : L'API documentée « Pour les liens, passer as="a" » est inutilisable en TypeScript : ButtonProps n'expose que les props de <button> (pas de href) et la ref est figée en HTMLButtonElement.
- **Preuve** : Button.tsx:9 documente `as="a"` ; mais l.36-37 `ButtonProps = ButtonOwnProps & Omit<ComponentPropsWithoutRef<"button">, ...>` n'accepte pas href/target, et l.71 `ref as Ref<HTMLButtonElement>`. En TS strict `<Button as="a" href="…">` ne compile pas ; seul le site (JS) pourrait s'en servir. Aucun usage actuel de `as` : grep '<Button' → apps/_template/app/page.tsx:24-26 et apps/site/components/ContactForm.jsx:182, tous sans `as`.
- **Action proposée** : Signaler : soit retirer la mention as="a" du commentaire (aucun consommateur), soit typer le composant en polymorphe générique. Changement purement au niveau des types/commentaires, aucun HTML rendu modifié.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C050 — [low/inconsistency] `packages/ui/src/components/Button.tsx` (l.59) ⚠️ **risque affichage**
- **Défaut** : L'état loading déclare cursor-wait mais il est inatteignable sur un vrai <button> : loading force disabled (l.73), donc disabled:cursor-not-allowed (base, spécificité :disabled supérieure) gagne toujours.
- **Preuve** : l.57 base contient `disabled:cursor-not-allowed` (sélecteur .disabled\:cursor-not-allowed:disabled, spécificité 0-2-0) ; l.59-60 loading ajoute `cursor-wait` (0-1-0) ; l.73 `disabled={... disabled || loading ...}`. Vérifié par compilation Tailwind 4.3.1 que cursor-wait bat bien cursor-pointer dans l'ordre CSS, mais pas la variante :disabled. Usage réel concerné : ContactForm.jsx:182 (loading pendant l'envoi) → curseur affiché = not-allowed, jamais wait.
- **Action proposée** : Signalement seul : retirer cursor-wait serait neutre visuellement (il ne gagne jamais sur un <button>), mais « corriger » pour afficher réellement wait pendant le chargement changerait le curseur visible — à trancher côté design.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C051 — [low/cleanup] `packages/ui/src/fonts.ts` (l.18)
- **Défaut** : La graisse Ubuntu 300 (ubuntu-300-normal.woff2) est déclarée et servie alors qu'aucun code du repo ne demande la graisse 300 (aucun font-light, aucun font-weight:300).
- **Preuve** : grep repo entier (apps + packages, hors node_modules) : 'font-light' → 0 ; 'font-weight:\s*300' et 'fontWeight: 300' (toutes notations) → 0. fonts.ts:18 déclare pourtant `{ path: "./fonts/ubuntu-300-normal.woff2", weight: "300", ... }`, fichier committé dans packages/ui/src/fonts/.
- **Action proposée** : Signaler : retirer la déclaration (et le woff2) allégerait les pages sans changer le rendu puisque la graisse n'est jamais sélectionnée. Re-vérifier au moment du fix qu'aucun contenu markdown/prose n'introduit un 300 entre-temps.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C052 — [low/dead-code] `packages/ui/src/styles/theme.css` (l.55)
- **Défaut** : Les tokens --background-size-grid-sm/--background-size-grid-lg sont morts par construction : Tailwind v4 n'a pas de namespace --background-size-*, aucun utilitaire ne peut les consommer, et personne ne les référence.
- **Preuve** : Vérifié dans node_modules/.pnpm/tailwindcss@4.3.1/.../dist/lib.js : l'utilitaire bg-* ne résout que ["--color"] et ["--background-image"] ; aucune occurrence d'un namespace --background-size. grep repo entier (hors node_modules) 'grid-sm|grid-lg' → 0 usage hors theme.css. Le seul endroit qui règle un background-size (apps/site/app/page.js:295) utilise des valeurs arbitraires [background-size:28px_28px]/[background-size:32px_32px] qui ne correspondent même pas au token grid-sm (16px 16px).
- **Action proposée** : Suppression sûre des deux tokens (lignes 55-56) : seules deux variables :root inutilisées disparaissent du CSS émis, rendu strictement identique.
- **Statut** : ✅ contre-vérifié et appliqué (commit 0298778)

### C053 — [low/cleanup] `packages/ui/src/styles/theme.css` (l.22)
- **Défaut** : Quatre tokens @theme ne sont consommés nulle part dans le repo : --color-brand-paper, --color-brand-primary-light, --color-brand-deep-light et --background-image-lab-grid (seule la variante -blue est utilisée).
- **Preuve** : grep récursif repo entier (hors node_modules/.next/.git, toutes notations : classe utilitaire, var(--...), arbitrary values) : 'brand-paper' → 0, 'brand-primary-light' → 0, 'brand-deep-light' → 0, 'bg-lab-grid[^-]' → 0. L'unique usage grille est bg-lab-grid-blue (apps/site/app/page.js:295). À l'inverse brand-wash/brand-slate/brand-grid/shadow-card/shadow-cta/text-xxs sont bien utilisés (site + packages/tracking).
- **Action proposée** : Signaler : suppression possible sans effet visuel (variables :root émises mais jamais référencées), MAIS ces couleurs font partie de la palette de marque et sont peut-être une réserve intentionnelle — décision de Valentin, pas de suppression automatique.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté


## packages/tracking

**Résumé du relecteur** : packages/tracking est un package sain dans l'ensemble : le hook de données (useTrackingData), la normalisation replay et les deux composants carte compilent sans erreur (tsc --noEmit vérifié), le contrat de données est cohérent avec services/tracking-cache (duplication volontaire et documentée des types), et le seul consommateur réel est apps/site via deux adaptateurs lazy. Les défauts principaux sont : (1) l'attribut markdown totalDistance des replays est silencieusement inopérant (Replay ne parse pas les strings, contrairement à LiveTrackingMap, alors que la doc le documente) ; (2) un chapelet de code mort et de props fantômes (statsUrl jamais consommé, timer destructuré inutilisé, champs dupliqués de ComputedStats) ; (3) des commentaires mensongers sur un consommateur « apps/tracking » qui n'a jamais existé dans le repo ; (4) aucun script lint/typecheck ne couvre le package dans turbo/CI. S'y ajoutent des incohérences internes (bounds en spread dans Replay contre l'utilitaire anti-stack-overflow, gardes de chargement de style différents entre Live et Replay, couleurs de charte codées en dur dans Replay dont un #b66b47 qui n'est pas le token brand-deep). Aucun de ces points n'exige de changement urgent ; les corrections sûres (commentaires, code mort prouvé, script typecheck) sont sans risque d'affichage, le reste est signalé avec display_risk honnête.

### C054 — [medium/cleanup] `packages/tracking/package.json` (l.1)
- **Défaut** : Aucun script lint/typecheck : rien dans le repo ne compile ni ne linte le TypeScript de ce package.
- **Preuve** : package.json n'a AUCUN champ `scripts` → `turbo run lint/test/build` l'ignorent ; le tsconfig.json (noEmit) n'est invoqué par rien ; apps/site est en JS sans tsconfig (seulement jsconfig.json) donc `next build --webpack` transpile via transpilePackages SANS type-check ; l'eslint du site (apps/site/eslint.config.mjs) ne couvre que l'app ; .github/workflows/deploy-vps.yml ne concerne que les services. Vérifié : `./node_modules/.bin/tsc --noEmit` passe aujourd'hui (exit 0).
- **Action proposée** : Ajouter `"scripts": { "lint": "tsc --noEmit" }` (ou `typecheck`) au package pour que `turbo run lint` le couvre — zéro impact runtime/affichage.
- **Statut** : ✅ contre-vérifié et appliqué (commit 0298778)

### C055 — [medium/bug] `packages/tracking/src/Replay.tsx` (l.344) ⚠️ **risque affichage**
- **Défaut** : Replay ignore silencieusement l'attribut totalDistance des directives markdown : les valeurs string ne sont jamais parsées, contrairement à LiveTrackingMap.
- **Preuve** : Replay.tsx:344-347 : `typeof totalDistanceKm === "number" && totalDistanceKm ? totalDistanceKm : computedTotalDistance || 100`. Or remarkPostLiveTracking.js:59 passe TOUJOURS une string (`totalDistanceKm: attrs.totalDistance || ... || ""`), et toutes les directives réelles (saison-trail-2026.md:113 `totalDistance="65"`, :285 `totalDistance="160"`, :473 `totalDistance="64.7"`) passent des strings → l'axe X utilise toujours computedTotalDistance. LiveTrackingMap.tsx:145-148 gère le cas string via `Number(totalDistanceKm)`. docs/live-tracking-guide.md:159 documente pourtant « totalDistance : distance totale (km) pour l'axe du profil ».
- **Action proposée** : Signalement seul. Un fix (parser Number(totalDistanceKm) comme dans LiveTrackingMap) changerait le domaine/les ticks de l'axe X des replays existants (ex. traversée Réunion : 64.7 déclaré vs distance calculée ×1.3) — décision produit requise ; sinon corriger la doc (l'attribut est inopérant en replay).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C056 — [medium/doc-obsolete] `packages/tracking/src/index.ts` (l.5)
- **Défaut** : Les commentaires du package affirment qu'il est consommé « À LA FOIS par apps/site et apps/tracking (VPS) » — apps/tracking n'existe pas et n'a jamais existé dans le repo.
- **Preuve** : `ls apps/` → `_template site` uniquement ; `git log --all --oneline -- apps/tracking` → vide. Références au consommateur fantôme : index.ts:4-5, types.ts:8-9, LiveTrackingMap.tsx:7, plus côté site apps/site/app/globals.css:18 et apps/site/components/LiveTrackingLazy.jsx:6. Le grep '@locomotionlab/tracking' montre un seul consommateur réel : apps/site (LiveTrackingLazy.jsx:23, PostLiveTrackingLazy.jsx:19). types.ts:19-20 prétend aussi que le package est « type-checké par DEUX apps distinctes » — faux (voir finding package.json).
- **Action proposée** : Corriger les commentaires (fix de commentaires seuls, aucun code). Noter au passage que la convention CLAUDE.md « un packages/<x> n'est créé QUE quand au moins deux apps s'en servent réellement » n'est plus satisfaite — à trancher par Valentin, pas par un nettoyage automatique.
- **Statut** : ✅ contre-vérifié et appliqué (commit 0298778)

### C057 — [medium/dead-code] `packages/tracking/src/types.ts` (l.167)
- **Défaut** : La prop `statsUrl` de ReplayProps est déclarée mais n'est consommée nulle part (ni par Replay.tsx ni par useTrackingData).
- **Preuve** : grep 'statsUrl' sur tout le repo → 3 hits seulement : types.ts:167 (déclaration), remarkPostLiveTracking.js:28 (commentaire) et :58 (`statsUrl: attrs.stats || ""` — construit puis jamais lu). Replay.tsx ne destructure pas statsUrl ; UseTrackingDataOptions n'a pas de champ statsUrl. La directive `stats="/replays/traversee-reunion/live-stats.json"` (saison-trail-2026.md:472) est donc inerte ; idem `statsEndpoint`/`timerEndpoint` de la directive livetracking (md:460-461), que remarkLiveTracking.js n'extrait même pas.
- **Action proposée** : Supprimer `statsUrl?: string` de ReplayProps (jamais consommé, aucun effet runtime) ; signaler côté site que le champ statsUrl du payload remark et les attributs stats/statsEndpoint des markdown sont morts (nettoyage hors périmètre package).
- **Statut** : ✅ contre-vérifié et appliqué (commit 0298778)

### C058 — [low/dead-code] `packages/tracking/src/LiveTrackingMap.tsx` (l.130)
- **Défaut** : `timer` est destructuré depuis useTrackingData mais jamais utilisé dans LiveTrackingMap.
- **Preuve** : grep 'timer' dans LiveTrackingMap.tsx → 3 hits : ligne 92 (prop timerEndpoint), ligne 130 (destructuration `timer,`), ligne 138 (passage de timerEndpoint au hook). La variable `timer` n'apparaît nulle part dans le corps ni le JSX ; seul `elapsed` (dérivé du timer dans le hook) est affiché via formatDuration(elapsed) lignes 441/447.
- **Action proposée** : Supprimer `timer,` de la destructuration ligne 130 (le hook continue de le calculer ; aucun changement de rendu).
- **Statut** : ✅ contre-vérifié et appliqué (commit 0298778)

### C059 — [low/inconsistency] `packages/tracking/src/LiveTrackingMap.tsx` (l.94) ⚠️ **risque affichage**
- **Défaut** : Défauts d'altitude contradictoires et fallbacks inatteignables : props par défaut elevationMin=0/elevationMax=10, fallbacks 400/860, doc annonce 400/860 — et via markdown les attributs omis donnent un domaine [0,0].
- **Preuve** : LiveTrackingMap.tsx:94-95 (`elevationMin = 0, elevationMax = 10`) vs :153-154 (`Number.isFinite(...) ? ... : 400` / `: 860`). Number("") === 0 (fini) donc le fallback 400/860 n'est atteignable qu'avec une string non numérique ; or remarkLiveTracking.js:71-72 passe "" pour un attribut absent → ELEVATION_MIN=ELEVATION_MAX=0. docs/live-tracking-guide.md:121 documente « défaut 400 / 860 » : faux dans tous les chemins. Même motif dans Replay.tsx:106-109 (défauts 0/3100 cohérents entre eux, mais "" → 0/0 aussi). Doc :160 dit aussi mapHeight replay « comme le live » alors que le défaut replay est 400 vs 500 en live.
- **Action proposée** : Signalement + correction de la doc (live-tracking-guide.md). Ne pas « corriger » le code sans décision : rendre les fallbacks atteignables changerait le domaine Y du profil pour toute directive sans elevationMin/Max. En pratique toutes les directives actuelles fournissent les deux bornes.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C060 — [low/inconsistency] `packages/tracking/src/LiveTrackingMap.tsx` (l.357)
- **Défaut** : L'effet d'application des données live n'a aucun garde isStyleLoaded (contrairement à Replay) : un addSource pendant qu'un style charge jette une exception non catchée.
- **Preuve** : LiveTrackingMap.tsx:355-382 : garde seulement `if (!map || !map.style) return;` puis addSource/addLayer sans try/catch — Style.addSource appelle _checkLoaded() qui throw si le style n'est pas chargé. `mapReady` est dans les deps (:408) mais jamais testé dans le corps, alors que le commentaire :114-115 dit qu'il sert à « pousser le tracé dès que la carte est prête ». Fenêtres réelles : ~1 frame au montage, et surtout chaque poll (revision, toutes les 10 s) tombant pendant un setStyle (l'effet 2 :294-350 re-crée la source via once("styledata"), en course avec l'effet 3). Replay.tsx:308 se garde avec isStyleLoaded().
- **Action proposée** : Signalement. Fix candidat aligné sur Replay : sortir tôt si !map.isStyleLoaded() (la revision suivante ou mapReady rattrape) — aucun changement de rendu nominal.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C061 — [low/inconsistency] `packages/tracking/src/Replay.tsx` (l.318) ⚠️ **risque affichage**
- **Défaut** : Replay recalcule la bounding box avec spread (Math.min(...coords.map(...))) alors que utils.getBoundsFromCoords existe précisément pour éviter le stack overflow sur les longs tracés.
- **Preuve** : Replay.tsx:318-321 : `Math.min(...coords.map((c) => c[0]))` ×4. utils.ts:44-45 documente : « Boucle classique (pas de spread) pour éviter un Stack Overflow sur de longs tracés » et LiveTrackingMap.tsx:387 utilise bien getBoundsFromCoords. Aggravant : pour l'ancien format, normalizeReplayData ne filtre PAS les coordonnées non finies (replayData.ts:225 `positions.map((p) => [p.longitude, p.latitude])`, sans filtre contrairement au nouveau format lignes 176-182) → un point invalide donne des bornes NaN → fitBounds jette → cadrage perdu (catché ligne 324).
- **Action proposée** : Signalement. Le remplacement par getBoundsFromCoords est identique pour toute donnée saine, mais change le cadrage dans le cas pathologique (coords NaN / très longs tracés) — donc à faire consciemment, pas en nettoyage aveugle.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C062 — [low/bug] `packages/tracking/src/Replay.tsx` (l.311)
- **Défaut** : Si le JSON de replay arrive pendant un changement de fond de carte, `map.once("load", applyReplayLayer)` ne se déclenchera jamais (l'événement maplibre "load" ne se produit qu'une fois par carte) et la trace orange n'est pas dessinée.
- **Preuve** : Replay.tsx:308-312 : `if (map.isStyleLoaded()) applyReplayLayer(); else map.once("load", applyReplayLayer);`. Après un setStyle (effet :217-273), isStyleLoaded() est false pendant le chargement des tuiles alors que "load" a déjà été émis au premier chargement → le listener ne sera jamais rappelé. Le rattrapage via map._replayGeoJSON (posé ligne 286 avant le garde) n'a lieu qu'au PROCHAIN changement de style (once("styledata") de l'effet 2, déjà consommé). Le site utilise le bon pattern ailleurs : apps/site/components/live/LiveMap.jsx:205 réapplique via once("styledata") après chaque setStyle.
- **Action proposée** : Signalement (fenêtre de course improbable : replay fetché une seule fois au montage). Fix candidat : écouter "idle"/"styledata" au lieu de "load" — ne change rien au rendu nominal, restaure la trace dans le cas dégradé.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C063 — [low/inconsistency] `packages/tracking/src/Replay.tsx` (l.354) ⚠️ **risque affichage**
- **Défaut** : Replay code la charte en dur (`text-[#b66b47]`, `bg-[#EFB159]` ×10) là où LiveTrackingMap utilise les tokens (`text-brand-deep`, `bg-brand-accent`) — et #b66b47 n'est même pas la valeur du token brand-deep (#B67352).
- **Preuve** : Replay.tsx:354 `text-[#b66b47]` ; :362, :371, :408, :420, :438, :459-460, :474-475, :489-490, :512 `[#EFB159]`. packages/ui/src/styles/theme.css:15 `--color-brand-accent: #EFB159` (valeur identique mais dupliquée) et :18 `--color-brand-deep: #B67352` ≠ #b66b47. LiveTrackingMap.tsx:433/442 utilise text-brand-deep/bg-brand-accent. Viole CLAUDE.md : « La charte vient de packages/ui et de nulle part ailleurs ». Conséquence actuelle : le titre du replay et celui du live n'ont pas exactement la même couleur.
- **Action proposée** : Signalement seul : remplacer par les tokens changerait les classes du HTML rendu et la couleur du titre (#b66b47 → #B67352). À arbitrer ; en attendant, toute retouche de --color-brand-accent ne se propagera pas au Replay.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C064 — [low/cleanup] `packages/tracking/src/Replay.tsx` (l.375)
- **Défaut** : Double formatage redondant : `Number(stats.distance).toFixed(2)` alors que stats.distance est déjà une string toFixed(2) par contrat.
- **Preuve** : Replay.tsx:375 : `{Number(stats.distance).toFixed(2)} km` ; types.ts:90-92 documente DisplayStats.distance comme « déjà formatée (toFixed(2)) » ; useTrackingData.ts:305 produit `distance: distanceKmFinal.toFixed(2)`. LiveTrackingMap.tsx:455 affiche directement `{stats.distance} km`. Number("12.34").toFixed(2) === "12.34" → sortie strictement identique.
- **Action proposée** : Aligner sur LiveTrackingMap (`{stats.distance} km`) — texte rendu prouvé identique pour toute valeur produite par le hook.
- **Statut** : ✅ contre-vérifié et appliqué (commit 0298778)

### C065 — [low/dead-code] `packages/tracking/src/index.ts` (l.13)
- **Défaut** : La majorité de l'API publique du package n'a aucun consommateur externe : seuls LiveTrackingMap et Replay sont importés ; useTrackingData, normalizeReplayData, computeStatsFromPoints et tous les types ne le sont jamais.
- **Preuve** : grep '@locomotionlab/tracking' hors package : seuls imports réels = LiveTrackingLazy.jsx:23 (m.LiveTrackingMap) et PostLiveTrackingLazy.jsx:19 (m.Replay), en dynamic import. grep 'useTrackingData|normalizeReplayData|computeStatsFromPoints|NormalizedReplay|UseTrackingDataOptions' hors package : uniquement des mentions en docs/commentaires (docs/archive/live-pr1-plan.md:55, docs/live-archive-schema.md:106, apps/site/lib/useLiveTimer.js:7, CLAUDE.md:54). De plus TrackingData.profile (types.ts:125) n'est consommé ni par LiveTrackingMap ni par Replay (grep '\bprofile\b' dans les .tsx : 0 hit).
- **Action proposée** : Signalement seul : c'est l'API publique voulue du package (tree-shakée au build, aucun poids mort dans le bundle) ; ne rien supprimer sans décision sur l'avenir du « second consommateur » (cf. finding apps/tracking).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C066 — [low/inconsistency] `packages/tracking/src/mapStyles.ts` (l.34)
- **Défaut** : Le fond OSM du package utilise les sous-domaines a/b/c.tile.openstreetmap.org (dépréciés par OSMF) alors que la carte live du site utilise tile.openstreetmap.org — et le commentaire de LiveMap.jsx prétend que c'est « le même ».
- **Preuve** : mapStyles.ts:34-36 : `a.tile.openstreetmap.org / b. / c.` ; apps/site/components/live/LiveMap.jsx:26 : `https://tile.openstreetmap.org/{z}/{x}/{y}.png` avec le commentaire :20-21 « le même que les cartes des projets (packages/tracking) » — les URL diffèrent (mêmes tuiles servies, les sous-domaines sont des alias en voie d'abandon côté OSM). Les fonds topo/satellite sont eux identiques entre les deux fichiers (duplication assumée par docs/archive/live-pr2-plan.md:15 « packages/tracking n'est PAS touché »).
- **Action proposée** : Signalement : corriger le commentaire de LiveMap.jsx, et envisager (décision séparée) d'aligner le package sur tile.openstreetmap.org — imagerie identique, aucun changement de DOM, mais c'est un changement d'URL réseau à valider.
- **Statut** : ✅ partiellement appliqué — 0298778 (commentaire LiveMap corrigé ; alignement des URL de tuiles du package : décision en attente)

### C067 — [low/dead-code] `packages/tracking/src/replayData.ts` (l.24)
- **Défaut** : Les champs distanceMeters/dplus/dminus de ComputedStats ne sont jamais lus et dupliquent exactement rawDistanceMeters/rawDplus/rawDminus.
- **Preuve** : replayData.ts:140-148 : `distanceMeters: totalDist, dplus: totalDplus, dminus: totalDminus, ... rawDistanceMeters: totalDist, rawDplus: totalDplus, rawDminus: totalDminus` — mêmes variables assignées deux fois. grep 'distanceMeters|\.dplus|\.dminus' dans le package : seuls les raw* sont lus par normalizeReplayData (lignes 227-236). Aucun consommateur externe de computeStatsFromPoints (grep repo entier : seuls index.ts et replayData.ts).
- **Action proposée** : Supprimer les trois champs non-raw de ComputedStats et des deux objets retournés (lignes 41-43 et 141-143) — comportement et affichage strictement identiques.
- **Statut** : ✅ contre-vérifié et appliqué (commit 0298778)

### C068 — [low/inconsistency] `packages/tracking/src/useTrackingData.ts` (l.203)
- **Défaut** : Le poll du timer ne vérifie pas res.ok alors que le poll des positions le fait.
- **Preuve** : useTrackingData.ts:168-169 (positions) : `if (!res.ok) throw new Error(\`HTTP ${res.status}\`)` ; :202-203 (timer) : `const res = await fetch(...); const data = await res.json();` sans contrôle. Une réponse d'erreur HTML fait échouer res.json() → catch → console.error "Erreur timer :" — même issue mais message trompeur (SyntaxError au lieu du statut HTTP).
- **Action proposée** : Fix sûr possible (ajouter le même `if (!res.ok) throw` — aucune incidence d'affichage, le catch reste identique) ou signalement seul.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C069 — [low/refactor] `packages/tracking/src/utils.ts` (l.127) ⚠️ **risque affichage**
- **Défaut** : L'icône du marqueur coureur est hotlinkée en dur depuis le CDN flaticon — dépendance externe non versionnée pour les deux composants.
- **Preuve** : utils.ts:126-127 : `backgroundImage = "url('https://cdn-icons-png.flaticon.com/512/847/847969.png')"` — seule occurrence repo (grep flaticon : ce fichier + le chunk .next compilé). Si le CDN bloque le hotlinking ou tombe, le marqueur devient invisible ; chaque visiteur fait une requête tierce.
- **Action proposée** : Signalement : rapatrier l'icône en asset local (apps/site/public + prop/param) serait plus robuste, mais change l'URL dans le style inline du DOM → à valider (pixel-identique seulement si le fichier est copié tel quel).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté


## services/tracking-cache

**Résumé du relecteur** : services/tracking-cache est un service compact et sain : boucle de collecte (index.ts) → tick incrémental (pipeline.ts) → fetch Traccar (traccar.ts) → calcul porté à l'identique de l'ancien live-cache.mjs (compute.ts) → écritures atomiques dans le volume (store.ts), pilotage par CLI (cli.ts/control.ts, tous les exports sont réellement consommés — aucun code mort dans ces deux fichiers). Aucun secret en dur (token exclusivement via TRACCAR_API_TOKEN, vérifié), contrat de sortie cohérent avec packages/tracking et les hooks du site (live-positions.json/live-timer.json, seuls endpoints consommés et seuls servis par Caddy), Dockerfile conforme au workflow CI (contexte racine, zéro dépendance runtime). Les défauts relevés sont périphériques : injection de tout infra/.env dans le conteneur (moindre privilège), documentation de bascule obsolète (tracking.caddy.disabled et montage /opt/traccar décrits alors que le repo est déjà en état post-bascule, live-stats.json encore cité dans le runbook), fragilités latentes (comparaisons de dates lexicographiques entre formats ISO différents, troncature avant tri dans le fetch, arrêt SIGTERM plus long que le délai de grâce Docker) et petits nettoyages neutres (double lecture du cache par tick, bloc if vide, fallback outputDir mort, replis de config divergents du JSON documenté). Aucun correctif proposé ne touche l'affichage du site, hormis deux fixes de robustesse données explicitement marqués display_risk=true et proposés en signalement seul.

### C070 — [medium/doc-obsolete] `docs/tracking-cache.md` (l.116)
- **Défaut** : La procédure « Phase 3 » demande de renommer infra/caddy/conf.d/tracking.caddy.disabled → tracking.caddy et de « décommenter » le montage live_json dans compose.yml, alors que ces deux étapes sont déjà faites dans le repo (fichier inexistant, montage déjà actif).
- **Preuve** : docs/tracking-cache.md:116-117 vs état réel : infra/caddy/conf.d/tracking.caddy existe (en-tête ligne 1 : « Route Traccar … (ACTIVE) »), aucun tracking.caddy.disabled (glob infra/** ne liste que twin-engine.caddy.disabled), et infra/compose.yml:32 a `- live_json:/srv/live:ro` non commenté.
- **Action proposée** : Mettre à jour la Phase 3 du doc : indiquer que la route et le montage sont déjà committés, il ne reste que les étapes VPS (ports 80/443, arrêt nginx, deploy).
- **Statut** : ✅ contre-vérifié et appliqué (commit ff1b4fd)

### C071 — [medium/doc-obsolete] `infra/README.md` (l.56)
- **Défaut** : infra/README.md et docs/runbook-vps.md (étape 4) décrivent l'ANCIEN design de la bascule : renommage de tracking.caddy.disabled, montage /opt/traccar:/srv/traccar:ro et « 3 live-*.json » servis dont live-stats.json — contredit par tracking.caddy et compose.yml actuels.
- **Preuve** : infra/README.md:56-59 (« renommer conf.d/tracking.caddy.disabled … décommentant le montage /opt/traccar … 3 live-*.json ») ; docs/runbook-vps.md:354-357, 374-376, 385-388 (montage /opt/traccar) et 413-416 (validation `curl …/live-stats.json`). Or infra/caddy/conf.d/tracking.caddy:13 et 28-29 disent explicitement que live-stats.json n'est PLUS servi (2 fichiers seulement, root /srv/live) et infra/compose.yml:32 monte le volume live_json, pas /opt/traccar. Le curl de validation 4.4 sur live-stats.json tomberait sur le proxy Traccar (404), pas sur un fichier.
- **Action proposée** : Rafraîchir infra/README.md § « Deux modes » et runbook-vps.md étape 4 : source = volume live_json produit par tracking-cache, 2 fichiers servis (live-positions.json, live-timer.json), supprimer la vérification live-stats.json.
- **Statut** : ✅ contre-vérifié et appliqué (commit ff1b4fd)

### C072 — [medium/security] `infra/compose.yml` (l.51)
- **Défaut** : Le conteneur tracking-cache reçoit TOUT infra/.env (env_file: .env) alors qu'il ne consomme que TRACCAR_API_TOKEN/TRACCAR_API_URL/DATA_DIR (+ overrides optionnels) — les secrets sans rapport (TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, LISTMONK_DB_PASSWORD, LISTMONK_ADMIN_PASSWORD, CF_API_TOKEN) sont injectés dans son environnement.
- **Preuve** : infra/compose.yml:51 `env_file: .env` sur le service tracking-cache ; infra/.env.example contient CF_API_TOKEN, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, LISTMONK_DB_PASSWORD, LISTMONK_ADMIN_*. Côté code, services/tracking-cache/src/config.ts ne lit que TRACCAR_API_TOKEN, TRACCAR_API_URL, DATA_DIR, TRACKING_CONFIG_PATH et les overrides DEVICE_ID/FETCH_WINDOW_HOURS/MAX_POINTS_PER_FETCH/INTERVAL_SECONDS/*_CORRECTION/*_THRESHOLD. Une compromission du conteneur expose des secrets d'autres services (défaut de moindre privilège).
- **Action proposée** : Remplacer env_file par une liste `environment:` explicite (TRACCAR_API_TOKEN=${TRACCAR_API_TOKEN}, TRACCAR_API_URL=${TRACCAR_API_URL}, DEVICE_ID=${DEVICE_ID:-}, etc.) pour tracking-cache. Aucun impact fonctionnel si la liste couvre les variables lues par config.ts.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C073 — [low/doc-obsolete] `docs/tracking-cache.md` (l.157)
- **Défaut** : Les tableaux de configuration (docs/tracking-cache.md et docs/live-tracking-guide.md §5.1) omettent la clé `maxPointsPerFetch` / env `MAX_POINTS_PER_FETCH` pourtant présente dans tracking.config.json et lue par config.ts.
- **Preuve** : tracking.config.json:8 `"maxPointsPerFetch": 10000` et config.ts:77 `num(process.env.MAX_POINTS_PER_FETCH, raw.maxPointsPerFetch ?? 10000)` — absents des deux tableaux (docs/tracking-cache.md:157-166, docs/live-tracking-guide.md:192-201). `TRACKING_CONFIG_PATH` (config.ts:59) est également non documentée.
- **Action proposée** : Ajouter la ligne manquante aux deux tableaux (doc uniquement).
- **Statut** : ✅ contre-vérifié et appliqué (commit ff1b4fd)

### C074 — [low/inconsistency] `infra/.env.example` (l.25)
- **Défaut** : Les docs opérationnelles renvoient vers « infra/.env → DEVICE_ID=<n> » pour changer d'appareil, mais .env.example ne contient aucune entrée DEVICE_ID (ni aucune autre variable d'override du tracking) — l'opérateur qui part du modèle ne la trouvera pas.
- **Preuve** : docs/live-tracking-guide.md:221 « ponctuel : infra/.env → DEVICE_ID=<n> puis ./deploy.sh » et docs/live-runbook-ecrins.md:65 « DEVICE_ID de infra/.env doit pointer sur le BON appareil » ; grep DEVICE_ID dans infra/.env.example : aucune occurrence.
- **Action proposée** : Ajouter dans .env.example une ligne commentée `# DEVICE_ID=8` (override ponctuel du deviceId de tracking.config.json).
- **Statut** : ✅ contre-vérifié et appliqué (commit ff1b4fd)

### C075 — [low/bug] `services/tracking-cache/src/compute.ts` (l.57) ⚠️ **risque affichage**
- **Défaut** : Comparaisons de dates par ordre lexicographique entre deux formats ISO différents : les fixTime Traccar sont au format « …+00:00 » alors que windowStartIso (control.ts, toISOString) est en « …Z » — un point dont le fixTime est exactement égal à l'ouverture de fenêtre est exclu à tort, et tout repose sur l'invariant non documenté que Traccar émet toujours UTC avec millisecondes.
- **Preuve** : compute.ts:57 `p.fixTime >= windowStartIso` et pipeline.ts:39 `candidates.sort().at(-1)` mélangent les deux formats. Format réel confirmé dans le repo : apps/site/public/replays/*/live-positions.json contient `"fixTime": "2026-03-14T07:42:30.000+00:00"`. ASCII : '+' (43) < 'Z' (90) → "…000+00:00" < "…000Z" pour le même instant. Impact réel limité (un point à la milliseconde frontière ; le préfixe YYYY-MM-DDTHH:MM:SS.mmm reste monotone entre instants distincts), mais fragile si Traccar changeait d'offset.
- **Action proposée** : Signalement seul : comparer via Date.parse serait plus robuste, mais tout changement peut modifier marginalement le contenu de live-positions.json (donnée affichée sur la carte) — à ne faire que derrière validation.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C076 — [low/inconsistency] `services/tracking-cache/src/config.ts` (l.106)
- **Défaut** : loadDataDir() (utilisée par la CLI) ignore le fallback `raw.outputDir` que loadConfig() honore (ligne 75) : si `outputDir` était posé dans tracking.config.json sans DATA_DIR en env, le démon et la CLI opéreraient sur deux dossiers différents (`track start` n'aurait aucun effet) ; de plus la clé `outputDir` n'existe ni dans tracking.config.json ni dans les tableaux de config des docs.
- **Preuve** : config.ts:75 `dataDir: process.env.DATA_DIR || raw.outputDir || "/data"` vs config.ts:106-108 `loadDataDir(): return process.env.DATA_DIR || "/data"`. Grep `outputDir` sur tout le repo : uniquement config.ts:26 et 75 — jamais dans tracking.config.json, docs/tracking-cache.md:157-166 ni docs/live-tracking-guide.md:192-201. Latent en pratique : DATA_DIR est toujours posé (Dockerfile:26 `ENV DATA_DIR=/data`, compose.yml:53).
- **Action proposée** : Supprimer le fallback `raw.outputDir` (clé de config morte) ou aligner loadDataDir() sur la même résolution. Nettoyage back-only, sans effet sur l'affichage.
- **Statut** : ✅ contre-vérifié et appliqué (commit 3d07819)

### C077 — [low/inconsistency] `services/tracking-cache/src/config.ts` (l.76)
- **Défaut** : Les valeurs de repli codées dans loadConfig() divergent des « défauts » documentés (= valeurs de tracking.config.json) : fetchWindowHours 48 vs 50, minDistanceThreshold 5 vs 8, minElevation ±2/2 vs 0/1, corrections 1.0 vs 1.03/0.95 — piège silencieux si une clé disparaissait du JSON.
- **Preuve** : config.ts:76 `raw.fetchWindowHours ?? 48`, :89 `raw.minDistanceThreshold ?? 5`, :92/:96 `?? 2`, :80-87 `?? 1.0` — contre tracking.config.json (50, 8, 0, 1, 1.03, 0.95, 0.95) et les tableaux « Défaut » de docs/tracking-cache.md:157-166 et docs/live-tracking-guide.md:192-201.
- **Action proposée** : Signalement seul : soit aligner les `??` sur les valeurs du JSON, soit documenter que les replis code diffèrent volontairement. Ne rien changer sans décision (les replis ne s'activent que si le JSON est incomplet).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C078 — [low/bug] `services/tracking-cache/src/index.ts` (l.52)
- **Défaut** : L'arrêt « propre » est illusoire : SIGTERM ne fait que poser un flag, mais la boucle dort intervalSeconds (15 s par défaut) sans interruption, ce qui dépasse le délai de grâce Docker par défaut (10 s) → le conteneur est en pratique SIGKILLé à chaque `docker compose stop/restart` (deploy.sh).
- **Preuve** : index.ts:33-38 (le handler ne fait que `stopping = true`), index.ts:52 `await sleep(intervalMs)` non abortable, tracking.config.json:9 `intervalSeconds: 15` ; infra/compose.yml ne définit pas de stop_grace_period pour tracking-cache (défaut Docker = 10 s). Le log « tracking-cache arrêté proprement. » (index.ts:55) ne s'exécute donc quasiment jamais. Sans gravité pour les données (écritures atomiques tmp+rename dans store.ts:45-49).
- **Action proposée** : Signalement (fix optionnel et neutre : sleep interruptible via AbortController/résolveur partagé, ou `stop_grace_period: 20s` dans compose.yml).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C079 — [low/dead-code] `services/tracking-cache/src/index.ts` (l.45)
- **Défaut** : Bloc `if (fresh === null) { … }` vide dans la boucle principale : la valeur de retour de runTick n'est jamais exploitée, le bloc ne contient qu'un commentaire.
- **Preuve** : index.ts:44-47 : `const fresh = await runTick(config, store); if (fresh === null) { // session inactive : rien à faire (mode idle) }` — corps vide, `fresh` inutilisé ailleurs.
- **Action proposée** : Supprimer le bloc (garder le commentaire au-dessus de l'appel si souhaité) ou `await runTick(...)` sans affectation. Nettoyage neutre.
- **Statut** : ✅ contre-vérifié et appliqué (commit 3d07819)

### C080 — [low/cleanup] `services/tracking-cache/src/pipeline.ts` (l.52)
- **Défaut** : Le cache brut est lu et parsé deux fois par tick : une fois pour computeFromIso (ligne 52) et une fois pour `cache` (ligne 55) — double lecture/parse du même fichier JSON à chaque intervalle.
- **Preuve** : pipeline.ts:52 `computeFromIso(store.readRawCache(), …)` puis pipeline.ts:55 `const cache = store.readRawCache();` — aucune écriture entre les deux.
- **Action proposée** : Lire une seule fois (`const cache = store.readRawCache()` avant computeFromIso et le passer en argument). Strictement équivalent, back-only.
- **Statut** : ✅ contre-vérifié et appliqué (commit 3d07819)

### C081 — [low/inconsistency] `services/tracking-cache/src/store.ts` (l.96)
- **Défaut** : emptyLivePositions() écrit dans le bloc `debug` des paramètres de correction à 0 (samplingCorrection: 0, etc.) au lieu des valeurs de config réelles (1.03/0.95/8/0/1) — le fichier initial/reset prétend que les corrections sont nulles, information trompeuse au débogage.
- **Preuve** : store.ts:92-103 : tous les champs de paramètres du debug à 0. Les valeurs réelles vivent dans config.compute (tracking.config.json). Vérifié inoffensif pour le front : packages/tracking/src/types.ts:68 type `debug?: unknown` jamais lu (grep `debug` dans packages/tracking/src : aucun accès), apps/site/lib/useLivePositions.js ne lit que `profile`.
- **Action proposée** : Signalement : soit passer les ComputeParams à emptyLivePositions, soit documenter que 0 = « pas encore calculé ». Le bloc debug n'étant consommé nulle part, le changement est sans risque d'affichage.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C082 — [low/bug] `services/tracking-cache/src/traccar.ts` (l.36) ⚠️ **risque affichage**
- **Défaut** : Le plafond maxPointsPerFetch est appliqué AVANT le tri chronologique (`.slice(0, max).sort(...)`) : la troncature garde les N premiers points dans l'ordre renvoyé par Traccar ; si cette réponse n'était pas croissante en fixTime, on jetterait des points antérieurs au dernier point du cache, jamais re-fetchés (trou permanent, le fetch incrémental repart de cache.at(-1).fixTime).
- **Preuve** : traccar.ts:35-37 : `data.slice(0, config.maxPointsPerFetch).sort((a, b) => …fixTime…)`. Le fetch incrémental (pipeline.ts:34 `cache.at(-1)?.fixTime`) ne ré-attrape que ce qui est POSTÉRIEUR au dernier point du cache. La correction (trier puis tronquer en gardant les plus anciens) garantirait la contiguïté quel que soit l'ordre de la réponse.
- **Action proposée** : Signalement seul (inverser en `sort` puis `slice`) : neutre si Traccar renvoie déjà l'ordre croissant, mais changerait la donnée collectée dans le cas contraire.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté


## services/email-gateway

**Résumé du relecteur** : services/email-gateway est un Worker Cloudflare compact et bien commenté (un seul fichier src/index.ts, ~175 lignes) qui relaie POST /subscribe vers Listmonk avec double opt-in ; validation, honeypot, rate-limit best-effort et anti-énumération sont réellement implémentés et le README/wrangler.toml/docs/email-setup.md sont globalement cohérents entre eux, secrets correctement hors repo. Le défaut sérieux est un désalignement gateway↔site : l'allowlist SOURCES (et le README) datent d'avant le renommage /manifeste→/quete — le site émet aujourd'hui source=\"quete\" que la passerelle rejettera en 400 dès la bascule de NEXT_PUBLIC_EMAIL_ENDPOINT, tandis que \"footer\" et \"manifeste\" sont des valeurs fantômes jamais émises. S'y ajoutent deux petits bugs de robustesse (corps JSON `null` → exception non gérée au lieu d'un 400 ; borne mémoire du rate-limiter placée sur la branche qui ne fait pas grossir la Map) et des signalements mineurs (CORS purement navigateur, wrangler non épinglé, ordre regex/longueur). Aucun des correctifs proposés ne touche le HTML rendu du site : le flux actif en production reste l'ancien Worker send-email tant que la variable d'environnement n'est pas basculée.

### C083 — [high/bug] `services/email-gateway/src/index.ts` (l.29)
- **Défaut** : L'allowlist SOURCES ne contient pas "quete" alors que la page /quete du site envoie source="quete" : après bascule de NEXT_PUBLIC_EMAIL_ENDPOINT vers la passerelle, toute inscription depuis /quete recevra 400 source_invalide et l'utilisateur verra le message d'erreur.
- **Preuve** : src/index.ts:29-36 : SOURCES = Set(["comprendre","twin","live","footer","manifeste","home"]) avec le commentaire « doit couvrir tous les formulaires du site ». Grep exhaustif des sources réellement émises par le site (source="…" dans apps/site) : quete (app/quete/page.jsx:162), comprendre (app/comprendre/page.jsx:199), twin (app/outils/twin/page.jsx:100), home (app/page.js:459), live (components/live/EmailCaptureCard.jsx:22). La page /manifeste n'existe plus : apps/site/next.config.mjs:126 = { source: "/manifeste", destination: "/quete", permanent: true } — la valeur "manifeste" du Set est le vestige d'avant le renommage. Aujourd'hui invisible car NEXT_PUBLIC_EMAIL_ENDPOINT est vide (apps/site/.env.example:23) donc EmailCapture.jsx:19-20 tape encore l'ancien Worker send-email qui ignore `source` ; le bug se déclenchera exactement au moment de la bascule documentée dans le README.
- **Action proposée** : Ajouter "quete" au Set SOURCES du Worker (et décider du sort de "manifeste" : le retirer ou le garder par tolérance). Changement côté Worker uniquement, aucun HTML du site touché.
- **Statut** : ✅ contre-vérifié et appliqué (commit 8eb1ecc)

### C084 — [low/doc-obsolete] `services/email-gateway/README.md` (l.19)
- **Défaut** : Le README documente `source ∈ comprendre · twin · live · footer · manifeste · home`, liste désynchronisée des formulaires réels du site ("quete" absent, "manifeste" et "footer" fantômes).
- **Preuve** : README.md:19 vs sources réellement émises (grep apps/site) : quete/comprendre/twin/home/live. La page /manifeste est redirigée 301 vers /quete (apps/site/next.config.mjs:126).
- **Action proposée** : Mettre à jour la liste du README en même temps que le Set SOURCES du Worker (fix du finding principal). Documentation uniquement.
- **Statut** : ✅ contre-vérifié et appliqué (commit 8eb1ecc)

### C085 — [low/cleanup] `services/email-gateway/package.json` (l.11)
- **Défaut** : `wrangler` n'est pas dans les devDependencies alors que les scripts dev/deploy (et le README, docs/email-setup.md) font `npx wrangler` : version non épinglée téléchargée à la volée → déploiements non reproductibles.
- **Preuve** : package.json:6-14 : scripts "dev": "npx wrangler dev", "deploy": "npx wrangler deploy" ; devDependencies = @cloudflare/workers-types + typescript uniquement. README.md:46,63 et docs/email-setup.md:59-62 utilisent aussi `npx wrangler`.
- **Action proposée** : Signalement : ajouter `wrangler` en devDependency épinglée et utiliser les scripts pnpm, pour figer la version de l'outil de déploiement. Aucun impact sur le code du Worker.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C086 — [low/bug] `services/email-gateway/src/index.ts` (l.145)
- **Défaut** : Un corps JSON valant `null` (JSON valide) passe le try/catch de request.json() puis provoque un TypeError non géré sur payload.website → exception Worker (erreur 500/1101 sans en-têtes CORS) au lieu du 400 corps_invalide prévu.
- **Preuve** : src/index.ts:143-148 : `payload = (await request.json()) as Record<string, unknown>` — `request.json()` résout `null` sans lever d'exception pour le corps `null`. Ligne 152 : `typeof payload.website === "string"` lit une propriété de null → TypeError hors du try/catch. Aucune vérification `payload !== null` / `typeof payload === "object"` dans le fichier.
- **Action proposée** : Après le parse, valider `typeof payload === "object" && payload !== null` et sinon retourner 400 corps_invalide, comme pour un JSON malformé. Comportement inchangé pour tout client légitime.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C087 — [low/bug] `services/email-gateway/src/index.ts` (l.52)
- **Défaut** : La borne mémoire du rate-limiter (`if (hits.size > 10_000) hits.clear()`) est placée sur la seule branche qui ne fait PAS grossir la Map : un flux d'IP toutes distinctes fait croître `hits` sans jamais atteindre le clear.
- **Preuve** : src/index.ts:44-54 : la croissance de la Map se fait uniquement via `hits.set(ip, …)` ligne 48 (nouvelle IP ou fenêtre expirée), branche qui `return false` ligne 49 avant tout contrôle de taille. Le contrôle ligne 52 n'est évalué que pour une entrée existante (chemin qui n'ajoute rien) ; il ne se déclenche donc que si une IP déjà vue revient alors que la Map dépasse déjà 10 000 entrées. Le commentaire assume un « borne mémoire grossière » best-effort, mais telle quelle elle ne borne pas le scénario qui fait grossir la mémoire.
- **Action proposée** : Déplacer le contrôle de taille avant/au moment du `hits.set` (branche nouvelle entrée). Aucun effet visible côté site ; sémantique best-effort conservée.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C088 — [low/inconsistency] `services/email-gateway/src/index.ts` (l.33)
- **Défaut** : La valeur "footer" de SOURCES n'est émise par aucun formulaire du site (aucun `source="footer"` dans tout le repo), et le commentaire « doit couvrir tous les formulaires du site » est donc doublement faux (valeur en trop + "quete" manquant).
- **Preuve** : Grep `source="…"` sur apps/site (jsx/js) : seules quete, comprendre, twin, home, live apparaissent. apps/site/components/Footer.jsx ne contient aucun EmailCapture (grep EmailCapture|NewsletterSignup : Footer.jsx absent des résultats). "footer" ne survit que dans le brief d'origine docs/archive/refonte-brief.md:137.
- **Action proposée** : Signalement : retirer "footer" (et "manifeste", cf. finding principal) ou les documenter explicitement comme réservés ; une valeur en trop dans l'allowlist est sans danger, mais elle entretient la fausse impression que la liste reflète le site.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C089 — [low/security] `services/email-gateway/src/index.ts` (l.64)
- **Défaut** : Signalement seul : la restriction d'origine est purement CORS (en-tête réfléchi pour les navigateurs) — le Worker traite quand même les POST directs (curl, bots) de n'importe quelle origine et l'appel Listmonk part, la protection réelle reposant sur honeypot + rate-limit par isolat.
- **Preuve** : src/index.ts:56-68 : `corsHeaders` n'ajoute Access-Control-Allow-Origin que si l'origine est autorisée, mais `fetch()` (ligne 125+) ne rejette jamais une requête dont l'Origin est absent ou non listé ; le flux continue jusqu'à subscribeToListmonk. Cohérent avec les commentaires (« best-effort ») et avec le double opt-in en aval (une inscription forcée n'est jamais confirmée), donc pas un défaut à corriger d'urgence.
- **Action proposée** : Signalement seul. Option si un jour nécessaire : rejeter en 403 les POST dont l'Origin n'est pas dans ALLOWED_ORIGINS (en gardant à l'esprit que l'en-tête est falsifiable hors navigateur).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C090 — [low/cleanup] `services/email-gateway/src/index.ts` (l.157)
- **Défaut** : Ordre des contrôles inversé : la regex email s'exécute avant la borne de longueur (`!EMAIL_REGEX.test(email) || email.length > 254`), donc une chaîne arbitrairement longue est d'abord passée à la regex.
- **Preuve** : src/index.ts:156-159. Le court-circuit `||` évalue le test regex en premier ; la limite 254 ne protège donc pas le coût du test sur une entrée hostile très longue (backtracking au pire quadratique sur `[^\s@]+\.[^\s@]+$`). Sans conséquence pour les clients légitimes.
- **Action proposée** : Signalement : inverser les deux conditions (longueur d'abord). Strictement même résultat fonctionnel, coût borné.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté


## services/live-journal

**Résumé du relecteur** : services/live-journal est un service ACTIF et pleinement intégré — construit par la CI (deploy-vps.yml), lancé sur le VPS (infra/compose.yml, volume live_journal_data, healthcheck), routé par Caddy (api.caddy : statique servi depuis le volume, API proxifiée) et consommé par apps/site/app/live via NEXT_PUBLIC_JOURNAL_API — mais il est totalement absent de CLAUDE.md. Le code est de bonne qualité : TypeScript strict propre (tsc OK), 67 tests verts + 1 skip ffmpeg couvrant la matrice Telegram, le store, /message (CORS, honeypot, rate-limit), l'export d'archive, le selfcheck et le rendu OG réel ; aucune dépendance inutilisée, aucun secret en dur (démarrage refusé si secrets manquants). Le défaut majeur est un bug de packaging : le stage runner du Dockerfile n'embarque pas assets/fonts, donc og.png et story.png échoueront en production dès le premier déploiement (le runbook §1.6 les exige) ; second défaut notable, le simulateur ne rejoue jamais son journal scripté quand on le relance avec le même DATA_DIR (update_id fixes + dédup persistée), ce qui contredit la procédure de test documentée. Zones non couvertes par les tests : telegram/api.ts (client réel), polling.ts, og/scheduler.ts, export/cli.ts, index.ts et le parsing Range de server.ts (dev-only). Le reste relève du signalement : rate-limit story codé en dur, cache de trace OG non ré-indexé, duplication photo/documentPhoto, en-tête CF-Connecting-IP forgeable en contournant Cloudflare.

### C091 — [high/bug] `services/live-journal/Dockerfile` (l.32) ⚠️ **risque affichage**
- **Défaut** : L'image de production n'embarque pas assets/fonts : la génération de og.png et story.png échouera dans le conteneur (ENOENT sur Ubuntu-Regular.ttf).
- **Preuve** : Runner stage : COPY --from=build /out/dist ./dist ; /out/node_modules ; /out/live-journal.config.json ; /out/sim — AUCUN COPY de /out/assets. Or src/og/render.ts:11 lit FONTS_DIR = path.resolve(__dirname, '..', '..', 'assets', 'fonts') → /app/assets/fonts au runtime (dist/og/render.js). Le Dockerfile date de la PR1 (git log : seul commit 351190f) alors que les fontes ont été ajoutées en PR4 (9447be0). Conséquence : OgScheduler.generate() logge une erreur à chaque cycle, /journal/story.png répond 500, et le selfcheck PR5 remontera « og : aucune carte générée ». docs/live-runbook-ecrins.md:47 exige pourtant que api.thelocomotionlab.com/journal/og.png existe, et apps/site/app/live/page.jsx:19 + components/live/LiveEnCours.jsx:123 consomment ces URLs. Latent (service pas encore déployé, checklist docs/live-reste-a-faire.md §1 non cochée) mais casse le premier déploiement.
- **Action proposée** : Ajouter `COPY --from=build /out/assets ./assets` dans le stage runner du Dockerfile (fix d'infra, aucun changement de code).
- **Statut** : ✅ contre-vérifié et appliqué (commit 8eb1ecc)

### C092 — [medium/doc-obsolete] `CLAUDE.md`
- **Défaut** : services/live-journal est totalement absent de CLAUDE.md (arborescence et texte) alors que c'est un service actif, déployé et consommé par le site.
- **Preuve** : grep -n 'live-journal' CLAUDE.md → aucune occurrence (exit 1). L'arborescence de CLAUDE.md liste sous services/ : tracking-cache, email-gateway, twin-engine. Le service est pourtant : construit par la CI (.github/workflows/deploy-vps.yml:42-43), lancé sur le VPS (infra/compose.yml:68, volume live_journal_data, healthcheck), routé par Caddy (infra/caddy/conf.d/api.caddy:61-64) et consommé par apps/site (lib/useJournal.js, components/live/MessageCard.jsx, LiveEnCours.jsx via NEXT_PUBLIC_JOURNAL_API).
- **Action proposée** : Ajouter une ligne `live-journal/` dans l'arborescence services/ de CLAUDE.md (journal de bord du live : webhook Telegram → journal.json + médias sur volume servi par Caddy, messages privés, cartes OG, auto-surveillance).
- **Statut** : ✅ contre-vérifié et appliqué (commit ff1b4fd)

### C093 — [medium/bug] `services/live-journal/src/sim/journal.ts` (l.93)
- **Défaut** : Relancer `pnpm sim` avec le même DATA_DIR ne rejoue JAMAIS le journal scripté : les update_id fixes (100_000+index) sont dédupliqués par le state.json persistant.
- **Preuve** : buildUpdate() émet update_id: 100_000 + index (déterministe à chaque run) ; JournalStore persiste processedUpdateIds dans private/state.json et handleUpdate (ingest.ts:90-93) ignore les doublons ; aucun rmSync/wipe du DATA_DIR en mode simulation (grep rmSync → seulement utils.ts moveFile et selfcheck probe). Or le README (§Run local) recommande un DATA_DIR fixe (/tmp/live-journal-data) et docs/live-reste-a-faire.md §6 dit « relance-le (Ctrl-C, ↑, Entrée) pour repartir à zéro » avec DATA_DIR=/tmp/lj-test réutilisé : au 2e run, les 6 événements du scénario sont silencieusement ignorés (compteur ignoredDuplicate).
- **Action proposée** : En mode simulation, dériver update_id d'un timestamp de run (ex. Date.now() de démarrage + index) ou purger/ignorer la dédup quand config.simulation.enabled — outil de dev uniquement, comportement de prod inchangé.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C094 — [low/doc-obsolete] `services/live-journal/README.md` (l.75)
- **Défaut** : Le README affirme « Front local : NEXT_PUBLIC_TRACKING_PROXY=http://localhost:3000 — une seule base URL » alors que le site lit DEUX variables (le journal utilise NEXT_PUBLIC_JOURNAL_API).
- **Preuve** : apps/site/lib/liveConfig.js:76-78 : trackingProxy = NEXT_PUBLIC_TRACKING_PROXY || prod ; journalApiBase = NEXT_PUBLIC_JOURNAL_API || 'https://api.thelocomotionlab.com'. Avec seulement TRACKING_PROXY posée, useJournal.js:23 sonde la prod. docs/live-reste-a-faire.md §6 (Phase 1) pose d'ailleurs correctement les deux variables ET utilise PORT=3999 pour éviter la collision avec le port 3000 du site — collision que l'exemple du README (sim sur le port 3000 par défaut) provoque.
- **Action proposée** : Corriger le README : mentionner les deux variables (mêmes valeurs) et un PORT distinct de celui du dev Next (ex. 3999), comme dans docs/live-reste-a-faire.md §6.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C095 — [low/cleanup] `services/live-journal/package.json` (l.13)
- **Défaut** : Le script `export-archive` (node dist/export/cli.js) échoue si `dist/` n'existe pas, contrairement à `dev` et `sim` qui enchaînent `pnpm build &&`.
- **Preuve** : "export-archive": "node dist/export/cli.js" vs "dev": "pnpm build && …" et "sim": "pnpm build && …". Le runbook (docs/live-reste-a-faire.md §6 Phase 5) ne fonctionne que parce que la Phase 1 a déjà lancé `pnpm sim` (qui builde).
- **Action proposée** : Passer le script à "pnpm build && node dist/export/cli.js" (aucun impact runtime).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C096 — [low/inconsistency] `services/live-journal/src/config.ts` (l.182)
- **Défaut** : Le mode simulation dans le conteneur (annoncé par le Dockerfile qui embarque sim/) crashe au démarrage : le GPX par défaut pointe vers apps/site/, absent de l'image.
- **Preuve** : gpxPath par défaut = path.resolve(__dirname, '..', '..', '..', 'apps', 'site', 'public', 'tracks', 'tour-des-ecrins_temp.gpx') → /apps/site/... dans le conteneur (__dirname=/app/dist) ; .dockerignore exclut apps/site/** du contexte et le runner ne copie que dist/node_modules/config/sim. Dockerfile:35 commente pourtant « Fixtures du simulateur (mode dev/recette : LIVE_JOURNAL_SIMULATION=1) ». PositionsSimulator (sim/positions.ts:127) fait fs.readFileSync(gpxPath) → ENOENT → exit 1, sauf si SIM_GPX est fourni.
- **Action proposée** : Signalement seul : soit documenter que SIM_GPX est obligatoire en conteneur, soit committer un petit GPX de fixture dans sim/ et en faire le défaut du mode simulation.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C097 — [low/refactor] `services/live-journal/src/journal/ingest.ts` (l.211)
- **Défaut** : Duplication quasi intégrale entre handlePhoto et handleDocumentPhoto (mêmes createEntry/reply), et handleAudio/handleVideo ré-inlinent la logique de downloadByFileId.
- **Preuve** : handlePhoto (187-209) et handleDocumentPhoto (211-234) ne diffèrent que par la sélection de taille et le message de log ; handleAudio:247-249 et handleVideo:273-275 répètent getFile + « getFile sans file_path » + downloadFile au lieu d'une variante de downloadByFileId (181-185) qui retournerait aussi file_path (nécessaire pour safeExt).
- **Action proposée** : Signalement seul : factoriser en un helper commun (publishPhoto(source, message) + downloadWithPath(fileId)) si on retouche le fichier — aucun changement de comportement attendu, textes de réponse identiques.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C098 — [low/bug] `services/live-journal/src/journal/store.ts` (l.79) ⚠️ **risque affichage**
- **Défaut** : Éditer une entrée pour vider son texte (ex. suppression d'une légende de photo dans Telegram) produit `"text": ""` dans journal.json, en contradiction avec le contrat « Absent si vide ».
- **Preuve** : ingest.ts:302 append({ kind: 'edited', text: text ?? '' }) quand cleanText() rend undefined ; store.ts reduceEntries() fait `entry.text = event.text` sans condition → la projection écrit text:"" alors que types.ts:26 documente « Corps … Absent si vide » et que createEntry (ingest.ts:168-169) n'écrit le champ que s'il est non vide.
- **Action proposée** : Dans reduceEntries(), supprimer le champ quand event.text est vide (`if (event.text) entry.text = event.text; else delete entry.text;`). À vérifier côté front que `""` et absent se rendent pareil avant de toucher — sinon signalement seul.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C099 — [low/security] `services/live-journal/src/message.ts` (l.37)
- **Défaut** : Le rate-limit de /journal/message est contournable en frappant l'origin directement avec un en-tête CF-Connecting-IP forgé (Caddy ne strippe pas cet en-tête).
- **Preuve** : clientIp() fait confiance à cf-connecting-ip puis x-forwarded-for sans vérification ; infra/caddy/conf.d/api.caddy proxifie /journal/message (ligne 61-64) sans header_up qui supprimerait/écraserait ces en-têtes. Un client qui joint l'IP du VPS directement (en contournant le proxy Cloudflare) peut forger une IP différente par requête et vider les quotas 5/min-30/h → spam du Telegram de Valentin (limité par le honeypot et la validation, mais sans plafond global).
- **Action proposée** : Signalement : faire écraser X-Forwarded-For/CF-Connecting-IP par Caddy (ou restreindre l'origin aux IP Cloudflare), et/ou ajouter un plafond global (comme storyLimiter) sur /message. Aucun impact d'affichage.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C100 — [low/dead-code] `services/live-journal/src/message.ts` (l.35)
- **Défaut** : clientIp() est exporté mais n'est importé nulle part ailleurs (ni src ni tests) : export superflu.
- **Preuve** : grep clientIp sur tout le service → seules occurrences : sa définition (message.ts:35) et son usage interne (message.ts:99). Aucun import dans server.ts, ratelimit.ts ni test/*.
- **Action proposée** : Retirer le mot-clé export (fonction locale). Au passage, deux espaces manquants cosmétiques dans ingest.ts:251 et 276 (`safeExt(file.file_path,".oga")`).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C101 — [low/refactor] `services/live-journal/src/og/data.ts` (l.157) ⚠️ **risque affichage**
- **Défaut** : trackCache n'est pas indexé par trackPath et met en cache un échec (null) pendant 1 h : changement de referenceTrack ou raté transitoire → silhouette absente/périmée sur les cartes jusqu'à 1 h.
- **Preuve** : track() : `if (this.trackCache && now - at < CONFIG_TTL_MS) return this.trackCache.value;` — le cache est rendu sans comparer trackPath, et `this.trackCache = { value, at }` est posé même quand value === null (fetch KO), alors que le commentaire d'en-tête ne documente la tolérance/TTL que pour « la config/trace ».
- **Action proposée** : Signalement seul (dégradation tolérée par design) : si on y touche, clé de cache = trackPath et TTL court (ou pas de cache) pour value === null.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C102 — [low/cleanup] `services/live-journal/src/server.ts` (l.98)
- **Défaut** : Le garde-fou de débit de /journal/story.png (10/min, 100/h) est codé en dur alors que les quotas équivalents de /message vivent dans live-journal.config.json.
- **Preuve** : server.ts:98 `new IpRateLimiter(10, 100)` (clé constante 'story') ; à comparer à config.message.ratePerMinute/ratePerHour (config.ts:151-152, surchargeables par env MESSAGE_RATE_*). Aucun moyen d'ajuster le débit story sans rebuild.
- **Action proposée** : Déplacer les deux valeurs dans la section og de live-journal.config.json (défauts identiques 10/100) — comportement par défaut inchangé.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté


## services/twin-engine — ingest

**Résumé du relecteur** : Le sous-paquet ingest est globalement sain : architecture claire (marcheur générique / manifeste Strava / 4 adaptateurs → schéma canonique 1 Hz), bien testée (5 fichiers de tests, fixtures réalistes), avec de vrais garde-fous PII et confidentialité. Les défauts trouvés sont des cas limites de robustesse (garde « ni dist, ni vitesse, ni GPS » inopérant pour .fit/.tcx car les parseurs passent des listes de NaN plutôt que None ; zip corrompu silencieux ; intervalMillis unique partagé entre canaux Polar) et de la dérive documentaire (source_format « polar » absent des commentaires, exports __init__ incohérents, docstring de _dt.py contredite par polar.py). Aucun fix n'a été appliqué : le moteur étant validé empiriquement, tout correctif comportemental listé ici doit passer par le protocole (flag de config + preuve A/B) ; seuls les items doc/commentaires sont applicables sans risque. Aucun finding ne touche l'affichage (backend pur, display_risk=false partout).

### C103 — [medium/bug] `services/twin-engine/src/twin_engine/ingest/canonical.py` (l.206)
- **Défaut** : Le garde « activité sans distance exploitable » teste la présence (lat is not None) et non la finitude : un .fit/.tcx FC-seule produit une activité à distance nulle au lieu de lever le ValueError prévu.
- **Preuve** : canonical.py:206 `elif lat is not None and lon is not None:` alors que les deux branches précédentes testent `np.isfinite(...).any()`. fit.py (l.76-77) et tcx.py (l.59-63) passent TOUJOURS des listes lat/lon (remplies de NaN si absentes), jamais None. Vérifié empiriquement : `from_samples(timestamps=range(10), dist_m=[nan]*10, speed_ms=[nan]*10, lat=[nan]*10, lon=[nan]*10, hr=[130]*10, sport='running')` → « parsed OK, dist[-1] = 0.0, speed max = 0.0, is_running = True » (le _resample tout-NaN → haversine NaN → nan_to_num → zéros). La branche ValueError l.210-213 est donc inatteignable pour les entrées fit/tcx ; une séance FC-seule étiquetée running entre dans la courbe record avec 0 m.
- **Action proposée** : Signalement seul (changement de comportement → protocole moteur : passer le test en finitude derrière un flag, avec preuve A/B). Ne pas corriger dans ce lot.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C104 — [medium/bug] `services/twin-engine/src/twin_engine/ingest/polar.py` (l.127)
- **Défaut** : Un seul interval_ms est partagé par tous les canaux Polar, écrasé à chaque itération : si les canaux ont des intervalMillis différents, toute la timeline est fausse pour les autres canaux.
- **Preuve** : polar.py l.112-129 : dans la boucle `for ch in channels:`, `interval_ms = float(ch.get("intervalMillis") or interval_ms)` écrase la valeur à chaque canal retenu ; la timeline unique `t = np.arange(n_max) * step_s` (l.136) est ensuite appliquée à TOUS les canaux. Le docstring du module (l.13-14) affirme des canaux « de même longueur » mais le code tolère des longueurs inégales (padding NaN l.137-139) sans tolérer des intervalles inégaux — incohérence interne. Un export où HEART_RATE est à 5000 ms et SPEED à 1000 ms placerait la FC sur une base 1 s (compression x5).
- **Action proposée** : Signalement seul : vérifier sur un export Polar réel si des intervalMillis hétérogènes existent ; le cas échéant, correctif par canal derrière un flag (protocole moteur).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C105 — [low/inconsistency] `services/twin-engine/src/twin_engine/_dt.py` (l.3)
- **Défaut** : La docstring « Source unique pour tout le moteur (ingestion XML, spec de course, pacing) » est doublement inexacte : polar.py parse l'ISO directement via datetime.fromisoformat, et aucun module de pacing/ ne parse de dates ISO.
- **Preuve** : polar.py:85 `return datetime.fromisoformat(src)` (sans passer par parse_iso : pas de gestion des fractions > 6 décimales, l.21 de _dt.py). Grep `parse_iso|fromisoformat` sur src/twin_engine/pacing/ et api/ : zéro résultat ; seuls course/spec.py:17 et ingest/_xml.py:12 importent parse_iso. Fonctionnellement quasi équivalent en Python 3.11 (fromisoformat gère « Z » et les millisecondes), mais la promesse « source unique » est fausse.
- **Action proposée** : Signalement seul : soit corriger la docstring (fix sûr), soit faire passer polar._parse_start par parse_iso (micro-changement de comportement sur fractions > 6 décimales → protocole).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C106 — [low/doc-obsolete] `services/twin-engine/src/twin_engine/ingest/__init__.py` (l.3)
- **Défaut** : Docstring et exports du paquet en retard sur l'adaptateur Polar : formats annoncés « .fit/.tcx/.gpx » sans le .json Polar, parse_fit/parse_tcx/parse_gpx ré-exportés mais pas parse_polar ni NotActivityData.
- **Preuve** : __init__.py l.3 « Adaptateurs PAR FORMAT (.fit/.tcx/.gpx, décompression .gz/.zip, bundle Strava) » ; __all__ l.31-33 liste parse_fit/parse_tcx/parse_gpx mais pas parse_polar. Grep repo entier : aucun consommateur externe n'importe parse_fit/tcx/gpx depuis le paquet racine (registry.py les importe des sous-modules) ; les tests importent parse_polar depuis twin_engine.ingest.polar et NotActivityData depuis twin_engine.ingest.canonical, faute de ré-export. registry.py:29 `_PARSERS = {..., "json": parse_polar}` confirme les 4 formats.
- **Action proposée** : Fix sûr du docstring (mentionner Polar .json). Pour les exports : soit ajouter parse_polar/NotActivityData (additif, sans risque), soit signaler seulement — les retraits seraient un changement d'API publique.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C107 — [low/bug] `services/twin-engine/src/twin_engine/ingest/canonical.py` (l.220)
- **Défaut** : Une activité de durée sub-seconde (0 < te[-1] < 1) sans canal vitesse plante avec un IndexError numpy cryptique au lieu du ValueError « durée nulle » propre.
- **Preuve** : Vérifié empiriquement : `from_samples(timestamps=[0.0, 0.5], dist_m=[0.0, 1.5], ...)` → `IndexError: index 0 is out of bounds for axis 0 with size 0` (tg = arange(0, 1, 1) n'a qu'un point, np.gradient l.220 explose). Le garde l.190 `te[-1] <= 0` laisse passer 0.5. Non fatal (blanket except de iter_activities l.109) mais la raison consignée dans skipped[] est le message numpy brut, inutilisable pour l'utilisateur.
- **Action proposée** : Signalement seul : durcir le garde (te[-1] < 1) serait un micro-changement de comportement à passer par le protocole ; en pratique aucun parseur ne produit ce cas avec les fixtures actuelles.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C108 — [low/bug] `services/twin-engine/src/twin_engine/ingest/canonical.py` (l.95)
- **Défaut** : Aucun garde contre des timestamps non monotones (régression d'horloge FIT) : np.interp exige un xp croissant et produit des résultats silencieusement faux sinon.
- **Preuve** : _seconds_from (l.95-104) et _resample (l.118 `np.interp(tg, te[mask], v[mask])`) n'imposent ni tri ni monotonie de te ; la doc numpy précise que np.interp donne des résultats « nonsensical » si xp n'est pas croissant, sans erreur. Les .fit réels peuvent contenir des retours en arrière d'horodatage (resync GPS). La distance est ensuite forcée monotone (l.214), ce qui masquerait la corruption au lieu de la signaler.
- **Action proposée** : Signalement seul : ajout d'un tri/garde = changement de comportement (protocole moteur, flag + A/B).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C109 — [low/doc-obsolete] `services/twin-engine/src/twin_engine/ingest/canonical.py` (l.130)
- **Défaut** : Le commentaire du champ source_format énumère "fit" | "tcx" | "gpx" alors que l'adaptateur Polar produit "polar".
- **Preuve** : canonical.py:130 `source_format: str  # "fit" | "tcx" | "gpx"` vs polar.py:158 `source_format="polar"`. Le test test_ingest_polar.py:54 vérifie d'ailleurs `a.source_format == "polar"`.
- **Action proposée** : Fix sûr : ajouter | "polar" au commentaire (aucun impact runtime).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C110 — [low/dead-code] `services/twin-engine/src/twin_engine/ingest/canonical.py` (l.28)
- **Défaut** : CANONICAL_VERSION = 1 est défini et ré-exporté (canonical.__all__, ingest/__init__.__all__) mais jamais consommé nulle part dans le repo.
- **Preuve** : Grep repo entier (hors __pycache__) : 4 occurrences seulement — définition canonical.py:28, __all__ canonical.py:240, import/__all__ __init__.py:11 et 22. Aucune lecture dans src/, tools/, tests/, docs/, ni dans les fixtures/JSON.
- **Action proposée** : Signalement seul : probablement un placeholder de versionnage du schéma (utile si le schéma évolue) ; à supprimer OU à consigner comme intentionnel, au choix du mainteneur.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C111 — [low/doc-obsolete] `services/twin-engine/src/twin_engine/ingest/canonical.py` (l.4)
- **Défaut** : Référence périmée « (commit 2) » dans le docstring du module : renvoie à une étape d'un plan de développement passé, plus à rien d'actuel.
- **Preuve** : canonical.py:4 « sont normalisés par les adaptateurs (commit 2) vers UN seul schéma ». Les références à extract_all2 (l.183, fit.py:3) restent, elles, valides : services/twin-engine/_seed/analyse/extract_all2.py existe.
- **Action proposée** : Fix sûr : supprimer « (commit 2) » du docstring.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C112 — [low/bug] `services/twin-engine/src/twin_engine/ingest/fit.py` (l.71)
- **Défaut** : Le repli enhanced_speed→speed (et enhanced_altitude→altitude) ne joue pas si la clé enhanced_* existe avec la valeur None (champ invalide fitdecode) : la valeur valide du champ non-enhanced est perdue.
- **Preuve** : fit.py l.71 `fields.get("enhanced_speed", fields.get("speed"))` et l.73 idem altitude : `dict.get(k, default)` renvoie la valeur stockée (None) quand la clé existe — vérifié : `{"enhanced_speed": None, "speed": 3.2}.get("enhanced_speed", ...)` → None. fitdecode renvoie None pour un champ présent mais invalide ; l'échantillon devient NaN au lieu de 3.2. Impact borné (interpolation/dérivation de la distance en aval), mais le repli documenté est partiellement inopérant.
- **Action proposée** : Signalement seul (changement de calcul des features → invisible au fixture montagnhard, ne se mesure que sur archive réelle ; protocole moteur).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C113 — [low/refactor] `services/twin-engine/src/twin_engine/ingest/registry.py` (l.176)
- **Défaut** : Pour un .zip sur disque, _prepare charge l'archive ENTIÈRE en RAM (p.read_bytes()) — mémoire O(taille du zip) alors que l'ingestion en flux vise O(1 activité).
- **Preuve** : registry.py:175-179 `data = p.read_bytes()` puis walker._walk_zip garde `data` (+ les octets de chaque zip imbriqué) vivants pendant toute l'itération. Le docstring de _prepare documente le choix (« on lit les octets une seule fois : manifeste Strava + marcheur ») mais un export Garmin de plusieurs Go résiderait intégralement en RAM sur le VPS. iter_activities (l.84-86) ne promet l'O(1) que sur les activités matérialisées, donc pas de contradiction stricte — limite d'architecture à connaître.
- **Action proposée** : Signalement seul : possible ouverture zipfile.ZipFile(path) en direct pour le cas fichier (zips imbriqués restant en RAM), à envisager si des archives multi-Go apparaissent en production.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C114 — [low/refactor] `services/twin-engine/src/twin_engine/ingest/tcx.py` (l.18)
- **Défaut** : Duplication triviale du helper « valeur → float ou NaN » dans trois parseurs : fit._num, tcx._float_or_nan, polar._float_array (variante vectorielle).
- **Preuve** : fit.py:30-37 `_num`, tcx.py:18-25 `_float_or_nan`, polar.py:72-78 `_float_array` — trois implémentations du même contrat (numérique sinon NaN), avec des ensembles d'exceptions légèrement différents (TypeError/ValueError vs ValueError seul vs isinstance).
- **Action proposée** : Signalement seul : factorisable dans _xml.py ou un _num.py commun, mais gain marginal et tout déplacement doit prouver la stricte équivalence (protocole) — à ne faire qu'à l'occasion d'un vrai chantier.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C115 — [low/bug] `services/twin-engine/src/twin_engine/ingest/walker.py` (l.98)
- **Défaut** : Un .zip racine corrompu produit un résultat vide totalement silencieux (aucune entrée skipped), alors qu'une trace corrompue individuelle est signalée avec sa raison.
- **Preuve** : walker.py l.97-99 `except zipfile.BadZipFile: return` (idem archive.py l.130-131 `strava_sport_map` → `return {}`). Dans registry.iter_activities, un fichier `.zip` est exclu du signalement « format non supporté » (l.95 `p.suffix.lower() != ".zip"`), donc un upload de zip tronqué donne activities=[] et skipped=[] sans aucune explication pour l'utilisateur — contrairement au test test_corrupt_member_does_not_abort_archive qui prouve qu'un membre corrompu, lui, est signalé.
- **Action proposée** : Signalement seul : à traiter côté API/pipeline (message « archive illisible » si 0 activité ET 0 skipped) ou skipped explicite — changement de comportement observable, hors périmètre de ce lot.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C116 — [low/inconsistency] `services/twin-engine/src/twin_engine/ingest/walker.py` (l.83)
- **Défaut** : Le pré-filtre de taille min_bytes est appliqué aux entrées de zip (l.117) et aux fichiers de dossier (l.76) mais PAS à un fichier unique passé directement.
- **Preuve** : walker.py l.82-84 : branche `elif recognized(p.name):` yield sans test `st_size >= min_bytes`, contrairement à l.76 (`f.stat().st_size >= min_bytes`) et l.117 (`zi.file_size < min_bytes: continue`). Comportement actuellement exploité par test_ingest.py l.156-159 (meta.json minuscule passé en fichier unique atteint parse_polar → NotActivityData).
- **Action proposée** : Signalement seul + éventuelle phrase dans le docstring de walk_activity_files documentant l'asymétrie voulue (un fichier explicitement fourni est toujours tenté). Ne pas ajouter le filtre (casserait le test existant).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C117 — [low/cleanup] `services/twin-engine/src/twin_engine/ingest/walker.py` (l.127)
- **Défaut** : DEFAULT_MIN_BYTES et DEFAULT_MAX_DEPTH sont exportés dans __all__ mais jamais importés ailleurs, et les paramètres min_bytes/max_depth de walk_activity_files ne sont jamais surchargés par aucun appelant.
- **Preuve** : Grep repo entier : DEFAULT_MIN_BYTES/DEFAULT_MAX_DEPTH n'apparaissent que dans walker.py (définition l.37/39, defaults l.49-50, __all__ l.127). Unique appel de production : registry.py:102 `walk_activity_files(source, path_filter=scope)` ; les tests (test_ingest_garmin.py:107,114-115) n'utilisent pas non plus ces kwargs.
- **Action proposée** : Signalement seul : constantes utilisées comme defaults en interne (pas du code mort au sens strict) ; retirer du __all__ serait cosmétique. Noter aussi que ces seuils sont des constantes en dur raisonnables (bruit Garmin), documentées dans le module.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C118 — [low/cleanup] `services/twin-engine/tests/test_ingest.py` (l.159)
- **Défaut** : Dans test_iter_activities_streams_like_batch, la liste sk2 est collectée mais jamais assertée, et le commentaire « le flux signale les sports ignorés comme le lot » ne correspond pas au scénario exercé (NotActivityData silencieux, pas un skip de sport).
- **Preuve** : test_ingest.py l.154-159 : `sk2: list[dict] = []` puis seule assertion `assert list(iter_activities(bad, running_only=True, skipped=sk2)) == []` — sk2 n'est jamais vérifiée ; meta.json (json non-session) lève NotActivityData → ignoré en silence, donc aucun « sport ignoré » n'est produit ni testé ici (la parité des skips running_only flux/lot est en fait couverte ailleurs, indirectement).
- **Action proposée** : Signalement : ajouter `assert sk2 == []` (ou un vrai cas de sport ignoré) et corriger le commentaire — modification de test uniquement, sans toucher au moteur.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté


## services/twin-engine — science (course/twin/calibration/predict/sufficiency/pacing)

**Résumé du relecteur** : Le cœur scientifique du twin-engine (course, twin, calibration, predict, sufficiency, pacing, pipeline, config) est dans un état sain : les 91 tests du périmètre passent (1 skipped = golden réel Nice, par design), twin.config.json et config.py sont alignés clé par clé à une exception près (course.default_segment_km absent du JSON), et le protocole « flags avec défaut documenté » est respecté dans le code. Aucun bug de calcul n'a été trouvé ; les défauts relevés sont des commentaires/docstrings périmés (défauts de flags qui ont basculé en 2026-07), du code mort prouvé (imports inutilisés, variables jamais lues héritées du _seed), et des textes/clés de présentation codés en dur (« 80 % », « moitié », clé JSON interval_80_*) qui mentiraient si la config changeait. Un seul texte servi à l'utilisateur est factuellement faux dans un régime atteignable (détail « moins de 3 vrais ultras » alors que la CV peut manquer par démotion N_eff avec ≥ 3 ultras). Tout ce qui touche une sortie servie est marqué display_risk=true et proposé en signalement seul, conformément au protocole moteur.

### C119 — [medium/inconsistency] `services/twin-engine/src/twin_engine/sufficiency.py` (l.211) ⚠️ **risque affichage**
- **Défaut** : Le détail du critère « Erreur validation croisée » affirme « moins de 3 vrais ultras → pas de régression » alors que la CV peut être absente avec 3+ ultras (démotion par le plancher N_eff vers le régime blend).
- **Preuve** : sufficiency.py:210-211 : Criterion("Erreur validation croisée", None, None, "non calculable (moins de 3 vrais ultras → pas de régression)"). Or calibration.py:413 exige n >= min_ultras_regression ET n_eff >= min_ultras_regression ; test_calibration.py:156-176 (test_neff_floor_demotes_when_few_recent_ultras) prouve un cas à 4 vrais ultras démoté en REGIME_BLEND → cross_validation None → le texte servi dit « moins de 3 vrais ultras » alors qu'il y en a 4.
- **Action proposée** : Signalement seul (texte servi dans le JSON preview et le rapport) : reformuler le détail pour couvrir la démotion N_eff (ex. « pas de régression exploitable : trop peu de vrais ultras récents »), à valider par Valentin car cela change un texte livré.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C120 — [medium/inconsistency] `services/twin-engine/twin.config.json` (l.4)
- **Défaut** : course.default_segment_km (découpage auto en mode GPX-only) est la seule constante du moteur absente de twin.config.json — elle n'existe que comme défaut dans config.py.
- **Preuve** : Comparaison clé par clé : toutes les autres dataclasses de config.py sont intégralement représentées dans twin.config.json ; le bloc course du JSON (lignes 4-9) n'a que grid_step_m, smooth_window_m, grade_clip, cr0. config.py:35 définit default_segment_km: float = 10.0, consommé par course/profile.py:165 et documenté dans docs/manuel-twin.md:124. Le _comment du JSON (ligne 2) annonce « Surcharge fine possible en éditant ces valeurs ».
- **Action proposée** : Ajouter "default_segment_km": 10.0 au bloc course de twin.config.json — strictement neutre (valeur identique au défaut code), remet la constante dans la source déclarée par le protocole.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C121 — [low/cleanup] `services/twin-engine/src/twin_engine/calibration.py` (l.521)
- **Défaut** : __all__ de calibration.py omet recency_weights alors que la fonction est une API consommée hors module (tests) et que sa jumelle maximality_weights y figure.
- **Preuve** : calibration.py:521-531 : __all__ contient maximality_weights mais pas recency_weights ; tests/test_predict.py:14 importe recency_weights directement (from twin_engine.calibration import … recency_weights).
- **Action proposée** : Ajouter recency_weights à __all__ (neutre : __all__ n'affecte que import *, non utilisé dans le repo).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C122 — [low/inconsistency] `services/twin-engine/src/twin_engine/config.py` (l.344)
- **Défaut** : load_config accepte un data_dir venant de twin.config.json (raw.get("data_dir")) et un littéral "/data", alors que le _comment du JSON et la docstring du module affirment qu'aucun chemin ne vit dans le JSON ni en dur dans le code.
- **Preuve** : config.py:344 : data_dir = Path(os.environ.get("DATA_DIR") or raw.get("data_dir") or "/data") ; twin.config.json:2 : « AUCUN chemin en dur ici. Le dossier de données vient de l'env DATA_DIR » ; config.py:4-5 : « AUCUN chemin en dur dans le code ». Le Dockerfile:43 (ENV DATA_DIR=/data) rend le repli cohérent en conteneur.
- **Action proposée** : Signalement seul : soit retirer le chemin raw.get("data_dir") (changement de comportement de chargement → hors nettoyage neutre), soit aligner les commentaires sur la réalité (repli documenté).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C123 — [low/inconsistency] `services/twin-engine/src/twin_engine/course/profile.py` (l.114)
- **Défaut** : _auto_segmentation contient un repli en dur step_km = 10.0 qui duplique la valeur du défaut de config (CourseParams.default_segment_km).
- **Preuve** : profile.py:113-114 : if step_km <= 0: step_km = 10.0 — garde défensif atteignable uniquement avec une config invalide (≤ 0) ; la valeur nominale vient de cfg.course.default_segment_km (ligne 165, défaut 10.0 dans config.py:35).
- **Action proposée** : Signalement seul (violation en dur bénigne) : inatteignable avec la config livrée ; si nettoyé un jour, lever une erreur ou re-lire le défaut de CourseParams plutôt que dupliquer 10.0.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C124 — [low/dead-code] `services/twin-engine/src/twin_engine/course/spec.py` (l.12)
- **Défaut** : Import mort : field importé de dataclasses mais jamais utilisé dans spec.py.
- **Preuve** : pyflakes : « src/twin_engine/course/spec.py:12:1: 'dataclasses.field' imported but unused » ; aucun field( dans le fichier.
- **Action proposée** : Supprimer field de l'import (neutre prouvé).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C125 — [low/dead-code] `services/twin-engine/src/twin_engine/course/spec.py` (l.43)
- **Défaut** : RaceSpec.official_dplus_m est parsé (from_dict ligne 79) mais jamais lu par aucun calcul du moteur.
- **Preuve** : grep official_dplus sur tout le repo : seules occurrences = définition/parse dans spec.py, la donnée d'exemple nice-100m.json:16, et la doc qui le documente comme non utilisé (docs/manuel-twin.md:140 « official_dplus_m n'est pas utilisé par le moteur ») avec un usage futur planifié (docs/twin-review-2026-07.md §T8 : auto-calibration de la fenêtre de lissage).
- **Action proposée** : Signalement seul — NE PAS supprimer : champ d'entrée documenté et réservé pour le correctif T8 planifié.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C126 — [low/dead-code] `services/twin-engine/src/twin_engine/pacing/plan.py` (l.138)
- **Défaut** : Deux variables mortes dans build_pacing : cum_move (lignes 138 et 143) est accumulée mais jamais lue, et cum_clock = np.zeros(n) (ligne 139) est écrasée inconditionnellement ligne 157.
- **Preuve** : grep cum_move : seules occurrences dans plan.py aux lignes 138 (cum_move = 0.0) et 143 (cum_move += t_move_h[i]), jamais lue ensuite — vestige de _seed/analyse/pacing.py:74-90 qui exportait cum_move_h. cum_clock est réassignée ligne 157 (cum_clock = np.cumsum(t_move_h) + cum_stop_before) sans lecture entre les deux.
- **Action proposée** : Suppression sûre des trois lignes mortes (aucun chemin ne les lit : neutralité prouvée, tests pacing verts).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C127 — [low/refactor] `services/twin-engine/src/twin_engine/pacing/plan.py` (l.170)
- **Défaut** : mult = mc / tpred est calculé avant le garde tpred > 0 et n'est utilisé que dans la branche else (repli percentiles MC) : calcul inutile quand plan_low/high_h sont servis, et division par zéro théorique si tpred == 0.
- **Preuve** : plan.py:169-177 : mc/mult/b_lo/b_hi calculés inconditionnellement ; la branche if (plan_low_h is not None … and tpred > 0) ne consomme que prediction.plan_low_h/high_h ; mult/b_lo/b_hi ne servent que dans le else (lignes 176-177). tpred = prediction.finish_hours ne peut pas être 0 en pratique (point fixe avec v ≥ v_floor).
- **Action proposée** : Signalement seul : déplacer le calcul de mult/b_lo/b_hi dans la branche else serait neutre, mais tout déplacement dans le moteur validé attend une fenêtre de changement dédiée.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C128 — [low/doc-obsolete] `services/twin-engine/src/twin_engine/pipeline.py` (l.6)
- **Défaut** : Docstring du module périmée : « ``full`` (pacing + figures + rapport) est ajouté aux commits 8–9 » alors que analyze_full/run_full existent dans ce même fichier.
- **Preuve** : pipeline.py:6 vs analyze_full (ligne 171) et run_full (ligne 223) implémentés et testés (test_report.py, cli).
- **Action proposée** : Mettre à jour la docstring (commentaire uniquement).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C129 — [low/doc-obsolete] `services/twin-engine/src/twin_engine/predict.py` (l.327)
- **Défaut** : Commentaire trompeur : « chemin historique (défaut sigma_only ; replis blend/vc_e) » alors que le défaut livré de mc_mode est "predictive" depuis le 2026-07-02.
- **Preuve** : predict.py:327 ; twin.config.json:69 "mc_mode": "predictive" ; test_config.py:26 assert cfg.prediction.mc_mode == "predictive" avec commentaire de bascule C3.
- **Action proposée** : Correction de commentaire uniquement (ex. « ancien défaut sigma_only ») — zéro effet runtime.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C130 — [low/inconsistency] `services/twin-engine/src/twin_engine/predict.py` (l.86) ⚠️ **risque affichage**
- **Défaut** : Clés JSON interval_80_low_h/interval_80_high_h codent « 80 » en dur alors que la couverture vient de la config (interval_low/high_pct 10/90) : la clé mentirait si la config changeait.
- **Preuve** : predict.py:86-87 : "interval_80_low_h": round(self.interval_low_h, 3) ; la largeur réelle = interval_high_pct − interval_low_pct (config.py:163-164). Même motif en dur dans sufficiency.py:222 (« intervalle 80% large de … »).
- **Action proposée** : Signalement seul : renommer la clé casserait le contrat JSON servi par l'API (POST /preview) — à ne toucher qu'avec décision explicite et migration côté consommateurs.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C131 — [low/refactor] `services/twin-engine/src/twin_engine/predict.py` (l.204)
- **Défaut** : Dans leave_one_out, un pli dont le point fixe échoue (tp is None) est silencieusement omis, ce qui désaligne errors/is_extrapolation/points des indices de calibration.genuine — un consommateur (test_montagnhard_robustness.py:110) mappe cv.is_extrapolation[i] sur cal.genuine[i] en supposant zéro pli omis.
- **Preuve** : predict.py:203-210 : if tp is None: continue (les listes se compressent) ; tests/test_montagnhard_robustness.py:110 : extrap = {cal.genuine[i].date for i in range(len(cal.genuine)) if cv.is_extrapolation[i]} — correct aujourd'hui (aucun pli n'échoue sur les données du fixture), fragile si un pli échouait.
- **Action proposée** : Signalement seul : exposer l'index de pli (ou l'ultra source) dans CrossValidation lors d'une future fenêtre de changement ; aucun bug actuel démontré.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C132 — [low/doc-obsolete] `services/twin-engine/src/twin_engine/sufficiency.py` (l.192)
- **Défaut** : Commentaire périmé : « ``strict`` (défaut) : MAE brute » alors que le défaut livré est gate_policy="honest".
- **Preuve** : sufficiency.py:192 dit « ``strict`` (défaut) » ; twin.config.json:98 "gate_policy": "honest" et config.py:268 gate_policy: str = "honest" avec commentaire « (DÉFAUT ACTIVÉ) ».
- **Action proposée** : Correction de commentaire uniquement (retirer « (défaut) » de strict ou l'attribuer à honest) — zéro effet runtime.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C133 — [low/inconsistency] `services/twin-engine/src/twin_engine/sufficiency.py` (l.222) ⚠️ **risque affichage**
- **Défaut** : Textes servis codant en dur des valeurs de config : « intervalle 80% » (ligne 222) et « ≈ moitié de la cible » (ligne 152) resteraient faux si interval_low/high_pct ou long_effort_min_fraction changeaient.
- **Preuve** : sufficiency.py:222 f"intervalle 80% large de {rel_width * 100:.0f}% du temps central" ; sufficiency.py:151-152 f"… (≈ moitié de la cible, …)" alors que threshold_s = s.long_effort_min_fraction * finish_hours (ligne 142, fraction configurable, défaut 0.5).
- **Action proposée** : Signalement seul (textes livrés dans criteria.detail → JSON/rapport) : dériver les libellés de la config si un jour ces constantes bougent ; aucun changement tant que les défauts restent 10/90 et 0,5.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C134 — [low/inconsistency] `services/twin-engine/src/twin_engine/sufficiency.py` (l.148)
- **Défaut** : Le plancher d'allure des « efforts longs » est calculé sur le temps ÉCOULÉ (a.ga_km / (a.duration_s/3600)) alors que la calibration calcule la vga des vrais ultras via _basis_hours qui honore twin.speed_basis : les deux filtres divergent si speed_basis="moving" est activé.
- **Preuve** : sufficiency.py:148 vs calibration.py:117-126 (_basis_hours : moving_time_s si speed_basis == "moving") et calibration.py:139-141 (vga_kmh = s.ga_km / hours). Avec le défaut speed_basis="elapsed" (twin.config.json:27), les deux calculs sont identiques — divergence uniquement sous flag non défaut.
- **Action proposée** : Signalement seul : harmoniser via _basis_hours changerait le comportement sous flag → à décider lors d'une éventuelle activation de speed_basis=moving ; rien à faire tant que le défaut est elapsed.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C135 — [low/cleanup] `services/twin-engine/tests/test_course.py` (l.12)
- **Défaut** : Import mort dans les tests : numpy importé mais jamais utilisé dans test_course.py.
- **Preuve** : pyflakes : « tests/test_course.py:12:1: 'numpy as np' imported but unused » ; aucun np. dans le fichier (les profils synthétiques sont en math pur).
- **Action proposée** : Supprimer l'import (neutre).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C136 — [low/doc-obsolete] `services/twin-engine/tests/test_montagnhard_robustness.py` (l.123)
- **Défaut** : Commentaires internes citant les valeurs pré-C1 (σ « 1,539 → ~0,5 », « 25,3 % → ~9–10 % ») alors que le fixture ré-épinglé post-C1 reproduit 1,528/24,8 % (assertions lignes 90 et 96).
- **Preuve** : test_montagnhard_robustness.py:123 « σ ~divisée par 2–3 (1,539 → ~0,5) » et :125 « 25,3 % → ~9–10 % » vs l'en-tête (lignes 4-5) qui documente la recapture post-C1 (24,8 %, 1,528) et relègue 25,3/1,539 à l'historique git ; les assertions elles-mêmes utilisent bien les valeurs post-C1.
- **Action proposée** : Mettre à jour les deux commentaires (aucune assertion ne change).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C137 — [low/cleanup] `services/twin-engine/tests/test_pipeline.py` (l.75)
- **Défaut** : Import mort local : timezone importé dans test_until_excludes_posterior_and_undated_and_anchors_freshness mais jamais utilisé (les dates passent par datetime.fromisoformat avec offset).
- **Preuve** : pyflakes : « tests/test_pipeline.py:75:5: 'datetime.timezone' imported but unused » ; ligne 83 utilise datetime.fromisoformat(f"{iso}T08:00:00+00:00").
- **Action proposée** : Supprimer timezone de l'import (neutre).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté


## services/twin-engine — report/api/cli/jobs

**Résumé du relecteur** : Le sous-système rapport/API/CLI/jobs du twin-engine est globalement sain : la purge des archives (exigence confidentialité) est réellement implémentée à trois niveaux (finally dans run_preview/run_full, purge du dossier upload en fin de job, balayage au démarrage des jobs orphelins + dossiers preview-*), le rendu LaTeX est cohérent avec le contexte injecté (StrictUndefined, tous les placeholders du template existent), et les tests couvrent bien les régressions listées dans DIAGNOSTIC. Le défaut le plus sérieux est un piège de déploiement : twin.config.json n'est ni embarqué dans le wheel (packages=["src/twin_engine"]) ni copié dans l'image Docker, et TWIN_CONFIG_PATH n'est défini nulle part — en production le moteur tourne silencieusement sur les défauts codés en dur (aujourd'hui identiques au JSON, donc aucun changement de comportement, mais toute édition future du JSON serait sans effet). On note aussi des incohérences docs↔code (CLAUDE.md décrit une app apps/twin qui n'existe pas ; le manuel annonce un défaut --race inexistant), du code mort bénin (paramètre athlete de /preview, clés de contexte jamais consommées par le template, scipy/pydantic déclarés mais jamais importés, logo jamais référencé, official_dplus_m parsé mais jamais lu) et une contradiction docstring/comportement sur ce que le job conserve (figures/ et tex/ gardés alors que la docstring dit « que le PDF et les métadonnées »). Aucun de ces correctifs ne touche le calcul scientifique ni l'affichage du site.

### C138 — [medium/doc-obsolete] `CLAUDE.md` (l.44)
- **Défaut** : CLAUDE.md décrit une app apps/twin (pages + api/eligibilite appelant /preview, checkout Stripe, webhook) qui n'existe pas dans le repo — apps/ ne contient que _template et site.
- **Preuve** : ls apps/ → _template, site uniquement. CLAUDE.md arbre : « apps/twin … api/eligibilite/route.ts # appelle le moteur /preview … checkout/route.ts … webhook/route.ts ». docs/manuel-twin.md:91 le confirme : « l'app twin qui la consommera n'existe pas encore — seul le teaser statique /outils/twin du site est en ligne ». Les endpoints /preview, /jobs, /jobs/{id}, /jobs/{id}/report existent bien côté moteur (api/app.py) et sont testés (test_api.py) + documentés (manuel-twin.md §4) : ce n'est pas du code mort, c'est le contrat de la future app — mais la doc racine présente comme existant ce qui est un plan.
- **Action proposée** : Corriger l'arborescence de CLAUDE.md (marquer apps/twin comme « à venir » ou la retirer), sans toucher au moteur.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C139 — [medium/bug] `services/twin-engine/Dockerfile` (l.43)
- **Défaut** : twin.config.json n'est jamais embarqué dans l'image Docker et TWIN_CONFIG_PATH n'est défini nulle part : en production le moteur tourne silencieusement sur les défauts codés en dur de config.py, et toute édition du JSON versionné est sans effet.
- **Preuve** : pyproject.toml [tool.hatch.build.targets.wheel] packages=["src/twin_engine"] (le JSON est à la racine du service, hors wheel) ; le Dockerfile ne COPY que pyproject/README/src et installe le wheel ; grep TWIN_CONFIG_PATH → aucune occurrence dans Dockerfile, compose.local.yml, infra/compose.yml. Dans le conteneur, _default_config_path() = Path(__file__).resolve().parents[2]/"twin.config.json" = /usr/local/lib/python3.11/twin.config.json (inexistant) → load_config() retombe sur les défauts sans erreur. Le _comment du JSON promet pourtant « Surcharge fine possible en éditant ces valeurs ». Aujourd'hui le JSON est strictement identique aux défauts des dataclasses (diff manuel champ à champ, seul course.default_segment_km manque et vaut le défaut) : aucun écart de comportement actuel, mais piège de dérive garanti au premier réglage.
- **Action proposée** : Embarquer twin.config.json dans l'image (COPY + ENV TWIN_CONFIG_PATH=/app/twin.config.json) ou l'inclure au wheel via force-include hatch. Neutre aujourd'hui (valeurs identiques aux défauts) ; à vérifier par pytest + golden avant merge, conformément au protocole moteur.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C140 — [medium/refactor] `services/twin-engine/src/twin_engine/api/app.py` (l.108)
- **Défaut** : POST /jobs et POST /preview chargent l'archive d'entraînement entière en mémoire (await training.read()) alors que le pipeline aval a été explicitement optimisé pour un flux O(1 activité) sur des archives de plusieurs Go.
- **Preuve** : app.py:86 et 108 : tpath.write_bytes(await training.read()). pipeline.py run_preview docstring : « mémoire O(1 activité) au lieu de plusieurs Go sur les archives de milliers de fichiers » — l'optimisation E1 est annulée à la porte HTTP : un upload de N Go = N Go de RAM le temps de l'écriture, par requête concurrente.
- **Action proposée** : Signalement seul : streamer l'upload vers le disque (shutil.copyfileobj(training.file, f) par blocs) au lieu de read(). Aucun changement de calcul ni d'affichage ; contrat HTTP identique.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C141 — [low/doc-obsolete] `docs/manuel-twin.md` (l.82)
- **Défaut** : Le manuel affirme que --race vaut par défaut examples/nice-100m.json, alors que le CLI a default=None (mode GPX-only, découpage auto) — comportement radicalement différent de celui documenté.
- **Preuve** : manuel-twin.md:82 « --race par défaut : examples/nice-100m.json (course de référence) » vs cli.py:71 sp.add_argument("--race", default=None, help="…sans, mode GPX-only…") et cli.py:96-98 : sans --race, RaceSpec(name=Path(args.course).stem).
- **Action proposée** : Corriger le manuel (le défaut est le mode GPX-only, nice-100m.json n'est qu'un exemple).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C142 — [low/dead-code] `services/twin-engine/examples/nice-100m.json` (l.16)
- **Défaut** : Le champ official_dplus_m est parsé dans RaceSpec (spec.py:43,79) mais jamais lu par aucun calcul du moteur — donnée morte, ce que docs/manuel-twin.md admet d'ailleurs explicitement.
- **Preuve** : grep official_dplus_m sur services/twin-engine → uniquement course/spec.py:43 (déclaration), spec.py:79 (parsing) et examples/nice-100m.json:16 (valeur 8900). manuel-twin.md : « (official_dplus_m n'est pas utilisé par le moteur.) ».
- **Action proposée** : Signalement seul : champ documenté comme informatif (carnet de route) ; le retirer casserait des specs JSON existantes pour un gain nul. Ne rien faire ou le documenter dans spec.py.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C143 — [low/cleanup] `services/twin-engine/pyproject.toml` (l.22)
- **Défaut** : scipy>=1.11 et pydantic>=2.6 sont déclarés en dépendances mais jamais importés nulle part dans le service (src, tests, tools) ; scipy alourdit l'image Docker pour rien, et CLAUDE.md le cite pourtant dans la stack du moteur.
- **Preuve** : grep 'import scipy|from scipy|import pydantic|from pydantic' sur tout services/twin-engine → 0 match ; grep scipy sur tout le repo → seulement CLAUDE.md:20 et pyproject.toml:22. pydantic reste une dépendance transitive de FastAPI (le pin explicite est redondant mais pas dangereux).
- **Action proposée** : Signalement : retirer scipy de pyproject (aucun import, image plus légère) et mettre à jour la mention dans CLAUDE.md ; pydantic peut rester comme pin de contrat FastAPI ou être retiré. Vérifier pytest + build Docker avant merge.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C144 — [low/dead-code] `services/twin-engine/src/twin_engine/api/app.py` (l.79)
- **Défaut** : Le champ Form « athlete » de POST /preview est accepté mais jamais utilisé dans le corps de l'endpoint (copier-coller de /jobs) ; même chose pour --athlete du sous-commande preview du CLI.
- **Preuve** : app.py:74-92 : athlete: str = Form("athlète") n'apparaît nulle part dans le corps de preview (grep athlete dans app.py : utilisé seulement par create_job lignes 110-113). cli.py:73 déclare --athlete pour les deux sous-commandes mais la branche preview (lignes 111-121) ne le passe pas à run_preview (qui n'a pas ce paramètre). test_api.py:54 envoie pourtant data={"athlete": "Test"}.
- **Action proposée** : Signalement seul : le retirer changerait le schéma OpenAPI/l'interface CLI (compat clients futurs) ; à trancher quand l'app twin consommera l'API. Sinon, l'utiliser (ex. journalisation) ou le supprimer des deux côtés.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C145 — [low/inconsistency] `services/twin-engine/src/twin_engine/cli.py` (l.54)
- **Défaut** : Le résumé CLI imprime « (80%) » en dur pour l'intervalle de prédiction, alors que les percentiles viennent de la config (prediction.interval_low/high_pct) et que le rapport dérive précisément ces libellés de la config pour ne jamais mentir (interval_pct).
- **Preuve** : cli.py:54 f"[{pred.interval_low_h:.2f} – {pred.interval_high_h:.2f}] (80%)" ; à comparer à context.py:254 "interval_pct": fr(cfg.prediction.interval_high_pct - cfg.prediction.interval_low_pct, 0) dont le commentaire dit « plus de « 80 % » en dur ». Si la config change, le CLI affiche un pourcentage faux.
- **Action proposée** : Dériver le libellé de cfg dans _print_summary (sortie stderr du CLI uniquement, pas le rapport client). Nécessite de passer cfg à _print_summary — signalement.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C146 — [low/inconsistency] `services/twin-engine/src/twin_engine/jobs/runner.py` (l.99)
- **Défaut** : La docstring du module promet « on ne conserve que le PDF et les métadonnées », mais le finally ne purge que upload/ et laisse figures/ et tex/ (main.tex avec toutes les valeurs personnelles + copie des fonts/assets) dans le dossier du job, sans aucun mécanisme de rétention/TTL par ailleurs.
- **Preuve** : runner.py:5 « on ne conserve que le PDF et les métadonnées » vs runner.py:98-99 « # purge l'upload (archive brute + trace), garde figures/tex/report.pdf » + shutil.rmtree(job_dir / "upload"). build_pdf (render.py:55-65) copie cls/math/bib/fonts/assets dans out_dir/tex à chaque job. Aucun code de suppression différée des jobs terminés (grep delete/TTL dans jobs/ : rien) alors que CLAUDE.md dit « On ne conserve que le rapport (le temps du SAV) ».
- **Action proposée** : Signalement : soit purger figures/ et tex/ après copie du PDF (l'archive brute, elle, est bien supprimée — la promesse cœur tient), soit aligner la docstring ; et acter quelque part le mécanisme « temps du SAV » (cron de rétention). Aucun impact calcul.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C147 — [low/doc-obsolete] `services/twin-engine/src/twin_engine/pipeline.py` (l.6)
- **Défaut** : Docstrings historiques périmées : pipeline.py annonce que « full … est ajouté aux commits 8-9 » alors que analyze_full/run_full sont implémentés dans ce même fichier ; pyproject.toml garde « implémenté au commit 11 » pour un CLI qui existe.
- **Preuve** : pipeline.py:6 « ``full`` (pacing + figures + rapport) est ajouté aux commits 8–9 » vs analyze_full (ligne 171) et run_full (ligne 223) présents et testés ; pyproject.toml:36 « CLI qui rejoue le cas Nice 100M de bout en bout (implémenté au commit 11) » — cli.py existe et est couvert par test_cli.py.
- **Action proposée** : Mettre à jour ces deux commentaires (changement de commentaires uniquement, neutre pour le moteur).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C148 — [low/dead-code] `services/twin-engine/src/twin_engine/report/context.py` (l.332)
- **Défaut** : 13 clés du contexte de rapport ne sont référencées ni par report.tex.j2 ni par aucun test : verdict, sellable, sufficiency_reasons, cv_rmse, cv_n, dprime, endurance_E, alpha, durability_pct, n_ultras, dplus_per_km, hr_majority, et figures — cette dernière avec un commentaire mensonger « (rempli par le moteur de rendu) » alors que rien ne la remplit jamais (le template code les chemins figures/*.png en dur).
- **Preuve** : grep 'verdict|sellable|sufficiency_reasons|cv_rmse|cv_n|dprime|n_ultras|hr_majority|dplus_per_km' dans report.tex.j2 → aucun match ; grep ctx[...] dans tests/ → aucun de ces noms. analyze_full (pipeline.py:208-218) construit figures et context séparément sans jamais faire context["figures"] = figures ; le template inclut \includegraphics{figures/profil.png} etc. en dur.
- **Action proposée** : Signalement : suppression sûre pour le PDF (aucun placeholder correspondant dans le template, rendu strictement identique) ; a minima corriger le commentaire de la clé figures. Garder si on veut les considérer comme API implicite du contexte.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C149 — [low/dead-code] `services/twin-engine/src/twin_engine/report/latex/template/assets/logo_deep_primary.png` (l.1)
- **Défaut** : L'asset logo_deep_primary.png du template LaTeX n'est référencé ni par locomotionreport.cls ni par report.tex.j2 (qui n'utilisent que logo_primary_deep et logo_full_white) ; il est pourtant embarqué dans le wheel et copié dans chaque dossier de travail de job.
- **Preuve** : grep logo dans locomotionreport.cls → \LLCoverLogoPath{assets/logo_primary_deep}, \LLHeaderLogoPath{assets/logo_full_white} uniquement ; report.tex.j2:8-9 mêmes deux chemins ; grep logo_deep_primary sur tout le repo → seule autre occurrence : apps/site/components/Navbar.jsx qui référence un fichier .webp distinct du site, pas cet asset. render.py:58 copytree(tpl/"assets") copie le PNG mort dans chaque work_dir.
- **Action proposée** : Suppression sûre du PNG du template (le rendu PDF ne le charge jamais) — après un build_pdf de contrôle. Ne pas toucher au sosie du site.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C150 — [low/cleanup] `services/twin-engine/src/twin_engine/report/narrative.py` (l.498)
- **Défaut** : Plusieurs paramètres de fonctions jamais utilisés dans leur corps (résidus d'harmonisation de signatures) : build_narrative(race), opening_narrative(calibration), figures._fig_cumul(prediction, race), cli._progress(name) ; plus deux micro-scories : twin.summaries.__len__() au lieu de len() et french_datetime absent du __all__ de _format.py alors qu'importé par context.py.
- **Preuve** : narrative.py:498 build_narrative(course, twin, calibration, prediction, plan, race, cfg) — race n'apparaît nulle part dans le corps (lignes 500-524) ; narrative.py:104 opening_narrative(twin, calibration, prediction, cfg) — calibration inutilisé ; figures.py:166 _fig_cumul(plan, prediction, race, ax, interval_label) — prediction et race inutilisés dans le corps (lignes 167-181) ; cli.py:24 _progress(n, name) — name inutilisé ; context.py:301 "n_activities": twin.summaries.__len__() ; _format.py:78 __all__ = ["fr", "fr_thousands", "hm", "tex_escape"] sans french_datetime pourtant importé par context.py:12.
- **Action proposée** : Signalement : nettoyages neutres possibles (retirer les paramètres morts en ajustant les 1-2 appelants, len(), compléter __all__). Zéro effet sur les valeurs calculées ni sur le PDF rendu — vérifier par pytest.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C151 — [low/cleanup] `services/twin-engine/tests/test_api.py` (l.79)
- **Défaut** : Dans test_job_lifecycle, le commentaire « archive d'entraînement purgée après parsing » précède une assertion qui ne vérifie pas du tout la purge (elle teste le verdict) : la suppression de jobs/<id>/upload dans le chemin nominal n'est couverte par aucun test (seul le chemin crash/orphelin l'est).
- **Preuve** : test_api.py:79-80 : « # archive d'entraînement purgée après parsing » suivi de assert body["verdict"] in {…}. La purge nominale est faite par runner.py:99 (finally) mais seul test_startup_sweeps_orphan_jobs_and_previews (ligne 88) vérifie une suppression, et uniquement pour le chemin crash.
- **Action proposée** : Ajouter dans test_job_lifecycle une assertion « not (data_dir/jobs/<id>/upload).exists() » (test seul, aucun code moteur touché) ou déplacer le commentaire.
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté

### C152 — [low/cleanup] `services/twin-engine/tests/test_report.py` (l.143)
- **Défaut** : Motif redondant et fragile dans test_implausible_vc_hidden_with_honest_note : dc_replace(...) if hasattr(...) else twin suivi d'une réassignation inconditionnelle twin_bad.critical_speed = bad — la branche else muterait l'objet partagé, et la ligne 144 rend la ligne 143 inutile.
- **Preuve** : test_report.py:143-144 : « twin_bad = dc_replace(twin, critical_speed=bad) if hasattr(twin, "__dataclass_fields__") else twin » puis « twin_bad.critical_speed = bad ». Twin est toujours une dataclass non gelée : la garde hasattr est morte et la réassignation écrase le résultat du replace.
- **Action proposée** : Simplifier en un seul dc_replace (test uniquement, aucun code moteur).
- **Statut** : ☐ à contre-vérifier ☐ validé ☐ appliqué ☐ écarté



## Étape 10 — revues manquantes, faites en lecture directe (session 3)

### C153 — [low/cleanup] `services/twin-engine/_seed/` ⚠️ décision requise
- **Défaut** : ~8 fichiers d'anciens scripts d'analyse (course.py, extract_all2.py, figs.py, gpx_parse.py, pacing.py, twin_fit.py, plan.json, segments.json), jamais importés par le moteur.
- **Preuve** : grep `_seed` repo entier → uniquement des mentions historiques dans des docstrings (calibration.py:12, twin/record.py:9) et twin-theory.md:352. Aucun import, aucun outil ne les exécute.
- **Action proposée** : purge possible (~valeur d'archive du carnet de labo à arbitrer par Valentin — les docstrings y font référence comme point de comparaison historique).
- **Statut** : ☐ à valider (décision Valentin)

### C154 — [info] `services/twin-engine/tools/` — tous vivants
- ab_montagnhard (exigé par le protocole CLAUDE.md), backtest (consommé par test_backtest_tools + registre), diag_dplus (référencé config + twin-review-2026-07), regen_montagnhard_fixture (protocole fixture), registre (consommé). Rien à purger.
- **Statut** : ✅ vérifié, aucun constat

### C155 — [info] infra + CI — cohérents
- deploy-vps.yml construit 4 images (template, tracking-cache, twin-engine, live-journal) = les 4 services GHCR du compose.yml ; Dockerfile du template présent ; caddy/conf.d cohérent (tracking.caddy actif, twin-engine.caddy.disabled en draft assumé). turbo lint couvre désormais site, _template, tracking, email-gateway.
- **Statut** : ✅ vérifié — reste C072 (env_file complet injecté dans tracking-cache, moindre privilège) à valider

### C156 — [info] docs/ — verdicts par document
- **À jour / conservés** : cloudflare-vps, comprendre-infra-vps, deploy-cloudflare, secrets, email-setup, manuel-monorepo, manuel-twin, twin-theory, twin-registre-couverture, twin-review-2026-07, adr/0001, live-reste-a-faire, live-runbook-ecrins, live-tracking-guide, live-archive-schema, tracking-cache, archive/* (corrigés là où ils étaient périmés, commit ff1b4fd).
- **Aucune purge** : live-brief.md reste en place conformément à docs/archive/README.md (« candidat futur : après le gel du chantier 2 »). Seule suppression candidate restante : apps/site/notes_pratiques.txt (C017, validation requise).
- **Statut** : ✅ revue faite

---

**Total : 152 constats + 4 entrées d'étape 10.**
