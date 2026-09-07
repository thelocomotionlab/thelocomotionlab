// packages/contenu/src/schemas.test.ts

import { describe, it, expect } from "vitest";
import { Aventure, Billet, Article, Recit, SCHEMAS_DE_SORTE } from "./sortes.ts";
import { SCHEMAS_DE_SECTION, TYPES_DE_SECTION } from "./sections.ts";
import { PropsProtocole, PropsNote } from "./blocs.ts";
import { AVENTURE_TROIS_SECTIONS, BILLET } from "./fixtures.ts";

describe("statut", () => {
  it("vaut brouillon quand rien n'est déclaré, pour les quatre sortes", () => {
    const sansStatut = {
      aventure: { ...AVENTURE_TROIS_SECTIONS, statut: undefined },
      recit: {
        sorte: "recit",
        titre: "« L'île intense vous dites ? »",
        slug: "ile-intense",
        chapeau: "Récit et bilan.",
        date: "2025-12-09",
        aventure: "reunion-2025",
        cover: "c.webp",
      },
      billet: { ...BILLET, statut: undefined },
      article: {
        sorte: "article",
        titre: "« Use it or lose it », vous êtes sûr ?",
        slug: "use-it-or-lose-it",
        chapeau: "Ce que le muscle garde quand on arrête.",
        publie_le: "2026-02-26",
        themes: ["memoire-musculaire"],
      },
    };

    for (const [sorte, donnees] of Object.entries(sansStatut)) {
      const resultat = SCHEMAS_DE_SORTE[sorte as keyof typeof SCHEMAS_DE_SORTE].safeParse(donnees);
      expect(resultat.success, `${sorte} : ${JSON.stringify(resultat.error?.issues)}`).toBe(true);
      expect(resultat.data!.statut).toBe("brouillon");
    }
  });

  it("n'accepte pas une autre valeur que brouillon ou publie", () => {
    expect(Billet.safeParse({ ...BILLET, statut: "en-ligne" }).success).toBe(false);
  });
});

describe("frontmatter", () => {
  it("ramène une date YAML à la chaîne AAAA-MM-JJ", () => {
    const analyse = Billet.parse({ ...BILLET, date: new Date("2026-05-17T00:00:00Z") });
    expect(analyse.date).toBe("2026-05-17");
  });

  it("exige l'aventure d'un récit et la rend facultative sur un billet", () => {
    expect(Recit.safeParse({ ...BILLET, sorte: "recit", cover: "c.webp", aventure: undefined }).success).toBe(false);
    expect(Billet.parse(BILLET).aventure).toBeUndefined();
  });

  it("laisse une campagne sans fin : une campagne en préparation n'en a pas", () => {
    const enPreparation = {
      ...AVENTURE_TROIS_SECTIONS,
      etat: "en-preparation",
      campagne: { debut: "2026-09-25" },
    };
    expect(Aventure.parse(enPreparation).campagne.fin).toBeUndefined();
  });

  it("donne à refs et revisions d'un article des tableaux vides par défaut", () => {
    const article = Article.parse({
      sorte: "article",
      titre: "T",
      slug: "t",
      chapeau: "C",
      publie_le: "2026-02-26",
      themes: ["memoire-musculaire"],
    });
    expect(article.refs).toEqual([]);
    expect(article.revisions).toEqual([]);
  });
});

describe("sections", () => {
  it("couvre les huit types de docs/systeme-de-contenu.md §5", () => {
    expect(TYPES_DE_SECTION).toEqual([
      "caracteristiques",
      "geo",
      "preparation",
      "paquetage",
      "nutrition",
      "libre",
      "direct",
      "recit",
    ]);
    expect(Object.keys(SCHEMAS_DE_SECTION).sort()).toEqual([...TYPES_DE_SECTION].sort());
  });

  it("accepte une préparation qui n'a que des stresseurs", () => {
    const section = SCHEMAS_DE_SECTION.preparation.parse({
      type: "preparation",
      stresseurs: {
        travailles: [
          {
            nom: "Chaleur",
            dose: "7 jours",
            frequence: "quotidien",
            intensite: "effort léger",
            pourquoi: "Baisser la FC à effort égal.",
          },
        ],
        non_travailles: ["Froid"],
      },
    });
    expect(section.graphe).toBeUndefined();
    expect(section.seances).toBeUndefined();
    expect(section.stresseurs!.non_travailles).toEqual(["Froid"]);
  });

  it("refuse un stresseur amputé d'un de ses cinq champs", () => {
    const resultat = SCHEMAS_DE_SECTION.preparation.safeParse({
      type: "preparation",
      stresseurs: { travailles: [{ nom: "Chaleur", dose: "7 jours" }] },
    });
    expect(resultat.success).toBe(false);
  });

  it("refuse une ligne de tableau qui n'a pas le compte de ses colonnes", () => {
    const resultat = SCHEMAS_DE_SECTION.nutrition.safeParse({
      type: "nutrition",
      colonnes: ["Poste", "Masse"],
      lignes: [["Gels"]],
    });
    expect(resultat.success).toBe(false);
    expect(resultat.error!.issues[0]!.message).toContain("1 cellules pour 2 colonnes");
  });

  it("refuse une série de graphe qui n'a pas le compte de ses abscisses", () => {
    const resultat = SCHEMAS_DE_SECTION.preparation.safeParse({
      type: "preparation",
      graphe: {
        abscisse: ["S1", "S2"],
        series: [{ nom: "Distance", unite: "km", valeurs: [64] }],
      },
    });
    expect(resultat.success).toBe(false);
    expect(resultat.error!.issues[0]!.message).toContain("1 valeurs pour 2 points");
  });

  it("exige un id et un titre sur une section libre, et rien d'autre sur direct et recit", () => {
    expect(SCHEMAS_DE_SECTION.libre.safeParse({ type: "libre", titre: "Sans id" }).success).toBe(false);
    expect(SCHEMAS_DE_SECTION.direct.parse({ type: "direct" }).type).toBe("direct");
    expect(SCHEMAS_DE_SECTION.recit.parse({ type: "recit" }).type).toBe("recit");
  });
});

describe("props de bloc", () => {
  it("lit une liste écrite en chaîne séparée par des virgules", () => {
    const props = PropsProtocole.parse({
      id: "train-low-eat-low",
      titre: "Train-low, Eat-low",
      objectif: "Maximiser l'activation de l'AMPK et de PGC-1α",
      statut: "en-test",
      n: "4",
      concepts: "flexibilite-metabolique, jeune-intermittent",
      refs: "marquet2016",
    });
    expect(props.concepts).toEqual(["flexibilite-metabolique", "jeune-intermittent"]);
    expect(props.refs).toEqual(["marquet2016"]);
    expect(props.n).toBe(4);
  });

  it("refuse un statut de protocole hors des quatre valeurs", () => {
    expect(
      PropsProtocole.safeParse({ id: "x", titre: "X", objectif: "O", statut: "brouillon", n: "1" }).success,
    ).toBe(false);
  });

  it("ne demande ni statut ni numéro à une note", () => {
    const note = PropsNote.parse({ id: "chasse-d-eau", titre: "La chasse d'eau", objectif: "Modéliser la fatigue." });
    expect(note.concepts).toEqual([]);
    expect("statut" in note).toBe(false);
  });
});
