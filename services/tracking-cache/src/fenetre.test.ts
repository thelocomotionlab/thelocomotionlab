// services/tracking-cache/src/fenetre.test.ts
//
// Le premier point de l'aventure — celui posé à la seconde du `./track start` —
// était jeté : la fenêtre finit par « Z », Traccar rend « +00:00 », et '+' passe
// avant 'Z' dans l'ordre des caractères.

import assert from "node:assert/strict";
import { test } from "node:test";

import { dansLaFenetre } from "./fenetre";

const DEBUT_Z = "2026-08-22T06:06:57.000Z";

test("dansLaFenetre : même instant écrit « +00:00 » plutôt que « Z »", () => {
  assert.equal(dansLaFenetre("2026-08-22T06:06:57.000+00:00", DEBUT_Z), true);
  // La comparaison de chaînes, elle, répondait faux :
  assert.equal("2026-08-22T06:06:57.000+00:00" >= DEBUT_Z, false);
});

test("dansLaFenetre : un décalage explicite est ramené à l'instant réel", () => {
  // 08:00+02:00 = 06:00 UTC, donc AVANT une fenêtre ouverte à 06:06:57 UTC —
  // alors que lexicographiquement la chaîne paraît postérieure.
  assert.equal(dansLaFenetre("2026-08-22T08:00:00.000+02:00", DEBUT_Z), false);
  assert.equal(dansLaFenetre("2026-08-22T09:00:00.000+02:00", DEBUT_Z), true);
});

test("dansLaFenetre : avant la fenêtre, dehors ; après, dedans", () => {
  assert.equal(dansLaFenetre("2026-08-21T23:59:59.000Z", DEBUT_Z), false);
  assert.equal(dansLaFenetre("2026-08-23T11:11:13.000+00:00", DEBUT_Z), true);
});

test("dansLaFenetre : sans fenêtre, tout passe ; sans horodatage, rien", () => {
  assert.equal(dansLaFenetre("2026-08-22T06:06:57.000Z", null), true);
  assert.equal(dansLaFenetre(null, null), true);
  assert.equal(dansLaFenetre(null, DEBUT_Z), false);
  assert.equal(dansLaFenetre("pas une date", DEBUT_Z), false);
});

test("dansLaFenetre : une fenêtre illisible ne fait pas disparaître la trace", () => {
  assert.equal(dansLaFenetre("2026-08-22T06:06:57.000Z", "n'importe quoi"), true);
});
