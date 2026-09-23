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
//   • `next build --webpack` → racine = APP, pour que le suivi des fichiers
//     parte de l'app et non du monorepo entier.
const PHASE_PRODUCTION_BUILD = "phase-production-build"; // cf. next/constants

/** @type {(phase: string) => NextConfig} */
export default function nextConfig(phase: string): NextConfig {
  const root = phase === PHASE_PRODUCTION_BUILD ? appDir : monorepoRoot;

  return {
    reactStrictMode: true,
    poweredByHeader: false,

    // LE STUDIO EST UN EXPORT STATIQUE : rien n'y tourne sur un serveur — la
    // trace, les photos, le projet restent dans le navigateur. Le build sort un
    // dossier `out/` de fichiers, que Cloudflare Pages sert tel quel. Pas de
    // Functions, donc pas de `headers()` ici : les en-têtes, pages comprises,
    // vivent dans public/_headers.
    output: "export",

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
  };
}
