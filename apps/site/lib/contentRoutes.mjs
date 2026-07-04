// lib/contentRoutes.mjs
//
// Source unique de vérité du modèle de contenu depuis la refonte
// Comprendre / Explorer :
//   - scan des dossiers public/articles et public/projets (gray-matter) ;
//   - slug = nom de fichier, « kind » = article | recit | projet
//     (public/articles : `type: "article"` → article, tout le reste → recit) ;
//   - routeFor() : LE mapping kind → pilier (/comprendre ou /explorer) ;
//   - contrôle de collision de slugs dans l'espace de noms /explorer.
//
// Format .mjs : ce module est importé à la fois par le code applicatif
// (pages, émetteurs d'URL) et par next.config.mjs (redirections 301),
// qui est chargé par Node en dehors de webpack.

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

function readEntries(dirName, kindOf) {
  const dir = path.join(process.cwd(), "public", dirName);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((fn) => fn.endsWith(".md"))
    .map((fn) => {
      const filePath = path.join(dir, fn);
      const raw = fs.readFileSync(filePath, "utf8");
      const { data, content } = matter(raw);

      return {
        slug: fn.replace(/\.md$/, ""),
        kind: kindOf(data),
        file: path.join("public", dirName, fn),
        filePath,
        data,
        content,
        published: data.published !== false && data.draft !== true,
      };
    });
}

export function listArticleEntries() {
  return readEntries("articles", (data) =>
    data.type === "article" ? "article" : "recit"
  );
}

export function listProjetEntries() {
  return readEntries("projets", () => "projet");
}

export function routeFor(entry) {
  return entry.kind === "article"
    ? `/comprendre/${entry.slug}`
    : `/explorer/${entry.slug}`;
}

/**
 * L'espace de noms /explorer fusionne les récits (public/articles) et les
 * projets (public/projets) : deux fichiers qui produiraient le même slug
 * doivent faire échouer le build, brouillons compris (les redirections 301
 * couvrent aussi les non-publiés).
 */
export function assertNoSlugCollision() {
  const explorer = [
    ...listArticleEntries().filter((e) => e.kind === "recit"),
    ...listProjetEntries(),
  ];

  const bySlug = new Map();
  for (const entry of explorer) {
    const other = bySlug.get(entry.slug);
    if (other) {
      throw new Error(
        `Collision de slugs sur /explorer/${entry.slug} : ` +
          `« ${other.file} » et « ${entry.file} » produisent la même URL. ` +
          `Renomme l'un des deux fichiers.`
      );
    }
    bySlug.set(entry.slug, entry);
  }
}

export function findComprendreEntry(slug) {
  return (
    listArticleEntries().find(
      (e) => e.slug === slug && e.kind === "article" && e.published
    ) ?? null
  );
}

/**
 * Loader unifié de /explorer/[slug] : cherche dans les récits PUIS les
 * projets (l'ordre est garanti sans ambiguïté par assertNoSlugCollision).
 */
export function findExplorerEntry(slug) {
  const recit = listArticleEntries().find(
    (e) => e.slug === slug && e.kind === "recit" && e.published
  );
  if (recit) return recit;

  return (
    listProjetEntries().find((e) => e.slug === slug && e.published) ?? null
  );
}
