// lib/paquetage.test.js
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { parseCsv, lireCsv, agregerPaquetage, grammes, kilos } from "./paquetage";

describe("parseCsv", () => {
  it("lit des champs simples, CRLF compris", () => {
    expect(parseCsv("a,b,c\r\n1,2,3\n")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("respecte les guillemets : virgules et guillemets doublés dedans", () => {
    expect(parseCsv('"Pansements, tire-tique, etc.",Divers,"dit ""ok"""\n')).toEqual([
      ["Pansements, tire-tique, etc.", "Divers", 'dit "ok"'],
    ]);
  });

  it("ignore la ligne vide finale de l'export", () => {
    expect(parseCsv("a,b\n1,2\n,\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("lireCsv", () => {
  it("renvoie des objets clé → valeur, valeurs nettoyées", () => {
    expect(lireCsv("Item Name,qty\n Sardines ,5\n")).toEqual([{ "Item Name": "Sardines", qty: "5" }]);
  });
});

describe("agregerPaquetage", () => {
  const ENTETE = "Item Name,Category,desc,qty,weight,unit,url,price,worn,consumable\n";

  it("multiplie par la quantité et trie du plus lourd au plus léger", () => {
    const p = agregerPaquetage(
      ENTETE + "Sardines,Couchage,,5,10,gram,,5,,\nCape,Couchage,,1,310,gram,,194,,\nEau,Hydratation,,1,2500,gram,,0,,\n",
    );
    expect(p.total).toBe(2860);
    expect(p.nombreArticles).toBe(3);
    expect(p.categories.map((c) => c.nom)).toEqual(["Hydratation", "Couchage"]);
    expect(p.categories[1].articles.map((a) => a.nom)).toEqual(["Cape", "Sardines"]);
    expect(p.categories[1].articles[1]).toMatchObject({ quantite: 5, masseUnitaire: 10, masse: 50 });
  });

  it("convertit les unités LighterPack en grammes", () => {
    const p = agregerPaquetage(ENTETE + "A,X,,1,1,kilogram,,,,\nB,X,,1,1,ounce,,,,\nC,X,,1,2,pound,,,,\n");
    const [x] = p.categories;
    expect(x.articles.map((a) => Math.round(a.masse))).toEqual([1000, 907, 28]);
  });

  it("tolère une quantité absente (1) et une catégorie vide", () => {
    const p = agregerPaquetage(ENTETE + "Truc,,,,40,gram,,,,\n");
    expect(p.categories[0]).toMatchObject({ nom: "Sans catégorie", masse: 40 });
    expect(p.categories[0].articles[0].quantite).toBe(1);
  });

  it("garde l'URL et la description, null quand vides", () => {
    const p = agregerPaquetage(ENTETE + "A,X,note,1,1,gram,https://x.y,,,\nB,X,,1,1,gram,,,,\n");
    expect(p.categories[0].articles[0]).toMatchObject({ url: "https://x.y", description: "note" });
    expect(p.categories[0].articles[1]).toMatchObject({ url: null, description: null });
  });

  it("digère l'export réel des Écrins : 47 articles, 7 catégories, 10 121 g", () => {
    const csv = fs.readFileSync(path.join(process.cwd(), "public", "paquetages", "tour-des-ecrins.csv"), "utf8");
    const p = agregerPaquetage(csv);
    expect(p.nombreArticles).toBe(47);
    expect(p.categories).toHaveLength(7);
    expect(Math.round(p.total)).toBe(10121);
    expect(p.categories[0]).toMatchObject({ nom: "Alimentation", masse: 3230 });
    // Le champ entre guillemets de l'export est bien lu en un seul article.
    const divers = p.categories.find((c) => c.nom === "Divers");
    expect(divers.articles.some((a) => a.nom === "Pansements, tire-tique, etc.")).toBe(true);
  });
});

describe("formats", () => {
  it("écrit les masses à la française", () => {
    expect(grammes(3230)).toMatch(/^3\s230 g$/);
    expect(kilos(10121)).toBe("10,1 kg");
    expect(kilos(4391)).toBe("4,4 kg");
  });
});
