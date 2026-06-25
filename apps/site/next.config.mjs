import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Ce fichier vit dans apps/site/ ; la racine du monorepo est deux niveaux au-dessus.
const appDir = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(appDir, "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Monorepo : indique à Turbopack (utilisé par `next dev`) que la racine du
  // workspace est la racine du repo — sinon Turbopack émet un warning d'inférence
  // de racine et peut mal résoudre la charte du workspace en dev.
  // (Le build de PROD passe par webpack — cf. script `build` = `next build
  // --webpack` ; Turbopack confine la résolution à une racine et casse sous le
  // builder Vercel de @cloudflare/next-on-pages.)
  turbopack: {
    root: monorepoRoot,
  },
  // File-tracing de la sortie : racine maintenue SUR l'app (apps/site), pas sur le
  // monorepo. Sinon, au build via @cloudflare/next-on-pages (Vercel CLI lancé DANS
  // apps/site), Vercel préfixe les chemins tracés par « apps/site/ » puis les rejoint
  // à son workPath (déjà = apps/site) → chemin dédoublé « apps/site/apps/site/.next ».
  // Le site étant quasi 100 % statique/SSG, restreindre le tracing à l'app est sans
  // incidence sur la sortie Cloudflare.
  outputFileTracingRoot: appDir,

  // Transpile la charte partagée (TS/TSX + next/font) consommée depuis le monorepo.
  transpilePackages: ["@locomotionlab/ui"],

  // Autorise l'acces au dev server depuis le LAN (telephone connecte au
  // meme wifi). Sans ca, Next.js bloque les requetes HMR et chunks
  // dynamiques quand on accede via une IP autre que localhost, ce qui
  // empeche les composants `dynamic(...)` de monter (carte, plots, etc.).
  // N'a aucun effet en production.
  allowedDevOrigins: [
    "192.168.1.42",
    "192.168.0.*",
    "192.168.1.*",
    "10.0.0.*",
  ],

  // Tree-shake les gros packages d'icônes / charts / animations :
  // Next n'embarquera dans le bundle client que ce qui est vraiment importé.
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "framer-motion",
    ],
  },

  images: {
    // Sur Cloudflare Pages, l'optimisation d'images Next a des limites :
    // ces formats sont utilisés si la pipeline d'optimisation est active,
    // sinon les WebP existants dans /public sont servis tels quels.
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 640, 828, 1080, 1200, 1920],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 jours
  },

  // Sur Cloudflare Pages via @cloudflare/next-on-pages, ces headers sont
  // traduits en règles `_headers` lors du déploiement.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      // Cache long pour les assets immuables servis depuis /public/images
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Cache long pour les replays GPX / JSON statiques
      {
        source: "/replays/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },

  async redirects() {
    return [
      {
        source: "/live",
        /* destination: 'https://www.thelocomotionlab.com/projets/traversee-reunion#la-travers%C3%A9e-de-la-r%C3%A9union-en-direct', */
        destination:
          "https://www.thelocomotionlab.com/projets/saison-trail-2026#projet-off-fontaine-rémuzat",
        // `permanent: false` effectue une redirection 307 (équivalent au 302).
        // Passe-le à `true` (308/301) uniquement si cette URL `/live` pointera
        // TOUJOURS vers cette page précise, même après ton retour de la Réunion.
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
