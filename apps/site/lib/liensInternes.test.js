// lib/liensInternes.test.js
//
// Une ancre morte ne fait rien du tout — c'est précisément pour ça qu'elle
// doit faire échouer le build.

import { describe, it, expect } from "vitest";

import { assertLiensInternes, idsDeTitres } from "./liensInternes.mjs";

function atome(slug, content, extra = {}) {
  return {
    slug,
    kind: "carnet",
    pilier: "explorer",
    label: "Carnet",
    corps: "projet",
    file: `content/carnets/${slug}.md`,
    data: { title: slug },
    content,
    published: true,
    ...extra,
  };
}

const verifie = (entries, aliases = {}) => () =>
  assertLiensInternes({ entries, aliases });

describe("les ids de titres", () => {
  it("suit l'algorithme de rehype-slug, emphase comprise", () => {
    const ids = idsDeTitres("## *Use it or lose it*, vous êtes sûr ?");
    expect(ids.has("use-it-or-lose-it-vous-êtes-sûr")).toBe(true);
  });

  it("numérote les doublons comme au rendu", () => {
    const ids = idsDeTitres("## Bilan\n### Bilan\n#### Bilan");
    expect([...ids]).toEqual(["bilan", "bilan-1", "bilan-2"]);
  });

  it("lit tous les niveaux de titre, pas seulement le sommaire", () => {
    expect(idsDeTitres("#### Le paquetage").has("le-paquetage")).toBe(true);
  });
});

describe("les ancres internes", () => {
  it("accepte une ancre qui vise un titre du fichier", () => {
    expect(
      verifie([atome("c", "## Le rest step\n\n[voir](#le-rest-step)")])
    ).not.toThrow();
  });

  it("refuse une ancre dont le titre est parti ailleurs", () => {
    expect(
      verifie([atome("c", "[voir](#la-decouverte-du-rest-step)")])
    ).toThrow(/l'ancre « #la-decouverte-du-rest-step »/);
  });

  it("accepte une ancre encodée en pourcent", () => {
    expect(
      verifie([atome("c", "## Préparatifs\n\n[a](#pr%C3%A9paratifs)")])
    ).not.toThrow();
  });

  it("accepte #sommaire, qui est l'id du bloc de plan", () => {
    expect(verifie([atome("c", "[Retour](#sommaire)")])).not.toThrow();
  });

  it("ignore ce qui est commenté ou dans un bloc de code", () => {
    expect(
      verifie([
        atome("c", "<!-- [mort](#disparu) -->\n\n```\n[aussi](#disparu)\n```"),
      ])
    ).not.toThrow();
  });

  it("ne vérifie pas les brouillons", () => {
    expect(
      verifie([atome("c", "[mort](#disparu)", { published: false })])
    ).not.toThrow();
  });
});

describe("les liens entre atomes", () => {
  const cible = atome("hormese", "", {
    kind: "concept",
    pilier: "comprendre",
    label: "Concept",
    file: "content/concepts/hormese.md",
  });

  it("accepte un lien vers un atome publié", () => {
    expect(
      verifie([cible, atome("c", "[a](/comprendre/hormese)")])
    ).not.toThrow();
  });

  it("accepte un lien vers un atome publié suivi d'une ancre", () => {
    expect(
      verifie([cible, atome("c", "[a](/comprendre/hormese#en-bref)")])
    ).not.toThrow();
  });

  it("refuse un lien vers un atome qui n'existe pas", () => {
    expect(verifie([atome("c", "[a](/comprendre/inconnu)")])).toThrow(
      /le lien « \/comprendre\/inconnu »/
    );
  });

  it("refuse un lien vers un brouillon", () => {
    expect(
      verifie([
        { ...cible, published: false },
        atome("c", "[a](/comprendre/hormese)"),
      ])
    ).toThrow(/le lien « \/comprendre\/hormese »/);
  });

  it("accepte une ancienne adresse que le 308 rattrape", () => {
    expect(
      verifie([cible, atome("c", "[a](/explorer/vieux-slug)")], {
        "vieux-slug": "hormese",
      })
    ).not.toThrow();
  });
});

describe("le contenu réel du site", () => {
  it("ne contient aucun lien ni aucune ancre qui pointe dans le vide", () => {
    expect(() => assertLiensInternes()).not.toThrow();
  });
});
