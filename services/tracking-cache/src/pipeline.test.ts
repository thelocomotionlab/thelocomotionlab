// services/tracking-cache/src/pipeline.test.ts
//
// Tests de la borne basse du fetch (`computeFromIso`) — le point sensible du
// back : c'est elle qui décide si un point bufferisé par le tracker est relu ou
// perdu à jamais. Runner natif Node 22 (`node --test`), aucune dépendance.
//
//   pnpm -F @locomotionlab/tracking-cache test

import assert from "node:assert/strict";
import { test } from "node:test";

import { computeFromIso } from "./pipeline";
import type { TraccarPosition } from "./types";

const NOW = new Date("2026-08-20T12:00:00.000Z");
const WINDOW_HOURS = 50;
const LOOKBACK = 180; // minutes (défaut de tracking.config.json)

const point = (fixTime: string): TraccarPosition => ({ id: 1, fixTime });

test("cache vide : on part de l'ouverture de session (`track start`)", () => {
  const from = computeFromIso([], "2026-08-20T08:00:00.000Z", WINDOW_HOURS, LOOKBACK, NOW);
  assert.equal(from, "2026-08-20T08:00:00.000Z");
});

test("cache vide et aucune session : on retombe sur le plancher fetchWindowHours", () => {
  const from = computeFromIso([], null, WINDOW_HOURS, LOOKBACK, NOW);
  assert.equal(from, new Date(NOW.getTime() - WINDOW_HOURS * 3_600_000).toISOString());
});

test("collecte normale : la borne suit le dernier point, reculée du lookback", () => {
  const from = computeFromIso(
    [point("2026-08-20T11:30:00.000Z")],
    "2026-08-20T00:00:00.000Z",
    WINDOW_HOURS,
    LOOKBACK,
    NOW
  );
  // 11:30 − 3 h = 08:30, postérieur à l'ouverture de session → c'est lui qui gagne.
  assert.equal(from, "2026-08-20T08:30:00.000Z");
});

test("store & forward : la position courante ne fait pas sauter les points bufferisés", () => {
  // Scénario réel : coupure réseau de 10:00 à 11:00. Au retour, le tracker envoie
  // d'abord sa position COURANTE (11:00), puis vide son buffer (10:01…10:59).
  const from = computeFromIso(
    [point("2026-08-20T11:00:00.000Z")],
    "2026-08-20T09:00:00.000Z",
    WINDOW_HOURS,
    LOOKBACK,
    NOW
  );
  const fromMs = new Date(from).getTime();
  // Le prochain tick doit redescendre sous 10:01, sinon le buffer est perdu.
  assert.ok(
    fromMs <= new Date("2026-08-20T10:01:00.000Z").getTime(),
    `borne ${from} : les points bufferisés à partir de 10:01 seraient manqués`
  );
});

test("l'ouverture de session prime toujours sur le recul", () => {
  // Le recul ne doit JAMAIS faire collecter des points antérieurs à `track start`
  // (sinon la trace démarrerait avant le départ réel).
  const from = computeFromIso(
    [point("2026-08-20T11:00:00.000Z")],
    "2026-08-20T10:30:00.000Z",
    WINDOW_HOURS,
    LOOKBACK,
    NOW
  );
  assert.equal(from, "2026-08-20T10:30:00.000Z");
});

test("le plancher fetchWindowHours borne le recul même sans session", () => {
  const floorIso = new Date(NOW.getTime() - WINDOW_HOURS * 3_600_000).toISOString();
  const from = computeFromIso([point("2026-08-19T00:00:00.000Z")], null, WINDOW_HOURS, 10_000, NOW);
  assert.equal(from, floorIso);
});

test("lookback à 0 : comportement historique (borne = dernier point)", () => {
  const from = computeFromIso(
    [point("2026-08-20T11:30:00.000Z")],
    "2026-08-20T00:00:00.000Z",
    WINDOW_HOURS,
    0,
    NOW
  );
  assert.equal(from, "2026-08-20T11:30:00.000Z");
});

test("fixTime illisible ou absent : on ignore le point, pas de NaN dans la borne", () => {
  const from = computeFromIso(
    [point("2026-08-20T11:30:00.000Z"), { id: 2, fixTime: "pas-une-date" }],
    "2026-08-20T00:00:00.000Z",
    WINDOW_HOURS,
    LOOKBACK,
    NOW
  );
  assert.ok(!from.includes("NaN"));
  assert.equal(from, "2026-08-20T00:00:00.000Z");
});

// --- Recalcul quand la session est ARRÊTÉE ---------------------------------
//
// Le mode « idle » ne collectait rien ET ne recalculait rien : live-positions.json
// restait figé sur les chiffres d'avant l'arrêt. Résultat à la Croix de
// Belledonne — la page affichait encore 22,3 km (coefficient 1,03) longtemps
// après le passage à 1,12, parce qu'aucun tick ne repassait sur le cache brut.
// Or recaler sur la montre se fait justement APRÈS la sortie.

import { runTick } from "./pipeline";
import type { Config } from "./config";
import type { LivePositions, LiveTimer } from "./types";

class FauxStore {
  timer: LiveTimer = { running: false, startTime: null, stopTime: null };
  control = { windowStartIso: null as string | null };
  cache: TraccarPosition[] = [];
  live: LivePositions | null = null;
  ecritures = 0;

  readTimer() {
    return this.timer;
  }
  readControl() {
    return this.control;
  }
  readRawCache() {
    return this.cache;
  }
  readLivePositions() {
    return this.live;
  }
  writeLivePositions(v: LivePositions) {
    this.live = v;
    this.ecritures += 1;
  }
  writeRawCache() {
    throw new Error("aucune écriture du cache brut attendue à l'arrêt");
  }
}

const CONFIG = (samplingCorrection: number): Config =>
  ({
    compute: {
      samplingCorrection,
      elevationPlusCorrection: 1,
      elevationMinusCorrection: 1,
      minDistanceThreshold: 8,
      elevationSmoothingWindow: 5,
      elevationHysteresisM: 5,
    },
  }) as Config;

/** Ligne droite de ~1 km vers le nord, une position toutes les 30 s. */
const TRACE: TraccarPosition[] = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  fixTime: new Date(Date.UTC(2026, 7, 6, 6, 0, i * 30)).toISOString(),
  latitude: 45.2 + i * 0.00025,
  longitude: 5.94,
  altitude: 1000 + i * 5,
}));

test("session arrêtée : on recalcule depuis le cache brut (sans toucher à Traccar)", async () => {
  const store = new FauxStore();
  store.cache = TRACE;
  const fresh = await runTick(CONFIG(1.0), store as never);

  assert.equal(fresh, null, "aucune collecte quand la session est arrêtée");
  assert.ok(store.live, "live-positions.json doit tout de même être écrit");
  assert.ok(store.live!.stats.distance > 0);
});

test("LE CAS DE BELLEDONNE : changer un coefficient recale la trace après l'arrêt", async () => {
  const store = new FauxStore();
  store.cache = TRACE;
  await runTick(CONFIG(1.03), store as never);
  const avant = store.live!.stats.distance;

  await runTick(CONFIG(1.12), store as never);
  const apres = store.live!.stats.distance;

  assert.ok(apres > avant, `le recalage doit s'appliquer (${avant} → ${apres})`);
  assert.ok(
    Math.abs(apres / avant - 1.12 / 1.03) < 0.01,
    `rapport attendu ≈ ${(1.12 / 1.03).toFixed(3)}, obtenu ${(apres / avant).toFixed(3)}`
  );
});

test("à coefficients constants, le fichier n'est PAS réécrit à chaque tick", async () => {
  // Le tick tourne toutes les 15 s : réécrire un fichier identique en boucle
  // userait le disque et invaliderait les caches HTTP pour rien.
  const store = new FauxStore();
  store.cache = TRACE;
  await runTick(CONFIG(1.12), store as never);
  assert.equal(store.ecritures, 1);
  await runTick(CONFIG(1.12), store as never);
  await runTick(CONFIG(1.12), store as never);
  assert.equal(store.ecritures, 1, "aucune réécriture tant que rien ne change");
});

test("après `track reset` (cache vide), le mode idle reste un vrai repos", async () => {
  const store = new FauxStore();
  assert.equal(await runTick(CONFIG(1.12), store as never), null);
  assert.equal(store.live, null, "rien ne doit être écrit après un reset");
  assert.equal(store.ecritures, 0);
});
