// lib/buildSearchIndex.js
//
// Construit, au build, un index plat des articles et projets publiés :
// titre, description, tags, et texte plain du corps markdown.
// Permet à la page /recherche de charger un seul fichier statique
// (/search-index.json) au lieu de fetch tous les .md à la demande.

import fs from "fs";
import path from "path";
import matter from "gray-matter";

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

function readDir({ dirRelativeToPublic, type, baseHref }) {
  const dir = path.join(process.cwd(), "public", dirRelativeToPublic);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((fn) => fn.endsWith(".md"))
    .map((fn) => {
      const slug = fn.replace(/\.md$/, "");
      const filePath = path.join(dir, fn);
      const raw = fs.readFileSync(filePath, "utf8");
      const { data, content } = matter(raw);

      if (data.published === false) return null;

      return {
        type,
        slug,
        href: `${baseHref}/${slug}`,
        title: data.title || slug,
        description: data.description || "",
        status: data.status || "",
        tags: Array.isArray(data.tags) ? data.tags.filter(Boolean) : [],
        body: stripMarkdown(content),
      };
    })
    .filter(Boolean);
}

export function buildSearchIndex() {
  const articles = readDir({
    dirRelativeToPublic: "articles",
    type: "article",
    baseHref: "/articles",
  });

  const projects = readDir({
    dirRelativeToPublic: "projets",
    type: "project",
    baseHref: "/projets",
  });

  return [...articles, ...projects];
}
