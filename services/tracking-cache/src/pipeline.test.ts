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
