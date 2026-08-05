// lib/progression.test.js
//
// Les cas qui comptent sont ceux du terrain : le détour, l'aller-retour, le
// hors-trace. C'est là que l'ancien calcul (distance parcourue / distance
// prévue) mentait.

import { describe, expect, it } from "vitest";

import { avancementSurTrace, cumulDistances } from "./progression";

// Trace de référence : une ligne droite plein est, ~10 points espacés d'environ
// 785 m à cette latitude (0,01° de longitude).
const REFERENCE = Array.from({ length: 11 }, (_, i) => [5.7 + i * 0.01, 45.2]);

/** Point à `n` pas le long de la référence, décalé de `deltaLat` degrés. */
const surTrace = (n, deltaLat = 0) => [5.7 + n * 0.01, 45.2 + deltaLat];

describe("cumulDistances", () => {
  it("part de zéro et croît le long de la polyligne", () => {
    const cum = cumulDistances(REFERENCE);
    expect(cum[0]).toBe(0);
    expect(cum[10]).toBeGreaterThan(cum[5]);
    // ~7,8 km au total pour 0,1° de longitude à 45,2° de latitude.
    expect(cum[10]).toBeGreaterThan(7000);
    expect(cum[10]).toBeLessThan(9000);
  });
});

describe("avancementSurTrace", () => {
  it("rend null sans trace de référence exploitable", () => {
    expect(avancementSurTrace(null, [surTrace(1)])).toBeNull();
    expect(avancementSurTrace([[5.7, 45.2]], [surTrace(1)])).toBeNull();
  });

  it("rend null sans position vécue", () => {
    expect(avancementSurTrace(REFERENCE, [])).toBeNull();
  });

  it("à mi-parcours, annonce ~50 %", () => {
    const vecu = [surTrace(0), surTrace(2), surTrace(4), surTrace(5)];
    const a = avancementSurTrace(REFERENCE, vecu);
    expect(a.pourcent).toBeGreaterThan(45);
    expect(a.pourcent).toBeLessThan(55);
  });

  it("LE CAS QUI MOTIVE TOUT : un détour n'avance pas le pourcentage", () => {
    // Le coureur atteint le point 3, part 2 km au nord (ravito), puis revient.
    // Distance PARCOURUE : bien plus que 3 pas. Avancement RÉEL : toujours 3.
    const detour = [
      surTrace(0),
      surTrace(3),
      surTrace(3, 0.02),
      surTrace(3, 0.04),
      surTrace(3, 0.02),
      surTrace(3),
    ];
    const a = avancementSurTrace(REFERENCE, detour);
    const droit = avancementSurTrace(REFERENCE, [surTrace(0), surTrace(3)]);
    expect(a.metresParcourus).toBeCloseTo(droit.metresParcourus, 0);
  });

  it("ne dépasse JAMAIS 100 %, même en multipliant les détours", () => {
    const beaucoupDeDetours = [];
    for (let i = 0; i <= 10; i += 1) {
      beaucoupDeDetours.push(surTrace(i), surTrace(i, 0.01), surTrace(i));
    }
    const a = avancementSurTrace(REFERENCE, beaucoupDeDetours);
    expect(a.pourcent).toBeLessThanOrEqual(100);
  });

  it("aller-retour : le retour ne fait pas reculer l'avancement", () => {
    const allerRetour = [surTrace(0), surTrace(5), surTrace(10), surTrace(5), surTrace(1)];
    const a = avancementSurTrace(REFERENCE, allerRetour);
    // Le maximum atteint (le bout) reste acquis.
    expect(a.pourcent).toBeGreaterThan(95);
  });

  it("position hors tolérance : le curseur ne bouge pas", () => {
    // 0,5° de latitude ≈ 55 km au nord de la trace : sans rapport avec elle.
    const horsTrace = [surTrace(2), surTrace(2, 0.5), surTrace(2, 0.6)];
    const a = avancementSurTrace(REFERENCE, horsTrace);
    const reste = avancementSurTrace(REFERENCE, [surTrace(2)]);
    expect(a.metresParcourus).toBeCloseTo(reste.metresParcourus, 0);
  });

  it("l'échantillonnage garde le dernier point (l'avancement courant)", () => {
    // Plus de points que le plafond : le dernier doit peser malgré le pas.
    const longue = Array.from({ length: 500 }, () => surTrace(0));
    longue.push(surTrace(9));
    const a = avancementSurTrace(REFERENCE, longue, { maxPoints: 10 });
    expect(a.pourcent).toBeGreaterThan(85);
  });

  it("ignore les coordonnées illisibles sans planter", () => {
    const sales = [surTrace(1), [NaN, 45.2], null, undefined, surTrace(4)];
    const a = avancementSurTrace(REFERENCE, sales);
    expect(Number.isFinite(a.pourcent)).toBe(true);
    expect(a.pourcent).toBeGreaterThan(30);
  });
});

describe("sens de parcours", () => {
  // Boucle fermée, comme la trace des Vouillands : départ et arrivée confondus.
  const BOUCLE = [
    ...Array.from({ length: 11 }, (_, i) => [5.7 + i * 0.01, 45.2]),
    ...Array.from({ length: 11 }, (_, i) => [5.8, 45.2 + i * 0.005]),
    ...Array.from({ length: 11 }, (_, i) => [5.8 - i * 0.01, 45.25]),
    ...Array.from({ length: 11 }, (_, i) => [5.7, 45.25 - i * 0.005]),
  ];

  it("boucle parcourue DANS LE SENS du GPX → 100 %", () => {
    expect(avancementSurTrace(BOUCLE, BOUCLE).pourcent).toBeGreaterThan(95);
  });

  it("LE CAS DES VOUILLANDS : boucle parcourue À CONTRESENS → 100 % aussi", () => {
    // Le GPX enregistré dans un sens, la sortie faite dans l'autre : une chance
    // sur deux sur une boucle. La recherche ne va que vers l'avant, donc sans
    // essai des deux orientations le curseur reste bloqué au départ (1,4 %).
    const aContresens = [...BOUCLE].reverse();
    expect(avancementSurTrace(BOUCLE, aContresens).pourcent).toBeGreaterThan(95);
  });

  it("à mi-parcours à contresens, on est bien à ~50 %", () => {
    const moitieInverse = [...BOUCLE].reverse().slice(0, Math.floor(BOUCLE.length / 2));
    const p = avancementSurTrace(BOUCLE, moitieInverse).pourcent;
    expect(p).toBeGreaterThan(40);
    expect(p).toBeLessThan(60);
  });
});

describe("plafond de vitesse (points horodatés)", () => {
  /** Point du profil, `secondes` après le départ. */
  const pt = (n, secondes) => ({
    longitude: 5.7 + n * 0.01,
    latitude: 45.2,
    fixTime: new Date(Date.UTC(2026, 7, 20, 6, 0, 0) + secondes * 1000).toISOString(),
  });

  it("interdit un bond de plusieurs km en quelques secondes", () => {
    // 30 s séparent les deux points : à 20 km/h, 167 m au plus. Le second point
    // est à ~6 km — physiquement hors de portée, le curseur ne suit pas.
    const a = avancementSurTrace(REFERENCE, [pt(0, 0), pt(8, 30)]);
    expect(a.pourcent).toBeLessThan(10);
  });

  it("un trou de données d'une heure laisse le budget de rattrapage", () => {
    // Même saut, mais une heure plus tard : 20 km de budget, largement de quoi
    // couvrir les 6 km. C'est le cas du retour de zone blanche — le plafond ne
    // doit PAS faire décrocher l'avancement.
    const a = avancementSurTrace(REFERENCE, [pt(0, 0), pt(8, 3600)]);
    expect(a.pourcent).toBeGreaterThan(70);
  });

  it("sans horodatage, aucun plafond (rétrocompatible)", () => {
    const a = avancementSurTrace(REFERENCE, [surTrace(0), surTrace(8)]);
    expect(a.pourcent).toBeGreaterThan(70);
  });

  it("une progression normale n'est jamais bridée", () => {
    // ~785 m en 5 min = 9,4 km/h : sous le plafond, rien ne doit être rogné.
    const vecu = [pt(0, 0), pt(1, 300), pt(2, 600), pt(3, 900), pt(4, 1200), pt(5, 1500)];
    const a = avancementSurTrace(REFERENCE, vecu);
    expect(a.pourcent).toBeGreaterThan(45);
    expect(a.pourcent).toBeLessThan(55);
  });
});
