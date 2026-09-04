// lib/legacyRedirects.mjs
//
// Toute adresse publiée un jour continue de répondre. Deux couches :
//
//   1. Les anciens rayons /articles et /projets, hérités de l'arborescence
//      d'avant les piliers. Le dossier d'origine d'un atome n'existe plus (la
//      sorte vient de content/<sorte>/), on couvre donc les DEUX espaces de
//      noms pour chaque atome : l'unicité globale des slugs
//      (assertContentRules, règle 1) garantit qu'aucune source n'est ambiguë.
//
//   2. Les atomes RENOMMÉS ou passés d'un pilier à l'autre : chacune de leurs
//      anciennes adresses mène à la neuve. Table SLUG_ALIASES, dans
//      contentRoutes.mjs. Une source égale à sa destination est retirée —
//      sans quoi un changement de pilier à slug constant bouclerait.
//
// Générées AU BUILD depuis content/, par slug EXACT. Consommé par redirects()
// dans next.config.mjs — fonctionne en dev et via @cloudflare/next-on-pages.
// `permanent: true` émet un 308 (équivalent moderne du 301, traité comme
// permanent par les moteurs de recherche).

import {
  listEntries,
  routeFor,
  assertContentRules,
  PILIERS,
  SLUG_ALIASES,
} from "./contentRoutes.mjs";

/** Les anciens rayons, pour un slug donné. */
function rayons(slug) {
  return [`/articles/${slug}`, `/projets/${slug}`];
}

export function buildLegacyRedirects() {
  // Le seul point du build par lequel TOUT passe : c'est ici que les règles de
  // contenu font échouer la compilation si un atome est mal rangé.
  assertContentRules();

  const entries = listEntries();
  const parSlug = new Map(entries.map((e) => [e.slug, e]));

  // Les brouillons reçoivent aussi leur redirection : inoffensif aujourd'hui,
  // robuste le jour où ils sont publiés.
  const heritees = entries.flatMap((entry) =>
    rayons(entry.slug).map((source) => ({
      source,
      destination: routeFor(entry),
      permanent: true,
    }))
  );

  const renommages = Object.entries(SLUG_ALIASES).flatMap(([ancien, actuel]) => {
    const cible = parSlug.get(actuel);
    // assertContentRules a déjà refusé un alias sans cible ; ceinture et
    // bretelles, pour que ce module reste sûr s'il est appelé seul.
    if (!cible) return [];
    const destination = routeFor(cible);

    return [...Object.values(PILIERS).map((p) => `${p}/${ancien}`), ...rayons(ancien)]
      .filter((source) => source !== destination)
      .map((source) => ({ source, destination, permanent: true }));
  });

  // Une source ne peut apparaître qu'une fois : les rayons hérités et les
  // renommages se recouvrent quand un atome a gardé son slug.
  const vues = new Set();
  const uniques = [...renommages, ...heritees].filter(({ source }) => {
    if (vues.has(source)) return false;
    vues.add(source);
    return true;
  });

  return [
    ...uniques,
    // Index : les deux anciens rayons fusionnent dans Explorer.
    { source: "/articles", destination: "/explorer", permanent: true },
    { source: "/projets", destination: "/explorer", permanent: true },
  ];
}
