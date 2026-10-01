import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { chiffrerSurPlace, chiffreur, cleDArchive, estChiffre, fluxDechiffre } from "../src/chiffre";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

function dossier(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "twin-depot-chiffre-"));
  cleanups.push(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}

async function lire(flux: Readable): Promise<Buffer> {
  const morceaux: Buffer[] = [];
  for await (const m of flux) morceaux.push(m as Buffer);
  return Buffer.concat(morceaux);
}

async function chiffrer(contenu: Buffer, cle: Buffer, chemin: string): Promise<void> {
  await pipeline(Readable.from([contenu]), chiffreur(cle), fs.createWriteStream(chemin));
}

describe("chiffrement des archives", () => {
  const cle = crypto.randomBytes(32);

  it("aller-retour, y compris une archive vide et une grosse", async () => {
    const d = dossier();
    for (const contenu of [Buffer.alloc(0), Buffer.from("PK"), crypto.randomBytes(3 * 1048576 + 7)]) {
      const chemin = path.join(d, `a-${contenu.length}`);
      await chiffrer(contenu, cle, chemin);
      expect(estChiffre(chemin)).toBe(true);
      expect(fs.statSync(chemin).size).toBe(contenu.length + 5 + 12 + 16);
      const clair = await lire(fluxDechiffre(chemin, cle));
      expect(clair.equals(contenu)).toBe(true);
    }
  });

  it("une mauvaise clé ou un octet altéré font échouer le flux", async () => {
    const d = dossier();
    const chemin = path.join(d, "a");
    await chiffrer(Buffer.from("contenu sensible"), cle, chemin);
    await expect(lire(fluxDechiffre(chemin, crypto.randomBytes(32)))).rejects.toThrow();
    const brut = fs.readFileSync(chemin);
    brut[20] ^= 0xff;
    fs.writeFileSync(chemin, brut);
    await expect(lire(fluxDechiffre(chemin, cle))).rejects.toThrow();
  });

  it("chiffre sur place une archive en clair", async () => {
    const d = dossier();
    const chemin = path.join(d, "clair.zip");
    fs.writeFileSync(chemin, "PK clair");
    expect(estChiffre(chemin)).toBe(false);
    await chiffrerSurPlace(chemin, cle);
    expect(estChiffre(chemin)).toBe(true);
    expect((await lire(fluxDechiffre(chemin, cle))).toString()).toBe("PK clair");
    expect(fs.readdirSync(d)).toEqual(["clair.zip"]);
  });

  it("lit la clé dans l'environnement", () => {
    expect(cleDArchive(undefined)).toBeNull();
    expect(cleDArchive("  ")).toBeNull();
    expect(cleDArchive("ab".repeat(32))?.length).toBe(32);
    expect(() => cleDArchive("1234")).toThrow(/64 caractères/);
  });
});
