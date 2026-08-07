// scripts/carte-partage.mjs
//
// FABRIQUE UNE CARTE DE PARTAGE A POSTERIORI (le carrousel de publication),
// depuis un ordinateur, en une commande :
//
//   pnpm -F site carte:partage -- --slug belledonne \
//     --texte "Parti à 6 h 22 sous la pluie. Le col dans le brouillard…"
//
// Elle lit ce que `live:archiver` a déjà mis à l'abri
// (public/replays/<slug>/) et ce que liveConfig décrit de l'aventure, puis
// appelle le moteur de rendu de live-journal — LE MÊME que la story du direct,
// donc exactement le même langage visuel.
//
// La sortie va dans `cartes/` à la racine (dossier ignoré par git) : fabriquer
// une carte ne salit jamais le dépôt, et rien n'est publié sans un geste
// délibéré.
//
// Options :
//   --slug <s>       dossier de replay à lire            (obligatoire)
//   --texte "…"      encart éditorial, 280 caractères max (carrousel)
//   --jour N         carte de la seule journée N (aventure de plusieurs jours)
//   --format         carrousel (défaut) | story | og
//   --nom / --dates / --date-debut / --trace   forcent les valeurs de liveConfig
//                    — utile quand liveConfig est déjà passé à l'aventure
//                    suivante ; sinon ils sont déduits (archive.json puis
//                    liveConfig).
//   --out <fichier>  chemin de sortie
//   --sans-fond 1    saute le téléchargement des tuiles (hors ligne)

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(SITE_DIR, "..", "..");
const LIVE_CONFIG = path.join(SITE_DIR, "lib", "liveConfig.js");
const CARTE_CLI = path.join(REPO_ROOT, "services", "live-journal", "dist", "og", "cli.js");

function parseArgs(argv) {
  const clean = argv[0] === "--" ? argv.slice(1) : argv;
  const args = new Map();
  for (let i = 0; i < clean.length; i += 2) {
    if (!clean[i]?.startsWith("--")) fail(`Argument invalide : ${clean[i] ?? "(vide)"}`);
    args.set(clean[i].slice(2), clean[i + 1]);
  }
  return args;
}

function fail(message) {
  console.error(`\n✗ carte:partage — ${message}\n`);
  process.exit(1);
}

function lireJson(fichier) {
  try {
    return JSON.parse(fs.readFileSync(fichier, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.get("slug");
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    fail('--slug manquant ou invalide (minuscules, chiffres, tirets). Ex. : --slug belledonne');
  }

  const replayDir = path.join(SITE_DIR, "public", "replays", slug);
  const positions = path.join(replayDir, "live-positions.json");
  if (!fs.existsSync(positions)) {
    fail(
      `positions introuvables : ${path.relative(REPO_ROOT, positions)}\n` +
        `  Lance d'abord :  pnpm -F site live:archiver -- --slug ${slug}`,
    );
  }

  // Identité de l'aventure : l'ARCHIVE d'abord (elle décrit CETTE aventure-là),
  // liveConfig ensuite (qui peut déjà pointer sur la suivante).
  const archive = lireJson(path.join(replayDir, "archive.json"));
  const { liveConfig } = await import(`file://${LIVE_CONFIG}`);
  const nom = args.get("nom") ?? archive?.meta?.nom ?? liveConfig.aventure.nom;
  const dateDebut =
    args.get("date-debut") ?? archive?.meta?.dateDebut ?? liveConfig.aventure.dateDebut;
  const dates = args.get("dates") ?? liveConfig.aventure.dates ?? "";

  // La trace de référence n'est pas dans l'archive : elle reste dans le site.
  const trace = args.get("trace") ?? liveConfig.aventure.trace;
  const tracePath = trace ? path.join(SITE_DIR, "public", trace.replace(/^\//, "")) : null;
  if (tracePath && !fs.existsSync(tracePath)) {
    fail(
      `trace de référence introuvable : ${path.relative(REPO_ROOT, tracePath)}\n` +
        `  Passe --trace /tracks/<autre>.track.json si liveConfig a changé d'aventure.`,
    );
  }

  const format = args.get("format") ?? "carrousel";
  const suffixe = args.get("jour") ? `-jour${args.get("jour")}` : "";
  const out = args.get("out") ?? path.join(REPO_ROOT, "cartes", `${slug}-${format}${suffixe}.png`);

  console.log(`\n▶ Carte « ${nom} » — format ${format}${suffixe ? ` (jour ${args.get("jour")})` : ""}\n`);

  console.log("① build du service live-journal…");
  execFileSync("pnpm", ["-F", "@locomotionlab/live-journal", "build"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
  if (!fs.existsSync(CARTE_CLI)) fail(`moteur de rendu introuvable après build : ${CARTE_CLI}`);

  // Les waypoints vivent dans liveConfig : on les passe par fichier temporaire
  // plutôt que d'inventer une syntaxe d'argument pour du JSON imbriqué.
  const waypoints = liveConfig.aventure.waypoints ?? [];
  const waypointsFile = path.join(REPO_ROOT, "cartes", `.waypoints-${slug}.json`);
  fs.mkdirSync(path.dirname(waypointsFile), { recursive: true });
  fs.writeFileSync(waypointsFile, JSON.stringify(waypoints));

  const cliArgs = [
    CARTE_CLI,
    "--positions", positions,
    "--nom", nom,
    "--dates", dates,
    "--date-debut", dateDebut,
    "--format", format,
    "--waypoints", waypointsFile,
    // Le fond de carte est identique d'une carte à l'autre : mis en cache ici,
    // les cartes suivantes (un jour par image) sortent sans retélécharger.
    "--cache", path.join(REPO_ROOT, "cartes", ".fonds"),
    "--out", out,
  ];
  if (tracePath) cliArgs.push("--track", tracePath);
  for (const passe of ["texte", "jour", "sans-fond"]) {
    if (args.get(passe) !== undefined) cliArgs.push(`--${passe}`, args.get(passe));
  }

  console.log("\n② rendu de la carte…");
  try {
    execFileSync("node", cliArgs, { cwd: REPO_ROOT, stdio: "inherit" });
  } finally {
    fs.rmSync(waypointsFile, { force: true });
  }

  console.log(
    [
      "",
      `✓ ${path.relative(REPO_ROOT, out)}`,
      "",
      "  (dossier `cartes/` ignoré par git — rien n'est publié tant que tu ne le déplaces pas)",
      "",
    ].join("\n"),
  );
}

main().catch((err) => fail(err.message));
