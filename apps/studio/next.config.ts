import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Ce fichier vit dans apps/studio/ ; la racine du monorepo est deux niveaux au-dessus.
const appDir = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(appDir, "../..");

// Next 16 IMPOSE que `turbopack.root` et `outputFileTracingRoot` aient la MÊME
// valeur, et la racine voulue diffère selon la commande — même contrainte que
// le site, pour les mêmes raisons :
//
//   • `next dev` (Turbopack) → racine = MONOREPO, sans quoi Turbopack ne suit
//     pas le symlink pnpm vers les paquets partagés et rien ne compile ;
//   • `next build --webpack` (en local ET via @cloudflare/next-on-pages) →
//     racine = APP, sinon le builder lancé DANS apps/studio dédouble le chemin
//     de sortie en « apps/studio/apps/studio/.next ».
const PHASE_PRODUCTION_BUILD = "phase-production-build"; // cf. next/constants

/** @type {(phase: string) => NextConfig} */
export default function nextConfig(phase: string): NextConfig {
  const root = phase === PHASE_PRODUCTION_BUILD ? appDir : monorepoRoot;

  return {
    reactStrictMode: true,
    poweredByHeader: false,

    turbopack: { root },
    outputFileTracingRoot: root,

    // Les paquets partagés sont du TS/TSX de monorepo : Next doit les compiler.
    // C'est ici que se joue la raison d'être de cette app — maplibre, le terrain
    // et l'encodeur vidéo n'entreront QUE dans ce bundle, jamais dans celui du
    // site, qui n'a rien à faire d'un moteur 3D.
    transpilePackages: [
      "@locomotionlab/ui",
      "@locomotionlab/trace",
      "@locomotionlab/planche",
    ],

    // Le studio se règle depuis un téléphone posé sur la même box que le poste
    // de travail : sans ça, Next bloque les requêtes HMR venues d'une IP de LAN.
    allowedDevOrigins: ["192.168.0.*", "192.168.1.*", "10.0.0.*"],

    experimental: {
      optimizePackageImports: ["lucide-react"],
    },

    async headers() {
      return [
        {
          source: "/(.*)",
          headers: [
            // Le studio n'est lié de nulle part et ne doit pas s'indexer : il
            // n'y a rien à y trouver pour un lecteur, et tout à y perdre en
            // référencement.
            { key: "X-Robots-Tag", value: "noindex, nofollow" },
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
      ];
    },
  };
}
