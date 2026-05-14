// app/projets/page.jsx
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import ProjectsGrid from "@/components/ProjectsGrid";
import { extractProjectNotes } from "@/lib/extractProjectNotes";

export const metadata = {
  title: "Projets du Labo – Expérimentations vivantes et terrain",
  description:
    "Suivi vivant des expérimentations du Locomotion Lab : ultra minimalisme, respiration consciente, préparation physique et résilience.",
  alternates: {
    canonical: "https://thelocomotionlab.com/projets",
  },
  openGraph: {
    title: "Projets du Labo – Locomotion Lab",
    description:
      "Découvre les expérimentations vivantes du Locomotion Lab : projets de terrain, ultra minimalisme, mouvement et exploration humaine.",
    url: "https://thelocomotionlab.com/projets",
    type: "website",
    images: [
      {
        url: "https://thelocomotionlab.com/images/assets/og-image.jpg",
      },
    ],
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Projets du Labo – Locomotion Lab",
    description:
      "Expérimentations autour du mouvement, de la respiration et de la performance au Locomotion Lab.",
    images: ["https://thelocomotionlab.com/images/assets/og-image.jpg"],
  },
};

function getAllProjects() {
  const projetsDir = path.join(process.cwd(), "public/projets");
  const filenames = fs.existsSync(projetsDir)
    ? fs.readdirSync(projetsDir)
    : [];

  const projets = filenames
    .filter((fn) => fn.endsWith(".md"))
    .map((fn) => {
      const filePath = path.join(projetsDir, fn);
      const fileContent = fs.readFileSync(filePath, "utf8");
      const { data } = matter(fileContent);

      const slug = fn.replace(/\.md$/, "");
      const date = data.date ? new Date(data.date) : null;

      return {
        slug,
        title: data.title || slug,
        date,
        status: data.status || "",
        description: data.description || "",
        published: data.published !== false,
      };
    })
    .filter((p) => p.published)
    .sort((a, b) => {
      if (a.date && b.date) return b.date - a.date;
      return 0;
    });

  return projets;
}

export default function ProjetsPage() {
  const projets = getAllProjects();

  // Notes pré-calculées au build, plus de fetch .md côté client
  const notesMap = Object.fromEntries(
    projets.map((p) => [p.slug, extractProjectNotes(p.slug)])
  );

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      {/* Header */}
      <header className="max-w-3xl mx-auto text-center mb-10">
        <h1 className="text-3xl font-bold font-heading mb-2 text-brand-primary">
          Projets du Labo
        </h1>
        <p className="text-lg text-gray-700">
          <em>Suivi expérimental vivant</em>
        </p>
      </header>

      {/* Grille + filtres en client component */}
      <ProjectsGrid projets={projets} notesMap={notesMap} />
    </main>
  );
}
