// lib/buildSearchIndex.js
//
// Construit, au build, un index plat des contenus publiés (articles,
// récits, projets) : titre, description, tags, et texte plain du corps
// markdown. Permet à la page /recherche de charger un seul fichier
// statique (/search-index.json) au lieu de fetch tous les .md à la demande.
// Les hrefs pointent vers les piliers Comprendre / Explorer (contentRoutes).

import {
  listArticleEntries,
  listProjetEntries,
  routeFor,
} from "./contentRoutes.mjs";

function stripMarkdown(md = "") {
  return md
    .replace(/<[a-z][^>]*>/gi, " ") // balises HTML inline (livetracking, postlivetracking…)
    .replace(/<\/[a-z]+>/gi, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // liens : conserve le texte affiché
    .replace(/```[\s\S]*?```/g, " ") // blocs code multi-lignes
    .replace(/`[^`]+`/g, " ") // code inline
    .replace(/:::[\s\S]*?:::/g, " ") // directives (split, etc.)
    .replace(/\{\{cite:[\w-]+\}\}/g, " ") // tokens citations
    .replace(/^\s*#{1,6}\s+/gm, "") // marqueurs de titre
    .replace(/[*_~>]+/g, " ") // emphase / blockquotes
    .replace(/\|/g, " ") // tables markdown
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSearchIndex() {
  return [...listArticleEntries(), ...listProjetEntries()]
    .filter((e) => e.published)
    .map((e) => ({
      type: e.kind, // "article" | "recit" | "projet"
      slug: e.slug,
      href: routeFor(e),
      title: e.data.title || e.slug,
      description: e.data.description || "",
      status: e.data.status || "",
      tags: Array.isArray(e.data.tags) ? e.data.tags.filter(Boolean) : [],
      body: stripMarkdown(e.content),
    }));
}
