// app/sitemap.js
import fs from "fs";
import path from "path";

// L'URL de base de ton site
const URL = "https://thelocomotionlab.com";

export default async function sitemap() {
  // 1. Les routes statiques (pages fixes)
  const routes = [
    "", // correspond à la home /
    "/about",
    "/labo",
    "/projets",
    "/articles",
    "/contact",
    "/soutenir",
    "/mentions-legales",
    "/recherche",
  ].map((route) => ({
    url: `${URL}${route}`,
    lastModified: new Date().toISOString(),
    changeFrequency: "monthly",
    priority: route === "" ? 1 : 0.8,
  }));

  // 2. Récupérer dynamiquement les PROJETS (depuis public/projets)
  let projects = [];
  try {
    const projectsDir = path.join(process.cwd(), "public/projets");
    // On vérifie si le dossier existe pour éviter un crash si vide
    if (fs.existsSync(projectsDir)) {
      const projectFiles = fs
        .readdirSync(projectsDir)
        .filter((file) => file.endsWith(".md"));

      projects = projectFiles.map((file) => {
        const slug = file.replace(".md", "");
        return {
          url: `${URL}/projets/${slug}`,
          lastModified: new Date().toISOString(),
          changeFrequency: "weekly",
          priority: 0.7,
        };
      });
    }
  } catch (error) {
    console.error("Erreur génération sitemap projets:", error);
  }

  // 3. Récupérer dynamiquement les ARTICLES (depuis public/articles)
  let articles = [];
  try {
    const articlesDir = path.join(process.cwd(), "public/articles");
    // On vérifie si le dossier existe
    if (fs.existsSync(articlesDir)) {
      const articleFiles = fs
        .readdirSync(articlesDir)
        .filter((file) => file.endsWith(".md"));

      articles = articleFiles.map((file) => {
        const slug = file.replace(".md", "");
        return {
          url: `${URL}/articles/${slug}`,
          lastModified: new Date().toISOString(),
          changeFrequency: "weekly",
          priority: 0.7,
        };
      });
    }
  } catch (error) {
    console.error("Erreur génération sitemap articles:", error);
  }

  // On fusionne tout dans un seul tableau
  return [...routes, ...projects, ...articles];
}