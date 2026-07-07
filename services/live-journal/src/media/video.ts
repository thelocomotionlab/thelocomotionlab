// Vidéos (≤ 20 Mo, drapeau de PUBLICATION dans la projection — l'ingestion, elle,
// a toujours lieu) : transcodage H.264/AAC pour lecture universelle, source conservée.

import fs from "node:fs";
import path from "node:path";

import { moveFile, randomMediaName } from "../utils";
import { probeMedia, runFfmpeg } from "./ffmpeg";

export interface VideoResult {
  fileName: string;
  duration?: number;
  width?: number;
  height?: number;
}

export interface VideoOptions {
  mediaDir: string;
  sourcesDir: string;
  tmpDir: string;
}

export async function processVideo(
  source: Buffer,
  sourceExt: string,
  opts: VideoOptions,
): Promise<VideoResult> {
  const fileName = randomMediaName("vi", ".mp4");
  const baseName = path.parse(fileName).name;

  const sourcePath = path.join(opts.sourcesDir, `${baseName}.src${sourceExt}`);
  fs.writeFileSync(sourcePath, source);

  const tmpPath = path.join(opts.tmpDir, fileName);
  await runFfmpeg([
    "-i", sourcePath,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "26",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "96k",
    "-movflags", "+faststart",
    tmpPath,
  ]);

  const probe = await probeMedia(tmpPath);
  moveFile(tmpPath, path.join(opts.mediaDir, fileName));

  const result: VideoResult = { fileName };
  if (probe.duration !== undefined) result.duration = Math.round(probe.duration);
  if (probe.width !== undefined) result.width = probe.width;
  if (probe.height !== undefined) result.height = probe.height;
  return result;
}
