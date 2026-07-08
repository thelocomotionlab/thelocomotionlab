// Régénération périodique de og.png (brief : toutes les 2-5 min, on prend 3) :
// écriture ATOMIQUE dans public/ — Caddy la sert sur une URL stable
// ({$API_DOMAIN}/journal/og.png). Hors direct, la carte se régénère quand
// l'état change (avant ↔ live ↔ terminé) — les variantes sont quasi statiques.

import fs from "node:fs";
import path from "node:path";

import { moveFile } from "../utils";
import { ogCard } from "./cards";
import { renderPng } from "./render";
import type { OgDataSource, OgVariant } from "./data";

export class OgScheduler {
  private timer: NodeJS.Timeout | null = null;

  lastGeneratedAt: string | null = null;
  lastVariant: OgVariant | null = null;

  constructor(
    private readonly source: OgDataSource,
    private readonly publicDir: string,
    private readonly intervalMs: number,
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

      const png = await renderPng(ogCard(data), 1200, 630);
      const target = path.join(this.publicDir, "og.png");
      const tmp = `${target}.tmp`;
      fs.writeFileSync(tmp, png);
      moveFile(tmp, target);

      this.lastVariant = data.variant;
      this.lastGeneratedAt = new Date().toISOString();
      console.log(
        new Date().toISOString(),
        `[og] og.png régénérée (variante ${data.variant}, ${(png.length / 1024).toFixed(0)} Ko)`,
      );
    } catch (err) {
      console.error(new Date().toISOString(), `[og] échec de génération : ${(err as Error).message}`);
    }
  }
}
