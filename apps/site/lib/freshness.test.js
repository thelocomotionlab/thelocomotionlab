// Les trois régimes de l'indicateur de fraîcheur (brief §5 + texte validé PR1 §13).

import { describe, expect, it } from "vitest";

import { freshnessState } from "./freshness";

const NOW = Date.parse("2026-08-21T13:00:00Z");
const base = { running: true, nowMs: NOW, zoneBlancheMinutes: 60 };

describe("freshnessState", () => {
  it("premier signal : timer démarré, aucune position — texte validé", () => {
    const state = freshnessState({ ...base, lastFixTime: null });
    expect(state.regime).toBe("premier-signal");
    expect(state.strong + state.rest).toBe(
      "En attente du premier signal — le départ est imminent.",
    );
  });

  it("rien à afficher hors direct sans position", () => {
    expect(freshnessState({ ...base, running: false, lastFixTime: null })).toBeNull();
  });

  it("régime normal sous le seuil : « Dernière position il y a 3 min »", () => {
    const state = freshnessState({ ...base, lastFixTime: "2026-08-21T12:57:10Z" });
    expect(state.regime).toBe("normal");
    expect(state.rest).toBe("Dernière position il y a 2 min");
  });

  it("bascule zone blanche AU seuil (60 min), heures entières au-delà", () => {
    const at59 = freshnessState({ ...base, lastFixTime: "2026-08-21T12:01:00Z" });
    expect(at59.regime).toBe("normal");

    const at60 = freshnessState({ ...base, lastFixTime: "2026-08-21T12:00:00Z" });
    expect(at60.regime).toBe("zone-blanche");
    expect(at60.strong).toBe("Zone blanche probable");
    expect(at60.rest).toBe(" — dernière position il y a 1 h");

    const at4h = freshnessState({ ...base, lastFixTime: "2026-08-21T08:55:00Z" });
    expect(at4h.rest).toBe(" — dernière position il y a 4 h");
  });

  it("le seuil vient de la config (pas de 60 en dur)", () => {
    const state = freshnessState({
      ...base,
      zoneBlancheMinutes: 30,
      lastFixTime: "2026-08-21T12:25:00Z",
    });
    expect(state.regime).toBe("zone-blanche");
  });
});
