// Collecte des données des cartes de partage. Sources :
//   - paramètres d'aventure : {SITE_BASE}/live-config.json — publié AU BUILD par
//     le site depuis lib/liveConfig.js (la source unique reste liveConfig) ;
//   - itinéraire (coordonnées + silhouette) : le .track.json public du site ;
//   - positions + timer : les artefacts publics de tracking (ou le simulateur).
// Tout est en cache (1 h pour la config/trace) et tolérant : une source
// injoignable dégrade la carte, elle ne la casse jamais.
//
// Les mêmes lecteurs (`trackFromJson`, `liveFromArtefacts`) servent au service
// ET à la commande locale du carrousel, qui lit des FICHIERS au lieu d'URLs —
// une seule interprétation de la donnée, deux points d'entrée.

import fs from "node:fs";
import path from "node:path";

import type { SimSnapshotProvider } from "../server";
import { avancementSurTrace, type LonLat } from "./progression";

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
  /** Polyligne [lon, lat] de l'itinéraire — le fond de carte se cadre dessus. */
  coords: LonLat[];
  dPlusM: number;
  dMinusM: number;
}

export interface OgLive {
  running: boolean;
  /**
   * Une session a été lancée et arrêtée : l'aventure est BOUCLÉE. C'est le
   * même critère que `LiveHub.jsx` (`timer.running || timer.startTime`) — sans
   * lui, la carte de partage d'une sortie terminée annonçait « PROCHAIN DÉPART
   * · 22 km à parcourir », constaté sur la Croix de Belledonne le 7 août 2026.
   * `./track reset` remet `startTime` à null et rend la page à l'état « avant ».
   */
  termine: boolean;
  /** Distance réellement parcourue (≠ avancement sur l'itinéraire). */
  doneKm: number;
  dplus: number;
  dminus: number;
  durationSeconds: number;
  /** Trace vécue [lon, lat], pour le trait plein de la carte. */
  coords: LonLat[];
  /** Kilomètre atteint SUR L'ITINÉRAIRE (projection), null si incalculable. */
  avancementKm: number | null;
  pourcent: number | null;
}

export interface OgData {
  variant: OgVariant;
  aventure: OgAventure;
  track: OgTrack | null;
  live: OgLive | null;
  jour: number | null;
  lastWaypoint: OgWaypoint | null;
  /** Encart éditorial du carrousel a posteriori (jamais en direct). */
  note?: string | null;
}

const CONFIG_TTL_MS = 3_600_000;
/** Intervalle minimal entre deux alertes « aucune position lue ». */
const ALERTE_TTL_MS = 900_000;

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

/** Kilomètre de référence pour situer le coureur : l'avancement projeté quand
 *  il existe, la distance parcourue sinon (mieux que rien, faux sur détour). */
export function kmSurItineraire(live: OgLive | null): number {
  if (!live) return 0;
  return live.avancementKm ?? live.doneKm;
}

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

/** Lecture d'un .track.json (schemaVersion 1) — `null` si inexploitable. */
export function trackFromJson(raw: unknown): OgTrack | null {
  const t = raw as {
    schemaVersion?: number;
    profile?: Array<{ km: number; alt: number }>;
    coords?: LonLat[];
    totalKm?: number;
    dPlusM?: number;
    dMinusM?: number;
  } | null;
  if (t?.schemaVersion !== 1 || !Array.isArray(t.profile) || t.profile.length < 2) return null;
  return {
    profile: t.profile,
    totalKm: t.totalKm ?? t.profile[t.profile.length - 1].km,
    coords: Array.isArray(t.coords) ? t.coords : [],
    dPlusM: Math.round(t.dPlusM ?? 0),
    dMinusM: Math.round(t.dMinusM ?? 0),
  };
}

interface PositionsShape {
  stats?: {
    distance?: number;
    dplus?: number;
    dminus?: number;
    durationSeconds?: number;
  };
  profile?: Array<{ latitude?: number | null; longitude?: number | null; fixTime?: string | null }>;
}

/**
 * Assemble l'instantané du direct à partir des artefacts de tracking. La
 * PROJECTION sur l'itinéraire se fait ici, une fois : c'est elle qui donne le
 * pourcentage de la carte et la position du curseur du profil.
 */
export function liveFromArtefacts(
  positions: unknown,
  timer: unknown,
  referenceCoords: LonLat[],
): OgLive {
  const p = (positions ?? {}) as PositionsShape;
  const points = Array.isArray(p.profile) ? p.profile : [];
  const coords: LonLat[] = [];
  for (const pt of points) {
    if (Number.isFinite(pt?.longitude) && Number.isFinite(pt?.latitude)) {
      coords.push([pt.longitude as number, pt.latitude as number]);
    }
  }
  const avancement =
    referenceCoords.length > 1 && points.length > 0
      ? avancementSurTrace(referenceCoords, points)
      : null;

  const t = timer as { running?: boolean; startTime?: string | null } | null;
  const running = t?.running === true;
  return {
    running,
    termine: !running && typeof t?.startTime === "string" && t.startTime !== "",
    doneKm: (p.stats?.distance ?? 0) / 1000,
    dplus: p.stats?.dplus ?? 0,
    dminus: p.stats?.dminus ?? 0,
    durationSeconds: p.stats?.durationSeconds ?? 0,
    coords,
    avancementKm: avancement ? avancement.metresParcourus / 1000 : null,
    pourcent: avancement ? avancement.pourcent : null,
  };
}

export interface OgDataSourceOptions {
  siteBase: string;
  trackingBase: string;
  /**
   * Dossier LOCAL des artefacts de tracking (`live-positions.json`,
   * `live-timer.json`), quand le volume `live_json` est monté dans le
   * conteneur. Les lire sur le disque plutôt que par `trackingBase` évite un
   * aller-retour par l'internet public pour des fichiers qui sont sur la MÊME
   * machine — et c'est ce trajet-là qui casse la carte de partage quand il
   * échoue. Absent (ou fichier illisible) : on retombe sur HTTP.
   */
  trackingDir?: string | null;
  sim?: SimSnapshotProvider;
  fetcher?: typeof fetch;
  now?: () => number;
}

export class OgDataSource {
  private readonly opts: OgDataSourceOptions;
  private readonly fetcher: typeof fetch;
  private aventureCache: { value: OgAventure; trackPath: string | null; at: number } | null = null;
  private trackCache: { value: OgTrack | null; at: number } | null = null;
  private derniereAlerte: number | null = null;

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
    // Cache-buster comme sur les artefacts de tracking. Sans lui, un cache
    // (Cloudflare devant Pages, proxy sortant) peut servir une config PÉRIMÉE
    // pendant des jours : le service compose alors les cartes de partage avec
    // l'itinéraire et la date de l'aventure PRÉCÉDENTE, sans rien signaler.
    const raw = (await this.fetchJson(
      `${this.opts.siteBase}/live-config.json?cacheBust=${this.now()}`,
    )) as {
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
    // Ce que le service croit couvrir, en clair dans les logs : c'est la seule
    // façon de voir d'un coup d'œil qu'il compose avec la config d'hier.
    console.log(
      new Date(this.now()).toISOString(),
      `[og] aventure « ${value.nom} » · départ ${value.dateDebut} · trace ${trackPath ?? "—"}`,
    );
    this.aventureCache = { value, trackPath, at: this.now() };
    return this.aventureCache;
  }

  private async track(trackPath: string | null): Promise<OgTrack | null> {
    if (this.trackCache && this.now() - this.trackCache.at < CONFIG_TTL_MS) {
      return this.trackCache.value;
    }
    const value = trackPath
      ? trackFromJson(
          await this.fetchJson(`${this.opts.siteBase}${trackPath}?cacheBust=${this.now()}`),
        )
      : null;
    this.trackCache = { value, at: this.now() };
    return value;
  }

  /** Artefact lu sur le volume s'il y est, sinon par `trackingBase`. */
  private async artefact(nom: string): Promise<unknown | null> {
    const dir = this.opts.trackingDir;
    if (dir) {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, nom), "utf8"));
      } catch {
        // Volume absent, fichier pas encore écrit, JSON tronqué en cours
        // d'écriture : on tente le réseau plutôt que de rendre une carte vide.
      }
    }
    return this.fetchJson(`${this.opts.trackingBase}/${nom}?cacheBust=${this.now()}`);
  }

  private async liveSnapshot(referenceCoords: LonLat[]): Promise<OgLive | null> {
    if (this.opts.sim) {
      return liveFromArtefacts(this.opts.sim.getPositions(), this.opts.sim.getTimer(), referenceCoords);
    }
    const [positions, timer] = await Promise.all([
      this.artefact("live-positions.json"),
      this.artefact("live-timer.json"),
    ]);
    if (!timer) return null;
    const live = liveFromArtefacts(positions, timer, referenceCoords);
    // ÉCHEC SILENCIEUX, sinon. Une carte de partage sans trace vécue ni
    // kilomètres se lit « il ne s'est rien passé », alors que la donnée est là
    // et que c'est le CHEMIN d'accès qui a lâché. Rien dans les logs ne le
    // disait : c'est ce qui a laissé passer le problème en plein direct.
    if (live.running && live.coords.length === 0) {
      this.plaindreArtefacts();
    }
    return live;
  }

  /** Un cri par quart d'heure : la boucle og tourne toutes les 3 minutes. */
  private plaindreArtefacts(): void {
    const now = this.now();
    if (this.derniereAlerte !== null && now - this.derniereAlerte < ALERTE_TTL_MS) return;
    this.derniereAlerte = now;
    console.warn(
      new Date(now).toISOString(),
      "[og] direct en cours mais AUCUNE position lue —",
      this.opts.trackingDir
        ? `ni ${this.opts.trackingDir}/live-positions.json ni ${this.opts.trackingBase}`
        : `${this.opts.trackingBase}/live-positions.json injoignable (TRACKING_DIR non configuré)`,
    );
  }

  /**
   * Vrai si la trace vécue tombe ENTIÈREMENT hors de l'itinéraire de référence.
   *
   * C'est la signature d'une config périmée : la carte se cadre sur la
   * référence, donc le vécu se projette hors du canevas et la carte sort avec
   * l'itinéraire seul, un pourcentage à 0 et le total d'une AUTRE sortie —
   * exactement ce qu'on a vu au Tour des Écrins, composé avec la trace du
   * Vercors. La marge (~5 km) laisse passer un départ décalé ou un détour.
   */
  private horsCadre(reference: LonLat[], vecu: LonLat[]): boolean {
    if (reference.length < 2 || vecu.length === 0) return false;
    const MARGE = 0.05;
    let lon0 = Infinity;
    let lon1 = -Infinity;
    let lat0 = Infinity;
    let lat1 = -Infinity;
    for (const [lon, lat] of reference) {
      if (lon < lon0) lon0 = lon;
      if (lon > lon1) lon1 = lon;
      if (lat < lat0) lat0 = lat;
      if (lat > lat1) lat1 = lat;
    }
    return vecu.every(
      ([lon, lat]) =>
        lon < lon0 - MARGE || lon > lon1 + MARGE || lat < lat0 - MARGE || lat > lat1 + MARGE,
    );
  }

  async collect(): Promise<OgData> {
    const { value: aventure, trackPath } = await this.aventure();
    const track = await this.track(trackPath);
    const live = await this.liveSnapshot(track?.coords ?? []);

    if (live && track && this.horsCadre(track.coords, live.coords)) {
      console.warn(
        new Date(this.now()).toISOString(),
        `[og] la trace vécue est HORS de l'itinéraire « ${aventure.nom} » ` +
          `(${trackPath}) — carte de partage composée avec la mauvaise aventure. ` +
          "Redéploie le site, ou vide le cache de live-config.json.",
      );
    }

    const variant: OgVariant =
      aventure.statut === "termine" || live?.termine
        ? "termine"
        : live?.running
          ? "live"
          : "avant";

    return {
      variant,
      aventure,
      track,
      live,
      jour:
        variant === "live"
          ? jourParis(new Date(this.now()).toISOString(), aventure.dateDebut)
          : null,
      lastWaypoint: live ? lastWaypointPassed(kmSurItineraire(live), aventure.waypoints) : null,
    };
  }
}
