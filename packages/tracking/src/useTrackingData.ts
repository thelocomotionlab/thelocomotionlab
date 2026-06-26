// packages/tracking/src/useTrackingData.ts
//
// COUCHE DONNÉES (et UNIQUEMENT les données) du live-tracking.
//
//   • Aucune dépendance à maplibre : ce hook ne fait que FETCH + DÉRIVER.
//   • AUCUN token, AUCUN secret : il ne reçoit que des URL. Le proxy (back VPS)
//     injecte le Bearer Traccar côté serveur ; le client tape une URL publique.
//   • Deux modes (le hook s'exécute toujours, chaque effet sort tôt hors mode) :
//       - "live"   : poll d'un proxy (/live-positions.json + /live-timer.json).
//       - "replay" : fetch unique d'un fichier statique (public/replays/*),
//                    nouveau OU ancien format (cf. normalizeReplayData).
//
// La PRÉSENTATION (carte + profil) consomme `TrackingData` et réagit à `revision`.

import { useEffect, useRef, useState } from "react";
import type {
  DisplayStats,
  ElevationPoint,
  LivePositions,
  LiveTimer,
  LngLat,
  ProfilePoint,
  TrackingData,
} from "./types";
import { buildUrl, withCacheBust } from "./utils";
import { normalizeReplayData } from "./replayData";

const NEUTRAL_TIMER: LiveTimer = {
  running: false,
  startTime: null,
  stopTime: null,
};

const EMPTY_STATS: DisplayStats = { distance: "0", ascent: 0, descent: 0 };

/** Instantané dérivé d'un payload (live ou replay) — base de TrackingData. */
type Snapshot = {
  coords: LngLat[];
  profile: ProfilePoint[];
  stats: DisplayStats;
  elevationData: ElevationPoint[];
  computedTotalDistance: number | null;
  lastUpdate: string | null;
};

const EMPTY_SNAPSHOT: Snapshot = {
  coords: [],
  profile: [],
  stats: EMPTY_STATS,
  elevationData: [],
  computedTotalDistance: null,
  lastUpdate: null,
};

export type UseTrackingDataOptions = {
  mode: "live" | "replay";
  // --- live ---
  apiBase?: string;
  positionsEndpoint?: string;
  timerEndpoint?: string;
  pollIntervalMs?: number;
  // --- replay ---
  positionsUrl?: string;
  distanceFactor?: number;
  ascentFactor?: number;
  descentFactor?: number;
};

/** Dérive l'instantané d'affichage depuis /live-positions.json (format courant). */
function deriveLiveSnapshot(data: LivePositions): Snapshot | null {
  const profile = Array.isArray(data?.profile) ? data.profile : [];
  const serverStats = data?.stats || null;

  if (!profile.length) return null;

  const coords: LngLat[] = profile
    .map((p): LngLat | null =>
      Number.isFinite(p?.longitude) && Number.isFinite(p?.latitude)
        ? [p.longitude as number, p.latitude as number]
        : null
    )
    .filter((c): c is LngLat => c !== null);

  if (!coords.length) return null;

  const lastPoint = profile.at(-1);

  const stats: DisplayStats = {
    distance:
      serverStats?.distance != null
        ? (serverStats.distance / 1000).toFixed(2)
        : ((lastPoint?.distMeters || 0) / 1000).toFixed(2),
    ascent:
      serverStats?.dplus != null
        ? serverStats.dplus
        : Math.round(lastPoint?.dPlus || 0),
    descent:
      serverStats?.dminus != null
        ? serverStats.dminus
        : Math.round(lastPoint?.dMinus || 0),
  };

  const elevationData: ElevationPoint[] = profile.map((p) => ({
    km:
      p?.distKm != null
        ? Number(p.distKm)
        : Number((p?.distMeters || 0) / 1000),
    alt: p?.alt || 0,
    dPlus: Math.round(p?.dPlus || 0),
    dMinus: Math.round(p?.dMinus || 0),
  }));

  const lastKm =
    lastPoint?.distKm != null
      ? Number(lastPoint.distKm)
      : Number((lastPoint?.distMeters || 0) / 1000);

  return {
    coords,
    profile,
    stats,
    elevationData,
    computedTotalDistance: lastKm || 0,
    lastUpdate: serverStats?.lastFixTime || lastPoint?.fixTime || null,
  };
}

export function useTrackingData(options: UseTrackingDataOptions): TrackingData {
  const {
    mode,
    apiBase = "",
    positionsEndpoint = "/live-positions.json",
    timerEndpoint = "/live-timer.json",
    pollIntervalMs = 10000,
    positionsUrl,
    distanceFactor = 1,
    ascentFactor = 1,
    descentFactor = 1,
  } = options;

  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [revision, setRevision] = useState(0);
  const [connectionError, setConnectionError] = useState(false);
  const [timer, setTimer] = useState<LiveTimer>(NEUTRAL_TIMER);
  const [elapsed, setElapsed] = useState(0);

  // Garde la dernière valeur du chrono accessible sans relancer les effets.
  const timerRef = useRef<LiveTimer>(NEUTRAL_TIMER);
  timerRef.current = timer;

  const applySnapshot = (snap: Snapshot | null) => {
    if (!snap) return;
    setSnapshot(snap);
    setRevision((r) => r + 1);
  };

  /* ---------- LIVE : poll des positions ---------- */
  useEffect(() => {
    if (mode !== "live") return;

    let cancelled = false;

    async function fetchPositions() {
      try {
        const positionsUrlBuilt = buildUrl(apiBase, positionsEndpoint);
        if (!positionsUrlBuilt) return;

        const res = await fetch(withCacheBust(positionsUrlBuilt));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = (await res.json()) as LivePositions;
        if (cancelled) return;

        setConnectionError(false);
        applySnapshot(deriveLiveSnapshot(data));
      } catch (err) {
        if (cancelled) return;
        console.error("Erreur récupération live data :", err);
        setConnectionError(true);
      }
    }

    fetchPositions();
    const interval = setInterval(fetchPositions, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [mode, apiBase, positionsEndpoint, pollIntervalMs]);

  /* ---------- LIVE : poll du timer ---------- */
  useEffect(() => {
    if (mode !== "live") return;

    let cancelled = false;

    async function fetchTimer() {
      try {
        const timerUrlBuilt = buildUrl(apiBase, timerEndpoint);
        if (!timerUrlBuilt) return;

        const res = await fetch(withCacheBust(timerUrlBuilt));
        const data = await res.json();
        if (cancelled) return;

        setTimer({
          running: Boolean(data?.running),
          startTime: data?.startTime || null,
          stopTime: data?.stopTime || null,
        });
      } catch (err) {
        if (cancelled) return;
        console.error("Erreur timer :", err);
      }
    }

    fetchTimer();
    const interval = setInterval(fetchTimer, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [mode, apiBase, timerEndpoint, pollIntervalMs]);

  /* ---------- LIVE : calcul du chrono en continu ---------- */
  useEffect(() => {
    if (mode !== "live") return;

    let interval: ReturnType<typeof setInterval> | undefined;

    const computeElapsed = () => {
      const t = timerRef.current;
      if (!t.startTime) {
        setElapsed(0);
        return;
      }
      const now = new Date();
      const start = new Date(t.startTime);
      const stop = t.stopTime ? new Date(t.stopTime) : null;
      const diff = t.running
        ? now.getTime() - start.getTime()
        : stop
          ? stop.getTime() - start.getTime()
          : 0;
      setElapsed(Math.max(0, Math.floor(diff / 1000)));
    };

    computeElapsed();

    if (timer.startTime && timer.running) {
      interval = setInterval(computeElapsed, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [mode, timer]);

  /* ---------- REPLAY : chargement unique d'un fichier statique ---------- */
  useEffect(() => {
    if (mode !== "replay" || !positionsUrl) return;

    let cancelled = false;

    async function loadReplay() {
      try {
        const res = await fetch(positionsUrl as string);
        const rawData: unknown = await res.json();
        if (cancelled) return;

        const normalized = normalizeReplayData(rawData);
        const {
          coords,
          profile,
          rawDistanceMeters,
          rawDplus,
          rawDminus,
          lastFixTime,
          durationSeconds,
          firstFixTime,
          lastProfilePoint,
        } = normalized;

        if (!coords.length) return;

        const distCorrection = Number(distanceFactor) || 1;
        const dplusCorrection = Number(ascentFactor) || 1;
        const dminusCorrection = Number(descentFactor) || 1;

        const distanceKmFinal = (rawDistanceMeters * distCorrection) / 1000;
        const dplusFinal = rawDplus * dplusCorrection;
        const dminusFinal = rawDminus * dminusCorrection;

        const elevationData: ElevationPoint[] = profile.map((p) => ({
          km: ((p.distMeters || 0) * distCorrection) / 1000,
          alt: p.alt || 0,
          dPlus: Math.round((p.dPlus || 0) * dplusCorrection),
          dMinus: Math.round((p.dMinus || 0) * dminusCorrection),
        }));

        applySnapshot({
          coords,
          profile,
          stats: {
            distance: distanceKmFinal.toFixed(2),
            ascent: Math.round(dplusFinal),
            descent: Math.round(dminusFinal),
          },
          elevationData,
          computedTotalDistance: distanceKmFinal,
          lastUpdate: lastFixTime || null,
        });

        // Durée : durationSeconds si fourni, sinon écart premier/dernier fixTime.
        if (typeof durationSeconds === "number" && durationSeconds >= 0) {
          setElapsed(Math.floor(durationSeconds));
        } else {
          const lastProfileFixTime = lastProfilePoint?.fixTime || null;
          if (firstFixTime && lastProfileFixTime) {
            const start = new Date(firstFixTime);
            const end = new Date(lastProfileFixTime);
            const diff = Math.max(0, (end.getTime() - start.getTime()) / 1000);
            setElapsed(Math.floor(diff));
          } else {
            setElapsed(0);
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Erreur chargement replay live tracking :", err);
      }
    }

    loadReplay();
    return () => {
      cancelled = true;
    };
  }, [mode, positionsUrl, distanceFactor, ascentFactor, descentFactor]);

  return {
    coords: snapshot.coords,
    profile: snapshot.profile,
    stats: snapshot.stats,
    elevationData: snapshot.elevationData,
    computedTotalDistance: snapshot.computedTotalDistance,
    lastUpdate: snapshot.lastUpdate,
    elapsed,
    timer,
    connectionError,
    revision,
  };
}
