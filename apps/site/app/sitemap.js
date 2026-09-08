// app/sitemap.js
//
// Les entrées de contenu viennent du modèle (lib/contenu.js) : le chargeur ne
// rend que ce qui déclare `statut: publie`, un brouillon ne peut donc pas y
// entrer.
import { aventures, parSorte, urlDe } from "@/lib/contenu";
import { listArchives } from "@/lib/archives.mjs";

const URL = "https://thelocomotionlab.com";

/** La date de dernière modification d'une page, du plus précis au plus vague. */
function dateDe(page) {
  const { revise_le, publie_le, date, campagne } = page.frontmatter;
  return revise_le ?? publie_le ?? date ?? campagne?.debut;
}

/** La plus récente d'une liste de pages, en ISO — sert de `lastmod` d'index. */
function laPlusRecente(pages) {
  const dates = pages.map(dateDe).filter(Boolean).sort();
  return dates.length ? new Date(dates[dates.length - 1]).toISOString() : undefined;
}

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
    lastModified: new Date(dateDe(page)).toISOString(),
    changeFrequency: "monthly",
    priority: 0.8,
  }));
}

export default async function sitemap() {
  const campagnes = aventures();
  const billets = [...parSorte("billet"), ...parSorte("recit")];
  const articles = parSorte("article");

  // Les index datent de leur contenu le plus récent. Les pages fixes n'ont
  // pas de `lastmod` : dater la page des mentions légales du jour du dernier
  // déploiement serait faux, et un plan de site qui ment sur ses dates finit
  // par être lu sans elles.
  //
  // `/recherche` et `/studio` n'y sont pas : elles se déclarent `noindex`, et
  // une page interdite d'index n'a rien à faire dans un plan de site.
  const routes = [
    { url: "", priority: 1.0, freq: "monthly", maj: laPlusRecente([...billets, ...articles]) },
    { url: "/aventures", priority: 0.9, freq: "weekly", maj: laPlusRecente(campagnes) },
    { url: "/blog", priority: 0.9, freq: "weekly", maj: laPlusRecente(billets) },
    { url: "/science", priority: 0.9, freq: "weekly", maj: laPlusRecente(articles) },
    { url: "/labo", priority: 0.8, freq: "monthly" },
    { url: "/services", priority: 0.8, freq: "monthly" },
    { url: "/services/twin", priority: 0.8, freq: "monthly" },
    { url: "/services/twin/cohorte", priority: 0.7, freq: "monthly" },
    { url: "/services/ateliers", priority: 0.7, freq: "monthly" },
    { url: "/live", priority: 0.7, freq: "weekly" },
    { url: "/mentions-legales", priority: 0.4, freq: "yearly" },
  ].map((route) => ({
    url: `${URL}${route.url}`,
    ...(route.maj ? { lastModified: route.maj } : {}),
    changeFrequency: route.freq,
    priority: route.priority,
  }));

  // Les directs archivés sont des pages à part entière, à une URL stable.
  const archives = listArchives().map((archive) => ({
    url: `${URL}/live/archives/${archive.slug}`,
    ...(archive.dateDebut ? { lastModified: new Date(archive.dateDebut).toISOString() } : {}),
    changeFrequency: "yearly",
    priority: 0.5,
  }));

  return [...routes, ...archives, ...routesDeContenu()];
}
