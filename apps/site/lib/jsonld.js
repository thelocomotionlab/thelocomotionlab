// lib/jsonld.js
//
// LES DONNÉES STRUCTURÉES DU SITE (schema.org), en un seul endroit.
//
// Elles disent aux moteurs ce qu'une page EST : un article daté, signé, révisé,
// rattaché à un fil d'Ariane. C'est ce qui permet à une page de contenu de
// sortir autrement qu'en lien bleu — date, auteur, image — et c'est aussi ce
// qui rattache toutes les pages à une même organisation.
//
// Rien n'est inventé ici : chaque champ vient du frontmatter ou de la charte.

import { LOGO_SIZE, LOGO_URL, SITE_URL, imageDePartage } from "@/lib/seo";

const NOM = "The Locomotion Lab";

/** L'organisation, citée comme éditeur par toutes les pages de contenu. */
export const ORGANISATION = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organisation`,
  name: NOM,
  url: SITE_URL,
  logo: { "@type": "ImageObject", url: LOGO_URL, width: LOGO_SIZE, height: LOGO_SIZE },
  founder: { "@type": "Person", name: "Valentin Fer" },
  sameAs: ["https://www.instagram.com/valent1.fer"],
};

/**
 * Une page de contenu : `Article` pour Science (document révisé),
 * `BlogPosting` pour le carnet et les récits.
 *
 * @param {object} page                  la page du modèle de contenu
 * @param {object} options
 * @param {string} options.url           son URL, sans le domaine
 * @param {string} [options.type]        `Article` ou `BlogPosting`
 * @param {string} [options.description] remplace le chapeau (qui peut valoir
 *   « TODO », comme dans le fil du carnet où l'amorce du texte prend le relais)
 */
export function pageDeContenu(page, { url, type = "BlogPosting", description }) {
  const f = page.frontmatter;
  const publiee = f.publie_le ?? f.date ?? f.campagne?.debut;
  const revisee = f.revise_le ?? f.revisions?.[0]?.date ?? publiee;
  const resume = description ?? (f.chapeau !== "TODO" ? f.chapeau : undefined);

  return {
    "@context": "https://schema.org",
    "@type": type,
    "@id": `${SITE_URL}${url}#page`,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}${url}` },
    url: `${SITE_URL}${url}`,
    headline: f.titre,
    ...(resume ? { description: resume } : {}),
    ...(publiee ? { datePublished: publiee } : {}),
    ...(revisee ? { dateModified: revisee } : {}),
    author: { "@type": "Person", name: f.auteur ?? "Valentin Fer" },
    publisher: ORGANISATION,
    ...(f.cover && f.cover !== "TODO" ? { image: [imageDePartage(f.cover)] } : {}),
    inLanguage: "fr-FR",
    isAccessibleForFree: true,
  };
}

/**
 * Le fil d'Ariane, dans le même ordre que celui qui s'affiche. Le dernier
 * maillon est la page elle-même : il n'a pas d'URL.
 */
export function filDAriane(maillons) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: maillons.map((maillon, rang) => ({
      "@type": "ListItem",
      position: rang + 1,
      name: maillon.label,
      ...(maillon.href ? { item: `${SITE_URL}${maillon.href}` } : {}),
    })),
  };
}
