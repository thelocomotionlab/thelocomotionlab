// Enrobage minimal de ffmpeg/ffprobe (binaires système du conteneur — pas de
// wrapper npm). Utilisé par audio.ts et video.ts.

import { execFile } from "node:child_process";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";
const TIMEOUT_MS = 120_000;

export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", ...args], { timeout: TIMEOUT_MS }, (err, _stdout, stderr) => {
      if (err) reject(new Error(`ffmpeg : ${stderr || err.message}`));
      else resolve();
    });
  });
}

interface ProbeResult {
  duration?: number;
  width?: number;
  height?: number;
}

export function probeMedia(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    execFile(
      FFPROBE,
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height:format=duration",
        "-of", "json",
        filePath,
      ],
      { timeout: TIMEOUT_MS },
      (err, stdout) => {
        if (err) {
          reject(new Error(`ffprobe : ${err.message}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout) as {
            format?: { duration?: string };
            streams?: Array<{ width?: number; height?: number }>;
          };
          const duration = parsed.format?.duration ? Number.parseFloat(parsed.format.duration) : undefined;
          resolve({
            duration: duration !== undefined && Number.isFinite(duration) ? duration : undefined,
            width: parsed.streams?.[0]?.width,
            height: parsed.streams?.[0]?.height,
          });
        } catch (parseErr) {
          reject(parseErr as Error);
        }
      },
    );
  });
}

/** Présence de ffmpeg (le test d'intégration média se saute si absent). */
export function ffmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(FFMPEG, ["-version"], { timeout: 10_000 }, (err) => resolve(!err));
  });
}
