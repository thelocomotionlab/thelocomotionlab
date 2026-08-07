// Régénération périodique de og.png (brief : toutes les 2-5 min, on prend 3) :
// écriture ATOMIQUE dans public/ — Caddy la sert sur une URL stable
// ({$API_DOMAIN}/journal/og.png). Hors direct, la carte se régénère quand
// l'état change (avant ↔ live ↔ terminé) — les variantes sont quasi statiques.
//
// Le fond de carte, lui, ne se retélécharge PAS à chaque tour : il est cadré
// sur l'itinéraire de référence, donc identique du départ à l'arrivée, et
// `cacheDir` le garde sur le volume (voir og/basemap.ts).

import fs from "node:fs";
import path from "node:path";

import { moveFile } from "../utils";
import { prechaufferFond, rendreCarte } from "./cards";
import type { OgDataSource, OgVariant } from "./data";

export class OgScheduler {
  private timer: NodeJS.Timeout | null = null;

  lastGeneratedAt: string | null = null;
  lastVariant: OgVariant | null = null;
  private fondStoryPret: OgVariant | null = null;

  constructor(
    private readonly source: OgDataSource,
    private readonly publicDir: string,
    private readonly intervalMs: number,
    private readonly cacheDir: string | null = null,
  ) {}

  start(): () => void {
    void this.generate();
    this.timer = setInterval(() => void this.generate(), this.intervalMs);
    return () => {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    };
  }

  async generate(): Promise<void> {
    try {
      const data = await this.source.collect();
      // Hors direct, inutile de re-rasteriser une carte identique.
      if (!data.live?.running && data.variant === this.lastVariant) return;

      const png = await rendreCarte(data, {
        format: "og",
        basemap: { cacheDir: this.cacheDir },
      });
      const target = path.join(this.publicDir, "og.png");
      const tmp = `${target}.tmp`;
      fs.writeFileSync(tmp, png);
      moveFile(tmp, target);

      this.lastVariant = data.variant;
      this.lastGeneratedAt = new Date().toISOString();

      // La story a son propre cadrage, donc son propre fond : on le prépare
      // ICI, une fois, pour que le premier « Partager l'aventure » ne fasse
      // pas attendre une soixantaine de tuiles.
      if (this.fondStoryPret !== data.variant) {
        this.fondStoryPret = data.variant;
        await prechaufferFond(data, { format: "story", basemap: { cacheDir: this.cacheDir } });
      }
      console.log(
        new Date().toISOString(),
        `[og] og.png régénérée (variante ${data.variant}, ${(png.length / 1024).toFixed(0)} Ko)`,
      );
    } catch (err) {
      console.error(new Date().toISOString(), `[og] échec de génération : ${(err as Error).message}`);
    }
  }
}
