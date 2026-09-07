// packages/contenu/src/extraction.test.ts

import { describe, it, expect } from "vitest";
import { extraireBlocs, decouperLeCorps } from "./extraction.ts";

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

  it("relève une carte écrite dans le corps d'un bloc", () => {
    const { blocs, cartes } = extraireBlocs(
      `<Protocole id="p1" titre="T" objectif="O" statut="en-test" n="1">\nVoir <VersProtocole id="rest-step" />.\n</Protocole>`,
    );
    expect(blocs).toHaveLength(1);
    expect(cartes.map((c) => c.id)).toEqual(["rest-step"]);
  });

  it("ignore une balise laissée en commentaire HTML", () => {
    const { blocs, cartes, erreurs } = extraireBlocs(
      `Un paragraphe.\n\n<!--\n<Protocole id="ancien" titre="T" objectif="O" statut="en-test" n="1">\ncorps\n</Protocole>\n-->\n\nLa suite.`,
    );
    expect(blocs).toEqual([]);
    expect(cartes).toEqual([]);
    expect(erreurs).toEqual([]);
  });

  it("garde une valeur d'attribut contenant du code ou un tiret de commentaire", () => {
    const { blocs } = extraireBlocs(
      "<Note id=\"n\" titre=\"T\" objectif=\"Ce que fait `AMPK` au repos\">corps</Note>",
    );
    expect(blocs[0]!.attributs.objectif).toBe("Ce que fait `AMPK` au repos");
  });

  it("ne referme pas un bloc de code sur une clôture porteuse de langage", () => {
    const { blocs, cartes } = extraireBlocs(
      "```md\nExemple :\n```mdx\n<Note id=\"exemple\" titre=\"T\" objectif=\"O\">corps</Note>\n```\n\nTexte après.\n",
    );
    expect(blocs).toEqual([]);
    expect(cartes).toEqual([]);
  });

  it("ignore un exemple écrit en bloc indenté", () => {
    const { blocs, erreurs } = extraireBlocs(
      'On écrit une note ainsi :\n\n    <Note id="exemple" titre="Exemple" objectif="Montrer">\n    Le corps.\n    </Note>\n\nEt voilà.',
    );
    expect(blocs).toEqual([]);
    expect(erreurs).toEqual([]);
  });

  it("ne prend pas un composant au nom voisin pour un bloc imbriqué", () => {
    const { blocs, erreurs } = extraireBlocs(
      `<Note id="a" titre="T" objectif="O">\nVoir <NoteBis /> ici.\n</Note>`,
    );
    expect(erreurs).toEqual([]);
    expect(blocs.map((b) => b.attributs.id)).toEqual(["a"]);
  });

  it("refuse un bloc d'un autre type imbriqué dans un bloc", () => {
    const { erreurs } = extraireBlocs(
      `<Protocole id="p" statut="en-test" n="1" titre="T" objectif="O">\n<Note id="n" titre="T" objectif="O">x</Note>\n</Protocole>`,
    );
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0]).toContain("contient un <Note>");
  });

  it("lit une balise auto-fermante comme un bloc au corps vide, sans annexer le suivant", () => {
    const { blocs, erreurs } = extraireBlocs(
      `<Note id="a" titre="A" objectif="O" />\n\n<Note id="b" titre="B" objectif="O">corps</Note>`,
    );
    expect(erreurs).toEqual([]);
    expect(blocs.map((b) => b.attributs.id)).toEqual(["a", "b"]);
    expect(blocs[0]!.corps).toBe("");
  });

  it("masque un commentaire jamais refermé, et pas un exemple de commentaire en ligne", () => {
    const ouvert = extraireBlocs(`<!--
<Note id="n" titre="T" objectif="O">corps</Note>

Suite.`);
    expect(ouvert.blocs).toEqual([]);

    const cite = extraireBlocs(
      "On écrit `<!--` pour commenter.\n\n<Note id=\"n\" titre=\"T\" objectif=\"O\">corps</Note>\n",
    );
    expect(cite.blocs.map((b) => b.attributs.id)).toEqual(["n"]);
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
    expect(erreurs[0]).toContain("contient un <Note>");
  });
});

describe("decouperLeCorps", () => {
  it("rend le texte et les balises demandées, dans l'ordre", () => {
    const segments = decouperLeCorps(
      'Avant.\n\n<SectionLibre id="a">Le corps.</SectionLibre>\n\nAprès.',
      ["SectionLibre"],
    );
    expect(segments.map((s) => s.type)).toEqual(["texte", "balise", "texte"]);
    expect(segments[1]).toMatchObject({ nom: "SectionLibre", attributs: { id: "a" }, corps: "Le corps." });
    expect((segments[0] as { texte: string }).texte.trim()).toBe("Avant.");
    expect((segments[2] as { texte: string }).texte.trim()).toBe("Après.");
  });

  it("laisse en texte une balise qu'on ne lui a pas demandée", () => {
    const segments = decouperLeCorps('<Citation id="x">y</Citation>', ["SectionLibre"]);
    expect(segments).toEqual([{ type: "texte", texte: '<Citation id="x">y</Citation>' }]);
  });

  it("ne découpe pas sur un exemple écrit en bloc de code", () => {
    const segments = decouperLeCorps(
      '```mdx\n<Note id="exemple" titre="T" objectif="O">corps</Note>\n```',
      ["Note"],
    );
    expect(segments.map((s) => s.type)).toEqual(["texte"]);
  });
});
