// Conversion des artefacts vivants (live-positions.json + journal.json) vers le
// contrat d'archive `archive.json` v1 (docs/live-tracking.md §15) — option A
// validée au plan PR3 : littéraux FRANÇAIS du contrat + champs OPTIONNELS
// additifs (id, duree, largeur, hauteur, edite), schemaVersion 1 conservé.
// RÈGLE ABSOLUE : `chat` reste vide — les messages privés n'entrent JAMAIS
// dans l'archive publique.

import path from "node:path";

import type { JournalEntry, JournalFile } from "../journal/types";

export interface ArchiveMeta {
  slug: string;
  nom: string;
  dateDebut: string; // YYYY-MM-DD
  dateFin: string; // YYYY-MM-DD
  distanceKm: number;
  denivelePositifM: number;
}

export interface ArchivePosition {
  idx: number;
  fixTime: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  distance?: number;
}

export interface ArchiveStats {
  distance: number;
  dplus: number;
  dminus: number;
  durationSeconds: number;
  lastFixTime: string | null;
}

export interface ArchiveJournalEntry {
  time: string;
  type: "texte" | "photo" | "audio" | "video";
  texte?: string;
  /** Chemin relatif à l'archive, sous journal/ (contrat v1). */
  media?: string;
  // Champs additifs optionnels (option A) — un lecteur v1 les ignore.
  id?: string;
  duree?: number;
  largeur?: number;
  hauteur?: number;
  edite?: boolean;
}

export interface ArchiveFile {
  schemaVersion: 1;
  meta: ArchiveMeta;
  positions: ArchivePosition[];
  stats: ArchiveStats;
  journal: ArchiveJournalEntry[];
  chat: never[];
}

/** Un média à copier dans l'archive : URL vivante → chemin relatif au dossier. */
export interface MediaCopy {
  fromUrl: string; // ex. /journal/media/au-xxxx.m4a
  to: string; // ex. journal/au-xxxx.m4a
}

interface LivePositionsInput {
  stats?: Partial<ArchiveStats>;
  profile?: Array<{
    idx?: number;
    fixTime?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    alt?: number;
    distMeters?: number;
  }>;
}

const TYPE_TO_FR: Record<JournalEntry["type"], ArchiveJournalEntry["type"]> = {
  text: "texte",
  photo: "photo",
  audio: "audio",
  video: "video",
};

function convertEntry(entry: JournalEntry): { converted: ArchiveJournalEntry; media?: MediaCopy } {
  const converted: ArchiveJournalEntry = {
    time: entry.ts,
    type: TYPE_TO_FR[entry.type],
    id: entry.id,
  };
  if (entry.text) converted.texte = entry.text;
  if (entry.editedAt) converted.edite = true;

  let media: MediaCopy | undefined;
  if (entry.media?.url) {
    const fileName = path.posix.basename(entry.media.url);
    converted.media = `journal/${fileName}`;
    if (entry.media.duration !== undefined) converted.duree = entry.media.duration;
    if (entry.media.width !== undefined) converted.largeur = entry.media.width;
    if (entry.media.height !== undefined) converted.hauteur = entry.media.height;
    media = { fromUrl: entry.media.url, to: `journal/${fileName}` };
  }
  return { converted, media };
}

export function buildArchive(input: {
  meta: ArchiveMeta;
  livePositions: LivePositionsInput;
  journal: Pick<JournalFile, "entries">;
}): { archive: ArchiveFile; media: MediaCopy[] } {
  const positions: ArchivePosition[] = [];
  for (const p of input.livePositions.profile ?? []) {
    if (
      !Number.isFinite(p.latitude ?? NaN) ||
      !Number.isFinite(p.longitude ?? NaN) ||
      !p.fixTime
    ) {
      continue;
    }
    const position: ArchivePosition = {
      idx: positions.length,
      fixTime: p.fixTime,
      latitude: p.latitude as number,
      longitude: p.longitude as number,
    };
    if (p.alt !== undefined) position.altitude = p.alt;
    if (p.distMeters !== undefined) position.distance = Math.round(p.distMeters);
    positions.push(position);
  }

  const stats: ArchiveStats = {
    distance: Math.round(input.livePositions.stats?.distance ?? 0),
    dplus: Math.round(input.livePositions.stats?.dplus ?? 0),
    dminus: Math.round(input.livePositions.stats?.dminus ?? 0),
    durationSeconds: Math.round(input.livePositions.stats?.durationSeconds ?? 0),
    lastFixTime: input.livePositions.stats?.lastFixTime ?? null,
  };

  const media: MediaCopy[] = [];
  const journal: ArchiveJournalEntry[] = [];
  for (const entry of input.journal.entries ?? []) {
    const { converted, media: copy } = convertEntry(entry);
    journal.push(converted);
    if (copy) media.push(copy);
  }

  return {
    archive: {
      schemaVersion: 1,
      meta: input.meta,
      positions,
      stats,
      journal,
      chat: [],
    },
    media,
  };
}

const FR_TYPES = new Set(["texte", "photo", "audio", "video"]);

/** Garde-fou du contrat : liste des problèmes (vide = archive conforme). */
export function validateArchive(archive: ArchiveFile): string[] {
  const errors: string[] = [];
  if (archive.schemaVersion !== 1) errors.push("schemaVersion doit valoir 1");
  for (const field of ["slug", "nom", "dateDebut", "dateFin"] as const) {
    if (!archive.meta?.[field]) errors.push(`meta.${field} manquant`);
  }
  if (!(archive.meta?.distanceKm > 0)) errors.push("meta.distanceKm invalide");
  if (!(archive.meta?.denivelePositifM >= 0)) errors.push("meta.denivelePositifM invalide");
  if (!Array.isArray(archive.positions) || archive.positions.length === 0) {
    errors.push("positions vide");
  }
  for (const p of archive.positions ?? []) {
    if (!p.fixTime || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) {
      errors.push(`position idx=${p.idx} invalide`);
      break;
    }
  }
  if (!archive.stats || !(archive.stats.distance >= 0)) errors.push("stats.distance invalide");
  for (const e of archive.journal ?? []) {
    if (!e.time) errors.push("entrée de journal sans time");
    if (!FR_TYPES.has(e.type)) errors.push(`type de journal inconnu : ${e.type}`);
    if (e.media && !e.media.startsWith("journal/")) {
      errors.push(`media hors de journal/ : ${e.media}`);
    }
  }
  if (!Array.isArray(archive.chat) || archive.chat.length !== 0) {
    errors.push("chat doit rester VIDE (les messages privés n'entrent jamais dans l'archive)");
  }
  return errors;
}
