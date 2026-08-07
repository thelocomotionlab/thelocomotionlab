// Fond de carte : assemblage de la mosaïque, cache disque, et surtout la
// DÉGRADATION — une carte de partage ne doit jamais échouer parce qu'un
// service tiers a hoqueté. Aucun accès réseau : le fetcher est injecté.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { basemapJpeg, basemapKey, TILE_URL } from "../src/og/basemap";
import { fitView, type LonLat } from "../src/og/geo";

const CANEVAS = { width: 540, height: 960 };
const FENETRE = { x: 48, y: 100, width: 444, height: 400 };
const ITINERAIRE: LonLat[] = [
  [5.80, 45.30],
  [5.90, 45.30],
  [5.90, 45.38],
  [5.80, 45.38],
];

const vue = () => fitView(ITINERAIRE, { ...CANEVAS, fit: FENETRE })!;

const dossiers: string[] = [];
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "basemap-"));
  dossiers.push(d);
  return d;
}
afterEach(() => {
  for (const d of dossiers.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** Tuile unie : la couleur encode l'appel, ce qui permet de compter. */
async function tuile(couleur: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({ create: { width: 256, height: 256, channels: 3, background: couleur } })
    .png()
    .toBuffer();
}

function fetcherQuiRepond(couleur = { r: 200, g: 190, b: 170 }, compteur = { n: 0 }): typeof fetch {
  return (async () => {
    compteur.n += 1;
    const buf = await tuile(couleur);
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    } as unknown as Response;
  }) as typeof fetch;
}

describe("basemapJpeg", () => {
  it("renvoie un JPEG aux dimensions EXACTES du canevas", async () => {
    const png = await basemapJpeg(vue(), { fetcher: fetcherQuiRepond() });
    expect(png).not.toBeNull();
    const meta = await sharp(png as Buffer).metadata();
    expect([meta.width, meta.height]).toEqual([CANEVAS.width, CANEVAS.height]);
    expect(meta.format).toBe("jpeg");
  }, 20_000);

  it("toutes les tuiles perdues → null (la carte se rabat sur un fond uni)", async () => {
    const muet = (async () => ({ ok: false, status: 503 }) as Response) as typeof fetch;
    expect(await basemapJpeg(vue(), { fetcher: muet })).toBeNull();

    const enPanne = (async () => {
      throw new Error("réseau coupé");
    }) as typeof fetch;
    expect(await basemapJpeg(vue(), { fetcher: enPanne })).toBeNull();
  }, 20_000);

  it("UNE tuile suffit : le reste du fond reste clair, l'image sort quand même", async () => {
    let premier = true;
    const capricieux = (async () => {
      if (!premier) return { ok: false, status: 404 } as Response;
      premier = false;
      const buf = await tuile({ r: 10, g: 200, b: 10 });
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      } as unknown as Response;
    }) as typeof fetch;
    const jpeg = await basemapJpeg(vue(), { fetcher: capricieux });
    expect(jpeg).not.toBeNull();
    const meta = await sharp(jpeg as Buffer).metadata();
    expect([meta.width, meta.height]).toEqual([CANEVAS.width, CANEVAS.height]);
  }, 20_000);

  it("LE CACHE : la seconde carte ne redemande AUCUNE tuile", async () => {
    // C'est ce qui rend le direct tenable : og.png se régénère toutes les
    // 3 minutes pendant cinq jours, mais le fond ne se télécharge qu'une fois.
    const cacheDir = tmpDir();
    const compteur = { n: 0 };
    const fetcher = fetcherQuiRepond(undefined, compteur);

    const a = await basemapJpeg(vue(), { fetcher, cacheDir });
    const appelsPremierRendu = compteur.n;
    expect(appelsPremierRendu).toBeGreaterThan(1);

    const b = await basemapJpeg(vue(), { fetcher, cacheDir });
    expect(compteur.n).toBe(appelsPremierRendu);
    expect(Buffer.compare(a as Buffer, b as Buffer)).toBe(0);
  }, 30_000);

  it("sans dossier de cache, rien n'est écrit sur le disque", async () => {
    const cacheDir = tmpDir();
    await basemapJpeg(vue(), { fetcher: fetcherQuiRepond() });
    expect(fs.readdirSync(cacheDir)).toEqual([]);
  }, 20_000);

  it("la clé de cache change avec le cadrage, pas avec l'heure", () => {
    const v1 = fitView(ITINERAIRE, { ...CANEVAS, fit: FENETRE })!;
    const v2 = fitView(ITINERAIRE, { ...CANEVAS, fit: FENETRE })!;
    const v3 = fitView(ITINERAIRE, { ...CANEVAS, fit: { ...FENETRE, y: 300 } })!;
    expect(basemapKey(v1, TILE_URL)).toBe(basemapKey(v2, TILE_URL));
    expect(basemapKey(v1, TILE_URL)).not.toBe(basemapKey(v3, TILE_URL));
  });

  it("l'URL demandée suit le gabarit {z}/{y}/{x} d'Esri", async () => {
    const vues: string[] = [];
    const espion = (async (url: RequestInfo | URL) => {
      vues.push(String(url));
      return { ok: false, status: 404 } as Response;
    }) as typeof fetch;
    await basemapJpeg(vue(), { fetcher: espion });
    expect(vues.length).toBeGreaterThan(0);
    for (const u of vues) {
      expect(u).toMatch(/World_Topo_Map\/MapServer\/tile\/\d+\/\d+\/\d+$/);
    }
  }, 20_000);
});

describe("garde-fous de durée", () => {
  it("un fournisseur qui ne répond jamais ne bloque pas plus que le budget", async () => {
    // Sans budget total, une panne coûterait tuiles/concurrence × timeout —
    // plusieurs minutes, pendant lesquelles la régénération suivante (toutes
    // les 3 min) s'empilerait.
    const lent = (async () => {
      await new Promise((r) => setTimeout(r, 60));
      return { ok: false, status: 504 } as Response;
    }) as typeof fetch;
    const t0 = Date.now();
    const png = await basemapJpeg(vue(), { fetcher: lent, deadlineMs: 120, concurrency: 2 });
    expect(Date.now() - t0).toBeLessThan(1_500);
    expect(png).toBeNull();
  }, 10_000);
});
