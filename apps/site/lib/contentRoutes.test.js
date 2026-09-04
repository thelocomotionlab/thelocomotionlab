// lib/contentRoutes.test.js
//
// Le modèle de contenu et ses règles de build. Ce sont elles qui rattrapent la
// seule fragilité assumée du système — la décision de rangement au moment
// d'écrire — donc elles ont un test par cas d'échec.

import { describe, it, expect } from "vitest";

import {
  KINDS,
  PILIERS,
  ORDRE_EXPLORER,
  ETATS,
  ETAT_LABELS,
  BRANCHES,
  SLUG_ALIASES,
  listEntries,
  listByKind,
  listByPilier,
  routeFor,
  etatDe,
  assertContentRules,
} from "./contentRoutes.mjs";

/** Un atome de fixture, avec les champs que readKind normalise. */
function atome(kind, slug, extra = {}) {
  const { pilier, label, corps } = KINDS[kind];
  return {
    slug,
    kind,
    pilier,
    label,
    corps,
    file: `content/${KINDS[kind].dir}/${slug}.md`,
    filePath: `/fixture/${slug}.md`,
    data: { title: slug },
    content: "",
    published: true,
    parent: null,
    concepts: [],
    fiches: [],
    lie: [],
    maturite: kind === "concept" ? "graine" : null,
    statut: kind === "protocole" ? "en-test" : null,
    branche: null,
    archive: null,
    origine: null,
    ...extra,
  };
}

const verifie = (entries, aliases = {}) => () =>
  assertContentRules({ entries, aliases });

describe("la table des sortes", () => {
  it("compte cinq sortes, réparties une / quatre entre les piliers", () => {
    expect(Object.keys(KINDS)).toHaveLength(5);
    const parPilier = Object.values(KINDS).reduce((acc, k) => {
      acc[k.pilier] = (acc[k.pilier] ?? 0) + 1;
      return acc;
    }, {});
    expect(parPilier).toEqual({ comprendre: 1, explorer: 4 });
  });

  it("donne un dossier, un libellé et un corps distincts à chaque sorte", () => {
    const dirs = Object.values(KINDS).map((k) => k.dir);
    expect(new Set(dirs).size).toBe(dirs.length);
    for (const k of Object.values(KINDS)) {
      expect(k.label).toBeTruthy();
      expect(["article", "projet"]).toContain(k.corps);
    }
  });

  it("range les quatre sortes d'Explorer dans l'ordre de l'index", () => {
    expect(ORDRE_EXPLORER).toEqual([
      "expedition",
      "protocole",
      "carnet",
      "fiche",
    ]);
    expect(new Set(ORDRE_EXPLORER)).toEqual(
      new Set(
        Object.keys(KINDS).filter((k) => KINDS[k].pilier === "explorer")
      )
    );
  });

  it("route chaque atome vers le préfixe de son pilier", () => {
    expect(routeFor(atome("concept", "hormese"))).toBe("/comprendre/hormese");
    expect(routeFor(atome("carnet", "carnet-2026"))).toBe(
      "/explorer/carnet-2026"
    );
    expect(Object.keys(PILIERS)).toEqual(["comprendre", "explorer"]);
  });

  it("donne à chaque valeur d'état un libellé affichable", () => {
    for (const { valeurs } of Object.values(ETATS)) {
      for (const v of valeurs) expect(ETAT_LABELS[v]).toBeTruthy();
    }
    expect(etatDe(atome("concept", "x", { maturite: "pousse" }))).toBe("Pousse");
    expect(etatDe(atome("protocole", "y", { statut: "eprouve" }))).toBe(
      "Éprouvé"
    );
    expect(etatDe(atome("fiche", "z", { parent: "e" }))).toBeNull();
  });
});

describe("les règles de build", () => {
  it("accepte un content/ vide", () => {
    expect(verifie([])).not.toThrow();
  });

  it("refuse deux atomes homonymes, même dans deux piliers différents", () => {
    expect(
      verifie([atome("concept", "meme-nom"), atome("carnet", "meme-nom")])
    ).toThrow(/Collision de slugs « meme-nom »/);
  });

  it("refuse une fiche sans parent", () => {
    expect(verifie([atome("fiche", "paquetage-x")])).toThrow(
      /une fiche doit déclarer « parent: »/
    );
  });

  it("refuse un parent qui ne désigne ni expédition ni protocole", () => {
    expect(
      verifie([
        atome("carnet", "carnet-2026"),
        atome("fiche", "paquetage-x", { parent: "carnet-2026" }),
      ])
    ).toThrow(/ne désigne aucune expédition ni aucun protocole/);
  });

  it("accepte une fiche dont le parent est une expédition ou un protocole", () => {
    expect(
      verifie([
        atome("expedition", "ecrins"),
        atome("protocole", "jeune", { statut: "eprouve" }),
        atome("fiche", "paquetage-ecrins", { parent: "ecrins" }),
        atome("fiche", "menu-jeune", { parent: "jeune" }),
      ])
    ).not.toThrow();
  });

  it("refuse un `concepts:` qui ne résout pas vers un concept", () => {
    expect(
      verifie([
        atome("expedition", "ecrins", { concepts: ["hormese"] }),
        atome("carnet", "hormese"),
      ])
    ).toThrow(/« concepts: \[… hormese …\] »/);
  });

  it("refuse un `fiches:` qui désigne autre chose qu'une fiche", () => {
    expect(
      verifie([
        atome("expedition", "ecrins", { fiches: ["reunion"] }),
        atome("expedition", "reunion"),
      ])
    ).toThrow(/« fiches: \[… reunion …\] »/);
  });

  it("refuse un `lie:` qui ne résout pas vers un concept", () => {
    expect(
      verifie([atome("concept", "froid", { lie: ["inconnu"] })])
    ).toThrow(/« lie: \[… inconnu …\] »/);
  });

  it("refuse qu'un atome publié cite un brouillon", () => {
    expect(
      verifie([
        atome("concept", "hormese", { published: false }),
        atome("expedition", "ecrins", { concepts: ["hormese"] }),
      ])
    ).toThrow(/désigne un brouillon/);
  });

  it("tolère qu'un brouillon cite un brouillon, et qu'une fiche ait un parent en brouillon", () => {
    expect(
      verifie([
        atome("concept", "hormese", { published: false }),
        atome("expedition", "ecrins", {
          concepts: ["hormese"],
          published: false,
        }),
        atome("fiche", "paquetage", { parent: "ecrins" }),
      ])
    ).not.toThrow();
  });

  it("accepte des relations qui résolvent toutes", () => {
    expect(
      verifie([
        atome("concept", "hormese"),
        atome("concept", "froid", { lie: ["hormese"] }),
        atome("fiche", "paquetage", { parent: "ecrins" }),
        atome("expedition", "ecrins", {
          concepts: ["hormese"],
          fiches: ["paquetage"],
        }),
      ])
    ).not.toThrow();
  });

  it("valide l'état contre le vocabulaire de la sorte", () => {
    expect(
      verifie([atome("concept", "froid", { maturite: "mure" })])
    ).toThrow(/« maturite: » doit valoir graine \| pousse \| etabli/);
    expect(
      verifie([atome("protocole", "jeune", { statut: "graine" })])
    ).toThrow(/« statut: » doit valoir en-test \| eprouve \| abandonne/);
  });

  it("exige un état sur un atome publié, pas sur un brouillon", () => {
    expect(
      verifie([atome("concept", "froid", { maturite: null })])
    ).toThrow(/un atome publié doit porter « maturite: »/);
    expect(
      verifie([atome("concept", "froid", { maturite: null, published: false })])
    ).not.toThrow();
  });

  it("n'exige aucun état des sortes qui n'en ont pas", () => {
    expect(
      verifie([atome("expedition", "ecrins"), atome("carnet", "carnet-2026")])
    ).not.toThrow();
  });

  it("refuse une branche inventée, tolère l'absence de branche", () => {
    expect(
      verifie([atome("concept", "froid", { branche: "cosmos" })])
    ).toThrow(/« branche: cosmos » n'est pas une branche connue/);
    expect(
      verifie([atome("concept", "froid", { branche: "thermique" })])
    ).not.toThrow();
    expect(verifie([atome("concept", "froid")])).not.toThrow();
  });

  it("accumule les erreurs au lieu de s'arrêter à la première", () => {
    let message = "";
    try {
      assertContentRules({
        entries: [
          atome("fiche", "sans-parent"),
          atome("concept", "sans-etat", { maturite: null }),
        ],
        aliases: {},
      });
    } catch (e) {
      message = e.message;
    }
    expect(message).toMatch(/une fiche doit déclarer/);
    expect(message).toMatch(/doit porter « maturite: »/);
  });
});

describe("les alias de slugs", () => {
  const contenu = [atome("carnet", "carnet-2026"), atome("concept", "la-genese")];

  it("refuse un alias dont la cible n'existe pas", () => {
    expect(verifie(contenu, { vieux: "absent" })).toThrow(
      /pointe vers « absent », qui n'existe pas/
    );
  });

  it("refuse un alias qui masquerait un atome vivant", () => {
    expect(verifie(contenu, { "carnet-2026": "la-genese" })).toThrow(
      /est redirigé alors qu'un atome porte ce slug/
    );
  });

  it("accepte un renommage vers un atome existant", () => {
    expect(verifie(contenu, { "saison-trail-2026": "carnet-2026" })).not.toThrow();
  });

  it("accepte « x: x », le changement de pilier à slug constant", () => {
    expect(verifie(contenu, { "la-genese": "la-genese" })).not.toThrow();
  });
});

describe("le contenu réel du site", () => {
  it("passe les règles, table d'alias comprise — c'est ce que fait le build", () => {
    expect(() => assertContentRules()).not.toThrow();
  });

  it("range chaque atome dans le dossier de sa sorte", () => {
    for (const entry of listEntries()) {
      expect(entry.file).toBe(
        `content/${KINDS[entry.kind].dir}/${entry.slug}.md`
      );
    }
  });

  it("déduit la sorte du dossier, jamais d'un champ `type` résiduel", () => {
    for (const entry of listEntries()) {
      expect(entry.data.type).toBeUndefined();
    }
  });

  it("sépare les deux piliers sans en perdre un atome", () => {
    const total = listEntries().length;
    expect(
      listByPilier("comprendre").length + listByPilier("explorer").length
    ).toBe(total);
    expect(listByKind("concept")).toEqual(listByPilier("comprendre"));
  });

  it("ne nomme dans SLUG_ALIASES que des branches et des cibles utiles", () => {
    const slugs = new Set(listEntries().map((e) => e.slug));
    for (const [ancien, actuel] of Object.entries(SLUG_ALIASES)) {
      expect(slugs.has(actuel)).toBe(true);
      if (ancien !== actuel) expect(slugs.has(ancien)).toBe(false);
    }
  });

  it("n'utilise que des branches connues", () => {
    for (const entry of listEntries()) {
      if (entry.branche) expect(BRANCHES).toHaveProperty(entry.branche);
    }
  });
});
