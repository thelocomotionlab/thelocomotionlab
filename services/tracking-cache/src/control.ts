// services/tracking-cache/src/control.ts
//
// Opérations de contrôle pilotées par la CLI (`track start|stop|reset|status`).
// Elles n'ont besoin que du volume (DATA_DIR) — PAS du token. La fenêtre de
// collecte (windowStartIso) est posée ici, au runtime : c'est ce qui remplace la
// date en dur + le hack `sed` sur le source de l'ancien live-cache.mjs.

import { EMPTY_CONTROL, NEUTRAL_TIMER, Store } from "./store";
import type { ComputeParams, LiveTimer } from "./types";

export type StatusReport = {
  running: boolean;
  startTime: string | null;
  stopTime: string | null;
  windowStart: string | null;
  elapsedSeconds: number;
  lastFixTime: string | null;
  points: number;
  distanceMeters: number;
  dplus: number;
  dminus: number;
  updatedAt: string | null;
  /**
   * Coefficients EFFECTIVEMENT appliqués par le conteneur qui tourne. Ils sont
   * là pour répondre à une question qui, sinon, ne se répond que par
   * supposition : « est-ce que ma nouvelle image est bien déployée ? » Un
   * chiffre qui ne bouge pas après un `./deploy.sh` vient neuf fois sur dix
   * d'un conteneur resté sur l'ancienne version, pas du calcul.
   */
  corrections: { distance: number; dPlus: number; dMinus: number } | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

/** Démarre une session : ouvre la fenêtre de collecte = maintenant + chrono ON. */
export function start(store: Store): LiveTimer {
  const now = nowIso();
  store.writeControl({ windowStartIso: now });
  const timer: LiveTimer = { running: true, startTime: now, stopTime: null };
  store.writeTimer(timer);
  return timer;
}

/** Arrête le chrono (la donnée reste figée pour consultation / replay). */
export function stop(store: Store): LiveTimer {
  const current = store.readTimer();
  const timer: LiveTimer = {
    running: false,
    startTime: current.startTime,
    stopTime: nowIso(),
  };
  store.writeTimer(timer);
  return timer;
}

/** Remet tout à zéro : chrono neutre, fenêtre effacée, cache + sortie vidés. */
export function reset(store: Store): void {
  store.writeTimer({ ...NEUTRAL_TIMER });
  store.writeControl({ ...EMPTY_CONTROL });
  store.clearData();
}

/** Photographie de l'état courant (pour `track status`). */
export function status(store: Store, compute?: ComputeParams): StatusReport {
  const timer = store.readTimer();
  const control = store.readControl();
  const live = store.readLivePositions();

  let elapsedSeconds = 0;
  if (timer.startTime) {
    const start = new Date(timer.startTime).getTime();
    const end = timer.running ? Date.now() : timer.stopTime ? new Date(timer.stopTime).getTime() : start;
    elapsedSeconds = Math.max(0, Math.floor((end - start) / 1000));
  }

  return {
    running: timer.running,
    startTime: timer.startTime,
    stopTime: timer.stopTime,
    windowStart: control.windowStartIso,
    elapsedSeconds,
    lastFixTime: live?.stats.lastFixTime ?? null,
    points: live?.meta.pointCount ?? 0,
    distanceMeters: live?.stats.distance ?? 0,
    dplus: live?.stats.dplus ?? 0,
    dminus: live?.stats.dminus ?? 0,
    updatedAt: live?.meta.updatedAt ?? null,
    corrections: compute
      ? {
          distance: compute.samplingCorrection,
          dPlus: compute.elevationPlusCorrection,
          dMinus: compute.elevationMinusCorrection,
        }
      : null,
  };
}
