import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Ce fichier vit dans apps/site/ ; la racine du monorepo est deux niveaux au-dessus.
const appDir = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(appDir, "../..");

// Next 16 IMPOSE que `turbopack.root` et `outputFileTracingRoot` aient la MÊME
// valeur. Or la racine voulue diffère selon la commande :
//
//   • `next dev` (Turbopack) → racine = MONOREPO : indispensable pour que Turbopack
//     suive le symlink pnpm `apps/site/node_modules/next` vers le store hoisté à la
//     racine du repo (sinon « couldn't find next/package.json » et la page ne
//     compile même pas en dev).
//   • `next build --webpack` (en local ET via @cloudflare/next-on-pages) → racine =
//     APP : webpack suit les symlinks sans contrainte de racine, et garder la racine
//     sur l'app empêche le builder Vercel (lancé DANS apps/site) de dédoubler le
//     chemin de sortie en « apps/site/apps/site/.next » (ENOENT).
//
// On choisit donc la racine selon la PHASE Next et on l'applique aux DEUX réglages
// (toujours égaux → plus de warning « must have the same value »).
const PHASE_PRODUCTION_BUILD = "phase-production-build"; // cf. next/constants

/** @type {(phase: string) => import('next').NextConfig} */
export default function nextConfig(phase) {
  const root = phase === PHASE_PRODUCTION_BUILD ? appDir : monorepoRoot;

  return {
    reactStrictMode: true,
    poweredByHeader: false,

    // Racine du workspace, choisie par phase (cf. explication en tête de fichier).
    turbopack: { root },
    outputFileTracingRoot: root,

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
}
