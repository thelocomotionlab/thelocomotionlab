// services/tracking-cache/src/pipeline.ts
//
// Un « tick » de collecte : fetch INCRÉMENTAL (depuis le dernier point en cache,
// borné par la fenêtre de collecte), déduplication par clé composite, écriture
// du cache brut, recalcul complet → live-positions.json.
//
// Efficience : on ne re-télécharge pas toute la fenêtre à chaque passage —
// seulement le delta depuis le dernier point connu (gros gain vs l'ancien script
// qui refetchait depuis une date fixe).

import type { Config } from "./config";
import { computeLiveData } from "./compute";
import { fetchPositions } from "./traccar";
import { Store } from "./store";
import type { TraccarPosition } from "./types";

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

/** Clé composite stable (id prioritaire, sinon fixTime+coords). */
function makeKey(p: TraccarPosition): string {
  return p.id != null ? `id:${p.id}` : `t:${p.fixTime}|${p.latitude}|${p.longitude}`;
}

/** Millisecondes d'une date ISO, ou null si absente/illisible. */
function msOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Borne basse du fetch : la plus récente de (dernier point en cache RECULÉ du
 * lookback, ouverture de la fenêtre, plancher `fetchWindowHours`).
 *
 * Le RECUL (`bufferLookbackMinutes`) existe pour le **store & forward** des
 * trackers type Queclink GL320MG : hors réseau, l'appareil bufferise ; au retour
 * du signal, rien ne garantit qu'il vide son buffer AVANT d'envoyer sa position
 * courante. Sans recul, ce point courant ferait avancer la borne basse au
 * présent et les points bufferisés (fixTime plus anciens), arrivés juste après,
 * ne seraient JAMAIS relus — trou définitif dans la trace.
 *
 * Re-balayer cette zone est sans risque : `runTick` dédoublonne par clé stable
 * (id Traccar), donc un point déjà connu n'est jamais compté deux fois. Le seul
 * coût est quelques points relus par tick, sur un Traccar local.
 */
export function computeFromIso(
  cache: TraccarPosition[],
  windowStartIso: string | null,
  fetchWindowHours: number,
  bufferLookbackMinutes: number,
  now: Date
): string {
  // Plancher dur : on ne remonte jamais plus loin, quoi qu'il arrive.
  const candidates: number[] = [now.getTime() - fetchWindowHours * 3_600_000];

  const lastFixMs = msOf(cache.at(-1)?.fixTime);
  if (lastFixMs !== null) {
    candidates.push(lastFixMs - Math.max(0, bufferLookbackMinutes) * 60_000);
  }
  // L'ouverture de session prime : jamais de collecte avant `track start`.
  const windowStartMs = msOf(windowStartIso);
  if (windowStartMs !== null) candidates.push(windowStartMs);

  return new Date(Math.max(...candidates)).toISOString();
}

/**
 * Exécute un tick. Renvoie le nombre de points frais ajoutés (ou null si la
 * session n'est pas active — rien n'est fait, c'est le mode « idle »).
 */
export async function runTick(config: Config, store: Store): Promise<number | null> {
  const timer = store.readTimer();
  if (!timer.running) return null; // idle : aucune collecte tant que `track start` n'a pas été lancé

  const control = store.readControl();
  const now = new Date();
  const cache = store.readRawCache();
  const fromIso = computeFromIso(
    cache,
    control.windowStartIso,
    config.fetchWindowHours,
    config.bufferLookbackMinutes,
    now
  );
  const toIso = now.toISOString();

  const fetched = await fetchPositions(config, fromIso, toIso);

  const cachedKeys = new Set(cache.map(makeKey));
  const fresh = fetched.filter((p) => !cachedKeys.has(makeKey(p)));

  let deduped = cache;
  if (fresh.length > 0) {
    const merged = [...cache, ...fresh].sort(
      (a, b) => new Date(a.fixTime ?? 0).getTime() - new Date(b.fixTime ?? 0).getTime()
    );
    const seen = new Set<string>();
    deduped = merged.filter((p) => {
      const key = makeKey(p);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    store.writeRawCache(deduped);
  }

  const live = computeLiveData(deduped, config.compute, control.windowStartIso);
  store.writeLivePositions(live);

  log(
    `fresh=${fresh.length} cache=${deduped.length} retained=${live.meta.pointCount}`,
    "stats=", live.stats
  );
  return fresh.length;
}
