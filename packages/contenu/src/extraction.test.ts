// packages/contenu/src/extraction.test.ts

import { describe, it, expect } from "vitest";
import { extraireBlocs } from "./extraction.ts";

const PROTOCOLE = `Un paragraphe d'introduction.

<Protocole id="train-low-eat-low" statut="en-test" n="4"
  titre="Train-low, Eat-low"
  objectif="Maximiser l'activation de l'AMPK et de PGC-1α"
  concepts="flexibilite-metabolique,jeune-intermittent"
  refs="marquet2016">

Footing à jeûn de 50 min, déjeuner cétogène, second footing d'1 h.

Sensations : début de deuxième footing difficile.
</Protocole>

La suite du billet.
`;

describe("extraireBlocs", () => {
  it("relève un protocole, ses props et son corps", () => {
    const { blocs, cartes, erreurs } = extraireBlocs(PROTOCOLE);
    expect(erreurs).toEqual([]);
    expect(cartes).toEqual([]);
    expect(blocs).toHaveLength(1);
    expect(blocs[0]!.type).toBe("protocole");
    expect(blocs[0]!.attributs.n).toBe("4");
    expect(blocs[0]!.attributs.concepts).toBe("flexibilite-metabolique,jeune-intermittent");
    expect(blocs[0]!.corps).toContain("Sensations : début de deuxième footing difficile.");
    expect(blocs[0]!.corps).not.toContain("<Protocole");
  });

  it("relève les cartes et laisse les autres composants tranquilles", () => {
    const { blocs, cartes } = extraireBlocs(
      `Voir <VersProtocole id="train-low-eat-low" /> et <Citation id="millet2012">l'étude</Citation>.`,
    );
    expect(blocs).toEqual([]);
    expect(cartes.map((c) => c.id)).toEqual(["train-low-eat-low"]);
  });

  it("ignore ce qui est écrit dans un bloc de code ou en ligne", () => {
    const { blocs, cartes, erreurs } = extraireBlocs(
      "Exemple :\n\n```mdx\n<Protocole id=\"exemple\" titre=\"T\" objectif=\"O\" statut=\"en-test\" n=\"1\">\ncorps\n</Protocole>\n```\n\nEt en ligne : `<VersProtocole id=\"exemple\" />`.\n",
    );
    expect(blocs).toEqual([]);
    expect(cartes).toEqual([]);
    expect(erreurs).toEqual([]);
  });

  it("ignore une balise laissée en commentaire HTML", () => {
    const { blocs, cartes, erreurs } = extraireBlocs(
      `Un paragraphe.\n\n<!--\n<Protocole id="ancien" titre="T" objectif="O" statut="en-test" n="1">\ncorps\n</Protocole>\n-->\n\nLa suite.`,
    );
    expect(blocs).toEqual([]);
    expect(cartes).toEqual([]);
    expect(erreurs).toEqual([]);
  });

  it("refuse une propriété de liste écrite en accolades", () => {
    const { erreurs } = extraireBlocs(
      `<Note id="n" titre="T" objectif="O" concepts={["a","b"]}>corps</Note>`,
    );
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0]).toContain("accolades");
  });

  it("refuse un bloc jamais refermé", () => {
    const { erreurs } = extraireBlocs(`<Note id="n" titre="T" objectif="O">\ncorps sans fermeture\n`);
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0]).toContain("n'est jamais refermée");
  });

  it("refuse deux blocs imbriqués", () => {
    const { erreurs } = extraireBlocs(
      `<Note id="a" titre="A" objectif="O">\n<Note id="b" titre="B" objectif="O">x</Note>\n</Note>`,
    );
    expect(erreurs[0]).toContain("ne s'imbriquent pas");
  });
});
