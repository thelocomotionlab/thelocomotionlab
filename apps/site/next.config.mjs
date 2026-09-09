import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildLegacyRedirects } from "./lib/legacyRedirects.mjs";
import { SITE_HOST_ALIAS, SITE_URL } from "./lib/site.mjs";

// Une page, une adresse. L'apex et le www pointent sur le même déploiement
// Cloudflare : sans cette règle, chaque page du site existe à deux adresses,
// et les moteurs choisissent laquelle indexer à notre place.
//
// ⚠ L'hôte s'écrit TEL QUEL, sans motif : le routeur de Cloudflare compare
// `has.host` à l'égalité stricte (`url.hostname === value`), là où celui de
// Next le lit comme une expression régulière. Un motif ancré, correct pour
// Next, n'est jamais égal à un nom d'hôte — la règle ne partait donc jamais,
// et l'apex répondait 200 au lieu de rediriger. C'est Cloudflare qui sert le
// site : c'est sa règle du jeu qui compte.
const VERS_LHOTE_OFFICIEL = {
  source: "/:chemin*",
  has: [{ type: "host", value: SITE_HOST_ALIAS }],
  destination: `${SITE_URL}/:chemin*`,
  permanent: true,
};

// Le site entier est aussi servi sur les adresses *.pages.dev du projet. Les
// déploiements de prévisualisation reçoivent leur `noindex` de Cloudflare
// lui-même ; l'adresse de PRODUCTION du projet, elle, ne le reçoit pas — d'où
// cette liste, à l'égalité stricte comme ci-dessus.
const HOTES_HORS_INDEX = [
  "thelocomotionlab-website.pages.dev",
  "staging.thelocomotionlab-website.pages.dev",
  "thelocomotionlab-staging.pages.dev",
];
const PREVISUALISATIONS_HORS_INDEX = HOTES_HORS_INDEX.map((hote) => ({
  source: "/(.*)",
  has: [{ type: "host", value: hote }],
  headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
}));

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

    // Transpile les packages partagés (TS/TSX + next/font) consommés depuis le
    // monorepo : la charte (@locomotionlab/ui), le live-tracking
    // (@locomotionlab/tracking — carte maplibre + replay, embed inline natif) et
    // le modèle de contenu (@locomotionlab/contenu — schémas et résolveur).
    transpilePackages: [
      "@locomotionlab/ui",
      "@locomotionlab/tracking",
      "@locomotionlab/contenu",
    ],

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

    // Tree-shake les gros packages d'icônes / charts :
    // Next n'embarquera dans le bundle client que ce qui est vraiment importé.
    // (recharts arrive via packages/tracking, transpilé ci-dessus.)
    experimental: {
      optimizePackageImports: [
        "lucide-react",
        "recharts",
      ],
    },

    images: {
      // Sur Cloudflare Pages, l'optimiseur d'images de Next ne redimensionne
      // rien : `/_next/image?url=…&w=360` renvoie la source, octet pour octet.
      // Les variantes sont donc fabriquées au build et adressées par ce
      // chargeur (scripts/build-images.mjs, lib/imageLoader.js).
      loader: "custom",
      loaderFile: "./lib/imageLoader.js",
      // Les largeurs que Next a le droit de demander — exactement les barreaux
      // fabriqués. En demander une autre renverrait vers un fichier absent.
      deviceSizes: [360, 640, 1080, 1600],
      imageSizes: [96, 256],
    },

    // Sur Cloudflare Pages via @cloudflare/next-on-pages, ces headers sont
    // traduits en règles `_headers` lors du déploiement.
    async headers() {
      return [
        ...PREVISUALISATIONS_HORS_INDEX,
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
        // Cache long pour les assets immuables servis depuis /public/images —
        // et pour les variantes fabriquées au build, qui portent leur largeur
        // dans leur nom et ne changent donc jamais sans changer d'adresse.
        {
          source: "/images-opt/:path*",
          headers: [
            {
              key: "Cache-Control",
              value: "public, max-age=31536000, immutable",
            },
          ],
        },
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
      // L'hôte d'abord : ce qui arrive sur l'apex repart tout de suite vers le
      // www, et la table des anciennes URL n'a plus qu'un hôte à connaître.
      return [VERS_LHOTE_OFFICIEL, ...buildLegacyRedirects()];
    },
  };
}
