import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DepotStore, nettoyerNomFichier } from "../src/store";

const cleanups: Array<() => void> = [];

function makeDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "twin-depot-"));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function metaDe(over: Partial<Parameters<DepotStore["add"]>[0]> = {}) {
  return {
    prenom: "Chloé",
    nom: "Durand",
    email: "Chloe@Test.FR",
    montre: "garmin",
    objectifs: "Diagonale des Fous 2026",
    consent: true as const,
    nomFichier: "export-garmin.zip",
    taille: 12,
    sha256: "abc123",
    ip: "1.2.3.4",
    ...over,
  };
}

function tmpAvecContenu(store: DepotStore, contenu: string): string {
  const tmp = store.tmpPath();
  fs.writeFileSync(tmp, contenu);
  return tmp;
}

describe("nettoyerNomFichier", () => {
  it("garde un nom sain tel quel", () => {
    expect(nettoyerNomFichier("export-garmin.zip")).toBe("export-garmin.zip");
  });

  it("neutralise chemins, caractères spéciaux et noms cachés", () => {
    expect(nettoyerNomFichier("../../etc/passwd")).toBe("passwd");
    expect(nettoyerNomFichier("C:\\Users\\moi\\données perso.zip")).toBe("donn_es_perso.zip");
    expect(nettoyerNomFichier(".htaccess")).toBe("htaccess");
    expect(nettoyerNomFichier("")).toBe("archive.zip");
    expect(nettoyerNomFichier("....")).toBe("archive.zip");
  });

  it("borne la longueur", () => {
    expect(nettoyerNomFichier("a".repeat(300)).length).toBe(120);
  });
});

describe("DepotStore", () => {
  it("déplace le tmp vers archives/<id>/ et indexe le dépôt", () => {
    const store = new DepotStore(makeDir());
    const tmp = tmpAvecContenu(store, "contenu-archive");

    const depot = store.add(metaDe(), tmp);

    expect(depot.reference).toMatch(/^LL-TWIN-\d{4}-0001$/);
    expect(depot.email).toBe("chloe@test.fr"); // normalisé
    expect(fs.existsSync(tmp)).toBe(false);
    expect(fs.readFileSync(store.archivePath(depot), "utf8")).toBe("contenu-archive");
    expect(store.count()).toBe(1);
    expect(store.find(depot.id)?.reference).toBe(depot.reference);
  });

  it("incrémente la référence et survit à un rechargement", () => {
    const dir = makeDir();
    const store = new DepotStore(dir);
    store.add(metaDe(), tmpAvecContenu(store, "a"));
    const deux = store.add(metaDe({ nomFichier: "deux.zip" }), tmpAvecContenu(store, "b"));
    expect(deux.reference).toMatch(/-0002$/);

    const recharge = new DepotStore(dir);
    expect(recharge.count()).toBe(2);
    const trois = recharge.add(metaDe({ nomFichier: "trois.zip" }), tmpAvecContenu(recharge, "c"));
    expect(trois.reference).toMatch(/-0003$/); // le compteur persiste
  });

  it("remove purge l'archive du disque et l'index (référence jamais réutilisée)", () => {
    const store = new DepotStore(makeDir());
    const depot = store.add(metaDe(), tmpAvecContenu(store, "x"));
    const chemin = store.archivePath(depot);

    expect(store.remove(depot.id)?.reference).toBe(depot.reference);
    expect(fs.existsSync(chemin)).toBe(false);
    expect(store.count()).toBe(0);
    expect(store.remove(depot.id)).toBeUndefined();

    const suivant = store.add(metaDe({ nomFichier: "suivant.zip" }), tmpAvecContenu(store, "y"));
    expect(suivant.reference).toMatch(/-0002$/);
  });

  it("purge les tmp orphelins au démarrage (crash pendant un upload)", () => {
    const dir = makeDir();
    const premier = new DepotStore(dir);
    const orphelin = premier.tmpPath();
    fs.writeFileSync(orphelin, "upload interrompu");

    new DepotStore(dir);
    expect(fs.existsSync(orphelin)).toBe(false);
  });
});
