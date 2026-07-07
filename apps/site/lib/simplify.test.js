// Douglas-Peucker : la trace est simplifiée avant affichage (brief §5).

import { describe, expect, it } from "vitest";

import { simplifyTrack } from "./simplify";

describe("simplifyTrack", () => {
  it("préserve les extrémités et retire les points colinéaires", () => {
    const line = [
      [6.1, 44.9],
      [6.2, 44.9], // colinéaire — doit sauter
      [6.3, 44.9],
    ];
    expect(simplifyTrack(line, 0.00008)).toEqual([
      [6.1, 44.9],
      [6.3, 44.9],
    ]);
  });

  it("garde un vrai virage", () => {
    const line = [
      [6.1, 44.9],
      [6.2, 44.95], // écart net au segment
      [6.3, 44.9],
    ];
    expect(simplifyTrack(line, 0.00008)).toHaveLength(3);
  });

  it("réduit fortement une trace dense sans la dénaturer", () => {
    // Sinusoïde échantillonnée très finement : la forme doit survivre.
    const dense = Array.from({ length: 5000 }, (_, i) => [
      6.1 + i * 0.0001,
      44.9 + 0.05 * Math.sin(i / 200),
    ]);
    const simplified = simplifyTrack(dense);
    expect(simplified.length).toBeLessThan(dense.length / 5);
    expect(simplified.length).toBeGreaterThan(20);
    expect(simplified[0]).toEqual(dense[0]);
    expect(simplified[simplified.length - 1]).toEqual(dense[dense.length - 1]);
  });

  it("cas dégénérés : vide, 1 ou 2 points, segment de longueur nulle", () => {
    expect(simplifyTrack([])).toEqual([]);
    expect(simplifyTrack([[6, 44]])).toEqual([[6, 44]]);
    expect(simplifyTrack([[6, 44], [6, 44]])).toEqual([[6, 44], [6, 44]]);
    expect(simplifyTrack([[6, 44], [6, 44], [6.1, 44.1]]).length).toBeGreaterThanOrEqual(2);
  });
});
