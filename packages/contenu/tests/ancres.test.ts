// Insérer une section en tête ne doit changer aucune ancre : les numéros
// viennent de la position, les ancres viennent des slugs, et les deux ne se
// parlent pas.

import { describe, expect, it } from "vitest";

import { ancreDeSection, sommaire, type Section } from "../src/index.ts";
import { aventureATroisSections, sansBibliographie } from "./aide.ts";
import { validerContenu } from "../src/index.ts";

function sectionsValidees(sections?: readonly unknown[]): Section[] {
  const { erreurs, documents } = validerContenu({
    documents: [aventureATroisSections(sections)],
    ...sansBibliographie,
  });
  expect(erreurs).toEqual([]);
  const document = documents[0]!.document;
  if (document.sorte !== "aventure") throw new Error("aventure attendue");
  return document.sections;
}

const SECTION_INSEREE = {
  type: "preparation",
  seances: { colonnes: ["Date", "Sortie", "Billet"], lignes: [] },
};

describe("insérer une section en tête d'une aventure", () => {
  it("ne change aucune ancre", () => {
    const avant = sectionsValidees();
    const apres = sectionsValidees([
      SECTION_INSEREE,
      ...JSON.parse(JSON.stringify(avantBrut())),
    ]);

    const ancresAvant = avant.map(ancreDeSection);
    const ancresApres = apres.map(ancreDeSection);

    expect(ancresAvant).toEqual(["caracteristiques", "geo", "genese"]);
    // Les mêmes ancres, dans le même ordre, décalées d'une seule entrée neuve.
    expect(ancresApres).toEqual(["preparation", ...ancresAvant]);
  });

  it("renumérote tout, sans qu'aucun numéro n'entre dans une ancre", () => {
    const apres = sommaire(
      sectionsValidees([SECTION_INSEREE, ...JSON.parse(JSON.stringify(avantBrut()))]),
    );

    expect(apres.map((entree) => entree.numero)).toEqual(["01", "02", "03", "04"]);
    // `caracteristiques` a glissé de 01 à 02 et garde exactement son ancre.
    expect(apres[1]).toMatchObject({ numero: "02", ancre: "caracteristiques" });
    for (const entree of apres) expect(entree.ancre).not.toMatch(/^\d/);
  });
});

/** Les sections de départ, sous leur forme brute de frontmatter. */
function avantBrut(): unknown[] {
  const donnees = aventureATroisSections().donnees as { sections: unknown[] };
  return donnees.sections;
}
