// app/sitemap.js
import fs from "fs";
import path from "path";

const URL = "https://thelocomotionlab.com";

/**
 * Fonction utilitaire pour vérifier si un article est publié.
 * Elle lit le contenu du fichier et cherche "published: false" dans l'en-tête.
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
    // 👇 PRIORITÉ BASSE POUR LES MENTIONS LÉGALES
    { url: "/mentions-legales", priority: 0.1, freq: "yearly" },
  ].map((route) => ({
    url: `${URL}${route.url}`,
    lastModified: new Date().toISOString(),
    changeFrequency: route.freq,
    priority: route.priority,
  }));

  // 2. PROJETS (filtrés par published: false)
  let projects = [];
  try {
    const projectsDir = path.join(process.cwd(), "public/projets");
    if (fs.existsSync(projectsDir)) {
      projects = fs
        .readdirSync(projectsDir)
        .filter((file) => file.endsWith(".md"))
        .filter((file) => isPublished(path.join(projectsDir, file))) 
        .map((file) => {
          const slug = file.replace(".md", "");
          return {
            url: `${URL}/projets/${slug}`,
            lastModified: new Date().toISOString(),
            changeFrequency: "weekly",
            priority: 0.9, // Priorité haute pour le contenu
          };
        });
    }
  } catch (error) {
    console.error("Erreur sitemap projets:", error);
  }

  // 3. ARTICLES (filtrés par published: false)
  let articles = [];
  try {
    const articlesDir = path.join(process.cwd(), "public/articles");
    if (fs.existsSync(articlesDir)) {
      articles = fs
        .readdirSync(articlesDir)
        .filter((file) => file.endsWith(".md"))
        .filter((file) => isPublished(path.join(articlesDir, file)))
        .map((file) => {
          const slug = file.replace(".md", "");
          return {
            url: `${URL}/articles/${slug}`,
            lastModified: new Date().toISOString(),
            changeFrequency: "weekly",
            priority: 0.9, // Priorité haute pour le contenu
          };
        });
    }
  } catch (error) {
    console.error("Erreur sitemap articles:", error);
  }

  return [...routes, ...projects, ...articles];
}