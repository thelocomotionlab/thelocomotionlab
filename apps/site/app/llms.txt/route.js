// app/llms.txt/route.js
//
// Route handler pré-générée au build qui sert un fichier llms.txt
// conforme au standard https://llmstxt.org : un résumé markdown du
// site avec un index des articles et projets, optimisé pour les
// modèles de langage qui veulent comprendre la structure du contenu.
// Cloudflare Pages le sert ensuite comme un asset statique.

import {
  listArticleEntries,
  listProjetEntries,
  routeFor,
} from "@/lib/contentRoutes.mjs";

const SITE_URL = "https://thelocomotionlab.com";

export const dynamic = "force-static";

function shapeEntry(e) {
  const { data } = e;
  return {
    entry: e,
    title: data.title || e.slug,
    description: data.description || "",
    date: data.date ? new Date(data.date) : null,
    activityAt: data.activityAt ? new Date(data.activityAt) : null,
  };
}

// Même clé de tri que l'index /explorer : activityAt ?? date.
function activityDateKey(item) {
  return item.activityAt?.getTime() ?? item.date?.getTime() ?? 0;
}

function formatEntry(item) {
  const url = `${SITE_URL}${routeFor(item.entry)}`;
  const desc = item.description ? `: ${item.description}` : "";
  return `- [${item.title}](${url})${desc}`;
}

function buildLlmsTxt() {
  const published = [...listArticleEntries(), ...listProjetEntries()].filter(
    (e) => e.published
  );

  const comprendre = published
    .filter((e) => e.kind === "article")
    .map(shapeEntry)
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));

  const explorer = published
    .filter((e) => e.kind !== "article")
    .map(shapeEntry)
    .sort((a, b) => activityDateKey(b) - activityDateKey(a));

  const lines = [];
  lines.push("# The Locomotion Lab");
  lines.push("");
  lines.push(
    "> Espace d'exploration de la locomotion humaine, entre rigueur scientifique et expériences personnelles : trail primal, ultra-endurance, minimalisme, hormèse."
  );
  lines.push("");
  lines.push(
    "Le Locomotion Lab est un laboratoire vivant qui explore les facteurs et pratiques favorisant la robustesse physiologique. On y trouve deux piliers : Comprendre (la science — articles de fond sourcés et vulgarisés) et Explorer (le terrain — récits d'aventures et projets au long cours type saisons d'entraînement et traversées)."
  );
  lines.push("");
  lines.push("## Pages principales");
  lines.push("");
  lines.push(`- [Accueil](${SITE_URL}/)`);
  lines.push(
    `- [Le Labo](${SITE_URL}/labo): présentation des thématiques et méthodes du Locomotion Lab`
  );
  lines.push(
    `- [Comprendre](${SITE_URL}/comprendre): la science — index des articles de fond`
  );
  lines.push(
    `- [Explorer](${SITE_URL}/explorer): le terrain — index des récits et projets`
  );
  lines.push(`- [À propos](${SITE_URL}/about): qui est derrière le site`);
  lines.push(
    `- [Soutenir](${SITE_URL}/soutenir): comment soutenir le projet`
  );
  lines.push(`- [Contact](${SITE_URL}/contact)`);
  lines.push("");

  if (comprendre.length) {
    lines.push("## Comprendre");
    lines.push("");
    for (const a of comprendre) {
      lines.push(formatEntry(a));
    }
    lines.push("");
  }

  if (explorer.length) {
    lines.push("## Explorer");
    lines.push("");
    for (const p of explorer) {
      lines.push(formatEntry(p));
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
