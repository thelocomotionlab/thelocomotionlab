// Test d'INTÉGRATION médias : exercice du vrai pipeline (sharp + ffmpeg) sur les
// fixtures du simulateur. Sauté automatiquement si ffmpeg est absent du poste —
// il tourne dans l'image Docker (ffmpeg installé) et sur tout poste équipé.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ffmpegAvailable } from "../src/media/ffmpeg";
import { processAudio } from "../src/media/audio";
import { processPhoto } from "../src/media/photo";

const hasFfmpeg = await ffmpegAvailable();
const fixturesDir = path.resolve(__dirname, "..", "sim");

function makeDirs() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "live-journal-media-"));
  const dirs = {
    mediaDir: path.join(base, "media"),
    sourcesDir: path.join(base, "sources"),
    tmpDir: path.join(base, "tmp"),
  };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
  return dirs;
}

describe("pipeline médias (intégration)", () => {
  it("photo : redimensionnée ≤ maxWidth, WebP, EXIF retiré, source conservée", async () => {
    const dirs = makeDirs();
    const source = fs.readFileSync(path.join(fixturesDir, "fixture-photo.jpg"));
    const result = await processPhoto(source, { maxWidth: 800, quality: 80, ...dirs });

    expect(result.width).toBe(800); // 1200 → bornée
    expect(result.fileName).toMatch(/^ph-[0-9a-f]{12}\.webp$/);
    const output = fs.readFileSync(path.join(dirs.mediaDir, result.fileName));
    expect(output.subarray(8, 12).toString()).toBe("WEBP");
    expect(output.includes(Buffer.from("EXIF"))).toBe(false);
    expect(fs.readdirSync(dirs.sourcesDir)).toHaveLength(1);
  });

  it.skipIf(!hasFfmpeg)("vocal : .ogg opus → .m4a AAC + durée, source conservée", async () => {
    const dirs = makeDirs();
    const source = fs.readFileSync(path.join(fixturesDir, "fixture-audio.ogg"));
    const result = await processAudio(source, ".oga", dirs);

    expect(result.fileName).toMatch(/^au-[0-9a-f]{12}\.m4a$/);
    expect(result.duration).toBe(3); // fixture de 3 s
    const output = fs.readFileSync(path.join(dirs.mediaDir, result.fileName));
    expect(output.subarray(4, 8).toString()).toBe("ftyp"); // conteneur MP4
    expect(fs.readdirSync(dirs.sourcesDir)).toHaveLength(1);
    expect(fs.readdirSync(dirs.tmpDir)).toHaveLength(0); // rename atomique effectué
  });
});
