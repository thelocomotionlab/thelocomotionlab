// Vocaux : Telegram envoie de l'Opus (.oga) que Safari/iOS ne lit pas nativement
// → transcodage AAC/M4A (lecture universelle), source conservée, durée via ffprobe.

import fs from "node:fs";
import path from "node:path";

import { moveFile, randomMediaName } from "../utils";
import { probeMedia, runFfmpeg } from "./ffmpeg";

export interface AudioResult {
  fileName: string;
  duration: number;
}

export interface AudioOptions {
  mediaDir: string;
  sourcesDir: string;
  tmpDir: string;
}

export async function processAudio(
  source: Buffer,
  sourceExt: string,
  opts: AudioOptions,
): Promise<AudioResult> {
  const fileName = randomMediaName("au", ".m4a");
  const baseName = path.parse(fileName).name;

  const sourcePath = path.join(opts.sourcesDir, `${baseName}.src${sourceExt}`);
  fs.writeFileSync(sourcePath, source);

  const tmpPath = path.join(opts.tmpDir, fileName);
  await runFfmpeg([
    "-i", sourcePath,
    "-vn",
    "-c:a", "aac",
    "-b:a", "64k",
    // faststart : le moov atom en tête → lecture dès les premiers octets (mobile).
    "-movflags", "+faststart",
    tmpPath,
  ]);

  const probe = await probeMedia(tmpPath);
  moveFile(tmpPath, path.join(opts.mediaDir, fileName));

  return { fileName, duration: Math.round(probe.duration ?? 0) };
}
