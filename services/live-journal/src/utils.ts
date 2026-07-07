import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Écriture atomique (tmp + rename) : Caddy sert ces fichiers en direct depuis le
 * volume, il ne doit JAMAIS voir un JSON tronqué. Même règle que tracking-cache.
 */
export function writeJsonAtomic(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

/** Déplace un fichier en gérant le cas volume ≠ tmpfs (EXDEV → copie + unlink). */
export function moveFile(from: string, to: string): void {
  try {
    fs.renameSync(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      fs.copyFileSync(from, to);
      fs.unlinkSync(from);
    } else {
      throw err;
    }
  }
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Nom de fichier média non devinable : préfixe type + 12 hex aléatoires. */
export function randomMediaName(prefix: string, ext: string): string {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}${ext}`;
}

const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32

/**
 * ULID minimal (48 bits de temps + 80 bits aléatoires) : id stable, unique et
 * triable chronologiquement, sans dépendance. Suffisant ici — pas besoin de la
 * monotonie intra-milliseconde de la spec complète.
 */
export function ulid(now: number = Date.now()): string {
  let time = now;
  let timePart = "";
  for (let i = 0; i < 10; i++) {
    timePart = ULID_ALPHABET[time % 32] + timePart;
    time = Math.floor(time / 32);
  }
  const rand = crypto.randomBytes(10);
  let randPart = "";
  for (let i = 0; i < 16; i++) {
    // 5 bits par caractère, on repioche dans les 80 bits (10 octets) : simple et uniforme.
    const bitIndex = i * 5;
    const byteIndex = Math.floor(bitIndex / 8);
    const shift = bitIndex % 8;
    const value =
      ((rand[byteIndex] << 8) | (byteIndex + 1 < rand.length ? rand[byteIndex + 1] : 0)) >>
      (11 - shift);
    randPart += ULID_ALPHABET[value & 31];
  }
  return timePart + randPart;
}

/** Durée « parlante » pour les confirmations du bot : 42 s, 1 min 42… */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  const rest = s % 60;
  return rest === 0 ? `${min} min` : `${min} min ${String(rest).padStart(2, "0")}`;
}

/** Extension de fichier (avec le point) déduite d'un chemin Telegram, bornée. */
export function safeExt(filePath: string, fallback: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (/^\.[a-z0-9]{1,5}$/.test(ext)) return ext;
  return fallback;
}
