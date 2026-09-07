// La table du §9, ligne par ligne, message par message.

import { describe, expect, it } from "vitest";

import { validerContenu, type DocumentBrut } from "../src/index.ts";
import { aventureATroisSections, billet, doc, sansBibliographie } from "./aide.ts";

function erreurs(
  documents: DocumentBrut[],
  entree: Partial<{ bibliographie: string[]; paquetages: string[] }> = {},
): string[] {
  return validerContenu({
    documents,
    bibliographie: entree.bibliographie ?? [],
    paquetages: entree.paquetages ?? [],
  }).erreurs;
}

/** Une aventure dont on ne fixe que les sections. */
function aventure(sections: readonly unknown[], reste: Record<string, unknown> = {}) {
  return doc("content/aventures/reunion-2025.mdx", {
    sorte: "aventure",
    titre: "Traversée de La Réunion en autonomie",
    slug: "reunion-2025",
    statut: "publie",
    chapeau: "170 km et deux pitons, en autonomie complète, en sandales.",
    etat: "termine",
    campagne: { debut: "2025-09-29", fin: "2025-11-30" },
    sections,
    ...reste,
  });
}

const PROTOCOLE = (id: string) =>
  `<Protocole id="${id}" statut="en-test" titre="Rest step" objectif="Épargner les quadriceps">\nCorps.\n</Protocole>\n`;

describe("§9 — les règles portées par le build", () => {
  it("deux blocs partagent un id", () => {
    expect(
      erreurs([billet("rest-step", PROTOCOLE("rest-step")), billet("utmc-off", PROTOCOLE("rest-step"))]),
    ).toEqual([
      'id de bloc en double : "rest-step" dans content/blog/rest-step.mdx et content/blog/utmc-off.mdx',
    ]);
  });

  it("une clé de refs absente de la bibliographie", () => {
    expect(
      erreurs([
        doc("content/science/use-it-or-lose-it.mdx", {
          sorte: "article",
          titre: "« Use it or lose it », vous êtes sûr ?",
          slug: "use-it-or-lose-it",
          statut: "publie",
          chapeau: "Ce que le muscle garde quand on arrête.",
          publie_le: "2026-02-26",
          refs: ["gundersen2016", "jamais-vue"],
        }),
      ], { bibliographie: ["gundersen2016"] }),
    ).toEqual(['référence inconnue : "jamais-vue" dans content/science/use-it-or-lose-it.mdx']);
  });

  it("une clé de refs d'un bloc est vérifiée elle aussi", () => {
    const corps = `<Protocole id="train-low-eat-low" statut="en-test" titre="Train-low, Eat-low" objectif="AMPK" refs="jamais-vue">\nCorps.\n</Protocole>\n`;
    expect(erreurs([billet("nouveau-bloc", corps)])).toEqual([
      'référence inconnue : "jamais-vue" dans content/blog/nouveau-bloc.mdx',
    ]);
  });

  it("un type de section inconnu", () => {
    expect(erreurs([aventure([{ type: "galerie", images: [] }])])).toEqual([
      'type de section inconnu : "galerie" dans content/aventures/reunion-2025.mdx',
    ]);
  });

  it("deux sections d'une même page produisent la même ancre", () => {
    const geo = { type: "geo", colonnes: ["Repère"], lignes: [] };
    expect(erreurs([aventure([geo, geo])])).toEqual([
      'ancre en double : "geo" dans content/aventures/reunion-2025.mdx',
    ]);
  });

  it("un id explicite lève l'ambiguïté entre deux sections de même type", () => {
    expect(
      erreurs([
        aventure([
          { type: "geo", id: "trace", colonnes: ["Repère"], lignes: [] },
          { type: "geo", id: "itineraire", colonnes: ["Étape"], lignes: [] },
        ]),
      ]),
    ).toEqual([]);
  });

  it("un recit pointe vers un slug inexistant", () => {
    expect(erreurs([aventure([], { recit: "ile-intense" })])).toEqual([
      'récit introuvable : "ile-intense" déclaré par content/aventures/reunion-2025.mdx',
    ]);
  });

  it("une aventure déclarée par un billet n'existe pas", () => {
    const rattache = doc("content/blog/tour-du-taillefer.mdx", {
      sorte: "billet",
      titre: "Première simulation en sortie longue",
      slug: "tour-du-taillefer",
      statut: "publie",
      chapeau: "39 km au Taillefer.",
      date: "2025-10-12",
      type: "recit-de-sortie",
      aventure: "vercors-2026",
    });
    expect(erreurs([rattache])).toEqual([
      'aventure introuvable : "vercors-2026" déclarée par content/blog/tour-du-taillefer.mdx',
    ]);
  });

  it("une section paquetage référence un jeu de données absent", () => {
    expect(erreurs([aventure([{ type: "paquetage", ref: "reunion-2025" }])])).toEqual([
      'paquetage introuvable : "reunion-2025" dans content/aventures/reunion-2025.mdx',
    ]);
    expect(
      erreurs([aventure([{ type: "paquetage", ref: "reunion-2025" }])], {
        paquetages: ["reunion-2025"],
      }),
    ).toEqual([]);
  });

  it("un slug de billet en dernière colonne de seances n'existe pas", () => {
    const seances = {
      colonnes: ["Date", "Sortie", "Billet"],
      lignes: [
        ["12/10/2025", "Tour du Taillefer", "tour-du-taillefer"],
        // Une cellule vide vaut « pas de billet » : rien à résoudre.
        ["25/10/2025", "UTMC OFF", ""],
      ],
    };
    expect(erreurs([aventure([{ type: "preparation", seances }])])).toEqual([
      'billet introuvable : "tour-du-taillefer" dans content/aventures/reunion-2025.mdx',
    ]);
    expect(
      erreurs([aventure([{ type: "preparation", seances }]), billet("tour-du-taillefer")]),
    ).toEqual([]);
  });

  it("un frontmatter qui ne valide pas son schéma est préfixé du chemin", () => {
    const sansTitre = doc("content/blog/nouveau-bloc.mdx", {
      sorte: "billet",
      slug: "nouveau-bloc",
      statut: "publie",
      chapeau: "Un chapeau.",
      date: "2026-05-17",
      type: "billet",
    });
    const [message] = erreurs([sansTitre]);
    expect(message).toMatch(/^content\/blog\/nouveau-bloc\.mdx : titre : /);
  });

  it("accumule toutes les erreurs plutôt que de s'arrêter à la première", () => {
    expect(
      erreurs([
        aventure([{ type: "galerie" }, { type: "paquetage", ref: "absent" }], {
          recit: "ile-intense",
        }),
      ]),
    ).toHaveLength(3);
  });
});

describe("§8 — le statut par défaut", () => {
  it("est brouillon quand le frontmatter ne dit rien", () => {
    const { documents } = validerContenu({
      documents: [billet("nouveau-bloc")],
      ...sansBibliographie,
    });
    expect(documents[0]!.document.statut).toBe("publie");

    const brut = billet("nouveau-bloc");
    delete (brut.donnees as Record<string, unknown>).statut;
    const sansStatut = validerContenu({ documents: [brut], ...sansBibliographie });
    expect(sansStatut.erreurs).toEqual([]);
    expect(sansStatut.documents[0]!.document.statut).toBe("brouillon");
  });

  it("laisse passer TODO là où une date manque encore", () => {
    expect(
      erreurs([aventureATroisSections()]).concat(
        erreurs([
          doc("content/aventures/costa-rica-2027.mdx", {
            sorte: "aventure",
            titre: "Costa Rica",
            slug: "costa-rica-2027",
            chapeau: "TODO",
            etat: "en-preparation",
            campagne: { debut: "TODO", fin: "TODO" },
          }),
        ]),
      ),
    ).toEqual([]);
  });
});
