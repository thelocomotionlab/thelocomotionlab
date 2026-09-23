// scripts/projet-vercel.mjs
//
// Écrit `.vercel/project.json` s'il manque.
//
// `build:cf` lance la CLI Vercel à part, dans une version fixée, puis
// next-on-pages avec `--skip-build` : next-on-pages télécharge sinon la
// dernière CLI, dont la sortie ne se lit plus. Mais `--skip-build` saute aussi
// sa préparation, qui écrivait ce fichier — et sans lui, `vercel build`
// s'arrête sur « No Project Settings found locally » et demande un
// `vercel pull`, donc un projet lié sur Vercel. Le contenu est celui que
// next-on-pages écrivait : un projet anonyme, framework Next.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const CHEMIN = ".vercel/project.json";

if (!existsSync(CHEMIN)) {
  mkdirSync(".vercel", { recursive: true });
  writeFileSync(
    CHEMIN,
    JSON.stringify({ projectId: "_", orgId: "_", settings: { framework: "nextjs" } }),
  );
}
