// services/tracking-cache/src/compute.test.ts
//
// Le dénivelé est la grandeur la plus fragile de la chaîne : l'altitude GNSS
// oscille en permanence, et une accumulation naïve transforme ce bruit en
// centaines de mètres. Sortie réelle des Vouillands, 5 août 2026 : 1 431 m
// affichés pour 419 m réels.

import assert from "node:assert/strict";
import { test } from "node:test";

import { batterieDepuisAttributs, denivelesCumules, moyenneGlissante } from "./compute";

test("moyenneGlissante : fenêtre <= 1 ne touche à rien", () => {
  const v = [1, 5, 2, 8];
  assert.deepEqual(moyenneGlissante(v, 1), v);
  assert.deepEqual(moyenneGlissante(v, 0), v);
});

test("moyenneGlissante : écrête un pic isolé sans déplacer le niveau", () => {
  // Palier à 100 avec un pic parasite à 130.
  const brut = [100, 100, 130, 100, 100];
  const lisse = moyenneGlissante(brut, 5);
  assert.ok(lisse[2] < 115, `pic encore à ${lisse[2]}`);
  assert.ok(lisse[2] > 100, "le pic ne doit pas disparaître entièrement");
});

test("moyenneGlissante : longueur conservée (le profil s'indexe dessus)", () => {
  assert.equal(moyenneGlissante([1, 2, 3, 4, 5, 6, 7], 5).length, 7);
});

test("dénivelé : une vraie montée est comptée en entier", () => {
  const montee = Array.from({ length: 51 }, (_, i) => 1000 + i * 10); // +500 m
  const { dPlusCumule, dMinusCumule } = denivelesCumules(montee, 5);
  assert.ok(Math.abs((dPlusCumule.at(-1) ?? 0) - 500) < 15, `D+ = ${dPlusCumule.at(-1)}`);
  assert.equal(dMinusCumule.at(-1), 0);
});

test("LE CAS QUI MOTIVE TOUT : un bruit sous le seuil n'accumule JAMAIS", () => {
  // 2000 points qui oscillent de ±3 m autour d'un plateau : dénivelé réel nul.
  // L'ancien calcul (seuil par segment) en tirait des centaines de mètres.
  const plateau = Array.from({ length: 2000 }, (_, i) => 1000 + Math.sin(i) * 3);
  const { dPlusCumule, dMinusCumule } = denivelesCumules(plateau, 5);
  assert.equal(dPlusCumule.at(-1), 0, "le bruit ne doit rien produire");
  assert.equal(dMinusCumule.at(-1), 0);
});

test("le nombre de points ne change pas le résultat sur un plateau bruité", () => {
  const bruit = (n: number) => Array.from({ length: n }, (_, i) => 1000 + Math.sin(i * 0.7) * 4);
  const court = denivelesCumules(bruit(200), 5).dPlusCumule.at(-1);
  const long = denivelesCumules(bruit(5000), 5).dPlusCumule.at(-1);
  assert.equal(court, long, "densifier la trace ne doit pas gonfler le D+");
});

test("alternance montée/descente : les deux sens sont comptés", () => {
  // +100 m puis −100 m, par pas de 10 m.
  const alt = [
    ...Array.from({ length: 11 }, (_, i) => 1000 + i * 10),
    ...Array.from({ length: 11 }, (_, i) => 1100 - i * 10),
  ];
  const { dPlusCumule, dMinusCumule } = denivelesCumules(alt, 5);
  assert.ok(Math.abs((dPlusCumule.at(-1) ?? 0) - 100) < 15, `D+ = ${dPlusCumule.at(-1)}`);
  assert.ok(Math.abs((dMinusCumule.at(-1) ?? 0) - 100) < 15, `D− = ${dMinusCumule.at(-1)}`);
});

test("les cumuls sont croissants (le profil les lit tels quels)", () => {
  const alt = Array.from({ length: 300 }, (_, i) => 1000 + Math.sin(i / 20) * 60);
  const { dPlusCumule, dMinusCumule } = denivelesCumules(alt, 5);
  for (let i = 1; i < alt.length; i++) {
    assert.ok(dPlusCumule[i] >= dPlusCumule[i - 1], `D+ recule en ${i}`);
    assert.ok(dMinusCumule[i] >= dMinusCumule[i - 1], `D− recule en ${i}`);
  }
});

test("série vide ou d'un seul point : aucun dénivelé, aucun plantage", () => {
  assert.deepEqual(denivelesCumules([], 5), { dPlusCumule: [], dMinusCumule: [] });
  assert.deepEqual(denivelesCumules([1000], 5), { dPlusCumule: [0], dMinusCumule: [0] });
});

test("seuil à 0 : comportement historique (tout est compté)", () => {
  const alt = [100, 101, 100, 101];
  const { dPlusCumule } = denivelesCumules(alt, 0);
  assert.equal(dPlusCumule.at(-1), 2);
});

test("batterie : lue dans les attributs, arrondie", () => {
  assert.equal(batterieDepuisAttributs({ attributes: { batteryLevel: 87.4 } }), 87);
  assert.equal(batterieDepuisAttributs({ attributes: { batteryPercentage: 42 } }), 42);
});

test("batterie : des VOLTS ne doivent jamais passer pour des pour-cent", () => {
  // Traccar range parfois une tension (4,1 V) sous la clé `battery` : l'afficher
  // en « 4 % » déclencherait une fausse alerte de batterie faible.
  assert.equal(batterieDepuisAttributs({ attributes: { battery: 4.1 } }), null);
  assert.equal(batterieDepuisAttributs({ attributes: { battery: 137 } }), null);
});

test("LE CAS DE L'EXTINCTION : on remonte au dernier message qui la porte", () => {
  // Le tracker clôt la trace par un événement d'extinction (+RESP:GTPFA) qui
  // n'a pas de champ batterie. Regarder la seule dernière position ferait
  // disparaître l'indicateur au moment précis du bilan de sortie.
  const trace = [
    { attributes: { batteryLevel: 90 } },
    { attributes: { batteryLevel: 64 } },
    { attributes: { alarm: "powerOff", type: "PFA" } },
  ];
  assert.equal(batterieDepuisAttributs(trace), 64);
});

test("batterie : absente partout → null (aucune pastille affichée)", () => {
  assert.equal(batterieDepuisAttributs([{ attributes: {} }, { attributes: { motion: true } }]), null);
  assert.equal(batterieDepuisAttributs([]), null);
  assert.equal(batterieDepuisAttributs(undefined), null);
});

test("batterie : la remontée est bornée (une valeur trop vieille n'informe plus)", () => {
  const vieille = [{ attributes: { batteryLevel: 55 } }, ...Array.from({ length: 60 }, () => ({ attributes: {} }))];
  assert.equal(batterieDepuisAttributs(vieille), null);
});
