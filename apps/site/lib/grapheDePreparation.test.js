import { brandColors } from "@locomotionlab/ui";
import { describe, expect, it } from "vitest";

import { phasesParPoint, specDuGraphe } from "./grapheDePreparation";

const GRAPHE = {
  abscisse: ["S1", "S2", "S3"],
  series: [
    { nom: "Distance", unite: "km", valeurs: [10, 20, 30] },
    { nom: "Dénivelé positif", unite: "m", valeurs: [100, 200, 300] },
  ],
};

const PHASES = [
  { nom: "Week-end choc", couleur: "trace", points: ["S2"] },
  { nom: "Affûtage", couleur: "accentInk", points: ["S3"] },
];

describe("specDuGraphe sans phases", () => {
  it("garde la figure d'avant : barres unies, pas de légende", () => {
    const spec = specDuGraphe(GRAPHE);
    expect(spec.data).toHaveLength(2);
    expect(spec.data[0].marker.color).toBe(brandColors.primary);
    expect(spec.layout.showlegend).toBe(false);
    expect(spec.layout.legend).toBeUndefined();
    expect(spec.layout.yaxis.title).toEqual({ text: "Distance (km)" });
  });
});

describe("specDuGraphe avec phases", () => {
  const spec = specDuGraphe({ ...GRAPHE, phases: PHASES });

  it("colore chaque barre de sa phase, les autres restent bleu-vert", () => {
    expect(spec.data[0].marker.color).toEqual([brandColors.primary, brandColors.trace, brandColors.accentInk]);
  });

  it("nomme chaque phase dans la légende, et seulement elles", () => {
    const enLegende = spec.data.filter((trace) => trace.showlegend);
    expect(enLegende.map((trace) => trace.name)).toEqual(["Week-end choc", "Affûtage"]);
    expect(spec.layout.showlegend).toBe(true);
  });

  it("ajoute la phase au survol d'une barre", () => {
    expect(spec.data[0].customdata).toEqual(["", " · Week-end choc", " · Affûtage"]);
  });
});

describe("phasesParPoint", () => {
  it("rend null pour un point hors phase", () => {
    expect(phasesParPoint(["S1", "S2"], PHASES).map((p) => p?.nom ?? null)).toEqual([null, "Week-end choc"]);
  });
});
