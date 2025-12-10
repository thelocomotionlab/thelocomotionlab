// app/projets/[slug]/page.jsx
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { notFound } from "next/navigation";

import ProjetClient from "./ProjetClient";

const SITE_URL = "https://thelocomotionlab.com";

function getProjectFilePath(slug) {
  return path.join(process.cwd(), "public", "projets", `${slug}.md`);
}

/**
 * Lit un projet à partir de son slug.
 * - retourne null si le fichier n'existe pas ou si published: false
 * - ne change pas le rendu fonctionnel, juste la centralisation de la lecture
 */
function readProject(slug) {
  const filePath = getProjectFilePath(slug);

  if (!fs.existsSync(filePath)) return null;

  const fileContent = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(fileContent);

  // Projet explicitement non publié → ignoré / 404
  if (data.published === false) return null;

  const project = {
    slug,
    title: data.title || slug,
    status: data.status || "",
    cover: data.cover || "",
    description: data.description || "",
    tags: data.tags || [],
    // ajoute d'autres champs de frontmatter ici si besoin
  };

  return { project, content, frontmatter: data };
}

// Génération statique de tous les slugs de projets publiés
export async function generateStaticParams() {
  const projectsDir = path.join(process.cwd(), "public", "projets");
  if (!fs.existsSync(projectsDir)) return [];

  const filenames = fs
    .readdirSync(projectsDir)
    .filter((fn) => fn.endsWith(".md"));

  const params = filenames
    .map((fn) => fn.replace(/\.md$/, ""))
    .map((slug) => {
      const data = readProject(slug);
      if (!data) return null; // non publié ou inexistant
      return { slug };
    })
    .filter(Boolean);

  return params;
}

/**
 * Métadonnées spécifiques à chaque projet
 * → important pour l’indexation correcte des projets
 */
export async function generateMetadata({ params }) {
  const { slug } = await params;

  const data = readProject(slug);

  // Si le projet n’existe pas / n’est pas publié : on indique de ne pas indexer
  if (!data) {
    return {
      title: "Projet introuvable – The Locomotion Lab",
      robots: {
        index: false,
        follow: true,
      },
    };
  }

  const { project } = data;

  const url = `${SITE_URL}/projets/${project.slug}`;
  const ogImage = project.cover
    ? `${SITE_URL}${project.cover}`
    : `${SITE_URL}/images/assets/og-image.jpg`;

  const description =
    project.description ||
    "Projets du labo : expérimentations en cours autour du mouvement, du minimalisme, de l’hormèse et de la performance humaine.";

  return {
    title: project.title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: project.title,
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
      title: project.title,
      description,
      images: [ogImage],
    },
  };
}

export default async function ProjetPage({ params }) {
  const { slug } = await params;

  const data = readProject(slug);

  if (!data) {
    notFound();
  }

  const { project, content } = data;

  // Rendu identique à avant : on passe le projet et le markdown au composant client
  return <ProjetClient project={project} initialContent={content} />;
}
