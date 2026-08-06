// services/tracking-cache/src/types.ts
//
// Types du back live-tracking. Le CONTRAT DE SORTIE (LivePositions, LiveTimer)
// est identique à celui consommé par le front (@locomotionlab/tracking) — ne rien
// changer ici sans répercuter là-bas.

/** Position GPS brute renvoyée par l'API Traccar (/positions). */
export type TraccarPosition = {
  id?: number;
  deviceId?: number;
  fixTime?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  altitude?: number | null;
  [k: string]: unknown;
};

/** Un point enrichi du profil (sortie front). */
export type ProfilePoint = {
  idx: number;
  fixTime: string | null;
  latitude: number | null;
  longitude: number | null;
  alt: number;
  distMeters: number;
  distKm: number;
  dPlus: number;
  dMinus: number;
};

/** /live-positions.json — contrat front { meta, stats, profile, debug }. */
export type LivePositions = {
  meta: { pointCount: number; updatedAt: string };
  stats: {
    distance: number;
    dplus: number;
    dminus: number;
    durationSeconds: number;
    lastFixTime: string | null;
    /**
     * Charge du tracker en %, telle que Traccar l'a relevée sur la DERNIÈRE
     * position. `null` si l'appareil ne la publie pas (le champ dépend du
     * modèle et de la version du décodeur) — le front n'affiche alors rien.
     */
    batteryPercent: number | null;
  };
  profile: ProfilePoint[];
  debug: {
    rawDistance: number;
    rawDplus: number;
    rawDminus: number;
    samplingCorrection: number;
    elevationPlusCorrection: number;
    elevationMinusCorrection: number;
    minDistanceThreshold: number;
    elevationSmoothingWindow: number;
    elevationHysteresisM: number;
    windowStart: string | null;
  };
};

/** /live-timer.json — chrono (contrat front, inchangé). */
export type LiveTimer = {
  running: boolean;
  startTime: string | null;
  stopTime: string | null;
};

/**
 * /live-control.json — état de contrôle INTERNE au back (pas consommé par le
 * front). Porte l'instant d'ouverture de la fenêtre de collecte, posé par
 * `track start` (remplace la date en dur + le hack sed sur le source).
 */
export type LiveControl = {
  windowStartIso: string | null;
};

/** Paramètres de filtrage/correction (source : tracking.config.json + env). */
export type ComputeParams = {
  samplingCorrection: number;
  elevationPlusCorrection: number;
  elevationMinusCorrection: number;
  minDistanceThreshold: number;
  elevationSmoothingWindow: number;
  elevationHysteresisM: number;
};
