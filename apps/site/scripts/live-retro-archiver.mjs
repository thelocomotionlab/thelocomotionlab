// scripts/live-retro-archiver.mjs
//
// RATTRAPE une aventure archivée AVANT le contrat d'autoportance (les Écrins) :
//
//   pnpm -F site live:retro -- --slug chartreuse-4x2000 --trace /tracks/xxx.track.json
//
// live-archiver.mjs, lui, ne sait travailler que sur une aventure ENCORE servie
// par le VPS : ses étapes ② et ③ vont chercher positions et journal en ligne.
// Passé un `./track reset`, ces données n'existent plus nulle part — sauf dans
// l'archive.json déjà déposée. Ce script reconstitue depuis ce seul survivant
// les quatre pièces de l'étape ④ (docs/live-tracking.md §9), pour que
// /live/archives/<slug> réponde comme pour une aventure d'après les Écrins.
//
// Il ne réécrit JAMAIS archive.json ni les médias : il ne fait qu'en dériver.
// Ce qu'il produit :
//
//   reference.track.json  ← copie de la trace prévue (--trace)
//   live-positions.json   ← positions au format du direct { meta, stats, profile }
//   journal.json          ← journal au format vivant { schemaVersion, entries }
//   aventure.json         ← l'identité que lit lib/archives.mjs
//
// Ce que le script NE PEUT PAS deviner, et qu'on lui passe : l'intention (la
// phrase sous le titre) et les repères de parcours. Une archive sans eux reste
// valide — elle affiche juste une aventure sans phrase et sans pastilles.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPLAYS = path.join(SITE_DIR, "public", "replays");

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function fail(message) {
  console.error(`\n✗ live:retro — ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const clean = argv[0] === "--" ? argv.slice(1) : argv; // pnpm ajoute parfois « -- »
  const args = new Map();
  for (let i = 0; i < clean.length; i += 1) {
    const cle = clean[i];
    if (!cle?.startsWith("--")) fail(`Argument invalide : ${cle ?? "(vide)"}`);
    const nom = cle.slice(2);
    // --force est un drapeau, les autres attendent une valeur.
    if (nom === "force") args.set(nom, true);
    else {
      const valeur = clean[i + 1];
      if (valeur === undefined || valeur.startsWith("--")) fail(`--${nom} attend une valeur.`);
      args.set(nom, valeur);
      i += 1;
    }
  }
  return args;
}

/** « 2026-07-24 » → « 24 juillet 2026 » ; deux dates → « 22-25 août 2026 ». */
function libelleDates(debut, fin) {
  const d = new Date(`${debut}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const jour = d.getUTCDate();
  const mois = MOIS[d.getUTCMonth()];
  const annee = d.getUTCFullYear();

  const f = fin ? new Date(`${fin}T12:00:00Z`) : null;
  if (!f || Number.isNaN(f.getTime()) || fin === debut) return `${jour} ${mois} ${annee}`;
  if (f.getUTCMonth() === d.getUTCMonth() && f.getUTCFullYear() === annee) {
    return `${jour}-${f.getUTCDate()} ${mois} ${annee}`;
  }
  return `${jour} ${mois} – ${f.getUTCDate()} ${MOIS[f.getUTCMonth()]} ${f.getUTCFullYear()}`;
}

/** L'instant, écrit à l'heure de Paris — même instant, lecture humaine. */
function versHeureDeParis(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const local = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  const decalageMin = Math.round((local - d.getTime()) / 60000);
  const signe = decalageMin >= 0 ? "+" : "-";
  const abs = Math.abs(decalageMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${signe}${hh}:${mm}`;
}

/**
 * Le profil du direct, dérivé des positions de l'archive.
 *
 * `distance` est reprise telle quelle : c'est DÉJÀ la distance corrigée, celle
 * des stats (vérifié sur les deux archives existantes — le dernier point vaut
 * exactement stats.distance, au mètre près).
 *
 * D+ et D− n'existent pas par point dans archive.json. On les intègre depuis
 * les altitudes, puis on les met à l'échelle des totaux de stats, eux corrigés
 * par le service de tracking. Sans cette mise à l'échelle, le dernier point du
 * profil contredirait l'en-tête du même fichier — de 5 à 8 % sur les archives
 * observées.
 */
function construireProfil(positions, stats) {
  let brutPlus = 0;
  let brutMoins = 0;
  const cumuls = positions.map((p, i) => {
    if (i > 0) {
      const delta = (p.altitude ?? 0) - (positions[i - 1].altitude ?? 0);
      if (delta > 0) brutPlus += delta;
      else brutMoins -= delta;
    }
    return { plus: brutPlus, moins: brutMoins };
  });

  const kPlus = brutPlus > 0 && Number.isFinite(stats?.dplus) ? stats.dplus / brutPlus : 1;
  const kMoins = brutMoins > 0 && Number.isFinite(stats?.dminus) ? stats.dminus / brutMoins : 1;

  const profile = positions.map((p, i) => ({
    idx: Number.isFinite(p.idx) ? p.idx : i,
    fixTime: p.fixTime,
    latitude: p.latitude,
    longitude: p.longitude,
    alt: Number(((p.altitude ?? 0)).toFixed(1)),
    distMeters: Number((p.distance ?? 0).toFixed(1)),
    distKm: Number(((p.distance ?? 0) / 1000).toFixed(3)),
    dPlus: Math.round(cumuls[i].plus * kPlus),
    dMinus: Math.round(cumuls[i].moins * kMoins),
  }));

  return { profile, brutPlus, brutMoins, kPlus, kMoins };
}

/** Le journal au format vivant — même traduction que live-archiver.mjs ④c. */
function construireJournal(entrees) {
  const TYPES = { texte: "text", photo: "photo", audio: "audio", video: "video" };
  return entrees.map((e, i) => {
    const entry = { id: e.id ?? `archive-${i}`, ts: e.time, type: TYPES[e.type] ?? "text" };
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
}

function ecrire(dossier, nom, contenu, force) {
  const cible = path.join(dossier, nom);
  if (fs.existsSync(cible) && !force) {
    fail(`${nom} existe déjà dans ${path.relative(SITE_DIR, dossier)} — relance avec --force pour l'écraser.`);
  }
  fs.writeFileSync(cible, `${JSON.stringify(contenu, null, 2)}\n`);
  console.log(`   → ${nom}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.get("slug");
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    fail('--slug manquant ou invalide. Ex. : --slug chartreuse-4x2000');
  }

  const dossier = path.join(REPLAYS, slug);
  const archiveFile = path.join(dossier, "archive.json");
  if (!fs.existsSync(archiveFile)) {
    fail(`archive.json introuvable : ${path.relative(SITE_DIR, archiveFile)}\n  Ce script part de l'archive déjà déposée ; sans elle, il n'y a rien à rattraper.`);
  }

  const archive = JSON.parse(fs.readFileSync(archiveFile, "utf8"));
  if (archive.schemaVersion !== 1) fail(`schemaVersion ${archive.schemaVersion} non gérée (attendu : 1).`);

  const meta = archive.meta ?? {};
  const stats = archive.stats ?? {};
  const positions = Array.isArray(archive.positions) ? archive.positions : [];
  if (positions.length < 2) fail("archive.json ne contient pas assez de positions.");

  const force = args.get("force") === true;
  const nom = args.get("nom") ?? meta.nom ?? slug;

  console.log(`\n▶ Rattrapage de l'archive « ${nom} » (slug: ${slug})\n`);
  console.log(`  ${positions.length} positions · ${(archive.journal ?? []).length} entrée(s) de journal`);

  // ① La trace prévue, copiée sous un nom qui ne bougera plus. C'est elle qui
  //    fait apparaître l'itinéraire et le profil sous la trace réellement suivie
  //    — et donc, sur une sortie écourtée, l'écart entre les deux.
  let tracePubliee = null;
  const trace = args.get("trace");
  if (trace) {
    const source = path.join(SITE_DIR, "public", trace.replace(/^\//, ""));
    if (!fs.existsSync(source)) fail(`trace de référence introuvable : ${source}`);
    fs.copyFileSync(source, path.join(dossier, "reference.track.json"));
    tracePubliee = `/replays/${slug}/reference.track.json`;
    console.log("   → reference.track.json");
  } else {
    console.warn("   ⚠ pas de --trace : la page vivra sans itinéraire prévu.");
  }

  // ② Les positions au format du direct.
  const { profile, brutPlus, brutMoins, kPlus, kMoins } = construireProfil(positions, stats);
  const dernier = positions.at(-1);
  ecrire(dossier, "live-positions.json", {
    meta: { pointCount: profile.length, updatedAt: stats.lastFixTime ?? dernier.fixTime },
    stats: {
      distance: stats.distance ?? 0,
      dplus: stats.dplus ?? 0,
      dminus: stats.dminus ?? 0,
      durationSeconds: stats.durationSeconds ?? null,
      lastFixTime: stats.lastFixTime ?? dernier.fixTime,
    },
    profile,
    // Trace de ce que ce script a fait, pour qu'on n'ait pas à le redécouvrir.
    debug: {
      derivedFrom: "archive.json",
      derivedAt: new Date().toISOString(),
      rawDplus: Number(brutPlus.toFixed(2)),
      rawDminus: Number(brutMoins.toFixed(2)),
      dPlusScale: Number(kPlus.toFixed(4)),
      dMinusScale: Number(kMoins.toFixed(4)),
    },
  }, force);

  // ③ Le journal au format vivant.
  const entries = construireJournal(archive.journal ?? []);
  ecrire(dossier, "journal.json", {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    count: entries.length,
    entries,
  }, force);

  // ④ L'identité — ce que lit lib/archives.mjs, et sans quoi l'aventure
  //    n'apparaît nulle part.
  ecrire(dossier, "aventure.json", {
    schemaVersion: 1,
    slug,
    nom,
    dates: args.get("dates") ?? libelleDates(meta.dateDebut, meta.dateFin),
    dateDebut: versHeureDeParis(positions[0].fixTime),
    intention: args.get("intention") ?? "",
    trace: tracePubliee,
    // Les repères se posent à la main dans le fichier produit : leur km dépend
    // de l'itinéraire prévu, que ce script ne sait pas lire à ta place.
    waypoints: [],
    timer: {
      running: false,
      startTime: positions[0].fixTime,
      stopTime: stats.lastFixTime ?? dernier.fixTime,
    },
    distanceKm: meta.distanceKm ?? null,
    deniveleM: meta.denivelePositifM ?? null,
  }, force);

  console.log(
    [
      "",
      "✓ Archive autoportante. La page répond au prochain build : /live/archives/" + slug,
      "",
      "À compléter à la main dans aventure.json si tu veux :",
      "  • intention  — la phrase en italique sous le titre",
      "  • waypoints  — les repères posés sur la carte et le profil (nom, km, icone)",
      "",
      "Pour poser aussi le replay DANS un récit :",
      `  <postlivetracking positions="/replays/${slug}/live-positions.json" />`,
      "",
    ].join("\n"),
  );
}

main();
