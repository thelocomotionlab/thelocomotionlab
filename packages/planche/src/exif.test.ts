import { describe, expect, it } from "vitest";

import { lireExif } from "./exif.ts";

/**
 * Fabrique un JPEG minimal portant un EXIF : en-tête, segment APP1, et rien
 * d'autre. Les octets sont écrits à la main pour que le test ne dépende
 * d'aucune photo, et qu'on sache exactement ce qu'on lit.
 */
function jpegAvecExif(
  champs: {
    date?: string;
    lat?: [number, number, number];
    latRef?: string;
    lon?: [number, number, number];
    lonRef?: string;
  },
  petitBoutiste = true,
): ArrayBuffer {
  const octets: number[] = [];
  const u8 = (n: number) => octets.push(n & 0xff);
  const u16 = (n: number) =>
    petitBoutiste ? (u8(n), u8(n >> 8)) : (u8(n >> 8), u8(n));
  const u32 = (n: number) =>
    petitBoutiste
      ? (u8(n), u8(n >> 8), u8(n >> 16), u8(n >> 24))
      : (u8(n >> 24), u8(n >> 16), u8(n >> 8), u8(n));

  // Le corps TIFF est assemblé à part : les entrées portent des décalages
  // depuis son début, qu'on ne connaît qu'une fois tout posé.
  const tiff: number[] = [];
  const t8 = (n: number) => tiff.push(n & 0xff);
  const t16 = (n: number) =>
    petitBoutiste ? (t8(n), t8(n >> 8)) : (t8(n >> 8), t8(n));
  const t32 = (n: number) =>
    petitBoutiste
      ? (t8(n), t8(n >> 8), t8(n >> 16), t8(n >> 24))
      : (t8(n >> 24), t8(n >> 16), t8(n >> 8), t8(n));

  t16(petitBoutiste ? 0x4949 : 0x4d4d);
  t16(0x002a);
  t32(8); // IFD0 juste après l'en-tête

  const aExif = champs.date !== undefined;
  const aGps = champs.lat !== undefined && champs.lon !== undefined;
  const nIfd0 = (aExif ? 1 : 0) + (aGps ? 1 : 0);

  // IFD0 : les deux pointeurs, puis le décalage du bloc de données.
  const finIfd0 = 8 + 2 + nIfd0 * 12 + 4;
  let curseur = finIfd0;
  const posExifIfd = curseur;
  const dateAscii = champs.date ?? "";
  if (aExif) curseur += 2 + 12 + 4 + dateAscii.length + 1;
  const posGpsIfd = curseur;

  t16(nIfd0);
  if (aExif) {
    t16(0x8769);
    t16(4);
    t32(1);
    t32(posExifIfd);
  }
  if (aGps) {
    t16(0x8825);
    t16(4);
    t32(1);
    t32(posGpsIfd);
  }
  t32(0);

  if (aExif) {
    const posDate = posExifIfd + 2 + 12 + 4;
    t16(1);
    t16(0x9003);
    t16(2);
    t32(dateAscii.length + 1);
    t32(posDate);
    t32(0);
    for (const c of dateAscii) t8(c.charCodeAt(0));
    t8(0);
  }

  if (aGps) {
    // Quatre entrées, puis les deux triplets de rationnels. Les RÉFÉRENCES
    // (« N », « S ») tiennent en deux octets : le format les écrit DANS
    // l'entrée, pas à un décalage — c'est ce que font les vrais appareils.
    const posDonnees = posGpsIfd + 2 + 4 * 12 + 4;
    const posLat = posDonnees;
    const posLon = posLat + 24;
    const ref = (c: string) => {
      t8(c.charCodeAt(0));
      t8(0);
      t8(0);
      t8(0);
    };

    t16(4);
    t16(0x0001);
    t16(2);
    t32(2);
    ref(champs.latRef ?? "N");
    t16(0x0002);
    t16(5);
    t32(3);
    t32(posLat);
    t16(0x0003);
    t16(2);
    t32(2);
    ref(champs.lonRef ?? "E");
    t16(0x0004);
    t16(5);
    t32(3);
    t32(posLon);
    t32(0);

    for (const x of champs.lat!) {
      t32(Math.round(x * 1000));
      t32(1000);
    }
    for (const x of champs.lon!) {
      t32(Math.round(x * 1000));
      t32(1000);
    }
  }

  u16(0xffd8); // SOI — toujours gros-boutiste, c'est le format
  octets.length = 0;
  octets.push(0xff, 0xd8, 0xff, 0xe1);
  const longueur = 2 + 6 + tiff.length;
  octets.push((longueur >> 8) & 0xff, longueur & 0xff);
  for (const c of "Exif") octets.push(c.charCodeAt(0));
  octets.push(0, 0);
  octets.push(...tiff);
  return new Uint8Array(octets).buffer;
}

describe("lireExif", () => {
  it("lit l'instant du DÉCLENCHEMENT", () => {
    const { priseLe } = lireExif(jpegAvecExif({ date: "2026:06:14 05:30:00" }));
    // L'EXIF n'a pas de fuseau : cette heure est celle de l'appareil, donc
    // l'heure LOCALE. La déclarer UTC décalerait une photo de midi.
    expect(priseLe).toBe(new Date(2026, 5, 14, 5, 30, 0).getTime());
  });

  it("lit la position, et la signe par sa référence", () => {
    const nord = lireExif(
      jpegAvecExif({ lat: [45, 12, 30], latRef: "N", lon: [6, 30, 0], lonRef: "E" }),
    );
    expect(nord.gps!.lat).toBeCloseTo(45 + 12 / 60 + 30 / 3600, 6);
    expect(nord.gps!.lon).toBeCloseTo(6.5, 6);

    const sud = lireExif(
      jpegAvecExif({ lat: [21, 6, 0], latRef: "S", lon: [55, 30, 0], lonRef: "W" }),
    );
    expect(sud.gps!.lat).toBeCloseTo(-21.1, 6);
    expect(sud.gps!.lon).toBeCloseTo(-55.5, 6);
  });

  it("lit les deux ordres d'octets", () => {
    for (const petit of [true, false]) {
      const r = lireExif(jpegAvecExif({ date: "2026:06:14 05:30:00" }, petit));
      expect(r.priseLe, String(petit)).not.toBeNull();
    }
  });

  it("lit date ET position dans le même fichier", () => {
    const r = lireExif(
      jpegAvecExif({ date: "2026:08:20 06:00:00", lat: [44, 54, 0], lon: [6, 18, 0] }),
    );
    expect(r.priseLe).not.toBeNull();
    expect(r.gps!.lat).toBeCloseTo(44.9, 6);
  });

  it("UNE PHOTO SANS EXIF N'EST PAS UNE ERREUR", () => {
    // Une capture d'écran, une image recompressée par une messagerie, un PNG
    // n'en portent pas : la bibliothèque doit s'en passer.
    expect(lireExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer)).toEqual({
      priseLe: null,
      gps: null,
    });
    expect(lireExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toEqual({
      priseLe: null,
      gps: null,
    });
    expect(lireExif(new ArrayBuffer(0))).toEqual({ priseLe: null, gps: null });
  });

  it("un fichier TRONQUÉ ne jette pas", () => {
    const complet = new Uint8Array(jpegAvecExif({ date: "2026:06:14 05:30:00" }));
    for (const taille of [8, 14, 20, 30, complet.length - 4]) {
      expect(() => lireExif(complet.slice(0, taille).buffer)).not.toThrow();
    }
  });

  it("écarte une position hors du monde", () => {
    expect(lireExif(jpegAvecExif({ lat: [200, 0, 0], lon: [6, 0, 0] })).gps).toBeNull();
  });
});
