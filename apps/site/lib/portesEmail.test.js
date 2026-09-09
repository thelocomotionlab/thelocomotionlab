// lib/portesEmail.test.js
//
// Les portes d'inscription du site et la passerelle qui les reçoit.
//
// Chaque formulaire annonce sa provenance (`source`), et la passerelle
// n'accepte que celles qu'elle connaît : une valeur absente de sa liste part en
// 400, et la page affiche « l'envoi a échoué » alors que rien n'est en panne.
// Trois portes ont vécu ainsi. Le test lit les deux côtés et les compare.

import fs from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

const SITE = process.cwd();
const PASSERELLE = path.join(SITE, "../../services/email-gateway/src/index.ts");

/** Les fichiers du site où se déclare une provenance. */
function fichiersDuSite() {
  const racines = ["app", "components"].map((d) => path.join(SITE, d));
  const trouves = [];
  const descendre = (dossier) => {
    for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
      const chemin = path.join(dossier, entree.name);
      if (entree.isDirectory()) descendre(chemin);
      else if (/\.jsx?$/.test(entree.name)) trouves.push(chemin);
    }
  };
  racines.forEach(descendre);
  return trouves;
}

/** `source="live"` dans un JSX, `source: "live"` dans un corps de requête. */
const PROVENANCE = /\bsource\s*[=:]\s*"([a-z0-9-]+)"/g;

function provenancesDuSite() {
  const portes = new Map();
  for (const fichier of fichiersDuSite()) {
    const code = fs.readFileSync(fichier, "utf8");
    for (const [, source] of code.matchAll(PROVENANCE)) {
      if (!portes.has(source)) portes.set(source, []);
      portes.get(source).push(path.relative(SITE, fichier));
    }
  }
  return portes;
}

function provenancesAcceptees() {
  const code = fs.readFileSync(PASSERELLE, "utf8");
  const bloc = /const SOURCES = new Set\(\[([\s\S]*?)\]\)/.exec(code);
  if (!bloc) throw new Error("la liste SOURCES de la passerelle est introuvable");
  // Une entrée commentée n'est pas acceptée : on coupe chaque ligne à son `//`.
  const vif = bloc[1]
    .split("\n")
    .map((ligne) => ligne.split("//")[0])
    .join("\n");
  return new Set([...vif.matchAll(/"([a-z0-9-]+)"/g)].map(([, s]) => s));
}

describe("les portes d'inscription email", () => {
  it("le site en ouvre au moins une par section", () => {
    const portes = provenancesDuSite();
    for (const attendue of ["home", "live", "soutenir", "pratiquer"]) {
      expect([...portes.keys()], `plus aucun formulaire n'émet « ${attendue} »`).toContain(attendue);
    }
  });

  it("la passerelle accepte la provenance de CHAQUE porte", () => {
    const acceptees = provenancesAcceptees();
    const refusees = [...provenancesDuSite()]
      .filter(([source]) => !acceptees.has(source))
      .map(([source, fichiers]) => `${source} (${fichiers.join(", ")})`);

    expect(refusees, "provenances que la passerelle renverrait en 400").toEqual([]);
  });
});
