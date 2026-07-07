// Photos : sharp — orientation EXIF appliquée puis métadonnées RETIRÉES (défaut
// sharp : rien n'est copié sans .withMetadata()), largeur bornée, sortie WebP.
// La source originale est conservée dans private/sources/ (jamais servie).

import path from "node:path";
import fs from "node:fs";

import sharp from "sharp";

import { moveFile, randomMediaName } from "../utils";

export interface PhotoResult {
  fileName: string;
  width: number;
  height: number;
}

export interface PhotoOptions {
  maxWidth: number;
  quality: number;
  mediaDir: string;
  sourcesDir: string;
  tmpDir: string;
}

export async function processPhoto(source: Buffer, opts: PhotoOptions): Promise<PhotoResult> {
  const fileName = randomMediaName("ph", ".webp");
  const baseName = path.parse(fileName).name;

  fs.writeFileSync(path.join(opts.sourcesDir, `${baseName}.src.jpg`), source);

  const { data, info } = await sharp(source, { failOn: "none" })
    .rotate() // applique l'orientation EXIF AVANT que les métadonnées soient perdues
    .resize({ width: opts.maxWidth, withoutEnlargement: true })
    .webp({ quality: opts.quality })
    .toBuffer({ resolveWithObject: true });

  const tmpPath = path.join(opts.tmpDir, fileName);
  fs.writeFileSync(tmpPath, data);
  moveFile(tmpPath, path.join(opts.mediaDir, fileName));

  return { fileName, width: info.width, height: info.height };
}
