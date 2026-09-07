// Le contenu réellement présent dans le dépôt doit valider, et l'index qu'il
// produit doit être celui que les cartes savent lire.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  chargerIndexDesBlocs,
  creerResolveur,
  lireBibliographie,
  lireDocuments,
  lireRefsDePaquetage,
  validerContenu,
} from "../src/index.ts";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const site = join(racine, "apps", "site");

async function valider() {
  return validerContenu({
    documents: await lireDocuments(join(site, "content"), racine),
    bibliographie: await lireBibliographie(join(site, "content", "bibliography.json")),
    paquetages: await lireRefsDePaquetage(join(site, "public", "paquetages")),
  });
}

describe("le contenu du dépôt", () => {
  it("valide sans erreur", async () => {
    expect((await valider()).erreurs).toEqual([]);
  });

  it("ignore le dossier des fixtures", async () => {
    const documents = await lireDocuments(join(site, "content"), racine);
    expect(documents.every((document) => !document.fichier.includes("__fixtures__"))).toBe(true);
  });

  it("produit un index que le résolveur relit et sert aux cartes", async () => {
    const { blocs } = await valider();
    const resolveur = creerResolveur(chargerIndexDesBlocs(JSON.parse(JSON.stringify(blocs))));

    const restStep = resolveur.exige("rest-step");
    expect(restStep).toMatchObject({
      type: "protocole",
      statut: "eprouve",
      url: "/blog/rest-step#protocole-rest-step",
      source: { sorte: "billet", slug: "rest-step" },
    });
    // La carte n'a que titre, objectif, statut et lien : pas de corps.
    expect(restStep).not.toHaveProperty("corps");

    expect(resolveur.resoudre("protocole-fantome")).toBeUndefined();
    expect(resolveur.parType("protocole").length).toBe(blocs.length);
  });

  it("route chaque sorte là où le §2 l'attend", async () => {
    const { documents } = await valider();
    const parSlug = new Map(documents.map((entree) => [entree.document.slug, entree.document]));

    expect(parSlug.get("reunion-2025")?.sorte).toBe("aventure");
    expect(parSlug.get("ile-intense")?.sorte).toBe("recit");
    expect(parSlug.get("nouveau-bloc")?.sorte).toBe("billet");
    expect(parSlug.get("use-it-or-lose-it")?.sorte).toBe("article");
  });
});
