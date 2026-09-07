// app/sitemap.js
//
// Les entrées de contenu viennent du modèle (lib/contenu.js) : le chargeur ne
// rend que ce qui déclare `statut: publie`, un brouillon ne peut donc pas y
// entrer.
import { aventures, parSorte, urlDe } from "@/lib/contenu";

const URL = "https://thelocomotionlab.com";

/**
 * Les pages du nouveau modèle de contenu. Le chargeur ne rend que ce qui
 * déclare `statut: publie` : un brouillon ne peut donc pas entrer ici.
 */
function routesDeContenu() {
  const pages = [
    ...aventures(),
    ...parSorte("recit"),
    ...parSorte("billet"),
    ...parSorte("article"),
  ];

  return pages.map((page) => ({
    url: `${URL}${urlDe(page)}`,
    lastModified: new Date(
      page.frontmatter.date ?? page.frontmatter.publie_le ?? page.frontmatter.campagne.debut,
    ).toISOString(),
    changeFrequency: "monthly",
    priority: 0.8,
  }));
}

export default async function sitemap() {
  // 1. Les routes statiques avec priorités personnalisées
  const routes = [
    { url: "", priority: 1.0, freq: "monthly" },
    { url: "/aventures", priority: 0.9, freq: "weekly" },
    { url: "/blog", priority: 0.9, freq: "weekly" },
    { url: "/science", priority: 0.9, freq: "weekly" },
    { url: "/labo", priority: 0.8, freq: "monthly" },
    { url: "/services", priority: 0.8, freq: "monthly" },
    { url: "/live", priority: 0.7, freq: "weekly" },
    { url: "/outils/twin/cohorte", priority: 0.7, freq: "monthly" },
    { url: "/recherche", priority: 0.3, freq: "yearly" },
    { url: "/mentions-legales", priority: 0.4, freq: "yearly" },
  ].map((route) => ({
    url: `${URL}${route.url}`,
    lastModified: new Date().toISOString(),
    changeFrequency: route.freq,
    priority: route.priority,
  }));

  return [...routes, ...routesDeContenu()];
}
