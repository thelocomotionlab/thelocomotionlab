// Simulateur de positions : rejoue un GPX à vitesse accélérée et produit EXACTEMENT
// le contrat front de tracking-cache (packages/tracking/src/types.ts) :
// live-positions.json { meta, stats, profile[] } + live-timer.json { running, ... }.
// Aucun fichier écrit : les instantanés vivent en mémoire, servis par server.ts.

import fs from "node:fs";

import type { SimSnapshotProvider } from "../server";

interface GpxPoint {
  lat: number;
  lon: number;
  ele: number;
}

interface ProfilePoint {
  idx: number;
  fixTime: string;
  latitude: number;
  longitude: number;
  alt: number;
  distMeters: number;
  distKm: number;
  dPlus: number;
  dMinus: number;
}

export interface SimGap {
  /** Kilomètre auquel le trou commence. */
  atKm: number;
  /** Durée réelle du trou (secondes) pendant laquelle rien n'est émis. */
  durationSeconds: number;
  /**
   * Ancienneté APPARENTE de la dernière position pendant le trou (minutes) :
   * permet d'observer immédiatement la « zone blanche » (> 60 min) en recette
   * sans attendre une heure réelle.
   */
  apparentMinutes?: number;
}

export interface PositionsScenario {
  /** Allure de l'athlète virtuel (km/h, temps d'aventure). */
  paceKmh?: number;
  /** Accélération du temps d'aventure par rapport au temps réel. */
  speed?: number;
  /** Cas « premier signal » : timer démarré, aucune position pendant N secondes réelles. */
  firstFixDelaySeconds?: number;
  gaps?: SimGap[];
}

const TICK_MS = 2_000;

/** Parse GPX naïf (trkpt/rtept) — suffisant pour nos traces, zéro dépendance. */
export function parseGpx(xml: string): GpxPoint[] {
  const points: GpxPoint[] = [];
  const re = /<(?:trkpt|rtept)[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*>([\s\S]*?)<\/(?:trkpt|rtept)>/g;
  const selfClosing = /<(?:trkpt|rtept)[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*\/>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const eleMatch = /<ele>([^<]+)<\/ele>/.exec(match[3]);
    points.push({
      lat: Number.parseFloat(match[1]),
      lon: Number.parseFloat(match[2]),
      ele: eleMatch ? Number.parseFloat(eleMatch[1]) : 0,
    });
  }
  if (points.length === 0) {
    while ((match = selfClosing.exec(xml)) !== null) {
      points.push({ lat: Number.parseFloat(match[1]), lon: Number.parseFloat(match[2]), ele: 0 });
    }
  }
  return points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

function haversineMeters(a: GpxPoint, b: GpxPoint): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

interface TrackPoint extends GpxPoint {
  distMeters: number;
  dPlus: number;
  dMinus: number;
}

export function buildTrack(points: GpxPoint[]): TrackPoint[] {
  const track: TrackPoint[] = [];
  let dist = 0;
  let dPlus = 0;
  let dMinus = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      dist += haversineMeters(points[i - 1], points[i]);
      const dEle = points[i].ele - points[i - 1].ele;
      if (dEle > 0) dPlus += dEle;
      else dMinus += -dEle;
    }
    track.push({ ...points[i], distMeters: dist, dPlus, dMinus });
  }
  return track;
}

export class PositionsSimulator implements SimSnapshotProvider {
  private readonly track: TrackPoint[];
  private readonly paceKmh: number;
  private readonly speed: number;
  private readonly firstFixDelayMs: number;
  private readonly gaps: SimGap[];

  private startedAt = 0;
  private emitted: ProfilePoint[] = [];
  private virtualElapsedMs = 0;
  private running = false;
  private startTime: string | null = null;
  private stopTime: string | null = null;
  private activeGap: { gap: SimGap; endsAt: number } | null = null;
  private doneGaps = new Set<SimGap>();
  private timer: NodeJS.Timeout | null = null;

  constructor(gpxPath: string, scenario: PositionsScenario) {
    this.track = buildTrack(parseGpx(fs.readFileSync(gpxPath, "utf8")));
    if (this.track.length < 2) throw new Error(`GPX inexploitable : ${gpxPath}`);
    this.paceKmh = scenario.paceKmh ?? 6;
    this.speed = scenario.speed ?? 60;
    this.firstFixDelayMs = (scenario.firstFixDelaySeconds ?? 0) * 1000;
    this.gaps = scenario.gaps ?? [];
  }

  start(): void {
    this.startedAt = Date.now();
    this.running = true;
    this.startTime = new Date().toISOString();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    console.log(
      new Date().toISOString(),
      `[sim] positions : ${this.track.length} pts GPX, ${(this.track[this.track.length - 1].distMeters / 1000).toFixed(1)} km, allure ${this.paceKmh} km/h ×${this.speed}`,
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const now = Date.now();
    if (now - this.startedAt < this.firstFixDelayMs) return; // premier signal à venir

    if (this.activeGap) {
      if (now < this.activeGap.endsAt) return; // zone blanche : rien n'est émis
      this.activeGap = null;
    }

    this.virtualElapsedMs += TICK_MS * this.speed;
    const targetMeters = (this.paceKmh * 1000 * this.virtualElapsedMs) / 3_600_000;
    const currentKm = targetMeters / 1000;

    for (const gap of this.gaps) {
      if (!this.doneGaps.has(gap) && currentKm >= gap.atKm) {
        this.doneGaps.add(gap);
        this.activeGap = { gap, endsAt: now + gap.durationSeconds * 1000 };
        console.log(new Date().toISOString(), `[sim] zone blanche au km ${gap.atKm} (${gap.durationSeconds}s réelles)`);
        return;
      }
    }

    while (
      this.emitted.length < this.track.length &&
      this.track[this.emitted.length].distMeters <= targetMeters
    ) {
      const source = this.track[this.emitted.length];
      this.emitted.push({
        idx: this.emitted.length,
        fixTime: new Date(now).toISOString(),
        latitude: source.lat,
        longitude: source.lon,
        alt: source.ele,
        distMeters: source.distMeters,
        distKm: source.distMeters / 1000,
        dPlus: source.dPlus,
        dMinus: source.dMinus,
      });
    }

    if (this.emitted.length >= this.track.length && this.running) {
      this.running = false;
      this.stopTime = new Date().toISOString();
      console.log(new Date().toISOString(), "[sim] fin du GPX → timer arrêté (état Terminé testable)");
    }
  }

  getPositions(): unknown {
    // Pendant une zone blanche, la dernière position est artificiellement vieillie
    // (apparentMinutes) pour observer le régime « zone blanche » sans attendre 1 h.
    let profile = this.emitted;
    const apparent = this.activeGap?.gap.apparentMinutes;
    if (apparent !== undefined && profile.length > 0) {
      const aged = new Date(Date.now() - apparent * 60_000).toISOString();
      profile = [...profile.slice(0, -1), { ...profile[profile.length - 1], fixTime: aged }];
    }
    const last = profile.length > 0 ? profile[profile.length - 1] : null;
    return {
      meta: { pointCount: profile.length, updatedAt: new Date().toISOString() },
      stats: {
        distance: last ? Math.round(last.distMeters) : 0,
        dplus: last ? Math.round(last.dPlus) : 0,
        dminus: last ? Math.round(last.dMinus) : 0,
        durationSeconds: Math.round(this.virtualElapsedMs / 1000),
        lastFixTime: last ? last.fixTime : null,
      },
      profile,
    };
  }

  getTimer(): unknown {
    return { running: this.running, startTime: this.startTime, stopTime: this.stopTime };
  }
}
