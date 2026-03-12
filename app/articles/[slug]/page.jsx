// app/articles/[slug]/page.jsx
export const dynamicParams = false;
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { notFound } from "next/navigation";

import ArticleClient from "./ArticleClient";

const SITE_URL = "https://thelocomotionlab.com";

function getArticleFilePath(slug) {
  return path.join(process.cwd(), "public", "articles", `${slug}.md`);
}

/**
 * Lit un article à partir de son slug.
 * - retourne null si le fichier n'existe pas ou si published: false
 * - ne change pas le contenu fonctionnel, seulement la façon de le centraliser
 */
function readArticle(slug) {
  const filePath = getArticleFilePath(slug);

  if (!fs.existsSync(filePath)) return null;

  const fileContent = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(fileContent);

  // Article explicitement non publié → ignoré / 404
  if (data.published === false) return null;

  const article = {
    slug,
    title: data.title || slug,
    date: data.date || null,
    cover: data.cover || "",
    description: data.description || "",
    type: data.type || "",
    tags: data.tags || [],
  };

  return { article, content, frontmatter: data };
}

// Génération statique de tous les slugs d'articles publiés
export async function generateStaticParams() {
  const articlesDir = path.join(process.cwd(), "public", "articles");
  if (!fs.existsSync(articlesDir)) return [];

  const filenames = fs
    .readdirSync(articlesDir)
    .filter((fn) => fn.endsWith(".md"));

  const params = filenames
    .map((fn) => fn.replace(/\.md$/, ""))
    .map((slug) => {
      const data = readArticle(slug);
      if (!data) return null; // non publié ou inexistant
      return { slug };
    })
    .filter(Boolean);

  return params;
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

  const url = `${SITE_URL}/articles/${article.slug}`;
  const ogImage = article.cover
    ? `${SITE_URL}${article.cover}`
    : `${SITE_URL}/images/assets/og-image.jpg`;

  const description =
    article.description ||
    "Carnets du labo : récits, analyses scientifiques et expérimentations autour du mouvement, du minimalisme et de l’hormèse.";

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

  // On garde exactement le même rendu fonctionnel qu’avant
  return <ArticleClient article={article} initialContent={content} />;
}
