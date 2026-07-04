// app/comprendre/[slug]/page.jsx
//
// Détail d'un article du pilier Comprendre : uniquement les contenus
// `type: "article"` publiés de public/articles/ (les récits vivent sous
// /explorer/[slug]). Les cartes teaser n'ont volontairement AUCUNE route.
export const dynamicParams = false;

import { notFound } from "next/navigation";

import ArticleBody from "@/components/ArticleBody";
import Breadcrumb from "@/components/Breadcrumb";
import SearchHighlighter from "@/components/SearchHighlighter";
import { getRelatedArticles } from "@/lib/getRelated";
import { listArticleEntries, findComprendreEntry } from "@/lib/contentRoutes.mjs";

const SITE_URL = "https://thelocomotionlab.com";

/**
 * Lit un article à partir de son slug.
 * - retourne null si le fichier n'existe pas, n'est pas publié ou n'est
 *   pas un `type: "article"` (les récits ont leur route sous /explorer)
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
    type: data.type || "",
    tags: data.tags || [],
    author: data.author || "",
  };

  return { article, content, frontmatter: data };
}

export async function generateStaticParams() {
  return listArticleEntries()
    .filter((e) => e.kind === "article" && e.published)
    .map((e) => ({ slug: e.slug }));
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
  const ogImage = article.cover
    ? `${SITE_URL}${article.cover}`
    : `${SITE_URL}/images/assets/og-image.jpg`;

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
  const related = getRelatedArticles(slug, 3);

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
  const imageUrl = article.cover
    ? `${SITE_URL}${article.cover}`
    : `${SITE_URL}/images/assets/og-image.jpg`;

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
        url: `${SITE_URL}/images/assets/og-image.jpg`,
        width: 1200,
        height: 630,
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
