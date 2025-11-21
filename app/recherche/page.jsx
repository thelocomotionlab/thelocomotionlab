// app/recherche/page.jsx
import fs from "fs";
import path from "path";
import matter from "gray-matter";

import SearchClient from "./SearchClient";

export const metadata = { /* … comme avant … */ };

// Articles
function getAllArticlesMeta() {
  const articlesDir = path.join(process.cwd(), "public", "articles");
  if (!fs.existsSync(articlesDir)) return [];

  const filenames = fs
    .readdirSync(articlesDir)
    .filter((fn) => fn.endsWith(".md"));

  return filenames
    .map((fn) => {
      const slug = fn.replace(/\.md$/, "");
      const fullPath = path.join(articlesDir, fn);
      const fileContent = fs.readFileSync(fullPath, "utf8");
      const { data } = matter(fileContent);

      // ⬇⬇ uniquement les articles publiés
      if (data.published === false) return null;

      return {
        slug,
        title: data.title || slug,
        date: data.date || null,
        description: data.description || "",
        tags: data.tags || [],
      };
    })
    .filter(Boolean);
}

// Projets
function getAllProjectsMeta() {
  const projectsDir = path.join(process.cwd(), "public", "projets");
  if (!fs.existsSync(projectsDir)) return [];

  const filenames = fs
    .readdirSync(projectsDir)
    .filter((fn) => fn.endsWith(".md"));

  return filenames
    .map((fn) => {
      const slug = fn.replace(/\.md$/, "");
      const fullPath = path.join(projectsDir, fn);
      const fileContent = fs.readFileSync(fullPath, "utf8");
      const { data } = matter(fileContent);

      // ⬇⬇ uniquement les projets publiés
      if (data.published === false) return null;

      return {
        slug,
        title: data.title || slug,
        status: data.status || "",
        description: data.description || "",
        tags: data.tags || [],
      };
    })
    .filter(Boolean);
}

export default function SearchPage() {
  const articles = getAllArticlesMeta();
  const projects = getAllProjectsMeta();

  return <SearchClient articles={articles} projects={projects} />;
}
