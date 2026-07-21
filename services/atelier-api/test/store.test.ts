import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { InscriptionStore } from "../src/store";

const tmpDirs: string[] = [];

function makeDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atelier-store-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("InscriptionStore", () => {
  it("compte les inscrits hors liste d'attente", () => {
    const store = new InscriptionStore(makeDir());
    store.add("a", "Ana", "ana@test.fr", false);
    store.add("a", "Bob", "bob@test.fr", false);
    store.add("a", "Zoé", "zoe@test.fr", true);
    store.add("b", "Léo", "leo@test.fr", false);

    expect(store.registered("a")).toBe(2);
    expect(store.waitlisted("a")).toBe(1);
    expect(store.registered("b")).toBe(1);
    expect(store.count()).toBe(4);
  });

  it("retrouve une inscription par email, insensible à la casse", () => {
    const store = new InscriptionStore(makeDir());
    store.add("a", "Ana", "Ana@Test.fr", false);

    expect(store.find("a", "ana@test.fr")?.prenom).toBe("Ana");
    expect(store.find("a", "ANA@TEST.FR")).toBeDefined();
    expect(store.find("b", "ana@test.fr")).toBeUndefined();
  });

  it("persiste sur disque et recharge au démarrage", () => {
    const dir = makeDir();
    const store = new InscriptionStore(dir);
    store.add("a", "Ana", "ana@test.fr", false);

    const reloaded = new InscriptionStore(dir);
    expect(reloaded.registered("a")).toBe(1);
    expect(reloaded.find("a", "ana@test.fr")?.prenom).toBe("Ana");
  });

  it("purge un atelier sans toucher les autres", () => {
    const dir = makeDir();
    const store = new InscriptionStore(dir);
    store.add("a", "Ana", "ana@test.fr", false);
    store.add("a", "Zoé", "zoe@test.fr", true);
    store.add("b", "Léo", "leo@test.fr", false);

    expect(store.purge("a")).toBe(2);
    expect(store.list("a")).toHaveLength(0);
    expect(store.registered("b")).toBe(1);

    const reloaded = new InscriptionStore(dir);
    expect(reloaded.count()).toBe(1);
  });
});
