# CLAUDE.md — Locomotion Lab

Monorepo du Locomotion Lab : le site public (Next.js, JavaScript, `apps/site`), des services conteneurisés
(`services/`), le moteur Locomotion Twin (Python, `services/twin-engine`), la charte partagée (`packages/ui`).

**Ce fichier est la seule règle permanente du dépôt.** Tout ce qui est dans `docs/` est un mode d'emploi ou de
l'histoire, jamais une loi. Une décision prise hier n'est pas un ordre pour aujourd'hui.

## Invariants

1. **La charte vient de `packages/ui` et de nulle part ailleurs** : tokens (`theme.css`), Ubuntu Sans, Computer
   Modern pour les mathématiques, composants. Aucune couleur, police, ombre ou arrondi codé en dur dans une app.
2. **La direction artistique** : sobre, chaude, typographique. Fond crème, ocre doré, bleu-vert de Science,
   terracotta d'Aventures, grille de labo en filigrane. Le texte tutoie, en français, au registre du carnet de bord.
   Aucune image de stock, aucune image générée par IA : des photos de Valentin, ou des visuels calculés depuis ses
   propres données (traces, profils, chiffres, paquetages).
3. **Le site doit builder et se déployer** : `pnpm -F site build`, `lint` et `test` verts avant de proposer un merge.
   Un contenu invalide fait échouer le build, il ne produit pas d'avertissement.
4. **Aucun secret dans le dépôt** (`docs/secrets.md` liste ce qui est attendu en variables d'environnement).
5. **Nouveau code en TypeScript** ; le site reste en JavaScript.
6. **Le moteur Twin est validé empiriquement** : avant d'y toucher, lire `docs/manuel-twin.md` et suivre son protocole
   de preuve.
7. **Avant toute opération destructive** (suppression de fichiers, réécriture d'historique, commande sur le VPS) :
   montrer le plan et attendre le OK.

## Comment travailler

- Une branche par chantier, des commits logiques. Si le chantier touche plus d'un module : un plan d'abord, le code
  après validation.
- Mode d'emploi du dépôt : `docs/manuel-monorepo.md`. Déploiement : `docs/deploy-cloudflare.md`, `docs/runbook-vps.md`.
- Modèle de contenu du site (les sortes, les sections, routage, gabarits, règles de build) :
  `docs/systeme-de-contenu.md`.

## Liberté

- Dans le cadre des invariants, Claude Code choisit librement la structure, les composants, le code et le nommage.
  Si une approche existante gêne, la proposer autrement plutôt que de la contourner.
- Les commentaires de code disent ce que le code fait et pourquoi ce n'est pas évident techniquement. Ils ne portent
  aucune décision éditoriale, aucun « à ne pas changer », aucune référence à un audit, une session ou une date.
- **Ne jamais ajouter de règle, principe, convention, garde-fou ou rappel** — ici ou dans `docs/` — sans que Valentin
  l'ait demandé explicitement dans la session. Un document produit pour un chantier va dans `docs/archive/` quand le
  chantier est fini, et n'engage plus personne.
- Ce fichier tient en une page. S'il doit grandir, on retire avant d'ajouter.