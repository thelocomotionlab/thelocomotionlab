import { describe, expect, it, vi } from "vitest";

import { sonderWebgl } from "./webgl";

function canvasAvec(contextes) {
  return { getContext: vi.fn((type) => contextes[type] ?? null) };
}

function contexte() {
  const loseContext = vi.fn();
  return {
    loseContext,
    getExtension: vi.fn((nom) => (nom === "WEBGL_lose_context" ? { loseContext } : null)),
  };
}

describe("sonderWebgl", () => {
  it("accepte un navigateur qui donne webgl2", () => {
    const gl = contexte();
    const canvas = canvasAvec({ webgl2: gl });
    expect(sonderWebgl(canvas)).toBe(true);
    expect(canvas.getContext).toHaveBeenCalledWith("webgl2");
  });

  it("se rabat sur webgl, comme maplibre", () => {
    const canvas = canvasAvec({ webgl: contexte() });
    expect(sonderWebgl(canvas)).toBe(true);
    expect(canvas.getContext.mock.calls.map(([type]) => type)).toEqual(["webgl2", "webgl"]);
  });

  it("refuse un navigateur sans aucun contexte WebGL", () => {
    expect(sonderWebgl(canvasAvec({}))).toBe(false);
  });

  it("refuse un navigateur dont getContext lève", () => {
    const canvas = {
      getContext: () => {
        throw new Error("contexte refusé");
      },
    };
    expect(sonderWebgl(canvas)).toBe(false);
  });

  it("rend le contexte de la sonde, pour laisser la place à celui de la carte", () => {
    const gl = contexte();
    sonderWebgl(canvasAvec({ webgl2: gl }));
    expect(gl.loseContext).toHaveBeenCalledOnce();
  });

  it("ne dépend pas de l'extension pour conclure", () => {
    const canvas = canvasAvec({ webgl: { getExtension: () => null } });
    expect(sonderWebgl(canvas)).toBe(true);
  });
});
