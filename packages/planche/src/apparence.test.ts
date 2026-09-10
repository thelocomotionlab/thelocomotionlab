import { describe, expect, it } from "vitest";

import { apparenceDe, avecApparence } from "./apparence.ts";
import { formeNeuve, iconeNeuve, texteNeuf } from "./fabrique.ts";

describe("apparenceDe", () => {
  it("prend l'apparence et laisse le contenu", () => {
    const t = texteNeuf({ x: 0, y: 0, l: 0.5, h: 0.1 }, "Un titre", "titre");
    const s = apparenceDe(t);
    expect(s.valeurs.corps).toBe(t.corps);
    expect(s.valeurs.graisse).toBe(t.graisse);
    expect(s.valeurs).not.toHaveProperty("contenu");
    expect(s.valeurs).not.toHaveProperty("x");
    expect(s.valeurs).not.toHaveProperty("id");
  });

  it("emporte l'opacité, qui est de l'apparence pour tous", () => {
    const f = formeNeuve({ x: 0, y: 0, l: 0.2, h: 0.2 }, { forme: "cercle" });
    expect(apparenceDe({ ...f, opacite: 0.4 }).valeurs.opacite).toBe(0.4);
  });
});

describe("avecApparence", () => {
  it("repose l'apparence sans toucher au texte ni à la place", () => {
    const modele = {
      ...texteNeuf({ x: 0, y: 0, l: 0.5, h: 0.1 }, "Modèle", "titre"),
      corps: 90,
      couleur: "#ff0000",
    };
    const cible = texteNeuf({ x: 0.3, y: 0.4, l: 0.2, h: 0.1 }, "Ma phrase", "corps");
    const habille = avecApparence(cible, apparenceDe(modele));
    expect(habille.type === "texte" && habille.corps).toBe(90);
    expect(habille.type === "texte" && habille.couleur).toBe("#ff0000");
    expect(habille.type === "texte" && habille.contenu).toBe("Ma phrase");
    expect(habille.x).toBe(0.3);
    expect(habille.id).toBe(cible.id);
  });

  it("ne traverse pas les types", () => {
    const t = texteNeuf({ x: 0, y: 0, l: 0.5, h: 0.1 }, "a", "titre");
    const i = iconeNeuve({ x: 0, y: 0, l: 0.1, h: 0.1 }, "sac");
    expect(avecApparence(i, apparenceDe(t))).toBe(i);
  });
});
