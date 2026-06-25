// app/llms.txt/route.js
//
// Route handler pré-générée au build qui sert un fichier llms.txt
// conforme au standard https://llmstxt.org : un résumé markdown du
// site avec un index des articles et projets, optimisé pour les
// modèles de langage qui veulent comprendre la structure du contenu.
// Cloudflare Pages le sert ensuite comme un asset statique.

import fs from "fs";
import path from "path";
import matter from "gray-matter";

const SITE_URL = "https://thelocomotionlab.com";

export const dynamic = "force-static";

function readMarkdownEntries(dirName) {
  const dir = path.join(process.cwd(), "public", dirName);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((fn) => fn.endsWith(".md"))
    .map((fn) => {
      const slug = fn.replace(/\.md$/, "");
      const raw = fs.readFileSync(path.join(dir, fn), "utf8");
      const { data } = matter(raw);

      if (data.published === false || data.draft === true) return null;

      return {
        slug,
        title: data.title || slug,
        description: data.description || "",
        date: data.date ? new Date(data.date) : null,
        status: data.status || null,
        completedAt: data.completedAt ? new Date(data.completedAt) : null,
        activityAt: data.activityAt ? new Date(data.activityAt) : null,
      };
    })
    .filter(Boolean);
}

function articleDateKey(a) {
  return a.date?.getTime() ?? 0;
}

function projectDateKey(p) {
  if (p.status === "Terminé" && p.completedAt) return p.completedAt.getTime();
  if (p.activityAt) return p.activityAt.getTime();
  return 0;
}

function formatEntry(baseHref, item) {
  const url = `${SITE_URL}${baseHref}/${item.slug}`;
  const desc = item.description ? `: ${item.description}` : "";
  return `- [${item.title}](${url})${desc}`;
}

function buildLlmsTxt() {
  const articles = readMarkdownEntries("articles").sort(
    (a, b) => articleDateKey(b) - articleDateKey(a)
  );
  const projects = readMarkdownEntries("projets").sort(
    (a, b) => projectDateKey(b) - projectDateKey(a)
  );

  const lines = [];
  lines.push("# The Locomotion Lab");
  lines.push("");
  lines.push(
    "> Espace d'exploration de la locomotion humaine, entre rigueur scientifique et expériences personnelles : trail primal, ultra-endurance, minimalisme, hormèse."
  );
  lines.push("");
  lines.push(
    "Le Locomotion Lab est un laboratoire vivant qui explore les facteurs et pratiques favorisant la robustesse physiologique. On y trouve des carnets (articles de fond ou récits), des projets (comptes-rendus de longue haleine type saisons d'entraînement et traversées) et un labo (présentation, méthodes)."
  );
  lines.push("");
  lines.push("## Pages principales");
  lines.push("");
  lines.push(`- [Accueil](${SITE_URL}/)`);
  lines.push(
    `- [Le Labo](${SITE_URL}/labo): présentation des thématiques et méthodes du Locomotion Lab`
  );
  lines.push(
    `- [Carnets](${SITE_URL}/articles): index des articles de fond et récits`
  );
  lines.push(
    `- [Projets](${SITE_URL}/projets): index des projets et comptes-rendus suivis`
  );
  lines.push(`- [À propos](${SITE_URL}/about): qui est derrière le site`);
  lines.push(
    `- [Soutenir](${SITE_URL}/soutenir): comment soutenir le projet`
  );
  lines.push(`- [Contact](${SITE_URL}/contact)`);
  lines.push("");

  if (articles.length) {
    lines.push("## Carnets");
    lines.push("");
    for (const a of articles) {
      lines.push(formatEntry("/articles", a));
    }
    lines.push("");
  }

  if (projects.length) {
    lines.push("## Projets");
    lines.push("");
    for (const p of projects) {
      lines.push(formatEntry("/projets", p));
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function GET() {
  const body = buildLlmsTxt();
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
