// scripts/live-archiver.mjs
//
// MET À L'ABRI les données d'une aventure, EN UNE COMMANDE (depuis un
// ordinateur) :
//   pnpm -F site live:archiver -- --slug vouillands
//
// Enchaîne :
//   1. build du service live-journal (pour disposer de l'export) ;
//   2. export depuis les données encore servies par le VPS → positions brutes
//      + journal + médias, dans apps/site/public/replays/<slug>/ ;
//   3. affiche les gestes de publication à lancer toi-même — publier reste
//      délibéré.
//
// Ce script ne TOUCHE PLUS à liveConfig.js : l'état « Terminé » de /live a été
// retiré (une aventure finie reste affichée figée). Il ne fait qu'une chose,
// mais celle qui est irremplaçable : sauver les données AVANT `./track reset`
// et `/purger`, qui les effacent pour de bon.
//
// La sortie sert ensuite au replay d'une page projet :
//   <postlivetracking positions="/replays/<slug>/live-positions.json" … />
// (docs/live-tracking.md §11), et le journal + les médias sont la matière
// première pour écrire le récit.
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
  console.error(`\n✗ live:archiver — ${message}\n`);
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

  console.log(`\n▶ Archiver l'aventure « ${nom} » (slug: ${slug})\n`);

  // 1. Build du service (idempotent, ~2 s) pour garantir dist/export/cli.js.
  console.log("① build du service live-journal…");
  run("pnpm", ["-F", "@locomotionlab/live-journal", "build"]);
  if (!fs.existsSync(EXPORT_CLI)) fail(`export introuvable après build : ${EXPORT_CLI}`);

  // 2. Export (journal + médias + archive.json, matière première du récit).
  const positionsUrl = args.get("positions") ?? DEFAULTS.positions;
  console.log("\n② export du journal et des médias depuis le VPS…");
  run("node", [
    EXPORT_CLI,
    "--positions", positionsUrl,
    "--journal", args.get("journal") ?? DEFAULTS.journal,
    "--media-base", args.get("media-base") ?? DEFAULTS["media-base"],
    "--out", outDir,
    "--slug", slug,
    "--nom", nom,
  ]);

  // 3. Les positions BRUTES, telles que la balise <postlivetracking> les lit.
  //    L'export ne produit qu'archive.json ; sans cette copie il fallait aller
  //    curler le fichier à la main (docs/live-tracking.md §11) — un geste facile
  //    à oublier, et impossible à rattraper après un `./track reset`.
  console.log("\n③ copie des positions brutes (live-positions.json)…");
  const positionsOut = path.join(REPO_ROOT, outDir, "live-positions.json");
  const reponse = await fetch(positionsUrl);
  if (!reponse.ok) fail(`positions injoignables (HTTP ${reponse.status}) : ${positionsUrl}`);
  const positions = await reponse.text();
  fs.mkdirSync(path.dirname(positionsOut), { recursive: true });
  fs.writeFileSync(positionsOut, positions);
  console.log(`   → ${outDir}/live-positions.json`);

  // 4. RENDRE L'ARCHIVE AUTOPORTANTE.
  //
  //    C'est ce qui la distingue d'un simple replay : la page permanente
  //    (/live/archives/<slug>) doit survivre à l'aventure SUIVANTE, qui
  //    réécrit liveConfig.js et peut remplacer le .track.json de public/tracks/.
  //    Rien de ce que lit cette page ne doit donc vivre ailleurs que dans son
  //    propre dossier.
  console.log("\n④ pièces d'autoportance (identité, trace, journal)…");
  const dossier = path.join(REPO_ROOT, outDir);

  //    a. La trace de référence, copiée sous un nom qui ne bougera plus.
  let tracePubliee = null;
  if (typeof liveConfig.aventure.trace === "string") {
    const source = path.join(SITE_DIR, "public", liveConfig.aventure.trace.replace(/^\//, ""));
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, path.join(dossier, "reference.track.json"));
      tracePubliee = `/replays/${slug}/reference.track.json`;
      console.log("   → reference.track.json");
    } else {
      console.warn(`   ⚠ trace de référence introuvable (${source}) — la page vivra sans itinéraire prévu.`);
    }
  }

  //    b. Le chrono, pour le temps total affiché sur la carte.
  const timerUrl = positionsUrl.replace(/live-positions\.json.*$/, "live-timer.json");
  let timer = { running: false, startTime: null, stopTime: null };
  try {
    const r = await fetch(timerUrl);
    if (r.ok) {
      const t = await r.json();
      timer = { running: false, startTime: t?.startTime ?? null, stopTime: t?.stopTime ?? null };
    }
  } catch {
    console.warn("   ⚠ chrono injoignable — la durée totale ne s'affichera pas.");
  }

  //    c. Le journal AU FORMAT VIVANT, dérivé d'archive.json. La page réutilise
  //       le composant du direct, qui attend { schemaVersion, entries } et des
  //       médias sous `media.url` ; archive.json, lui, porte les littéraux
  //       français du contrat v1 et un chemin relatif. On traduit ici, une fois,
  //       plutôt que d'apprendre deux dialectes au composant.
  const archiveFile = JSON.parse(fs.readFileSync(path.join(dossier, "archive.json"), "utf8"));
  const TYPES = { texte: "text", photo: "photo", audio: "audio", video: "video" };
  const entries = (archiveFile.journal ?? []).map((e, i) => {
    const entry = {
      id: e.id ?? `archive-${i}`,
      ts: e.time,
      type: TYPES[e.type] ?? "text",
    };
    if (e.texte) entry.text = e.texte;
    if (e.media) {
      entry.media = { url: `/${String(e.media).replace(/^\//, "")}` };
      if (Number.isFinite(e.largeur)) entry.media.width = e.largeur;
      if (Number.isFinite(e.hauteur)) entry.media.height = e.hauteur;
      if (Number.isFinite(e.duree)) entry.media.duration = e.duree;
    }
    if (e.edite) entry.editedAt = e.time;
    return entry;
  });
  fs.writeFileSync(
    path.join(dossier, "journal.json"),
    `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), count: entries.length, entries }, null, 2)}\n`,
  );
  console.log(`   → journal.json (${entries.length} entrée${entries.length > 1 ? "s" : ""})`);

  //    d. L'identité de l'aventure — ce que la page affiche en tête.
  fs.writeFileSync(
    path.join(dossier, "aventure.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        slug,
        nom,
        dates: liveConfig.aventure.dates ?? "",
        dateDebut: liveConfig.aventure.dateDebut ?? null,
        intention: liveConfig.aventure.intention ?? "",
        trace: tracePubliee,
        waypoints: liveConfig.aventure.waypoints ?? [],
        timer,
        distanceKm: archiveFile.meta?.distanceKm ?? null,
        deniveleM: archiveFile.meta?.denivelePositifM ?? null,
      },
      null,
      2,
    )}\n`,
  );
  console.log("   → aventure.json");

  // 5. Les derniers gestes, délibérés.
  console.log(
    [
      "\n✓ Données mises à l'abri. Tu peux maintenant faire `./track reset` sans rien perdre.",
      "",
      "Il te reste à publier (tes gestes) :",
      `  git add apps/site/public/replays/${slug}`,
      `  git commit -m "live: archive de « ${nom} »"`,
      "  pnpm -F site deploy:cf        # (ou deploy:staging pour vérifier d'abord)",
      "",
      `La page d'archive est en ligne au déploiement : /live/archives/${slug}`,
      "  (le direct tel qu'on l'a suivi, figé, badge ARCHIVE — lie-la depuis un article)",
      "",
      "Pour en faire aussi un replay DANS un récit, pose la balise en page projet :",
      `  <postlivetracking positions="/replays/${slug}/live-positions.json" />`,
      "",
    ].join("\n"),
  );
}

main().catch((err) => fail(err.message));
