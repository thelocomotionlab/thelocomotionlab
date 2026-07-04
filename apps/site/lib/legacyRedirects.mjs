// lib/legacyRedirects.mjs
//
// Redirections permanentes héritées de l'ancienne arborescence (/articles,
// /projets) vers les piliers Comprendre / Explorer. Générées AU BUILD depuis
// le frontmatter (champ `type`), par slug EXACT : les fichiers bruts
// /articles/<slug>.md et /projets/<slug>.md servis depuis public/ ne sont
// donc jamais capturés. Les brouillons (published: false) reçoivent aussi
// leur redirection : inoffensif aujourd'hui, robuste pour l'avenir.
//
// Consommé par redirects() dans next.config.mjs — fonctionne en dev et via
// @cloudflare/next-on-pages. `permanent: true` émet un 308 (équivalent
// moderne du 301, traité comme permanent par les moteurs de recherche).

import {
  listArticleEntries,
  listProjetEntries,
  routeFor,
  assertNoSlugCollision,
} from "./contentRoutes.mjs";

export function buildLegacyRedirects() {
  assertNoSlugCollision();

  const perSlug = [
    ...listArticleEntries().map((e) => ({
      source: `/articles/${e.slug}`,
      destination: routeFor(e),
      permanent: true,
    })),
    ...listProjetEntries().map((e) => ({
      source: `/projets/${e.slug}`,
      destination: routeFor(e),
      permanent: true,
    })),
  ];

  return [
    ...perSlug,
    // Index : les deux anciens rayons fusionnent dans Explorer.
    { source: "/articles", destination: "/explorer", permanent: true },
    { source: "/projets", destination: "/explorer", permanent: true },
  ];
}
