// app/projets/[slug]/page.jsx
export const dynamicParams = false;

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { notFound } from "next/navigation";

import ProjetClient from "./ProjetClient";

const SITE_URL = "https://thelocomotionlab.com";

function getProjectFilePath(slug) {
  return path.join(process.cwd(), "public", "projets", `${slug}.md`);
}

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

function readProject(slug) {
  const filePath = getProjectFilePath(slug);

  if (!fs.existsSync(filePath)) return null;

  const fileContent = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(fileContent);

  if (data.published === false) return null;

  const project = {
    slug,
    title: data.title || slug,
    status: data.status || "",
    cover: data.cover || "",
    description: data.description || "",
    tags: data.tags || [],
    date: toDate(data.date),
    completedAt: toDate(data.completedAt),
    activityAt: toDate(data.activityAt),
  };

  return { project, content, frontmatter: data };
}

// Génération statique de tous les slugs de projets publiés
export async function generateStaticParams() {
  const projectsDir = path.join(process.cwd(), "public", "projets");
  if (!fs.existsSync(projectsDir)) return [];

  return fs
    .readdirSync(projectsDir)
    .filter((fn) => fn.endsWith(".md"))
    .map((fn) => fn.replace(/\.md$/, ""))
    .map((slug) => {
      const data = readProject(slug);
      if (!data) return null;
      return { slug };
    })
    .filter(Boolean);
}

export async function generateMetadata({ params }) {
  const { slug } = await params;

  const data = readProject(slug);

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

  const publishedTime = toIsoString(project.date);
  const modifiedTime = toIsoString(project.completedAt || project.activityAt);

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
      locale: "fr_FR",
      images: [{ url: ogImage }],
      ...(publishedTime ? { publishedTime } : {}),
      ...(modifiedTime ? { modifiedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: project.title,
      description,
      images: [ogImage],
    },
    robots: {
      index: true,
      follow: true,
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

  return <ProjetClient project={project} initialContent={content} />;
}