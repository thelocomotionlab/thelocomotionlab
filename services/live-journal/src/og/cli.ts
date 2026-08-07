// LA COMMANDE DES CARTES A POSTERIORI (carrousel, ou story regénérée).
//
// Elle ne tourne PAS sur le VPS : le service peut être éteint quand on prépare
// une publication, le texte de l'encart est éditorial (aucune génération
// automatique ne peut l'inventer), et un carrousel c'est plusieurs images
// choisies — pas un fichier unique réécrit en boucle comme og.png.
//
//   node dist/og/cli.js \
//     --track apps/site/public/tracks/x.track.json \
//     --positions apps/site/public/replays/<slug>/live-positions.json \
//     --nom "…" --dates "…" --date-debut 2026-08-06T06:00:00+02:00 \
//     --format carrousel --texte "…" --out cartes/x.png
//
// En pratique on passe par le raccourci du site, qui remplit tout ça depuis
// liveConfig et le dossier de replay :
//
//   pnpm -F site carte:partage -- --slug belledonne --texte "…"
//
// `--jour N` découpe la journée N (frontière à minuit heure française, même
// règle que /live) : les CHIFFRES sont ceux de la journée, la carte et le
// profil montrent l'avancement CUMULÉ à la fin de cette journée — c'est ce qui
// permet un carrousel « une image par jour » sur une aventure de plusieurs
// jours.

import fs from "node:fs";
import path from "node:path";

import { rendreCarte, type CarteFormat } from "./cards";
import {
  jourParis,
  kmSurItineraire,
  lastWaypointPassed,
  liveFromArtefacts,
  trackFromJson,
  type OgAventure,
  type OgData,
  type OgWaypoint,
} from "./data";

/** Au-delà, l'encart déborderait sur le titre : on refuse plutôt que de couper
 *  les mots de quelqu'un d'autre. */
export const NOTE_MAX = 280;

const FORMATS: CarteFormat[] = ["story", "carrousel", "og"];

function parseArgs(rawArgv: string[]): Map<string, string> {
  const argv = rawArgv[0] === "--" ? rawArgv.slice(1) : rawArgv;
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) fail(`Argument invalide : ${key ?? "(vide)"}`);
    args.set(key.slice(2), value);
  }
  return args;
}

function fail(message: string): never {
  console.error(`carte : ${message}`);
  process.exit(1);
}

function readJson(source: string): unknown {
  if (!fs.existsSync(source)) fail(`fichier introuvable : ${source}`);
  return JSON.parse(fs.readFileSync(source, "utf8"));
}

interface PointProfil {
  fixTime?: string | null;
  distMeters?: number;
  dPlus?: number;
  dMinus?: number;
}

/**
 * Restreint les positions à la fin du jour N, et remplace les statistiques
 * CUMULÉES par celles de la seule journée (différence avec la veille).
 */
export function decouperJour(
  positions: { profile?: PointProfil[]; stats?: Record<string, unknown> } | null,
  dateDebut: string,
  jour: number,
): typeof positions {
  const profile = positions?.profile;
  if (!Array.isArray(profile) || profile.length === 0) return positions;

  const jusquA: PointProfil[] = [];
  let dernierDeLaVeille: PointProfil | null = null;
  let premierDuJour: PointProfil | null = null;
  for (const p of profile) {
    if (!p.fixTime) continue;
    const j = jourParis(p.fixTime, dateDebut);
    if (j > jour) break;
    if (j < jour) dernierDeLaVeille = p;
    else if (premierDuJour === null) premierDuJour = p;
    jusquA.push(p);
  }
  // Fonction PURE : elle lève, elle ne sort pas du processus — c'est ce qui
  // la rend testable (le test importe ce module).
  if (jusquA.length === 0) throw new Error(`aucune position le jour ${jour}`);

  const fin = jusquA[jusquA.length - 1];
  const base = dernierDeLaVeille ?? { distMeters: 0, dPlus: 0, dMinus: 0 };
  const debutJour = premierDuJour ?? fin;
  return {
    ...positions,
    profile: jusquA,
    stats: {
      ...positions?.stats,
      distance: (fin.distMeters ?? 0) - (base.distMeters ?? 0),
      dplus: (fin.dPlus ?? 0) - (base.dPlus ?? 0),
      dminus: (fin.dMinus ?? 0) - (base.dMinus ?? 0),
      durationSeconds: Math.max(
        0,
        Math.round((Date.parse(fin.fixTime ?? "") - Date.parse(debutJour.fixTime ?? "")) / 1000),
      ),
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const format = (args.get("format") ?? "carrousel") as CarteFormat;
  if (!FORMATS.includes(format)) fail(`--format inconnu : ${format} (${FORMATS.join(" | ")})`);

  const nom = args.get("nom");
  if (!nom) fail("--nom manquant");

  const trackPath = args.get("track");
  const track = trackPath ? trackFromJson(readJson(trackPath)) : null;
  if (trackPath && !track) fail(`trace de référence inexploitable : ${trackPath}`);

  const note = args.get("texte") ?? null;
  if (note && note.length > NOTE_MAX) {
    fail(`--texte trop long (${note.length} caractères, maximum ${NOTE_MAX})`);
  }

  const dateDebut = args.get("date-debut") ?? new Date().toISOString();
  const jourArg = args.get("jour");
  const jour = jourArg ? Number.parseInt(jourArg, 10) : null;
  if (jourArg && (!Number.isFinite(jour) || (jour as number) < 1)) fail(`--jour invalide : ${jourArg}`);

  const positionsPath = args.get("positions");
  let positions = positionsPath
    ? (readJson(positionsPath) as { profile?: PointProfil[]; stats?: Record<string, unknown> })
    : null;
  if (positions && jour !== null) positions = decouperJour(positions, dateDebut, jour);

  const waypointsPath = args.get("waypoints");
  const waypoints = (waypointsPath ? (readJson(waypointsPath) as OgWaypoint[]) : []) ?? [];

  const aventure: OgAventure = {
    nom,
    dates: args.get("dates") ?? "",
    dateDebut,
    distanceKm: Number.parseFloat(args.get("distance-km") ?? "") || track?.totalKm || 0,
    deniveleM: Number.parseFloat(args.get("denivele-m") ?? "") || track?.dPlusM || 0,
    // Une carte fabriquée après coup décrit une aventure BOUCLÉE : c'est ce
    // statut qui bascule le contenu du format story sur le bilan.
    statut: args.get("statut") === "avant" ? "avant" : "termine",
    waypoints,
  };

  const live = positions ? liveFromArtefacts(positions, { running: false }, track?.coords ?? []) : null;
  const data: OgData = {
    variant: aventure.statut === "termine" ? "termine" : "avant",
    aventure,
    track,
    live,
    jour,
    lastWaypoint: live ? lastWaypointPassed(kmSurItineraire(live), waypoints) : null,
    note,
  };

  const out = args.get("out") ?? `carte-${format}.png`;
  const png = await rendreCarte(data, {
    format,
    basemap: { cacheDir: args.get("cache") ?? null },
    sansFond: args.get("sans-fond") === "1",
  });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, png);
  console.log(`✓ ${out} (${format}, ${(png.length / 1024).toFixed(0)} Ko)`);
}

// Importable sans effet de bord : le test unitaire charge ce module pour
// exercer `decouperJour`, il ne doit pas déclencher un rendu ni un process.exit.
if (require.main === module) {
  main().catch((err) => fail((err as Error).message));
}
