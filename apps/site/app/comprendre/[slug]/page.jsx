// app/comprendre/[slug]/page.jsx
//
// Détail d'un concept : le pilier Comprendre n'accueille que cette sorte.
// Les brouillons sont pré-rendus en 404, jamais servis.
export const dynamicParams = false;

import { notFound } from "next/navigation";

import ArticleBody from "@/components/ArticleBody";
import Breadcrumb from "@/components/Breadcrumb";
import SearchHighlighter from "@/components/SearchHighlighter";
import { getRelated } from "@/lib/getRelated";
import {
  listByPilier,
  findComprendreEntry,
  etatDe,
} from "@/lib/contentRoutes.mjs";

import { imageDePartage, LOGO_SIZE, LOGO_URL } from "@/lib/seo";

const SITE_URL = "https://thelocomotionlab.com";

/**
 * Lit un concept à partir de son slug. Retourne null si le fichier n'existe
 * pas ou n'est pas publié.
 */
function readArticle(slug) {
  const entry = findComprendreEntry(slug);
  if (!entry) return null;

  const { data, content } = entry;

  const article = {
    slug,
    title: data.title || slug,
    date: data.date || null,
    cover: data.cover || "",
    description: data.description || "",
    kind: entry.kind,
    kindLabel: entry.label,
    etat: etatDe(entry),
    tags: data.tags || [],
    author: data.author || "",
  };

  return { article, content, frontmatter: data };
}

export async function generateStaticParams() {
  // Les brouillons sont inclus et pré-rendus en 404 (readArticle les refuse) :
  // sous @cloudflare/next-on-pages, une route [slug] sans AUCUN chemin
  // pré-rendu serait traitée comme dynamique et exigerait le runtime edge.
  // Ils deviennent de vraies pages dès published: true, sans autre changement.
  return listByPilier("comprendre").map((e) => ({ slug: e.slug }));
}

/**
 * Métadonnées spécifiques à chaque article
 * → crucial pour l’indexation et les SERP propres
 */
export async function generateMetadata({ params }) {
  const { slug } = await params;

  const data = readArticle(slug);

  // Si l’article n’existe pas / n’est pas publié : on indique de ne pas indexer
  if (!data) {
    return {
      title: "Article introuvable – The Locomotion Lab",
      robots: {
        index: false,
        follow: true,
      },
    };
  }

  const { article } = data;

  const url = `${SITE_URL}/comprendre/${article.slug}`;
  const ogImage = imageDePartage(article.cover);

  const description =
    article.description ||
    "Comprendre : articles de fond sourcés et vulgarisés sur la robustesse physiologique — mouvement, minimalisme, hormèse.";

  return {
    title: article.title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: article.title,
      description,
      url,
      type: "article",
      images: [
        {
          url: ogImage,
        },
      ],
      locale: "fr_FR",
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description,
      images: [ogImage],
    },
  };
}

export default async function ArticlePage({ params }) {
  const { slug } = await params;

  const data = readArticle(slug);

  if (!data) {
    notFound();
  }

  const { article, content } = data;
  const jsonLd = buildArticleJsonLd(article);
  const related = getRelated("comprendre", slug, 3);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Breadcrumb
        items={[
          { href: "/", label: "Accueil" },
          { href: "/comprendre", label: "Comprendre" },
          { label: article.title },
        ]}
      />
      <ArticleBody
        article={article}
        initialContent={content}
        related={related}
        backHref="/comprendre"
        backLabel="Retour à Comprendre"
      />
      <SearchHighlighter targetSelector=".article-body" />
    </>
  );
}

/**
 * Construit un objet JSON-LD de type BlogPosting pour l'article.
 * Permet à Google d'afficher des rich snippets (date, image, auteur, etc.)
 * et améliore la compréhension du contenu par les crawlers.
 */
function buildArticleJsonLd(article) {
  const url = `${SITE_URL}/comprendre/${article.slug}`;
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
      "Comprendre : articles de fond sourcés et vulgarisés sur la robustesse physiologique — mouvement, minimalisme, hormèse.",
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
