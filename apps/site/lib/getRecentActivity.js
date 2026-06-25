import fs from "fs";
import path from "path";
import matter from "gray-matter";

/**
 * Utilitaires pour lire les contenus Markdown
 * depuis /public/articles et /public/projets
 * et construire des feeds récents.
 *
 * Source de vérité :
 * - Articles : date frontmatter (publication) = clé de tri principale
 * - Projets  : date métier = completedAt si status "Terminé",
 *              sinon activityAt, sinon updatedAt en fallback technique
 */

function safeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getProjectActivityDate(item) {
  if (item.type !== "Projet") return null;

  if (item.status === "Terminé" && item.completedAt) {
    return item.completedAt;
  }

  if (item.activityAt) {
    return item.activityAt;
  }

  return item.updatedAt ?? null;
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

        // Nouvelles dates métier projet
        activityAt: safeDate(data.activityAt),
        completedAt: safeDate(data.completedAt),

        // Métadonnées fichier (fallback technique uniquement)
        updatedAt: stats.mtime,

        // Publication
        published: data.published !== false,
      };
    })
    .filter((item) => item.published);
}

/**
 * Articles : tri par date de publication.
 * On n'utilise PAS updatedAt en clé principale pour éviter qu'un edit remonte l'article.
 */
function sortArticlesByPublicationDate(a, b) {
  const ad = a.date?.getTime?.() ?? 0;
  const bd = b.date?.getTime?.() ?? 0;
  if (bd !== ad) return bd - ad;

  // Tie-breaker seulement : si même date (ou absente), on utilise updatedAt
  const au = a.updatedAt?.getTime?.() ?? 0;
  const bu = b.updatedAt?.getTime?.() ?? 0;
  return bu - au;
}

/**
 * Projets : tri par date métier.
 * - status "Terminé" + completedAt => completedAt
 * - sinon activityAt
 * - sinon updatedAt en fallback
 */
function sortProjectsByMeaningfulDate(a, b) {
  const aKey = getProjectActivityDate(a)?.getTime?.() ?? 0;
  const bKey = getProjectActivityDate(b)?.getTime?.() ?? 0;

  if (bKey !== aKey) return bKey - aKey;

  // Tie-breaker 1 : updatedAt technique
  const au = a.updatedAt?.getTime?.() ?? 0;
  const bu = b.updatedAt?.getTime?.() ?? 0;
  if (bu !== au) return bu - au;

  // Tie-breaker 2 : date frontmatter éventuelle
  const ad = a.date?.getTime?.() ?? 0;
  const bd = b.date?.getTime?.() ?? 0;
  return bd - ad;
}

/**
 * Feed mixte : comparaison "récence" selon la nature du contenu
 * - Carnet => date (publication)
 * - Projet => date métier projet
 */
function sortMixedActivity(a, b) {
  const aKey =
    a.type === "Carnet"
      ? a.date?.getTime?.() ?? 0
      : getProjectActivityDate(a)?.getTime?.() ?? 0;

  const bKey =
    b.type === "Carnet"
      ? b.date?.getTime?.() ?? 0
      : getProjectActivityDate(b)?.getTime?.() ?? 0;

  if (bKey !== aKey) return bKey - aKey;

  // Tie-breaker stable : second champ
  const aSecond =
    a.type === "Carnet"
      ? a.updatedAt?.getTime?.() ?? 0
      : a.updatedAt?.getTime?.() ?? 0;

  const bSecond =
    b.type === "Carnet"
      ? b.updatedAt?.getTime?.() ?? 0
      : b.updatedAt?.getTime?.() ?? 0;

  return bSecond - aSecond;
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
    .sort(sortArticlesByPublicationDate)
    .slice(0, limit);
}

export function getRecentProjects({ limit = 3 } = {}) {
  return readMarkdownDir({
    dirRelativeToPublic: "projets",
    type: "Projet",
    baseHref: "/projets",
  })
    .sort(sortProjectsByMeaningfulDate)
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

  return [...articles, ...projets].sort(sortMixedActivity).slice(0, limit);
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