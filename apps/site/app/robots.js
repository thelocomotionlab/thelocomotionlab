import { SITE_URL } from "@/lib/seo";

// Règles explicites pour les principaux crawlers IA. Notre robots.txt
// est totalement permissif (rien à cacher côté contenu) : on les liste
// nommément pour clarifier l'intention. Le blocage effectif des bots
// IA est géré au niveau Cloudflare (Security → Bots) si on le souhaite.
const AI_BOTS = [
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Bytespider",
  "Amazonbot",
  "Meta-ExternalAgent",
  "cohere-ai",
];

// Les outils privés du labo. Ils ne sont liés de nulle part et portent déjà leur
// balise `robots` ; on les nomme quand même ici, parce qu'un chemin deviné une fois
// (un lien collé dans un chat, un `Referer` qui fuit) suffit à le faire indexer.
// Une page de tableau de bord dans un résultat de recherche, c'est une porte annoncée.
const PRIVE = ["/services/twin/tableau-de-bord"];

export default function robots() {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVE },
      ...AI_BOTS.map((bot) => ({ userAgent: bot, allow: "/", disallow: PRIVE })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}