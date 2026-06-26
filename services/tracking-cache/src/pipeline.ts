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

/** Borne basse du fetch : la plus récente de (dernier point en cache, fenêtre, plancher). */
function computeFromIso(
  cache: TraccarPosition[],
  windowStartIso: string | null,
  fetchWindowHours: number,
  now: Date
): string {
  const candidates: string[] = [];
  const lastFix = cache.at(-1)?.fixTime;
  if (lastFix) candidates.push(lastFix);
  if (windowStartIso) candidates.push(windowStartIso);
  candidates.push(new Date(now.getTime() - fetchWindowHours * 3_600_000).toISOString());
  // La plus récente borne = le plus petit fetch sans manquer de points.
  return candidates.sort().at(-1) as string;
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
  const fromIso = computeFromIso(store.readRawCache(), control.windowStartIso, config.fetchWindowHours, now);
  const toIso = now.toISOString();

  const cache = store.readRawCache();
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
