// app/explorer/[slug]/page.jsx
//
// Détail unifié du pilier Explorer : le loader cherche dans les récits
// (public/articles, type: "recit") PUIS dans les projets (public/projets),
// et rend le bon corps — ArticleBody pour un récit, ProjetBody (qui monte
// ProjetClientFx) pour un projet. Le contrôle de collision de slugs entre
// les deux dossiers fait échouer le build avec les deux fichiers nommés.
export const dynamicParams = false;

import { notFound } from "next/navigation";

import ArticleBody from "@/components/ArticleBody";
import ProjetBody from "@/components/ProjetBody";
import Breadcrumb from "@/components/Breadcrumb";
import SearchHighlighter from "@/components/SearchHighlighter";
import { getRelatedArticles, getRelatedProjects } from "@/lib/getRelated";
import {
  listArticleEntries,
  listProjetEntries,
  findExplorerEntry,
  assertNoSlugCollision,
} from "@/lib/contentRoutes.mjs";

import { imageDePartage, LOGO_SIZE, LOGO_URL } from "@/lib/seo";

const SITE_URL = "https://thelocomotionlab.com";

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoString(value) {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Lit une fiche Explorer à partir de son slug : récit ou projet publié.
 * Retourne { kind, item, content } ou null (→ 404).
 */
function readExplorerEntry(slug) {
  const entry = findExplorerEntry(slug);
  if (!entry) return null;

  const { data, content } = entry;

  if (entry.kind === "recit") {
    return {
      kind: "recit",
      content,
      item: {
        slug,
        title: data.title || slug,
        date: data.date || null,
        cover: data.cover || "",
        description: data.description || "",
        type: data.type || "",
        tags: data.tags || [],
        author: data.author || "",
      },
    };
  }

  return {
    kind: "projet",
    content,
    item: {
      slug,
      title: data.title || slug,
      status: data.status || "",
      cover: data.cover || "",
      description: data.description || "",
      tags: data.tags || [],
      author: data.author || "",
      date: toDate(data.date),
      completedAt: toDate(data.completedAt),
      activityAt: toDate(data.activityAt),
    },
  };
}

// Génération statique : récits + projets publiés, dans un espace de noms
// commun vérifié sans collision.
export async function generateStaticParams() {
  assertNoSlugCollision();

  const recits = listArticleEntries().filter(
    (e) => e.kind === "recit" && e.published
  );
  const projets = listProjetEntries().filter((e) => e.published);

  return [...recits, ...projets].map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;

  const data = readExplorerEntry(slug);

  if (!data) {
    return {
      title: "Page introuvable – The Locomotion Lab",
      robots: {
        index: false,
        follow: true,
      },
    };
  }

  const { kind, item } = data;

  const url = `${SITE_URL}/explorer/${item.slug}`;
  const ogImage = imageDePartage(item.cover);

  const description =
    item.description ||
    "Explorer : récits d'aventures et projets de terrain du Locomotion Lab — traversées en autonomie, saisons de trail, expérimentations.";

  const base = {
    title: item.title,
    description,
    alternates: {
      canonical: url,
    },
    twitter: {
      card: "summary_large_image",
      title: item.title,
      description,
      images: [ogImage],
    },
  };

  if (kind === "recit") {
    return {
      ...base,
      openGraph: {
        title: item.title,
        description,
        url,
        type: "article",
        images: [{ url: ogImage }],
        locale: "fr_FR",
      },
    };
  }

  const publishedTime = toIsoString(item.date);
  const modifiedTime = toIsoString(item.completedAt || item.activityAt);

  return {
    ...base,
    openGraph: {
      title: item.title,
      description,
      url,
      type: "article",
      locale: "fr_FR",
      images: [{ url: ogImage }],
      ...(publishedTime ? { publishedTime } : {}),
      ...(modifiedTime ? { modifiedTime } : {}),
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function ExplorerEntryPage({ params }) {
  const { slug } = await params;

  const data = readExplorerEntry(slug);

  if (!data) {
    notFound();
  }

  const { kind, item, content } = data;
  const jsonLd =
    kind === "recit" ? buildRecitJsonLd(item) : buildProjectJsonLd(item);
  const related =
    kind === "recit" ? getRelatedArticles(slug, 3) : getRelatedProjects(slug, 3);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Breadcrumb
        items={[
          { href: "/", label: "Accueil" },
          { href: "/explorer", label: "Explorer" },
          { label: item.title },
        ]}
      />
      {kind === "recit" ? (
        <ArticleBody
          article={item}
          initialContent={content}
          related={related}
          backHref="/explorer"
          backLabel="Retour à Explorer"
        />
      ) : (
        <ProjetBody project={item} initialContent={content} related={related} />
      )}
      <SearchHighlighter targetSelector=".article-body" />
    </>
  );
}

/**
 * JSON-LD BlogPosting pour un récit (comportement identique aux anciens
 * articles, URL sous /explorer).
 */
function buildRecitJsonLd(article) {
  const url = `${SITE_URL}/explorer/${article.slug}`;
  const imageUrl = imageDePartage(article.cover);

  const datePublished = article.date
    ? new Date(article.date).toISOString()
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description:
      article.description ||
      "Explorer : récits d'aventures et projets de terrain du Locomotion Lab.",
    image: [imageUrl],
    ...(datePublished ? { datePublished, dateModified: datePublished } : {}),
    author: {
      "@type": "Organization",
      name: "The Locomotion Lab",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "The Locomotion Lab",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: LOGO_URL,
        width: LOGO_SIZE,
        height: LOGO_SIZE,
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    inLanguage: "fr-FR",
    ...(Array.isArray(article.tags) && article.tags.length
      ? { keywords: article.tags.filter(Boolean).join(", ") }
      : {}),
  };
}

/**
 * JSON-LD Article pour un projet. Les projets sont des comptes-rendus de
 * longue haleine (saison de trail, expéditions, formations) : Article avec
 * articleSection "Projet" est le type Schema.org le plus représentatif.
 */
function buildProjectJsonLd(project) {
  const url = `${SITE_URL}/explorer/${project.slug}`;
  const imageUrl = imageDePartage(project.cover);

  const datePublished = toIsoString(project.date);
  const dateModified =
    toIsoString(project.completedAt) ||
    toIsoString(project.activityAt) ||
    datePublished;

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: project.title,
    description:
      project.description ||
      "Projets du labo : expérimentations en cours autour du mouvement, du minimalisme, de l'hormèse et de la performance humaine.",
    image: [imageUrl],
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
    articleSection: "Projet",
    author: {
      "@type": "Organization",
      name: "The Locomotion Lab",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "The Locomotion Lab",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: LOGO_URL,
        width: LOGO_SIZE,
        height: LOGO_SIZE,
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    inLanguage: "fr-FR",
    ...(Array.isArray(project.tags) && project.tags.length
      ? { keywords: project.tags.filter(Boolean).join(", ") }
      : {}),
  };
}
