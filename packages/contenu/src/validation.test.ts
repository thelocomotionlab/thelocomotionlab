// packages/contenu/src/validation.test.ts
//
// Les dix règles du tableau §9, chacune avec son message exact.

import { describe, it, expect } from "vitest";
import { analyserFrontmatter, construireIndexDesBlocs, validerCorpus } from "./validation.ts";
import { creerResolveur, BlocIntrouvable } from "./resolveur.ts";
import { AVENTURE_TROIS_SECTIONS, BILLET, CATALOGUE_VIDE, page } from "./fixtures.ts";

const CATALOGUE = {
  bibliographie: new Set(["marquet2016", "millet2012"]),
  paquetages: new Set(["tour-des-ecrins"]),
};

function valider(pages: ReturnType<typeof page>[], catalogue = CATALOGUE) {
  const { index, erreurs } = construireIndexDesBlocs(pages);
  return { index, erreurs: [...erreurs, ...validerCorpus(pages, index, catalogue)] };
}

const protocole = (id: string, refs = "marquet2016") =>
  `<Protocole id="${id}" statut="en-test" titre="Train-low, Eat-low" objectif="Maximiser l'activation de l'AMPK" refs="${refs}">\ncorps\n</Protocole>`;

describe("§9 — les règles qui font échouer le build", () => {
  it("id de bloc en double", () => {
    const { erreurs } = valider([
      page("content/blog/a.mdx", { ...BILLET, slug: "a" }, protocole("train-low-eat-low")),
      page("content/blog/b.mdx", { ...BILLET, slug: "b" }, protocole("train-low-eat-low")),
    ]);
    expect(erreurs).toContain(
      'id de bloc en double : "train-low-eat-low" dans content/blog/a.mdx et content/blog/b.mdx',
    );
  });

  // Cas de test du système : une carte qui pointe vers un id inexistant fait
  // échouer le build.
  it("une carte pointant vers un id inexistant fait échouer le build", () => {
    const { erreurs } = valider([
      page("content/blog/a.mdx", { ...BILLET, slug: "a" }, protocole("train-low-eat-low")),
      page("content/science/b.mdx", {
        sorte: "article",
        titre: "T",
        slug: "b",
        chapeau: "C",
        publie_le: "2026-02-26",
        themes: ["memoire-musculaire"],
      }, `Voir <VersProtocole id="rest-step" />.`),
    ]);
    expect(erreurs).toEqual([
      '<VersProtocole id="rest-step"> dans content/science/b.mdx : aucun bloc ne porte cet id',
    ]);
  });

  it("une carte pointant vers un id inexistant, écrite dans le corps d'un bloc", () => {
    const { erreurs } = valider([
      page(
        "content/blog/a.mdx",
        { ...BILLET, slug: "a" },
        `<Protocole id="p" statut="en-test" titre="T" objectif="O">\n<VersProtocole id="fantome" />\n</Protocole>`,
      ),
    ]);
    expect(erreurs).toContain(
      '<VersProtocole id="fantome"> dans content/blog/a.mdx : aucun bloc ne porte cet id',
    );
  });

  it("un id de preparation.protocoles absent de l'index est une carte morte", () => {
    const aventure = {
      ...AVENTURE_TROIS_SECTIONS,
      sections: [{ type: "preparation", protocoles: ["rest-step"] }],
    };
    const { erreurs } = valider([page("content/aventures/a.mdx", aventure)]);
    expect(erreurs).toEqual([
      '<VersProtocole id="rest-step"> dans content/aventures/a.mdx : aucun bloc ne porte cet id',
    ]);
  });

  it("un id de preparation.protocoles présent dans l'index passe", () => {
    const aventure = {
      ...AVENTURE_TROIS_SECTIONS,
      sections: [{ type: "preparation", protocoles: ["train-low-eat-low"] }],
    };
    const { erreurs } = valider([
      page("content/blog/a.mdx", { ...BILLET, slug: "a" }, protocole("train-low-eat-low")),
      page("content/aventures/a.mdx", aventure),
    ]);
    expect(erreurs).toEqual([]);
  });

  it("référence inconnue", () => {
    const { erreurs } = valider([
      page("content/blog/a.mdx", { ...BILLET, slug: "a" }, protocole("p", "sanchez2025")),
    ]);
    expect(erreurs).toContain('référence inconnue : "sanchez2025" dans content/blog/a.mdx');
  });

  it("référence inconnue déclarée par le frontmatter d'un article", () => {
    const { erreurs } = valider([
      page("content/science/a.mdx", {
        sorte: "article",
        titre: "T",
        slug: "a",
        chapeau: "C",
        publie_le: "2026-02-26",
        themes: ["memoire-musculaire"],
        refs: ["inconnue2026"],
      }),
    ]);
    expect(erreurs).toEqual(['référence inconnue : "inconnue2026" dans content/science/a.mdx']);
  });

  it("type de section inconnu", () => {
    const analyse = analyserFrontmatter("content/aventures/a.mdx", {
      ...AVENTURE_TROIS_SECTIONS,
      sections: [{ type: "meteo" }],
    });
    expect(analyse.ok).toBe(false);
    expect(analyse.ok === false && analyse.erreurs).toEqual([
      'type de section inconnu : "meteo" dans content/aventures/a.mdx',
    ]);
  });

  it("ancre en double", () => {
    const { erreurs } = valider([
      page("content/aventures/a.mdx", {
        ...AVENTURE_TROIS_SECTIONS,
        sections: [
          { type: "nutrition", colonnes: ["Poste"], lignes: [["Gels"]] },
          { type: "nutrition", titre: "Sur le parcours", colonnes: ["Poste"], lignes: [["Eau"]] },
        ],
      }),
    ]);
    expect(erreurs).toContain('ancre en double : "nutrition" dans content/aventures/a.mdx');
  });

  it("un id distingue deux sections du même type", () => {
    const { erreurs } = valider([
      page("content/aventures/a.mdx", {
        ...AVENTURE_TROIS_SECTIONS,
        sections: [
          { type: "nutrition", colonnes: ["Poste"], lignes: [["Gels"]] },
          { type: "nutrition", id: "sur-le-parcours", colonnes: ["Poste"], lignes: [["Eau"]] },
        ],
      }),
    ]);
    expect(erreurs).toEqual([]);
  });

  it("récit introuvable", () => {
    const { erreurs } = valider([
      page("content/aventures/a.mdx", { ...AVENTURE_TROIS_SECTIONS, recit: "ile-intense" }),
    ]);
    expect(erreurs).toContain('récit introuvable : "ile-intense" déclaré par content/aventures/a.mdx');
  });

  it("aventure introuvable, déclarée par un billet", () => {
    const { erreurs } = valider([page("content/blog/a.mdx", { ...BILLET, aventure: "nice-2026" })]);
    expect(erreurs).toContain('aventure introuvable : "nice-2026" déclarée par content/blog/a.mdx');
  });

  it("aventure introuvable, déclarée par un récit", () => {
    const { erreurs } = valider([
      page("content/recits/a.mdx", {
        sorte: "recit",
        titre: "T",
        slug: "a",
        chapeau: "C",
        date: "2025-12-09",
        aventure: "nice-2026",
        cover: "c.webp",
      }),
    ]);
    expect(erreurs).toContain('aventure introuvable : "nice-2026" déclarée par content/recits/a.mdx');
  });

  it("paquetage introuvable", () => {
    const { erreurs } = valider(
      [page("content/aventures/a.mdx", AVENTURE_TROIS_SECTIONS)],
      { ...CATALOGUE, paquetages: new Set<string>() },
    );
    expect(erreurs).toContain('paquetage introuvable : "tour-des-ecrins" dans content/aventures/a.mdx');
  });

  it("billet introuvable en dernière colonne des séances", () => {
    const aventure = {
      ...AVENTURE_TROIS_SECTIONS,
      sections: [
        {
          type: "preparation",
          seances: {
            colonnes: ["Date", "Sortie", "Billet"],
            lignes: [
              ["12/10/2025", "Tour du Taillefer", "taillefer"],
              ["25/10/2025", "UTMC OFF", ""],
            ],
          },
        },
      ],
    };
    const { erreurs } = valider([page("content/aventures/a.mdx", aventure)]);
    expect(erreurs).toEqual(['billet introuvable : "taillefer" dans content/aventures/a.mdx']);
  });

  it("une référence est imputée à la page qui l'écrit, jamais à une homonyme", () => {
    const { erreurs } = valider([
      page("content/blog/a.mdx", { ...BILLET, slug: "doublon" }),
      page("content/blog/b.mdx", { ...BILLET, slug: "doublon" }, protocole("p", "inconnue2026")),
    ]);
    expect(erreurs).toEqual(['référence inconnue : "inconnue2026" dans content/blog/b.mdx']);
  });

  it("refuse une clé de frontmatter que le modèle ne connaît pas", () => {
    const analyse = analyserFrontmatter("content/recits/a.mdx", {
      sorte: "recit",
      titre: "T",
      slug: "a",
      chapeau: "C",
      date: "2025-12-09",
      aventure: "reunion-2025",
      cover: "c.webp",
      lectuer: 12,
    });
    expect(analyse.ok).toBe(false);
    expect(analyse.ok === false && analyse.erreurs[0]).toContain("content/recits/a.mdx : ");
    expect(analyse.ok === false && analyse.erreurs[0]).toContain("lectuer");
  });

  it("refuse une clé de section que le modèle ne connaît pas", () => {
    const analyse = analyserFrontmatter("content/aventures/a.mdx", {
      ...AVENTURE_TROIS_SECTIONS,
      sections: [{ type: "direct", versions: ["v1", "v2"] }],
    });
    expect(analyse.ok).toBe(false);
    expect(analyse.ok === false && analyse.erreurs[0]).toContain("versions");
  });

  it("refuse un horodatage : le jour lu ne serait pas le jour écrit", () => {
    const analyse = analyserFrontmatter("content/blog/a.mdx", {
      ...BILLET,
      date: new Date("2026-05-18T00:30:00+02:00"),
    });
    expect(analyse.ok).toBe(false);
    expect(analyse.ok === false && analyse.erreurs[0]).toBe(
      "content/blog/a.mdx : date : une date s'écrit AAAA-MM-JJ",
    );
  });

  it("frontmatter invalide : message Zod préfixé du chemin du fichier", () => {
    const analyse = analyserFrontmatter("content/blog/a.mdx", { ...BILLET, date: "17/05/2026" });
    expect(analyse.ok).toBe(false);
    expect(analyse.ok === false && analyse.erreurs[0]).toBe(
      "content/blog/a.mdx : date : une date s'écrit AAAA-MM-JJ",
    );
  });

  it("sorte inconnue : message Zod préfixé du chemin du fichier", () => {
    const analyse = analyserFrontmatter("content/blog/a.mdx", { sorte: "carnet", titre: "T" });
    expect(analyse.ok === false && analyse.erreurs[0]).toContain("content/blog/a.mdx : sorte : sorte inconnue");
  });
});

// Cas de test du système : une aventure à trois sections valide sans
// avertissement. Le module ne rend qu'une liste d'erreurs — il n'existe pas de
// canal d'avertissement où quelque chose pourrait passer inaperçu.
describe("§4 — l'aventure à trois sections", () => {
  it("valide sans erreur ni avertissement", () => {
    const pages = [page("content/aventures/tour-des-ecrins.mdx", AVENTURE_TROIS_SECTIONS)];
    const { index, erreurs } = construireIndexDesBlocs(pages);
    const resultat = validerCorpus(pages, index, CATALOGUE);

    expect(erreurs).toEqual([]);
    expect(resultat).toEqual([]);
    expect(Array.isArray(resultat)).toBe(true);
  });

  it("a bien trois sections, numérotées 01 à 03", () => {
    const [page3] = [page("content/aventures/tour-des-ecrins.mdx", AVENTURE_TROIS_SECTIONS)];
    expect(page3!.frontmatter.sorte === "aventure" && page3!.frontmatter.sections).toHaveLength(3);
  });
});

describe("index des blocs", () => {
  it("écrit une entrée conforme au schéma de §6", () => {
    const { index, erreurs } = valider([
      page("content/blog/nouveau-bloc.mdx", BILLET, protocole("train-low-eat-low")),
    ]);
    expect(erreurs).toEqual([]);
    expect(index).toEqual([
      {
        type: "protocole",
        id: "train-low-eat-low",
        titre: "Train-low, Eat-low",
        objectif: "Maximiser l'activation de l'AMPK",
        statut: "en-test",
        concepts: [],
        refs: ["marquet2016"],
        source: { sorte: "billet", slug: "nouveau-bloc", titre: "Nouveau bloc d'entraînement" },
        url: "/blog/nouveau-bloc#protocole-train-low-eat-low",
        date: "2026-05-17",
      },
    ]);
  });
});

describe("résolveur", () => {
  const { index } = valider([page("content/blog/a.mdx", BILLET, protocole("train-low-eat-low"))]);
  const resolveur = creerResolveur(index);

  it("rend la carte d'un bloc, jamais son corps", () => {
    const carte = resolveur.carte("train-low-eat-low", "content/science/b.mdx");
    expect(carte.titre).toBe("Train-low, Eat-low");
    expect(carte.statut).toBe("en-test");
    expect(carte.url).toBe("/blog/nouveau-bloc#protocole-train-low-eat-low");
    expect("corps" in carte).toBe(false);
  });

  it("lève sur un id absent, avec le message de §9", () => {
    expect(() => resolveur.carte("rest-step", "content/science/b.mdx")).toThrow(BlocIntrouvable);
    expect(() => resolveur.carte("rest-step", "content/science/b.mdx")).toThrow(
      '<VersProtocole id="rest-step"> dans content/science/b.mdx : aucun bloc ne porte cet id',
    );
  });

  it("retrouve les blocs d'une page, ce dont l'index Blog a besoin", () => {
    expect(resolveur.parSource("billet", "nouveau-bloc").map((b) => b.id)).toEqual(["train-low-eat-low"]);
    expect(resolveur.parSource("article", "nouveau-bloc")).toEqual([]);
    expect(resolveur.parType("note")).toEqual([]);
  });

  it("ne trouve rien dans un index vide", () => {
    expect(creerResolveur([]).chercher("train-low-eat-low")).toBeUndefined();
  });
});

describe("catalogue vide", () => {
  it("signale toute référence quand la bibliographie est vide", () => {
    const { erreurs } = valider(
      [page("content/blog/a.mdx", BILLET, protocole("p"))],
      CATALOGUE_VIDE,
    );
    expect(erreurs).toContain('référence inconnue : "marquet2016" dans content/blog/a.mdx');
  });
});
