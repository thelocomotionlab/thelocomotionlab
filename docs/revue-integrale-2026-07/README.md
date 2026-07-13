# Revue intégrale du monorepo — juillet 2026

Dossier de travail de la revue de code complète demandée le 2026-07-13. Il sert de **mémoire
partagée entre sessions** : chaque étape ci-dessous est validée par Valentin avant application,
et son état est tenu à jour ici et dans `constats.md`.

**Branche de travail** : `claude/locomotion-lab-review-3kxfg4`.

## Règles de la revue (rappel des contraintes)

1. **L'affichage du site et des apps reste strictement identique.** Tout correctif marqué
   « risque affichage » n'est appliqué qu'après validation explicite, un par un.
2. **Aucun changement de comportement du moteur twin-engine** (validé empiriquement) : seuls les
   nettoyages prouvés neutres (commentaires, docstrings, code inatteignable) sont candidats ;
   `pytest` (190 passed, 2 skipped) doit rester vert après chaque commit.
3. Chaque lot de correctifs = contre-vérification (grep/lecture) → application → `build` + `lint`
   + `test` verts → commit logique.
4. Purge de docs et suppressions de fichiers : uniquement sur validation (liste soumise avant).

## État de référence (établi AVANT toute modification, session 1)

- `pnpm -F site build` : ✅ OK (toutes les routes prérendues)
- `pnpm lint` : ✅ OK (1 warning préexistant : `apps/_template/postcss.config.mjs`)
- `pnpm test` : ✅ OK (vitest site + 67 tests live-journal)
- `pytest services/twin-engine` : ✅ **190 passed, 2 skipped**
- **Lignes de code (baseline)** : 30 850 lignes de code strict (ts/tsx/js/jsx/mjs/py/css,
  hors node_modules/.next/.venv), + 11 252 lignes de configs/LaTeX/yml, + 8 789 lignes de markdown.
  Recompte prévu en fin de revue (étape 12).

## Ce qui a été fait (session 1 — 2026-07-13)

- Repérage complet + baseline verte (ci-dessus).
- Revue multi-agents : **10 relecteurs sur 13 ont terminé** → **152 constats** consignés dans
  [`constats.md`](./constats.md) (C001–C152), classés par sous-système et sévérité.
- **3 relecteurs n'ont pas pu tourner** (limite de session) : `docs/`, `twin-engine tools/_seed`,
  `infra + CI`. À refaire (étape 10).
- La **contre-vérification adversariale n'a pas tourné** : aucun constat n'est encore « confirmé »,
  chacun doit être re-vérifié avant application.
- Incohérences structurelles déjà établies avec certitude :
  - `apps/twin` **n'a jamais existé** dans l'historique git, alors que CLAUDE.md le décrit comme
    présent (pages, routes API). CLAUDE.md décrit un état futur comme s'il était courant.
  - `services/live-journal` (≈4 500 lignes, service actif : CI, compose, Caddy, consommé par le
    site) est **absent** de l'arborescence de CLAUDE.md.

## Plan des étapes restantes (chacune validée avant exécution)

Cocher : ☐ à faire → ☑ validée par Valentin → ✅ faite (commit référencé).

- **Étape 1 — Hygiène triviale du repo** ✅ (session 2, commit `881acc6`)
  `apps/site/log.test` supprimé (sortie systemctl, zéro référence — contre-vérifié).
  Reste en attente de validation : `apps/site/notes_pratiques.txt` (C017, conf nginx périmée +
  conventions d'images à déplacer ?) → traité à l'étape 11.
- **Étape 2 — apps/site : dépendances mortes du package.json** ✅ (session 2, commit `90062c2`)
  11 dépendances retirées après grep de contre-vérification (emailjs-com, framer-motion,
  markdown-it, marked, proj4, proj4leaflet, remark-breaks, recharts, puppeteer, autoprefixer,
  baseline-browser-mapping) ; gray-matter déplacé en dependencies ; framer-motion retiré
  d'optimizePackageImports. Build + lint + tests verts. C019 (pin eslint-config-next) laissé en
  signalement.
- **Étape 3 — apps/site : composants et lib morts** ✅ (session 2, commit `e5059c8`)
  LiveStatusBlock, ProjectsGrid, RecentActivity, NewsletterSignup supprimés (grep repo entier :
  zéro import) ; .pulse-slow/.pulse-fast/.no-scrollbar purgées ; exports morts de
  getRecentActivity ; flag résolu SHOW_OUTILS (Navbar) ; commentaires trompeurs corrigés ;
  .env.example complété. Build 27/27 + lint + 21 tests verts. Les champs morts
  d'embed/nextDeparture (liveConfig) restent à valider (C002 partiel).
- **Étape 4 — apps/site : correctifs À RISQUE AFFICHAGE (décision au cas par cas)** ☐
  Fuite d'écouteurs MapEmbed, flash ShareButton, protocole `[[MD_CAPTION|…]]` sans consommateur,
  promesse MathJax dans Plot, mélange articles/récits de getRelatedArticles. Chaque fix présenté
  avec avant/après, appliqué seulement sur feu vert explicite.
- **Étape 5 — packages/ui + apps/_template** ☐
  Chaîne « preset Tailwind » morte (tailwind-preset.js, apps/site/tailwind.config.mjs,
  @tailwindcss/typography jamais activés), tokens jamais consommés, token trompeur
  `--font-serif: "Ubuntu Serif"` (police inexistante → Georgia dans le Tooltip : tout fix est un
  changement d'affichage, décision requise), warning ESLint du template. Constats : C044–C053.
- **Étape 6 — packages/tracking** ☐
  Commentaires mensongers (« apps/tracking » n'a jamais existé), code mort (statsUrl, timer),
  script typecheck manquant dans turbo/CI ; décision sur `totalDistance` inopérant dans Replay
  (risque affichage). Constats : C054–C069.
- **Étape 7 — services/tracking-cache** ☐
  Nettoyages neutres (bloc if vide, fallback mort, double lecture du cache) + doc de bascule
  obsolète ; décisions sur les fixes de robustesse (dates lexicographiques, délai SIGTERM).
  Constats : C070–C082.
- **Étape 8 — services/email-gateway + services/live-journal (2 bugs HIGH)** ☐
  - C083 (high) : ajouter `"quete"` à l'allowlist SOURCES du Worker (sinon 400 à la bascule) ;
    sort de `"manifeste"`/`"footer"` à décider.
  - C091 (high) : `COPY --from=build /out/assets ./assets` manquant dans le Dockerfile de
    live-journal → og.png/story.png en 500 au premier déploiement.
  - - le reste des constats C084–C102 (null body → 400, borne du rate-limiter, sim, docs).
- **Étape 9 — twin-engine : signalements et nettoyages neutres (C103–C152)** ☐
  Aucun changement de comportement. Docstrings/commentaires périmés, code mort prouvé,
  incohérences twin.config.json ↔ config.py à SIGNALER. `pytest` re-vérifié après chaque commit.
  Tout point touchant un calcul = décision de Valentin (protocole CLAUDE.md).
- **Étape 10 — Les 3 revues manquantes** ☐
  Relancer les relecteurs `docs/`, `twin tools/_seed`, `infra + CI` (workflow réutilisable :
  reprise possible du run `wf_2f0d5be2-aac`). Ajouter leurs constats à `constats.md`.
- **Étape 11 — Docs : mise à jour et purge (liste soumise à validation)** ☐
  CLAUDE.md (apps/twin inexistant → à requalifier « prévu », ajouter live-journal, « manifeste »
  → quete), README de services désynchronisés, docs live-* (état courant vs plans terminés),
  doublons infra. Toute purge/archivage présenté en liste AVANT suppression.
- **Étape 12 — Passe finale** ☐
  Re-vérification complète (build site + lint + vitest + pytest + tsc packages), **comptage final
  des lignes de code**, synthèse de la revue (constats appliqués / écartés / restants).

## Méthode de comptage des lignes (reproductible)

```bash
find apps packages services infra .github -type f \
  \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \
     -o -name "*.mjs" -o -name "*.py" -o -name "*.css" \) \
  -not -path "*/node_modules/*" -not -path "*/.next/*" \
  -not -path "*/__pycache__/*" -not -path "*/.venv/*" | xargs wc -l | tail -1
```
