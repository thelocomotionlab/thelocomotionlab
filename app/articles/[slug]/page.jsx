// app/articles/[slug]/page.jsx
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { notFound } from "next/navigation";

import ArticleClient from "./ArticleClient";

// Génération statique de tous les slugs d'articles publiés
export async function generateStaticParams() {
  const articlesDir = path.join(process.cwd(), "public", "articles");
  if (!fs.existsSync(articlesDir)) return [];

  const filenames = fs
    .readdirSync(articlesDir)
    .filter((fn) => fn.endsWith(".md"));

  // On lit le frontmatter pour filtrer sur published: true
  return filenames
    .map((fn) => {
      const slug = fn.replace(/\.md$/, "");
      const filePath = path.join(articlesDir, fn);
      const fileContent = fs.readFileSync(filePath, "utf8");
      const { data } = matter(fileContent);

      if (data.published === false) return null; // non publié -> pas de page générée
      return { slug };
    })
    .filter(Boolean);
}

export default async function ArticlePage({ params }) {
  // ⬇⬇ important : params est une Promise dans ton setup actuel
  const { slug } = await params;

  const filePath = path.join(
    process.cwd(),
    "public",
    "articles",
    `${slug}.md`
  );

  if (!fs.existsSync(filePath)) {
    notFound();
  }

  const fileContent = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(fileContent);

  // Article explicitement non publié → 404
  if (data.published === false) {
    notFound();
  }

  const article = {
    slug,
    title: data.title || slug,
    date: data.date || null,
    cover: data.cover || "",
    description: data.description || "",
    type: data.type || "",
    tags: data.tags || [],
  };

  return <ArticleClient article={article} initialContent={content} />;
}
