// app/search-index.json/route.js
//
// Route handler pré-générée au build (force-static) qui sert l'index
// de recherche en JSON. Cloudflare Pages la traite ensuite comme un
// asset statique avec cache long.

import { buildSearchIndex } from "../../lib/buildSearchIndex";

export const dynamic = "force-static";

export function GET() {
  const index = buildSearchIndex();
  return new Response(JSON.stringify(index), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
    },
  });
}
