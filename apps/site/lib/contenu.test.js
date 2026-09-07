// lib/contenu.test.js
//
// Le contenu réel de content/ passe les règles de build, et l'index des blocs
// qu'il produit est celui que les cartes liront.

import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  construireContenu,
  creerResolveur,
  ancresDeSections,
  numeroterSections,
} from "@locomotionlab/contenu";

const racine = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const arborescence = {
  contenu: path.join(racine, "content"),
  base: racine,
  bibliographie: path.join(racine, "content/bibliography.json"),
  paquetages: path.join(racine, "public/paquetages"),
};

const { pages, index, erreurs } = construireContenu(arborescence);

const parSlug = (slug) => pages.find((p) => p.frontmatter.slug === slug);

describe("content/", () => {
  it("ne produit aucune erreur de build", () => {
    expect(erreurs).toEqual([]);
  });

  it("porte une page par sorte", () => {
    const sortes = pages.map((p) => p.frontmatter.sorte);
    for (const sorte of ["aventure", "recit", "billet", "article"]) {
      expect(sortes, `aucune page de sorte ${sorte}`).toContain(sorte);
    }
  });

  it("laisse en brouillon ce qui n'est pas complet", () => {
    expect(parSlug("reunion-2025").frontmatter.statut).toBe("publie");
    // Le Tour des Écrins n'a ni cover ni chapeau écrits : il n'est pas routé.
    expect(parSlug("tour-des-ecrins").frontmatter.statut).toBe("brouillon");
  });
});

describe("l'aventure à trois sections", () => {
  const ecrins = () => parSlug("tour-des-ecrins").frontmatter;

  it("valide telle quelle", () => {
    expect(ecrins().sections).toHaveLength(3);
    expect(erreurs).toEqual([]);
  });

  it("garde ses ancres quand une section s'insère en tête", () => {
    // Les ancres attendues sont écrites en littéraux : comparer deux appels de
    // la même fonction passerait même si elle rendait partout la même chaîne.
    const ANCRES = ["caracteristiques", "genese-et-preparatifs", "paquetage"];

    const avant = numeroterSections(ecrins().sections);
    const apres = numeroterSections([{ type: "direct" }, ...ecrins().sections]);

    expect(avant.map((s) => s.ancre)).toEqual(ANCRES);
    expect(apres.map((s) => s.ancre)).toEqual(["direct", ...ANCRES]);
    expect(avant.map((s) => s.numero)).toEqual(["01", "02", "03"]);
    expect(apres.map((s) => s.numero)).toEqual(["01", "02", "03", "04"]);
  });
});

describe("index des blocs", () => {
  it("contient le protocole du billet, adressé par son ancre", () => {
    const carte = creerResolveur(index).carte("train-low-eat-low", "lib/contenu.test.js");
    expect(carte.url).toBe("/blog/nouveau-bloc#protocole-train-low-eat-low");
    expect(carte.statut).toBe("en-test");
    expect(carte.source.slug).toBe("nouveau-bloc");
  });
});

describe("la traversée de la Réunion", () => {
  const reunion = () => parSlug("reunion-2025").frontmatter;

  it("déclare ses sections dans l'ordre de la page", () => {
    expect(reunion().sections.map((s) => s.type)).toEqual([
      "caracteristiques",
      "geo",
      "preparation",
      "nutrition",
      "direct",
      "recit",
    ]);
  });

  it("produit des ancres dérivées du type, pas du numéro", () => {
    expect(ancresDeSections(reunion().sections)).toEqual([
      "caracteristiques",
      "geo",
      "preparation",
      "nutrition",
      "direct",
      "recit",
    ]);
  });

  it("renvoie vers un récit qui existe", () => {
    expect(reunion().recit).toBe("ile-intense");
    expect(parSlug("ile-intense").frontmatter.sorte).toBe("recit");
  });
});
