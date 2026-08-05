// services/tracking-cache/src/store.ts
//
// Lecture / écriture des fichiers d'état dans le volume partagé (DATA_DIR).
// Écriture ATOMIQUE (tmp + rename) : Caddy sert ces fichiers en lecture seule ;
// un rename atomique évite de servir un JSON tronqué pendant l'écriture.

import fs from "node:fs";
import path from "node:path";
import type { LiveControl, LivePositions, LiveTimer, TraccarPosition } from "./types";

export const NEUTRAL_TIMER: LiveTimer = {
  running: false,
  startTime: null,
  stopTime: null,
};

export const EMPTY_CONTROL: LiveControl = { windowStartIso: null };

export class Store {
  readonly rawCacheFile: string;
  readonly livePositionsFile: string;
  readonly timerFile: string;
  readonly controlFile: string;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.rawCacheFile = path.join(dataDir, "live-positions-cache.json");
    this.livePositionsFile = path.join(dataDir, "live-positions.json");
    this.timerFile = path.join(dataDir, "live-timer.json");
    this.controlFile = path.join(dataDir, "live-control.json");
  }

  private readJson<T>(file: string, fallback: T): T {
    try {
      if (fs.existsSync(file)) {
        const txt = fs.readFileSync(file, "utf8");
        if (txt.trim()) return JSON.parse(txt) as T;
      }
    } catch (e) {
      console.error("Lecture impossible :", file, (e as Error).message);
    }
    return fallback;
  }

  private writeJsonAtomic(file: string, data: unknown): void {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  readRawCache(): TraccarPosition[] {
    return this.readJson<TraccarPosition[]>(this.rawCacheFile, []);
  }
  writeRawCache(positions: TraccarPosition[]): void {
    this.writeJsonAtomic(this.rawCacheFile, positions);
  }

  writeLivePositions(data: LivePositions): void {
    this.writeJsonAtomic(this.livePositionsFile, data);
  }
  readLivePositions(): LivePositions | null {
    return this.readJson<LivePositions | null>(this.livePositionsFile, null);
  }

  readTimer(): LiveTimer {
    return this.readJson<LiveTimer>(this.timerFile, NEUTRAL_TIMER);
  }
  writeTimer(timer: LiveTimer): void {
    this.writeJsonAtomic(this.timerFile, timer);
  }

  readControl(): LiveControl {
    return this.readJson<LiveControl>(this.controlFile, EMPTY_CONTROL);
  }
  writeControl(control: LiveControl): void {
    this.writeJsonAtomic(this.controlFile, control);
  }

  /** Vide le cache brut + le fichier front (remise à zéro de la donnée). */
  clearData(): void {
    this.writeRawCache([]);
    this.writeLivePositions(emptyLivePositions(null));
  }
}

/** live-positions.json « vide » (aucun point), pour reset / session inactive. */
export function emptyLivePositions(windowStart: string | null): LivePositions {
  return {
    meta: { pointCount: 0, updatedAt: new Date().toISOString() },
    stats: { distance: 0, dplus: 0, dminus: 0, durationSeconds: 0, lastFixTime: null },
    profile: [],
    debug: {
      rawDistance: 0,
      rawDplus: 0,
      rawDminus: 0,
      samplingCorrection: 0,
      elevationPlusCorrection: 0,
      elevationMinusCorrection: 0,
      minDistanceThreshold: 0,
      elevationSmoothingWindow: 0,
      elevationHysteresisM: 0,
      windowStart,
    },
  };
}
