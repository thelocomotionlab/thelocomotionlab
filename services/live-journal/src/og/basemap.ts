// Fond de carte des cartes de partage : mosaïque de tuiles raster Esri World
// Topo — LE MÊME fond que la carte « Relief » de /live (LiveMap.jsx), pour que
// le partage ressemble à la page.
//
// Trois choses comptent ici, dans cet ordre :
//
//   1. LE CACHE. Le cadrage est calculé sur l'itinéraire de référence, qui ne
//      bouge pas de l'aventure : le fond est donc téléchargé UNE FOIS et relu
//      sur disque à chaque régénération (toutes les 3 min pendant un direct).
//      Sans lui on redemanderait ~50 tuiles à Esri toutes les 3 minutes pendant
//      cinq jours — inacceptable pour un service tiers gratuit, et lent.
//   2. LA DÉGRADATION. Une tuile manquante laisse un carré vide ; toutes les
//      tuiles manquantes renvoient `null` et la carte se rabat sur un fond uni.
//      Une carte de partage ne doit JAMAIS échouer à cause du réseau.
//   3. L'ATTRIBUTION, portée par la carte elle-même (« Fond de carte · Esri
//      World Topo ») — condition d'usage du service.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { TILE_SIZE, tileWindow, type MapView } from "./geo";

export const TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";

export const ATTRIBUTION = "Fond de carte · Esri World Topo";

const USER_AGENT = "locomotionlab-live-journal/1.0 (+https://thelocomotionlab.com)";

export interface BasemapOptions {
  tileUrl?: string;
  /** Dossier de cache ; absent = pas de cache (tests). */
  cacheDir?: string | null;
  fetcher?: typeof fetch;
  /** Requêtes simultanées vers le fournisseur de tuiles. */
  concurrency?: number;
  timeoutMs?: number;
  /**
   * Budget TOTAL du téléchargement. Sans lui, une panne du fournisseur ferait
   * attendre `tuiles / concurrence × timeout` — plusieurs minutes, pendant
   * lesquelles la régénération suivante (toutes les 3 min) s'empilerait.
   * Passé le délai, on assemble ce qu'on a.
   */
  deadlineMs?: number;
}

function tileUrlFor(template: string, z: number, x: number, y: number): string {
  return template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

/** Clé de cache : tout ce qui détermine l'image, et rien d'autre. */
export function basemapKey(view: MapView, tileUrl: string): string {
  const w = tileWindow(view);
  const descriptor = [
    tileUrl,
    w.zoom,
    w.tx0,
    w.ty0,
    w.cols,
    w.rows,
    w.cropX,
    w.cropY,
    view.tileCanvasWidth,
    view.tileCanvasHeight,
    view.width,
    view.height,
  ].join("|");
  return crypto.createHash("sha1").update(descriptor).digest("hex").slice(0, 16);
}

/**
 * Mosaïque JPEG couvrant tout le canevas de `view`, ou `null` si aucune tuile
 * n'a pu être obtenue. JPEG et non PNG : le fond n'a pas de transparence, et
 * satori l'embarque en base64 dans le SVG — 250 Ko au lieu de 2 Mo.
 */
export async function basemapJpeg(view: MapView, options: BasemapOptions = {}): Promise<Buffer | null> {
  const tileUrl = options.tileUrl ?? TILE_URL;
  const cacheDir = options.cacheDir === undefined ? null : options.cacheDir;
  const cacheFile = cacheDir ? path.join(cacheDir, `basemap-${basemapKey(view, tileUrl)}.jpg`) : null;

  if (cacheFile && fs.existsSync(cacheFile)) {
    try {
      return fs.readFileSync(cacheFile);
    } catch {
      // Cache illisible : on refabrique.
    }
  }

  const win = tileWindow(view);
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const fin = Date.now() + (options.deadlineMs ?? 45_000);
  const max = 2 ** win.zoom;

  const jobs: Array<{ col: number; row: number; z: number; x: number; y: number }> = [];
  for (let row = 0; row < win.rows; row += 1) {
    for (let col = 0; col < win.cols; col += 1) {
      jobs.push({
        col,
        row,
        z: win.zoom,
        // La longitude est cyclique : au zoom faible, le canevas peut déborder
        // du planisphère. `((n % max) + max) % max` ramène l'indice dans [0,max[.
        x: (((win.tx0 + col) % max) + max) % max,
        y: win.ty0 + row,
      });
    }
  }

  const tiles: Array<{ input: Buffer; left: number; top: number }> = [];
  let index = 0;
  const worker = async () => {
    for (;;) {
      const job = jobs[index++];
      if (!job) return;
      if (Date.now() > fin) return;
      try {
        const res = await fetcher(tileUrlFor(tileUrl, job.z, job.x, job.y), {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) continue;
        tiles.push({
          input: Buffer.from(await res.arrayBuffer()),
          left: job.col * TILE_SIZE,
          top: job.row * TILE_SIZE,
        });
      } catch {
        // Tuile perdue : le canevas restera clair à cet endroit.
      }
    }
  };
  await Promise.all(Array.from({ length: options.concurrency ?? 6 }, worker));

  if (tiles.length === 0) {
    console.warn(new Date().toISOString(), "[og] aucune tuile obtenue — carte sans fond");
    return null;
  }

  try {
    const mosaic = sharp({
      create: {
        width: win.cols * TILE_SIZE,
        height: win.rows * TILE_SIZE,
        channels: 3,
        background: { r: 232, g: 230, b: 222 },
      },
    });
    const jpeg = await mosaic
      .composite(tiles)
      // Les origines de la vue sont entières (fitView les arrondit) : la découpe
      // tombe donc toujours DANS la mosaïque. Le clamp ne sert qu'aux cas
      // dégénérés (canevas plus grand que le planisphère à zoom minimal).
      .extract({
        left: Math.max(0, Math.min(win.cols * TILE_SIZE - view.tileCanvasWidth, win.cropX)),
        top: Math.max(0, Math.min(win.rows * TILE_SIZE - view.tileCanvasHeight, win.cropY)),
        width: Math.min(view.tileCanvasWidth, win.cols * TILE_SIZE),
        height: Math.min(view.tileCanvasHeight, win.rows * TILE_SIZE),
      })
      // Retour au canevas final : c'est ici que le zoom fractionnaire se paie.
      .resize(view.width, view.height, { fit: "fill", kernel: "lanczos3" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    if (cacheFile) {
      try {
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
        fs.writeFileSync(cacheFile, jpeg);
      } catch (err) {
        console.warn(new Date().toISOString(), `[og] cache du fond non écrit : ${(err as Error).message}`);
      }
    }
    return jpeg;
  } catch (err) {
    console.warn(new Date().toISOString(), `[og] mosaïque impossible : ${(err as Error).message}`);
    return null;
  }
}

export function dataUriJpeg(buffer: Buffer): string {
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}
