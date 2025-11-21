// app/projets/[slug]/page.jsx
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { notFound } from "next/navigation";

import ProjetClient from "./ProjetClient";

// Génération statique de tous les slugs de projets publiés
export async function generateStaticParams() {
  const projectsDir = path.join(process.cwd(), "public", "projets");
  if (!fs.existsSync(projectsDir)) return [];

  const filenames = fs
    .readdirSync(projectsDir)
    .filter((fn) => fn.endsWith(".md"));

  // On lit le frontmatter pour filtrer sur published: true
  return filenames
    .map((fn) => {
      const slug = fn.replace(/\.md$/, "");
      const filePath = path.join(projectsDir, fn);
      const fileContent = fs.readFileSync(filePath, "utf8");
      const { data } = matter(fileContent);

      if (data.published === false) return null; // non publié -> pas de page générée
      return { slug };
    })
    .filter(Boolean);
}

export default async function ProjetPage({ params }) {
  // même pattern que pour ArticlePage
  const { slug } = await params;

  const filePath = path.join(
    process.cwd(),
    "public",
    "projets",
    `${slug}.md`
  );

  if (!fs.existsSync(filePath)) {
    notFound();
  }

  const fileContent = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(fileContent);

  // Projet explicitement non publié → 404
  if (data.published === false) {
    notFound();
  }

  const project = {
    slug,
    title: data.title || slug,
    status: data.status || "",
    cover: data.cover || "",
    description: data.description || "",
    tags: data.tags || [],
    // ajoute d'autres champs de frontmatter ici si besoin
  };

  return <ProjetClient project={project} initialContent={content} />;
}
