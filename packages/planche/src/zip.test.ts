import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { crc32, ecrireZip, lireZip } from "./zip.ts";

const texte = (s: string) => new TextEncoder().encode(s);

describe("crc32", () => {
  it("donne la valeur de référence", () => {
    // « The quick brown fox jumps over the lazy dog » → 0x414FA339
    expect(crc32(texte("The quick brown fox jumps over the lazy dog"))).toBe(0x414fa339);
  });

  it("vaut zéro sur le vide", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("aller-retour", () => {
  it("rend chaque entrée telle quelle", () => {
    const octets = new Uint8Array(5000);
    for (let i = 0; i < octets.length; i += 1) octets[i] = (i * 37) % 256;
    const zip = ecrireZip([
      { nom: "projet.json", donnees: texte('{"nom":"Écrins"}') },
      { nom: "medias/photo-é.jpg", donnees: octets },
      { nom: "vide.txt", donnees: new Uint8Array(0) },
    ]);
    const relu = lireZip(zip);
    expect([...relu.keys()]).toEqual(["projet.json", "medias/photo-é.jpg", "vide.txt"]);
    expect(new TextDecoder().decode(relu.get("projet.json")!.donnees)).toBe('{"nom":"Écrins"}');
    expect(relu.get("medias/photo-é.jpg")!.donnees).toEqual(octets);
    expect(relu.get("vide.txt")!.donnees.length).toBe(0);
  });

  it("refuse un fichier qui n'est pas une archive", () => {
    expect(() => lireZip(texte("bonjour"))).toThrow(/archive/);
  });
});

describe("compatibilité", () => {
  it("s'ouvre avec unzip", () => {
    const zip = ecrireZip([
      { nom: "a.txt", donnees: texte("premier") },
      { nom: "dossier/b.txt", donnees: texte("second") },
    ]);
    const dossier = mkdtempSync(join(tmpdir(), "zip-"));
    const chemin = join(dossier, "test.zip");
    writeFileSync(chemin, zip);
    // `unzip -t` vérifie les CRC de toute l'archive : c'est le juge de paix.
    execFileSync("unzip", ["-t", chemin]);
    execFileSync("unzip", ["-o", "-q", chemin, "-d", dossier]);
    expect(readFileSync(join(dossier, "a.txt"), "utf8")).toBe("premier");
    expect(readFileSync(join(dossier, "dossier/b.txt"), "utf8")).toBe("second");
  });

  it("relit une archive écrite par zip", () => {
    const dossier = mkdtempSync(join(tmpdir(), "zip-"));
    writeFileSync(join(dossier, "c.txt"), "venu d'ailleurs");
    // -0 : stocké, comme ce qu'on écrit — c'est ce qu'on sait relire.
    execFileSync("zip", ["-0", "-q", "-j", join(dossier, "ext.zip"), join(dossier, "c.txt")]);
    const relu = lireZip(new Uint8Array(readFileSync(join(dossier, "ext.zip"))));
    expect(new TextDecoder().decode(relu.get("c.txt")!.donnees)).toBe("venu d'ailleurs");
  });
});

describe("deflate", () => {
  it("écrit une entrée dégonflée que unzip valide", async () => {
    const brut = texte("bonjour ".repeat(500));
    const flux = new Blob([brut as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    const gonfle = new Uint8Array(await new Response(flux).arrayBuffer());
    const zip = ecrireZip([
      { nom: "gros.txt", donnees: gonfle, methode: 8, brut: { taille: brut.length, crc: crc32(brut) } },
    ]);
    expect(gonfle.length).toBeLessThan(brut.length / 4);

    const dossier = mkdtempSync(join(tmpdir(), "zip-"));
    const chemin = join(dossier, "deflate.zip");
    writeFileSync(chemin, zip);
    execFileSync("unzip", ["-t", chemin]);
    execFileSync("unzip", ["-o", "-q", chemin, "-d", dossier]);
    expect(readFileSync(join(dossier, "gros.txt"), "utf8")).toBe("bonjour ".repeat(500));
  });

  it("rend la méthode et la taille d'origine à la relecture", () => {
    const zip = ecrireZip([
      { nom: "x", donnees: new Uint8Array([1, 2]), methode: 8, brut: { taille: 99, crc: 7 } },
    ]);
    const e = lireZip(zip).get("x")!;
    expect(e.methode).toBe(8);
    expect(e.brut).toEqual({ taille: 99, crc: 7 });
    expect(e.donnees).toEqual(new Uint8Array([1, 2]));
  });
});
