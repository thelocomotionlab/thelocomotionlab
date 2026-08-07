// app/sitemap.js
//
// Les entrées de contenu s'appuient sur lib/contentRoutes.mjs (source
// unique) : filtrage published/draft via gray-matter et URLs vers les
// piliers Comprendre / Explorer. Brouillons et cartes teaser exclus.
import {
  listArticleEntries,
  listProjetEntries,
  routeFor,
} from "@/lib/contentRoutes.mjs";

const URL = "https://thelocomotionlab.com";

/**
 * Date du frontmatter ("date:") si présente et valide, sinon la date
 * actuelle → lastModified cohérent dans le sitemap.
 */
function frontmatterDateOrNow(data) {
  if (data.date) {
    const parsed = new Date(data.date);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

export default async function sitemap() {
  // 1. Les routes statiques avec priorités personnalisées
  const routes = [
    { url: "", priority: 1.0, freq: "monthly" },
    { url: "/explorer", priority: 0.9, freq: "weekly" },
    { url: "/comprendre", priority: 0.9, freq: "weekly" },
    { url: "/pratiquer", priority: 0.9, freq: "weekly" },
    { url: "/quete", priority: 0.8, freq: "monthly" },
    { url: "/live", priority: 0.7, freq: "weekly" },
    { url: "/outils/twin", priority: 0.7, freq: "monthly" },
    { url: "/outils/twin/cohorte", priority: 0.6, freq: "monthly" },
    { url: "/outils", priority: 0.6, freq: "monthly" },
    { url: "/a-propos", priority: 0.7, freq: "monthly" },
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

  // 2. Contenus publiés (articles → /comprendre, récits + projets → /explorer)
  let entries = [];
  try {
    entries = [...listArticleEntries(), ...listProjetEntries()]
      .filter((e) => e.published)
      .map((e) => ({
        url: `${URL}${routeFor(e)}`,
        lastModified: frontmatterDateOrNow(e.data),
        changeFrequency: "weekly",
        priority: 0.9, // Priorité haute pour le contenu
      }));
  } catch (error) {
    console.error("Erreur sitemap contenus:", error);
  }

  return [...routes, ...entries];
}
