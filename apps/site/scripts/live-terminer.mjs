// scripts/live-terminer.mjs
//
// Termine une aventure EN UNE COMMANDE (depuis un ordinateur) :
//   pnpm -F site live:terminer -- --slug vouillands
//
// Enchaîne :
//   1. build du service live-journal (pour disposer de l'export) ;
//   2. export de l'archive depuis les données encore servies par le VPS
//      (positions + journal + médias) → apps/site/public/replays/<slug>/ ;
//      distance, D+ et dates sont DÉDUITS des données ;
//   3. bascule liveConfig.js en « terminé » + pointe l'archive sur <slug> ;
//   4. affiche les deux dernières commandes à lancer toi-même
//      (git commit + déploiement) — publier reste ton geste délibéré.
//
// Pré-requis : `./track stop` a déjà été fait (le VPS sert les données figées).
// Options : --nom "…" (défaut : le nom courant de liveConfig) ;
//           --positions / --journal / --media-base (défaut : domaines de prod).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(SITE_DIR, "..", "..");
const LIVE_CONFIG = path.join(SITE_DIR, "lib", "liveConfig.js");
const EXPORT_CLI = path.join(REPO_ROOT, "services", "live-journal", "dist", "export", "cli.js");

const DEFAULTS = {
  positions: "https://tracking.thelocomotionlab.com/live-positions.json",
  journal: "https://api.thelocomotionlab.com/journal/journal.json",
  "media-base": "https://api.thelocomotionlab.com",
};

function parseArgs(argv) {
  const clean = argv[0] === "--" ? argv.slice(1) : argv; // pnpm ajoute parfois « -- »
  const args = new Map();
  for (let i = 0; i < clean.length; i += 2) {
    if (!clean[i]?.startsWith("--")) fail(`Argument invalide : ${clean[i] ?? "(vide)"}`);
    args.set(clean[i].slice(2), clean[i + 1]);
  }
  return args;
}

function fail(message) {
  console.error(`\n✗ live:terminer — ${message}\n`);
  process.exit(1);
}

function run(cmd, cmdArgs) {
  execFileSync(cmd, cmdArgs, { cwd: REPO_ROOT, stdio: "inherit" });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.get("slug");
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    fail('--slug manquant ou invalide (minuscules, chiffres, tirets). Ex. : --slug vouillands');
  }

  const { liveConfig } = await import(`file://${LIVE_CONFIG}`);
  const nom = args.get("nom") ?? liveConfig.aventure.nom;
  const outDir = path.join("apps", "site", "public", "replays", slug);

  console.log(`\n▶ Terminer l'aventure « ${nom} » (slug: ${slug})\n`);

  // 1. Build du service (idempotent, ~2 s) pour garantir dist/export/cli.js.
  console.log("① build du service live-journal…");
  run("pnpm", ["-F", "@locomotionlab/live-journal", "build"]);
  if (!fs.existsSync(EXPORT_CLI)) fail(`export introuvable après build : ${EXPORT_CLI}`);

  // 2. Export de l'archive (distance/D+/dates déduits des données du VPS).
  console.log("\n② export de l'archive depuis le VPS…");
  run("node", [
    EXPORT_CLI,
    "--positions", args.get("positions") ?? DEFAULTS.positions,
    "--journal", args.get("journal") ?? DEFAULTS.journal,
    "--media-base", args.get("media-base") ?? DEFAULTS["media-base"],
    "--out", outDir,
    "--slug", slug,
    "--nom", nom,
  ]);

  // 3. Bascule liveConfig.js en « terminé » + archive sur ce slug.
  console.log("\n③ mise à jour de liveConfig.js…");
  let src = fs.readFileSync(LIVE_CONFIG, "utf8");
  const before = src;
  src = src.replace(/(NEXT_PUBLIC_LIVE_STATUT\s*\|\|\s*")[^"]*(")/, `$1termine$2`);
  src = src.replace(/(\barchive:\s*")[^"]*(")/, `$1/replays/${slug}/archive.json$2`);
  if (src === before) {
    fail(
      "liveConfig.js n'a pas pu être mis à jour automatiquement.\n" +
        `  → mets à la main : statut par défaut « termine » et archive: "/replays/${slug}/archive.json"`,
    );
  }
  fs.writeFileSync(LIVE_CONFIG, src);
  console.log(`   statut → "termine", archive → /replays/${slug}/archive.json`);

  // 4. Les deux derniers gestes, délibérés.
  console.log(
    [
      "\n✓ Archive prête et page basculée en « Terminé ».",
      "",
      "Il te reste à publier (tes gestes) :",
      `  git add apps/site/public/replays/${slug} apps/site/lib/liveConfig.js`,
      `  git commit -m "live: archive de « ${nom} »"`,
      "  pnpm -F site deploy:cf        # (ou deploy:staging pour vérifier d'abord)",
      "",
    ].join("\n"),
  );
}

main().catch((err) => fail(err.message));
