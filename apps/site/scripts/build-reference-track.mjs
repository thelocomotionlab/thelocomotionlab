// scripts/build-reference-track.mjs
//
// GPX prévisionnel → trace de référence LÉGÈRE pour la page /live :
//   public/tracks/<nom>.track.json  { schemaVersion, totalKm, coords, profile }
// Le GPX brut des Écrins pèse 2,3 Mo (0,5 Mo gzippé) — inacceptable dans le
// budget « premier chargement < 1,5 Mo hors tuiles » du brief. On committe donc
// une version simplifiée (Douglas-Peucker) + un profil décimé, générés UNE FOIS :
//
//   node scripts/build-reference-track.mjs public/tracks/tour-des-ecrins_temp.gpx
//
// À RELANCER quand Valentin fournit le GPX définitif (puis mettre à jour
// lib/liveConfig.js si le nom change).

import fs from "node:fs";
import path from "node:path";

// — Douglas-Peucker : copie de lib/simplify.js (le site est en CommonJS par
//   défaut : un .mjs ne peut pas importer ce .js ESM directement). Toute
//   évolution de l'algorithme se fait LÀ-BAS d'abord, puis se recopie ici.
function perpendicularDistance(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  const t = Math.max(
    0,
    Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared),
  );
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy));
}

function simplifyTrack(points, tolerance) {
  if (!Array.isArray(points) || points.length <= 2) return points ?? [];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let maxDistance = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const distance = perpendicularDistance(points[i], points[first], points[last]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const result = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) result.push(points[i]);
  return result;
}

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function parseGpx(xml) {
  const points = [];
  const re = /<(?:trkpt|rtept)[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*>([\s\S]*?)<\/(?:trkpt|rtept)>/g;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const eleMatch = /<ele>([^<]+)<\/ele>/.exec(match[3]);
    const lat = Number.parseFloat(match[1]);
    const lon = Number.parseFloat(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      points.push([lon, lat, eleMatch ? Number.parseFloat(eleMatch[1]) : 0]);
    }
  }
  return points;
}

const MAP_TOLERANCE = 0.00012; // ≈ 12 m : invisible à l'écran, ~10× moins de points
const PROFILE_POINTS = 400; // ~0,5 km de résolution pour un SVG de 110 px de haut

const input = process.argv[2];
if (!input) {
  console.error("Usage : node scripts/build-reference-track.mjs <chemin/vers/trace.gpx>");
  process.exit(2);
}

const raw = parseGpx(fs.readFileSync(input, "utf8"));
if (raw.length < 2) {
  console.error(`GPX inexploitable : ${input}`);
  process.exit(1);
}

let meters = 0;
const full = [];
for (let i = 0; i < raw.length; i++) {
  if (i > 0) meters += haversineMeters(raw[i - 1], raw[i]);
  full.push({ lng: raw[i][0], lat: raw[i][1], alt: raw[i][2], km: meters / 1000 });
}
const totalKm = meters / 1000;

const coords = simplifyTrack(
  full.map((p) => [p.lng, p.lat]),
  MAP_TOLERANCE,
).map(([lng, lat]) => [Number(lng.toFixed(5)), Number(lat.toFixed(5))]);

// D+/D− cumulés avec hystérésis 5 m : l'altitude GPX est bruitée, sans seuil
// le D+ gonfle de 20-30 %. Le cumul est porté par chaque point du profil →
// l'encart de survol peut afficher « D+ accumulé à ce point ».
const HYSTERESIS_M = 5;
let dPlus = 0;
let dMinus = 0;
let refAlt = full[0].alt;
const cumul = new Array(full.length);
let elevMin = Infinity;
let elevMax = -Infinity;
for (let i = 0; i < full.length; i++) {
  const delta = full[i].alt - refAlt;
  if (delta >= HYSTERESIS_M) {
    dPlus += delta;
    refAlt = full[i].alt;
  } else if (delta <= -HYSTERESIS_M) {
    dMinus -= delta;
    refAlt = full[i].alt;
  }
  cumul[i] = { dp: dPlus, dm: dMinus };
  if (full[i].alt < elevMin) elevMin = full[i].alt;
  if (full[i].alt > elevMax) elevMax = full[i].alt;
}

const step = Math.max(1, full.length / PROFILE_POINTS);
const profile = [];
const pushProfilePoint = (i) => {
  const p = full[i];
  // lat/lng par point : le survol du profil pose un point synchronisé sur la carte.
  profile.push({
    km: Number(p.km.toFixed(2)),
    alt: Math.round(p.alt),
    lat: Number(p.lat.toFixed(5)),
    lng: Number(p.lng.toFixed(5)),
    dp: Math.round(cumul[i].dp),
    dm: Math.round(cumul[i].dm),
  });
};
for (let i = 0; i < PROFILE_POINTS && Math.floor(i * step) < full.length; i++) {
  pushProfilePoint(Math.floor(i * step));
}
pushProfilePoint(full.length - 1);

const output = {
  schemaVersion: 1,
  source: path.basename(input),
  totalKm: Number(totalKm.toFixed(2)),
  // Stats CALCULÉES depuis le GPX — la page les préfère aux valeurs saisies
  // de liveConfig (aucune discordance possible entre le .json et le terrain).
  dPlusM: Math.round(dPlus),
  dMinusM: Math.round(dMinus),
  elevMinM: Math.round(elevMin),
  elevMaxM: Math.round(elevMax),
  coords,
  profile,
};

const outPath = input.replace(/\.gpx$/i, ".track.json");
fs.writeFileSync(outPath, JSON.stringify(output));
const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
console.log(
  `${outPath} : ${coords.length} pts carte (sur ${raw.length}), ${profile.length} pts profil, ${totalKm.toFixed(1)} km, D+ ${Math.round(dPlus)} m / D− ${Math.round(dMinus)} m, alt ${Math.round(elevMin)}–${Math.round(elevMax)} m, ${kb} Ko`,
);
