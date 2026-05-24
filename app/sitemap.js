// app/sitemap.js
import fs from "fs";
import path from "path";

const URL = "https://thelocomotionlab.com";

/**
 * Fonction utilitaire pour vérifier si un article / projet est publié.
 * Elle lit le contenu du fichier et cherche "published: false" ou "draft: true" dans l'en-tête.
 */
function isPublished(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");

    // On extrait le bloc de configuration YAML (entre les ---)
    const frontmatterMatch = fileContent.match(/^---\n([\s\S]*?)\n---/);

    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];

      // Si on trouve explicitement "published: false" ou "draft: true", on rejette
      if (frontmatter.match(/^published:\s*false/m)) return false;
      if (frontmatter.match(/^draft:\s*true/m)) return false;
    }

    // Par défaut (si pas de mention ou si published: true), on publie
    return true;
  } catch (error) {
    console.error(`Erreur lecture fichier ${filePath}:`, error);
    return false;
  }
}

/**
 * Récupère la date du frontmatter ("date:") si présente,
 * sinon renvoie la date actuelle.
 * → permet d’avoir un lastModified cohérent dans le sitemap
 */
function getFrontmatterDateOrNow(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const frontmatterMatch = fileContent.match(/^---\n([\s\S]*?)\n---/);

    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const dateMatch = frontmatter.match(/^date:\s*["']?(.+?)["']?$/m);

      if (dateMatch && dateMatch[1]) {
        const parsed = new Date(dateMatch[1]);
        if (!isNaN(parsed)) {
          return parsed.toISOString();
        }
      }
    }
  } catch (error) {
    console.error(`Erreur lecture date frontmatter ${filePath}:`, error);
  }

  return new Date().toISOString();
}

export default async function sitemap() {
  // 1. Les routes statiques avec priorités personnalisées
  const routes = [
    { url: "", priority: 1.0, freq: "monthly" },
    { url: "/projets", priority: 0.9, freq: "weekly" },
    { url: "/articles", priority: 0.9, freq: "weekly" },
    { url: "/labo", priority: 0.8, freq: "monthly" },
    { url: "/about", priority: 0.7, freq: "monthly" },
    { url: "/soutenir", priority: 0.6, freq: "monthly" },
    { url: "/contact", priority: 0.5, freq: "yearly" },
    { url: "/recherche", priority: 0.3, freq: "yearly" },
    { url: "/mentions-legales", priority: 0.4, freq: "yearly" },
  ].map((route) => ({
    url: `${URL}${route.url}`,
    lastModified: new Date().toISOString(),
    changeFrequency: route.freq,
    priority: route.priority,
  }));

  // 2. PROJETS (filtrés par published / draft, avec lastModified basé sur le frontmatter.date si présent)
  let projects = [];
  try {
    const projectsDir = path.join(process.cwd(), "public/projets");
    if (fs.existsSync(projectsDir)) {
      projects = fs
        .readdirSync(projectsDir)
        .filter((file) => file.endsWith(".md"))
        .map((file) => {
          const filePath = path.join(projectsDir, file);
          if (!isPublished(filePath)) return null;

          const slug = file.replace(".md", "");
          const lastModified = getFrontmatterDateOrNow(filePath);

          return {
            url: `${URL}/projets/${slug}`,
            lastModified,
            changeFrequency: "weekly",
            priority: 0.9, // Priorité haute pour le contenu
          };
        })
        .filter(Boolean);
    }
  } catch (error) {
    console.error("Erreur sitemap projets:", error);
  }

  // 3. ARTICLES (filtrés par published / draft, avec lastModified basé sur le frontmatter.date si présent)
  let articles = [];
  try {
    const articlesDir = path.join(process.cwd(), "public/articles");
    if (fs.existsSync(articlesDir)) {
      articles = fs
        .readdirSync(articlesDir)
        .filter((file) => file.endsWith(".md"))
        .map((file) => {
          const filePath = path.join(articlesDir, file);
          if (!isPublished(filePath)) return null;

          const slug = file.replace(".md", "");
          const lastModified = getFrontmatterDateOrNow(filePath);

          return {
            url: `${URL}/articles/${slug}`,
            lastModified,
            changeFrequency: "weekly",
            priority: 0.9, // Priorité haute pour le contenu
          };
        })
        .filter(Boolean);
    }
  } catch (error) {
    console.error("Erreur sitemap articles:", error);
  }

  return [...routes, ...projects, ...articles];
}
