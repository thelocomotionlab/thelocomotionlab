// La commande de fin d'aventure : assemble archive.json + les médias, prêt à
// committer dans le site. Tourne en local comme sur le VPS — lit des URLs
// publiques OU des fichiers/dossiers.
//
//   pnpm -F @locomotionlab/live-journal export-archive -- \
//     --positions https://tracking.thelocomotionlab.com/live-positions.json \
//     --journal   https://api.thelocomotionlab.com/journal/journal.json \
//     --media-base https://api.thelocomotionlab.com \
//     --out apps/site/public/replays/tour-des-ecrins-2026 \
//     --slug tour-des-ecrins-2026 --nom "Tour des Écrins en autonomie"
//
// Distance, D+ et dates sont DÉDUITS des données (stats + horodatage des
// positions) — plus besoin de les saisir. On peut toutefois les forcer avec
// --distance-km / --denivele-m / --date-debut / --date-fin (une valeur donnée
// l'emporte sur la déduction).
//
// L'archive NON CONFORME au contrat n'est jamais écrite (validation bloquante).
// `chat` reste vide par construction.

import fs from "node:fs";
import path from "node:path";

import { buildArchive, validateArchive, type ArchiveMeta } from "./archive";

function parseArgs(rawArgv: string[]): Map<string, string> {
  // pnpm transmet parfois un « -- » nu en tête (`pnpm … export-archive -- …`) :
  // on l'ignore pour que la commande documentée fonctionne telle quelle.
  const argv = rawArgv[0] === "--" ? rawArgv.slice(1) : rawArgv;
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) {
      fail(`Argument invalide : ${key ?? "(vide)"}`);
    }
    args.set(key.slice(2), value);
  }
  return args;
}

function fail(message: string): never {
  console.error(`export-archive : ${message}`);
  process.exit(1);
}

function required(args: Map<string, string>, name: string): string {
  const value = args.get(name);
  if (!value) fail(`--${name} manquant`);
  return value;
}

async function readJson(source: string): Promise<unknown> {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) fail(`${source} → HTTP ${res.status}`);
    return res.json();
  }
  return JSON.parse(fs.readFileSync(source, "utf8"));
}

async function readMedia(mediaBase: string, fromUrl: string): Promise<Buffer> {
  if (/^https?:\/\//.test(mediaBase)) {
    const url = `${mediaBase.replace(/\/$/, "")}${fromUrl}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) fail(`média ${url} → HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  // Base = dossier local (ex. le volume DATA_DIR/public) : on résout le nom.
  const local = path.join(mediaBase, "media", path.posix.basename(fromUrl));
  if (!fs.existsSync(local)) fail(`média introuvable : ${local}`);
  return fs.readFileSync(local);
}

/** Date « AAAA-MM-JJ » (fuseau Europe/Paris) d'un horodatage ISO, ou null. */
function parisDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" }); // → 2026-07-24
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const outDir = required(args, "out");
  const mediaBase = required(args, "media-base");

  const [livePositions, journal] = await Promise.all([
    readJson(required(args, "positions")),
    readJson(required(args, "journal")),
  ]);

  // Déduction depuis les données (surchargée par un argument s'il est fourni).
  const lp = livePositions as {
    stats?: { distance?: number; dplus?: number; lastFixTime?: string | null };
    profile?: Array<{ fixTime?: string | null }>;
  };
  const profile = lp.profile ?? [];
  const premierFix = profile.find((p) => p.fixTime)?.fixTime ?? null;
  const dernierFix =
    lp.stats?.lastFixTime ?? [...profile].reverse().find((p) => p.fixTime)?.fixTime ?? null;

  const dateDebut = args.get("date-debut") ?? parisDate(premierFix);
  const dateFin = args.get("date-fin") ?? parisDate(dernierFix);
  if (!dateDebut) fail("date de début introuvable (positions non datées) — précise --date-debut");
  if (!dateFin) fail("date de fin introuvable (positions non datées) — précise --date-fin");

  const meta: ArchiveMeta = {
    slug: required(args, "slug"),
    nom: required(args, "nom"),
    dateDebut,
    dateFin,
    distanceKm: args.has("distance-km")
      ? Number(args.get("distance-km"))
      : Math.round(((lp.stats?.distance ?? 0) / 1000) * 10) / 10,
    denivelePositifM: args.has("denivele-m")
      ? Number(args.get("denivele-m"))
      : Math.round(lp.stats?.dplus ?? 0),
  };

  const { archive, media } = buildArchive({
    meta,
    livePositions: livePositions as never,
    journal: journal as never,
  });

  const errors = validateArchive(archive);
  if (errors.length > 0) {
    fail(`archive NON CONFORME, rien n'est écrit :\n  - ${errors.join("\n  - ")}`);
  }

  fs.mkdirSync(path.join(outDir, "journal"), { recursive: true });
  for (const copy of media) {
    const buffer = await readMedia(mediaBase, copy.fromUrl);
    fs.writeFileSync(path.join(outDir, copy.to), buffer);
  }
  fs.writeFileSync(path.join(outDir, "archive.json"), JSON.stringify(archive, null, 2));

  console.log(
    `archive.json écrite dans ${outDir} : ${archive.positions.length} positions, ` +
      `${archive.journal.length} entrées de journal, ${media.length} média(s) copiés, chat vide.`,
  );
}

main().catch((err) => fail((err as Error).message));
