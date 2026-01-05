import fs from "fs";
import path from "path";
import matter from "gray-matter";

/**
 * Unifies "Carnets" (articles) and "Projets" into a single, sortable feed.
 *
 * Sources:
 * - public/articles/*.md
 * - public/projets/*.md
 */

function safeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function readMarkdownDir({ dirRelativeToPublic, type, baseHref }) {
  const dir = path.join(process.cwd(), "public", dirRelativeToPublic);
  const filenames = fs.existsSync(dir) ? fs.readdirSync(dir) : [];

  return filenames
    .filter((fn) => fn.endsWith(".md"))
    .map((fn) => {
      const filePath = path.join(dir, fn);
      const raw = fs.readFileSync(filePath, "utf8");
      const { data } = matter(raw);

      const slug = fn.replace(/\.md$/, "");
      const date = safeDate(data.date);
      const mtime = fs.statSync(filePath).mtime;

      return {
        type, // "Carnet" | "Projet"
        slug,
        href: `${baseHref}/${slug}`,
        title: data.title || slug,
        description: data.description || "",
        cover: data.cover || "",
        date,
        updatedAt: mtime,
        published: data.published !== false,
      };
    })
    .filter((item) => item.published);
}

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

  const all = [...articles, ...projets]
    .sort((a, b) => {
      // Primary: updatedAt (file modified time)
      const au = a.updatedAt?.getTime?.() ?? 0;
      const bu = b.updatedAt?.getTime?.() ?? 0;
      if (bu !== au) return bu - au;

      // Secondary: declared date
      const ad = a.date?.getTime?.() ?? 0;
      const bd = b.date?.getTime?.() ?? 0;
      return bd - ad;
    })
    .slice(0, limit);

  return all;
}

export function formatRelativeDays(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  const now = new Date();
  // Calculate full days difference in local time.
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
