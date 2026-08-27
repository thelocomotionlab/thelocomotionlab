// lib/archives.mjs
//
// LES AVENTURES ARCHIVÉES — l'index de `public/replays/<slug>/`.
//
// Une archive est AUTOPORTANTE : son identité (`aventure.json`), sa trace de
// référence, ses positions, son journal et ses médias vivent tous dans son
// dossier. C'est la condition pour qu'elle survive à l'aventure SUIVANTE, qui
// réécrit `liveConfig.js` et peut remplacer le `.track.json` de `public/tracks/`.
// `live:archiver` les dépose tous en une fois (docs/live-tracking.md §9).
//
// Format .mjs pour la même raison que contentRoutes.mjs : ce module est lu par
// le code applicatif ET, le cas échéant, hors de webpack.
//
// Les replays historiques (Réunion 2025, Chartreuse/Vercors 2026) n'ont pas
// d'`aventure.json` : ils restent des replays de page projet et n'apparaissent
// pas ici. Aucune migration rétroactive.

import fs from "node:fs";
import path from "node:path";

const DOSSIER = "replays";

function racine() {
  return path.join(process.cwd(), "public", DOSSIER);
}

/** Lit `aventure.json` et refuse poliment ce qu'on ne sait pas rendre. */
function lire(slug) {
  const fichier = path.join(racine(), slug, "aventure.json");
  if (!fs.existsSync(fichier)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(fichier, "utf8"));
    if (data?.schemaVersion !== 1 || !data?.nom) return null;
    return {
      slug,
      nom: data.nom,
      dates: data.dates ?? "",
      dateDebut: data.dateDebut ?? null,
      intention: data.intention ?? "",
      // La trace de référence de l'archive, pas celle de public/tracks/.
      trace: data.trace ?? `/${DOSSIER}/${slug}/reference.track.json`,
      waypoints: Array.isArray(data.waypoints) ? data.waypoints : [],
      timer: data.timer ?? { running: false, startTime: null, stopTime: null },
      distanceKm: Number.isFinite(data.distanceKm) ? data.distanceKm : null,
      deniveleM: Number.isFinite(data.deniveleM) ? data.deniveleM : null,
    };
  } catch {
    return null;
  }
}

/** Toutes les archives, la plus récente d'abord. */
export function listArchives() {
  const dir = racine();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => lire(e.name))
    .filter(Boolean)
    .sort((a, b) => String(b.dateDebut ?? "").localeCompare(String(a.dateDebut ?? "")));
}

/** Une archive par son slug, ou null. */
export function getArchive(slug) {
  if (typeof slug !== "string" || !/^[a-z0-9-]+$/.test(slug)) return null;
  return lire(slug);
}
