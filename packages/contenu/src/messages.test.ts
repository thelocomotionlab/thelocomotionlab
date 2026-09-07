// packages/contenu/src/messages.test.ts
//
// Les messages du build sont ceux du tableau §9, au caractère près. Le tableau
// est lu dans docs/systeme-de-contenu.md : si l'un des deux bouge sans l'autre,
// ce test le dit.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as messages from "./messages.ts";

const SPEC = fileURLToPath(new URL("../../../docs/systeme-de-contenu.md", import.meta.url));

/** Les messages de la colonne « Message » du tableau §9, dans l'ordre. */
function messagesDuTableau(): string[] {
  const section = readFileSync(SPEC, "utf8").split("## 9. Validation au build")[1]!.split("\n## ")[0]!;
  return section
    .split("\n")
    .filter((ligne) => ligne.startsWith("|") && !ligne.includes("---") && !ligne.includes("Condition"))
    .map((ligne) => ligne.replace(/^\||\|$/g, "").split("|")[1]!.trim())
    .map((cellule) => cellule.replace(/^`|`$/g, ""));
}

describe("§9", () => {
  it("porte dix règles", () => {
    expect(messagesDuTableau()).toHaveLength(10);
  });

  it("produit chaque message au caractère près", () => {
    const [
      idEnDouble,
      carte,
      reference,
      typeDeSection,
      ancre,
      recit,
      aventure,
      paquetage,
      billet,
    ] = messagesDuTableau();

    expect(messages.idDeBlocEnDouble("<id>", "<fichier A>", "<fichier B>")).toBe(idEnDouble);
    expect(messages.carteSansBloc("<id>", "<fichier>")).toBe(carte);
    expect(messages.referenceInconnue("<clé>", "<fichier>")).toBe(reference);
    expect(messages.typeDeSectionInconnu("<type>", "<fichier>")).toBe(typeDeSection);
    expect(messages.ancreEnDouble("<ancre>", "<fichier>")).toBe(ancre);
    expect(messages.recitIntrouvable("<slug>", "<fichier>")).toBe(recit);
    expect(messages.aventureIntrouvable("<slug>", "<fichier>")).toBe(aventure);
    expect(messages.paquetageIntrouvable("<ref>", "<fichier>")).toBe(paquetage);
    expect(messages.billetIntrouvable("<slug>", "<fichier>")).toBe(billet);
  });

  it("préfixe un message Zod du chemin du fichier", () => {
    expect(messagesDuTableau()[9]).toBe("message Zod, préfixé du chemin du fichier");
    expect(messages.schemaInvalide("content/blog/a.mdx", "date", "une date s'écrit AAAA-MM-JJ")).toBe(
      "content/blog/a.mdx : date : une date s'écrit AAAA-MM-JJ",
    );
  });
});
