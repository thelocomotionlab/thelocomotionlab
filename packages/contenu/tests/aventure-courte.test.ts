// Une aventure à trois sections doit valider sans rien signaler du tout : la
// page courte est un état normal du système, pas une page amputée.

import { describe, expect, it } from "vitest";

import { sommaire, validerContenu } from "../src/index.ts";
import { aventureATroisSections, sansBibliographie } from "./aide.ts";

describe("une aventure à trois sections", () => {
  it("valide sans erreur ni avertissement", () => {
    const resultat = validerContenu({
      documents: [aventureATroisSections()],
      ...sansBibliographie,
    });

    expect(resultat.erreurs).toEqual([]);
    // Le résultat n'a pas d'autre canal de sortie : rien ne peut être signalé
    // à mi-voix ailleurs.
    expect(Object.keys(resultat).sort()).toEqual(["blocs", "documents", "erreurs"]);
    expect(resultat.documents).toHaveLength(1);
  });

  it("produit un sommaire complet, numéroté depuis 01", () => {
    const { documents } = validerContenu({
      documents: [aventureATroisSections()],
      ...sansBibliographie,
    });
    const aventure = documents[0]!.document;
    if (aventure.sorte !== "aventure") throw new Error("aventure attendue");

    expect(sommaire(aventure.sections).map((entree) => entree.numero)).toEqual([
      "01",
      "02",
      "03",
    ]);
  });

  it("n'exige aucune section : une aventure peut n'en déclarer aucune", () => {
    const resultat = validerContenu({
      documents: [aventureATroisSections([])],
      ...sansBibliographie,
    });

    expect(resultat.erreurs).toEqual([]);
  });
});
