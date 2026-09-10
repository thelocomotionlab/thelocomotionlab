# docs/archive — documents historiques

Documents **terminés ou périmés**, conservés pour la trace (rien n'est supprimé) :

- `refonte-brief.md` — le brief du chantier 1 (refonte de l'IA du site), livré.
- `refonte-chantier1-rapport.md` — le rapport de clôture du chantier 1.
- `etat-infra-vps.md` — instantané de l'infra VPS d'avant Listmonk/twin-engine/
  live-journal. L'état CIBLE vit dans le code : `infra/compose.yml`,
  `infra/caddy/conf.d/`, `infra/.env.example`.

- `live-pr1-plan.md` → `live-pr5-plan.md` — les plans des 5 PR du chantier 2
  (purgés de docs/ à la livraison ; les décisions validées y restent
  consultables, notamment PR1 §13 et les textes actés).

- `live-brief.md` — le brief du chantier 2 (le direct / live v2), livré.
  L'exploitation courante vit désormais dans `docs/live-tracking.md` (doc
  unique), qui a remplacé les anciens `live-runbook-ecrins.md`,
  `live-tracking-guide.md`, `live-reste-a-faire.md`, `tracking-cache.md` et
  `live-archive-schema.md`.

- `audit-ux-ui-site.md`, `plan-staging.md`, `twin-review-2026-07.md` — trois chantiers terminés,
  archivés le 4 septembre 2026.

- `revue-integrale-2026-07/` — le dossier de travail de la revue de code complète de juillet 2026
  (README + constats). Ses correctifs sont appliqués ; le dossier reste comme trace.

- `plan-refonte-contenu.md`, `table-de-migration.md`, `inventaire-contenus.md` — le chantier 3
  (refonte du système de contenu), livré et déployé, archivé le 10 septembre 2026. Le plan
  décrivait une arborescence `content/concepts/` que la refonte n'a pas retenue : le modèle
  effectivement en place est décrit par `docs/systeme-de-contenu.md`, et les anciennes URL
  redirigées vivent dans `apps/site/lib/legacyRedirects.mjs`, pas dans la table de migration.
  (Le fichier d'inventaire s'appelait `invetaire-contenus.md` ; la coquille est corrigée ici.)
