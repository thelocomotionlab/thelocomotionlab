import { describe, expect, it } from "vitest";

import { estHeic } from "./imageFile";

/** Faux `File` : seul `slice().arrayBuffer()` est utilisé par la détection. */
function fichier(octets) {
  const buf = new Uint8Array(octets);
  return {
    slice: (a, b) => ({ arrayBuffer: async () => buf.slice(a, b).buffer }),
  };
}

/** En-tête ISO-BMFF : 4 octets de taille, « ftyp », puis la marque de type. */
function enTete(marque) {
  return [0, 0, 0, 24, ...[..."ftyp"].map((c) => c.charCodeAt(0)), ...[...marque].map((c) => c.charCodeAt(0)), 0, 0, 0, 0];
}

describe("estHeic", () => {
  it("reconnaît les marques HEIF de l'iPhone", async () => {
    for (const marque of ["heic", "heix", "mif1", "msf1"]) {
      expect(await estHeic(fichier(enTete(marque))), marque).toBe(true);
    }
  });

  it("est insensible à la casse de la marque", async () => {
    expect(await estHeic(fichier(enTete("HEIC")))).toBe(true);
  });

  it("ne confond pas avec les autres conteneurs ISO-BMFF ni avec JPEG/PNG", async () => {
    // Une vidéo MP4 commence aussi par « ftyp » : la marque seule les sépare.
    expect(await estHeic(fichier(enTete("isom")))).toBe(false);
    expect(await estHeic(fichier(enTete("mp42")))).toBe(false);
    expect(await estHeic(fichier([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
    expect(await estHeic(fichier([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 0]))).toBe(false);
  });

  it("ON LIT LES OCTETS, PAS LE NOM : un fichier tronqué ou illisible dit non", async () => {
    // iOS renvoie régulièrement un `File.type` vide et le nom peut mentir ;
    // la détection ne doit jamais jeter, seulement répondre non.
    expect(await estHeic(fichier([0, 0, 0]))).toBe(false);
    expect(await estHeic({ slice: () => ({ arrayBuffer: async () => { throw new Error("boom"); } }) })).toBe(false);
  });
});
