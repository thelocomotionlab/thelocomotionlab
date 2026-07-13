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
  hors node_modules/.next/.venv/dist), + 11 252 lignes de configs/LaTeX/yml, + 8 789 lignes de markdown.

## Bilan final (après étapes 4 et 9, session 4 — 2026-07-13)

- Vérification complète re-jouée après tous les correctifs : `pnpm build` ✅, `pnpm lint` ✅,
  `pnpm test` ✅, `pytest services/twin-engine` ✅ **190 passed, 2 skipped — identique à la
  baseline** (aucun changement de comportement moteur).
- **Lignes de code final : 30 266** (baseline 30 850 ; −600 de code mort, +16 nets des correctifs
  des étapes 4/9 : tokens JS, gardes, assertions de test). (+ ~10 300 configs/LaTeX/yml,
  ~8 900 markdown.)
- **76 constats traités** (✅ appliqués), dont les 2 bugs high, 9 fixes d'affichage validés
  (2 changements visibles assumés) et 21 nettoyages neutres du moteur. Le reste = signalements
  documentés dans `constats.md` : changements de comportement du moteur (protocole flag+A/B),
  décisions éditoriales/design, et 3 purges candidates (notes_pratiques.txt, _seed/, chaîne
  preset Tailwind).

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
- **Étape 4 — apps/site : correctifs à risque affichage** ✅ (session 4, commit `52cac3d`,
  validée par Valentin)
  Appliqué : fuite d'écouteurs MapEmbed, promesse MathJax, émission `[[MD_CAPTION]]` retirée,
  flash ShareButton (fill-mode `both`), Tooltip en `span[role=button]` (+ classe morte
  font-inherit), constantes JS `brandColors` dans packages/ui consommées par les 7 composants
  live (rendu identique), Replay en utilitaires brand. Deux changements visibles ASSUMÉS :
  Tooltip Georgia→Lora (`--font-serif`, conforme charte) et titre replay #b66b47→#B67352 (token).
  Restent en signalement : getRelatedArticles (C015, décision éditoriale), SoutenirSection→
  EmailCapture (C026, change les textes), règle h1-h6 var(--font-heading) (C028), sélecteurs
  md-split (C029), citation-ref (C030), compteur de figures (C038), défauts d'altitude (C059),
  gardes de style Live/Replay (C060/C062), bounds spread (C061), icône flaticon (C069).
- **Étape 5 — packages/ui + apps/_template** ✅ partiel (session 3, commit `0298778`)
  Appliqué : tokens --background-size-grid-* morts par construction, warning ESLint du template.
  En attente de décision : chaîne preset Tailwind (C045), `--font-serif: "Ubuntu Serif"` (C044,
  affichage Tooltip), tokens de réserve de palette (C053), graisse Ubuntu 300 (C051).
- **Étape 6 — packages/tracking** ✅ partiel (session 3, commit `0298778`)
  Appliqué : script lint (tsc --noEmit) branché sur turbo, prop fantôme statsUrl, destructuration
  timer, champs dupliqués de ComputedStats, double toFixed redondant, commentaires « apps/tracking »
  corrigés. En attente de décision : totalDistance inopérant en replay (C055), défauts d'altitude
  (C059), gardes de style (C060/C062), couleurs en dur du Replay (C063), icône flaticon (C069).
- **Étape 7 — services/tracking-cache** ✅ partiel (session 3, commit `3d07819`)
  Appliqué : bloc if vide, double lecture du cache, clé outputDir morte. En attente de décision :
  env_file complet (C072, moindre privilège), dates lexicographiques (C075), replis de config
  divergents (C077), SIGTERM vs délai de grâce (C078), debug à 0 (C081), slice avant sort (C082).
- **Étape 8 — services/email-gateway + services/live-journal (2 bugs HIGH)** ✅ partiel
  (session 3, commit `8eb1ecc`) : "quete" ajouté à l'allowlist SOURCES (manifeste/footer gardés
  par tolérance, README aligné) ; COPY des assets ajouté au Dockerfile live-journal. En attente :
  null body → 400 (C085 zone), borne du rate-limiter, constats live-journal restants (C093–C102).
- **Étape 9 — twin-engine : nettoyages neutres** ✅ (session 4, commit `8ef46d1`, validée par
  Valentin — pytest identique : 190 passed, 2 skipped)
  Appliqué : docstrings/commentaires périmés, code mort prouvé (import field, cum_move/cum_clock,
  imports de tests), default_segment_km dans twin.config.json, __all__ calibration, Dockerfile
  embarque enfin twin.config.json (TWIN_CONFIG_PATH — la prod tournait sur les défauts code),
  scipy retiré (zéro import), tests renforcés (purge upload, sk2, dc_replace), manuel-twin
  (--race). Restent en signalement (changements de COMPORTEMENT → protocole flag+A/B) :
  C103 (garde finitude), C104 (interval_ms Polar), C107/C108 (gardes canonical), C112 (repli
  enhanced_*), C113 (zip en RAM), C115 (zip corrompu silencieux), C119/C133 (textes servis),
  C122 (data_dir du JSON), C125/C142 (official_dplus_m, réservé T8), C130 (clé interval_80),
  C131 (plis LOO), C134 (speed_basis), C140 (upload en RAM), C144 (Form athlete), C145 (« 80% »
  CLI), C146 (purge figures/tex), C148 (13 clés contexte), C149 (logo inutilisé — après
  build_pdf de contrôle), C150 (paramètres morts).
- **Étape 10 — Les 3 revues manquantes** ✅ (session 3, en lecture directe — voir fin de
  constats.md, entrées C153–C156)
  tools/ tous vivants ; _seed/ = candidat purge à arbitrer (C153) ; infra/CI cohérents ;
  docs passées en revue une à une, corrections committées (ff1b4fd), aucune purge (convention
  archive respectée).
- **Étape 11 — Docs : mise à jour et purge** ✅ partiel (session 3, commit `ff1b4fd`)
  CLAUDE.md aligné (apps/twin « prévu », live-journal + _template ajoutés, quete, redirections
  308), runbooks/README/guides corrigés sur l'état réel. Purges restantes à valider :
  apps/site/notes_pratiques.txt (C017), services/twin-engine/_seed/ (C153),
  live-brief.md (à archiver seulement après gel du chantier 2).
- **Étape 12 — Passe finale** ✅ (session 3)
  Vérification complète re-jouée (build + lint + tests + pytest) et comptage final : voir
  la synthèse en tête de ce fichier et le rapport de session.

## Méthode de comptage des lignes (reproductible)

```bash
find apps packages services infra .github -type f \
  \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \
     -o -name "*.mjs" -o -name "*.py" -o -name "*.css" \) \
  -not -path "*/node_modules/*" -not -path "*/.next/*" \
  -not -path "*/__pycache__/*" -not -path "*/.venv/*" | xargs wc -l | tail -1
```
