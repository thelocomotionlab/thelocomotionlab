// Collecte des données des cartes de partage. Sources :
//   - paramètres d'aventure : {SITE_BASE}/live-config.json — publié AU BUILD par
//     le site depuis lib/liveConfig.js (la source unique reste liveConfig) ;
//   - silhouette du profil : le .track.json public du site ;
//   - positions + timer : les artefacts publics de tracking (ou le simulateur).
// Tout est en cache (1 h pour la config/trace) et tolérant : une source
// injoignable dégrade la carte, elle ne la casse jamais.

import type { SimSnapshotProvider } from "../server";

export type OgVariant = "live" | "avant" | "termine";

export interface OgWaypoint {
  nom: string;
  km: number;
  altitude?: number;
}

export interface OgAventure {
  nom: string;
  dates: string;
  dateDebut: string;
  distanceKm: number;
  deniveleM: number;
  statut: "avant" | "termine";
  waypoints: OgWaypoint[];
}

export interface OgTrack {
  profile: Array<{ km: number; alt: number }>;
  totalKm: number;
}

export interface OgLive {
  running: boolean;
  doneKm: number;
  dplus: number;
}

export interface OgData {
  variant: OgVariant;
  aventure: OgAventure;
  track: OgTrack | null;
  live: OgLive | null;
  jour: number | null;
  lastWaypoint: OgWaypoint | null;
}

const CONFIG_TTL_MS = 3_600_000;

// Aventure neutre si live-config.json est injoignable (dev isolé) : la carte
// reste générable, avec un avertissement en logs.
const FALLBACK_AVENTURE: OgAventure = {
  nom: "Aventure du Locomotion Lab",
  dates: "",
  dateDebut: new Date().toISOString(),
  distanceKm: 0,
  deniveleM: 0,
  statut: "avant",
  waypoints: [],
};

/** Dernier waypoint dépassé — « Dernière étape franchie » de la maquette 2f. */
export function lastWaypointPassed(doneKm: number, waypoints: OgWaypoint[]): OgWaypoint | null {
  let last: OgWaypoint | null = null;
  for (const wp of waypoints) {
    if (wp.km <= doneKm && (last === null || wp.km > last.km)) last = wp;
  }
  return last;
}

const parisDayFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * J-index en Europe/Paris, frontière à minuit française — MÊME règle que
 * apps/site/lib/liveTime.js (le site est en JS, le service en TS : duplication
 * volontaire de ~15 lignes, toute évolution se fait des deux côtés).
 */
export function jourParis(nowISO: string, dateDebutISO: string): number {
  const dayNumber = (iso: string) => {
    const parts = Object.fromEntries(
      parisDayFormatter.formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
    ) as Record<string, string>;
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86_400_000;
  };
  return Math.max(1, dayNumber(nowISO) - dayNumber(dateDebutISO) + 1);
}

export interface OgDataSourceOptions {
  siteBase: string;
  trackingBase: string;
  sim?: SimSnapshotProvider;
  fetcher?: typeof fetch;
  now?: () => number;
}

export class OgDataSource {
  private readonly opts: OgDataSourceOptions;
  private readonly fetcher: typeof fetch;
  private aventureCache: { value: OgAventure; trackPath: string | null; at: number } | null = null;
  private trackCache: { value: OgTrack | null; at: number } | null = null;

  constructor(opts: OgDataSourceOptions) {
    this.opts = opts;
    this.fetcher = opts.fetcher ?? fetch;
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  private async fetchJson(url: string): Promise<unknown | null> {
    try {
      const res = await this.fetcher(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  private async aventure(): Promise<{ value: OgAventure; trackPath: string | null }> {
    if (this.aventureCache && this.now() - this.aventureCache.at < CONFIG_TTL_MS) {
      return this.aventureCache;
    }
    const raw = (await this.fetchJson(`${this.opts.siteBase}/live-config.json`)) as {
      aventure?: Partial<OgAventure>;
      live?: { referenceTrack?: string; waypoints?: OgWaypoint[] };
    } | null;

    let value = FALLBACK_AVENTURE;
    let trackPath: string | null = null;
    if (raw?.aventure?.nom) {
      value = {
        nom: raw.aventure.nom,
        dates: raw.aventure.dates ?? "",
        dateDebut: raw.aventure.dateDebut ?? FALLBACK_AVENTURE.dateDebut,
        distanceKm: raw.aventure.distanceKm ?? 0,
        deniveleM: raw.aventure.deniveleM ?? 0,
        statut: raw.aventure.statut === "termine" ? "termine" : "avant",
        waypoints: raw.live?.waypoints ?? [],
      };
      trackPath = raw.live?.referenceTrack ?? null;
    } else {
      console.warn(new Date().toISOString(), "[og] live-config.json injoignable — aventure neutre");
    }
    this.aventureCache = { value, trackPath, at: this.now() };
    return this.aventureCache;
  }

  private async track(trackPath: string | null): Promise<OgTrack | null> {
    if (this.trackCache && this.now() - this.trackCache.at < CONFIG_TTL_MS) {
      return this.trackCache.value;
    }
    let value: OgTrack | null = null;
    if (trackPath) {
      const raw = (await this.fetchJson(`${this.opts.siteBase}${trackPath}`)) as {
        schemaVersion?: number;
        profile?: Array<{ km: number; alt: number }>;
        totalKm?: number;
      } | null;
      if (raw?.schemaVersion === 1 && Array.isArray(raw.profile) && raw.profile.length > 1) {
        value = { profile: raw.profile, totalKm: raw.totalKm ?? raw.profile[raw.profile.length - 1].km };
      }
    }
    this.trackCache = { value, at: this.now() };
    return value;
  }

  private async liveSnapshot(): Promise<OgLive | null> {
    if (this.opts.sim) {
      const positions = this.opts.sim.getPositions() as {
        stats?: { distance?: number; dplus?: number };
      };
      const timer = this.opts.sim.getTimer() as { running?: boolean };
      return {
        running: timer.running === true,
        doneKm: (positions.stats?.distance ?? 0) / 1000,
        dplus: positions.stats?.dplus ?? 0,
      };
    }
    const [positions, timer] = await Promise.all([
      this.fetchJson(`${this.opts.trackingBase}/live-positions.json?cacheBust=${this.now()}`),
      this.fetchJson(`${this.opts.trackingBase}/live-timer.json?cacheBust=${this.now()}`),
    ]);
    if (!timer) return null;
    const stats = (positions as { stats?: { distance?: number; dplus?: number } } | null)?.stats;
    return {
      running: (timer as { running?: boolean }).running === true,
      doneKm: (stats?.distance ?? 0) / 1000,
      dplus: stats?.dplus ?? 0,
    };
  }

  async collect(): Promise<OgData> {
    const { value: aventure, trackPath } = await this.aventure();
    const [track, live] = await Promise.all([this.track(trackPath), this.liveSnapshot()]);

    const variant: OgVariant =
      aventure.statut === "termine" ? "termine" : live?.running ? "live" : "avant";

    return {
      variant,
      aventure,
      track,
      live,
      jour:
        variant === "live"
          ? jourParis(new Date(this.now()).toISOString(), aventure.dateDebut)
          : null,
      lastWaypoint: live ? lastWaypointPassed(live.doneKm, aventure.waypoints) : null,
    };
  }
}
