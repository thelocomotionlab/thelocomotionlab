// packages/contenu/src/ancres.test.ts

import { describe, it, expect } from "vitest";
import { Aventure } from "./sortes.ts";
import { ancresDeSections, numeroterSections, slug, urlDeBloc } from "./ancres.ts";
import { AVENTURE_TROIS_SECTIONS as TROIS_SECTIONS } from "./fixtures.ts";

describe("slug", () => {
  it("retire les accents et la ponctuation", () => {
    expect(slug("« L'île intense vous dites ? »")).toBe("l-ile-intense-vous-dites");
    expect(slug("Préparation")).toBe("preparation");
  });
});

describe("ancres", () => {
  it("dérive l'ancre du type quand la section n'a pas d'id", () => {
    expect(ancresDeSections(Aventure.parse(TROIS_SECTIONS).sections)).toEqual([
      "caracteristiques",
      "genese-et-preparatifs",
      "paquetage",
    ]);
  });

  it("ne dérive pas l'ancre du titre : renommer une section ne casse aucun lien", () => {
    const renommee = structuredClone(TROIS_SECTIONS);
    renommee.sections[2]!.titre = "Ce que j'ai mis dans le sac";
    expect(ancresDeSections(Aventure.parse(renommee).sections)).toEqual(
      ancresDeSections(Aventure.parse(TROIS_SECTIONS).sections),
    );
  });

  // Cas de test du système : insérer une section en tête d'une aventure
  // renumérote l'affichage et ne déplace aucune ancre.
  it("insérer une section en tête ne change aucune ancre, seulement les numéros", () => {
    const avant = numeroterSections(Aventure.parse(TROIS_SECTIONS).sections);

    const allongee = structuredClone(TROIS_SECTIONS);
    allongee.sections.unshift({
      type: "geo",
      titre: "Trace",
      colonnes: ["Repère", "km"],
      lignes: [["Vénosc", "0"]],
    } as never);
    const apres = numeroterSections(Aventure.parse(allongee).sections);

    // Les ancres sont figées en littéraux : un calcul cassé qui rendrait
    // partout la même chaîne passerait une comparaison de deux calculs.
    expect(avant.map((s) => s.ancre)).toEqual([
      "caracteristiques",
      "genese-et-preparatifs",
      "paquetage",
    ]);
    expect(apres.map((s) => s.ancre)).toEqual([
      "geo",
      "caracteristiques",
      "genese-et-preparatifs",
      "paquetage",
    ]);
    for (const section of avant) {
      const meme = apres.find((s) => s.ancre === section.ancre);
      expect(meme).toBeDefined();
      expect(meme!.numero).not.toBe(section.numero);
    }
    expect(avant.map((s) => s.numero)).toEqual(["01", "02", "03"]);
    expect(apres.map((s) => s.numero)).toEqual(["01", "02", "03", "04"]);
  });
});

describe("urlDeBloc", () => {
  it("adresse un bloc par l'ancre de la page qui le porte", () => {
    expect(
      urlDeBloc("protocole", { id: "train-low-eat-low" }, { sorte: "billet", slug: "nouveau-bloc" }),
    ).toBe("/blog/nouveau-bloc#protocole-train-low-eat-low");
    expect(urlDeBloc("note", { id: "chasse-d-eau" }, { sorte: "article", slug: "use-it-or-lose-it" })).toBe(
      "/science/use-it-or-lose-it#note-chasse-d-eau",
    );
    expect(
      urlDeBloc("note", { id: "sandales" }, { sorte: "recit", slug: "ile-intense", aventure: "reunion-2025" }),
    ).toBe("/aventures/reunion-2025/recit#note-sandales");
  });
});
