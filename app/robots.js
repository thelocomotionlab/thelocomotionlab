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

export default function robots() {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      ...AI_BOTS.map((bot) => ({ userAgent: bot, allow: "/" })),
    ],
    sitemap: "https://thelocomotionlab.com/sitemap.xml",
    host: "https://thelocomotionlab.com",
  };
}