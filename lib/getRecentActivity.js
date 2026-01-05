import fs from "fs";
import path from "path";
import matter from "gray-matter";

/**
 * Utilitaires pour lire les contenus Markdown
 * depuis /public/articles et /public/projets
 * et construire des feeds récents.
 *
 * Source de vérité :
 * - frontmatter (title, description, date, cover, status)
 * - mtime du fichier (updatedAt)
 */

function safeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function readMarkdownDir({ dirRelativeToPublic, type, baseHref }) {
  const dir = path.join(process.cwd(), "public", dirRelativeToPublic);

  if (!fs.existsSync(dir)) return [];

  const filenames = fs.readdirSync(dir);

  return filenames
    .filter((fn) => fn.endsWith(".md"))
    .map((fn) => {
      const filePath = path.join(dir, fn);
      const raw = fs.readFileSync(filePath, "utf8");
      const { data } = matter(raw);

      const slug = fn.replace(/\.md$/, "");
      const stats = fs.statSync(filePath);

      return {
        type, // "Carnet" | "Projet"
        slug,
        href: `${baseHref}/${slug}`,

        // Frontmatter
        title: data.title ?? slug,
        description: data.description ?? "",
        cover: data.cover ?? "",
        status: data.status ?? null,
        date: safeDate(data.date),

        // Métadonnées fichier
        updatedAt: stats.mtime,

        // Publication
        published: data.published !== false,
      };
    })
    .filter((item) => item.published);
}

function sortByRecency(a, b) {
  const au = a.updatedAt?.getTime?.() ?? 0;
  const bu = b.updatedAt?.getTime?.() ?? 0;
  if (bu !== au) return bu - au;

  const ad = a.date?.getTime?.() ?? 0;
  const bd = b.date?.getTime?.() ?? 0;
  return bd - ad;
}

/* ============================
   FEEDS PUBLICS
   ============================ */

export function getRecentArticles({ limit = 3 } = {}) {
  return readMarkdownDir({
    dirRelativeToPublic: "articles",
    type: "Carnet",
    baseHref: "/articles",
  })
    .sort(sortByRecency)
    .slice(0, limit);
}

export function getRecentProjects({ limit = 3 } = {}) {
  return readMarkdownDir({
    dirRelativeToPublic: "projets",
    type: "Projet",
    baseHref: "/projets",
  })
    .sort(sortByRecency)
    .slice(0, limit);
}

/**
 * Feed mixte (optionnel)
 * Utilisé si un jour tu veux un journal global du Labo
 */
export function getRecentActivity({ limit = 6 } = {}) {
  const articles = readMarkdownDir({
    dirRelativeToPublic: "articles",
    type: "Carnet",
    baseHref: "/articles",
  });

  const projets = readMarkdownDir({
    dirRelativeToPublic: "projets",
    type: "Projet",
    baseHref: "/projets",
  });

  return [...articles, ...projets]
    .sort(sortByRecency)
    .slice(0, limit);
}

/* ============================
   HELPERS UI
   ============================ */

export function formatRelativeDays(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((now.getTime() - date.getTime()) / msPerDay);

  if (diffDays <= 0) return "aujourd’hui";
  if (diffDays === 1) return "hier";
  if (diffDays < 7) return `il y a ${diffDays} jours`;

  const weeks = Math.floor(diffDays / 7);
  if (weeks === 1) return "il y a 1 semaine";
  if (weeks < 5) return `il y a ${weeks} semaines`;

  const months = Math.floor(diffDays / 30);
  if (months === 1) return "il y a 1 mois";
  return `il y a ${months} mois`;
}
