// app/llms.txt/route.js
//
// Route handler pré-générée au build qui sert un fichier llms.txt
// conforme au standard https://llmstxt.org : un résumé markdown du
// site avec un index de ses atomes, optimisé pour les
// modèles de langage qui veulent comprendre la structure du contenu.
// Cloudflare Pages le sert ensuite comme un asset statique.

import { listEntries, routeFor } from "@/lib/contentRoutes.mjs";
import { dateActivite } from "@/lib/getRecentActivity";

const SITE_URL = "https://thelocomotionlab.com";

export const dynamic = "force-static";

function shapeEntry(e) {
  const { data } = e;
  return {
    entry: e,
    title: data.title || e.slug,
    description: data.description || "",
    date: data.date ? new Date(data.date) : null,
    activite: dateActivite(e),
  };
}

// Même clé de tri que les index : la date d'activité de l'atome.
function activityDateKey(item) {
  return item.activite?.getTime() ?? item.date?.getTime() ?? 0;
}

function formatEntry(item) {
  const url = `${SITE_URL}${routeFor(item.entry)}`;
  const desc = item.description ? ` : ${item.description}` : "";
  return `- [${item.title}](${url}) (${item.entry.label.toLowerCase()})${desc}`;
}

function buildLlmsTxt() {
  const published = listEntries().filter((e) => e.published);

  const comprendre = published
    .filter((e) => e.pilier === "comprendre")
    .map(shapeEntry)
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));

  const explorer = published
    .filter((e) => e.pilier === "explorer")
    .map(shapeEntry)
    .sort((a, b) => activityDateKey(b) - activityDateKey(a));

  const lines = [];
  lines.push("# The Locomotion Lab");
  lines.push("");
  lines.push(
    "> Espace d'exploration de la robustesse physiologique : mouvement primal, ultra-endurance, minimalisme, hormèse."
  );
  lines.push("");
  lines.push(
    "Le Locomotion Lab est un laboratoire vivant qui explore les facteurs et pratiques favorisant la robustesse physiologique. On y trouve deux piliers : Comprendre (la science — des concepts sourcés, chacun avec sa maturité) et Explorer (le terrain — des expéditions, des protocoles N = 1, des carnets de bord et des fiches de matériel)."
  );
  lines.push("");
  lines.push("## Pages principales");
  lines.push("");
  lines.push(`- [Accueil](${SITE_URL}/)`);
  lines.push(
    `- [La quête](${SITE_URL}/quete): la quête du labo — la robustesse physiologique`
  );
  lines.push(
    `- [Comprendre](${SITE_URL}/comprendre): la science — index des concepts`
  );
  lines.push(
    `- [Explorer](${SITE_URL}/explorer): le terrain — expéditions, protocoles, carnets et fiches`
  );
  lines.push(
    `- [Pratiquer](${SITE_URL}/pratiquer): les ateliers de mouvement primal — dates et inscription`
  );
  lines.push(
    `- [Live](${SITE_URL}/live): le direct des aventures du labo, ou le prochain départ`
  );
  lines.push(
    `- [Outils](${SITE_URL}/outils): les outils construits au labo`
  );
  lines.push(
    `- [Locomotion Twin](${SITE_URL}/outils/twin): prédiction de temps de course calibrée sur les données de l'athlète (en construction)`
  );
  lines.push(`- [À propos](${SITE_URL}/a-propos): qui est derrière le site`);
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
