import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Ce fichier vit dans apps/_template/ ; la racine du monorepo est deux niveaux au-dessus.
const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Transpile la charte partagée (TS/TSX + next/font) du monorepo.
  transpilePackages: ["@locomotionlab/ui"],

  // Build conteneurisable : Next produit un serveur Node autonome dans .next/standalone
  // (embarque uniquement les dépendances réellement utilisées). Cf. apps/_template/Dockerfile.
  output: "standalone",

  // Racine du workspace = racine du monorepo, pour les DEUX réglages (Next 16 exige qu'ils soient
  // ÉGAUX). Permet à `next dev` (Turbopack) de suivre le symlink pnpm vers @locomotionlab/ui, et à
  // la sortie `standalone` de tracer les dépendances hoistées + la charte. Contrairement au site
  // (builder Vercel/Cloudflare), ce build tourne « sur place » : pas de dédoublement de chemin,
  // donc une valeur statique suffit (pas besoin de la fonction par phase du site).
  turbopack: { root: monorepoRoot },
  outputFileTracingRoot: monorepoRoot,
};

export default nextConfig;
