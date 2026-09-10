import { describe, expect, it } from "vitest";

import { depaqueter, empaqueter, type MediaEmporte } from "./fichier.ts";
import { instancier } from "./modeles.ts";
import { SCHEMA } from "./types.ts";
import type { Media, Projet } from "./types.ts";
import { ecrireZip, lireZip } from "./zip.ts";

const MEDIA: Media = {
  id: "media-1",
  nom: "col.jpg",
  largeur: 4032,
  hauteur: 3024,
  priseLe: 1_700_000_000_000,
  gps: { lat: 45.1, lon: 6.3 },
};

function projet(): Projet {
  const maintenant = new Date().toISOString();
  return {
    schema: SCHEMA,
    id: "projet-1",
    nom: "Écrins 2026",
    creeLe: maintenant,
    modifieLe: maintenant,
    format: "carrousel",
    theme: "sombre",
    bilan: "apres",
    donnees: { trace: null, coupures: [], etiquettes: [], traceCadrage: null, seance: null },
    medias: [MEDIA],
    planches: [instancier("texte")],
  };
}

const octets = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const emporte = (): MediaEmporte[] => [{ media: MEDIA, type: "image/jpeg", octets: octets() }];

describe("empaqueter", () => {
  it("range le manifeste et une photo par média", async () => {
    const entrees = lireZip(await empaqueter(projet(), emporte()));
    expect([...entrees.keys()]).toEqual(["studio.json", "medias/media-1.jpg"]);
  });

  it("dégonfle le manifeste et laisse la photo telle quelle", async () => {
    const entrees = lireZip(await empaqueter(projet(), emporte()));
    expect(entrees.get("studio.json")!.methode).toBe(8);
    expect(entrees.get("medias/media-1.jpg")!.methode).toBe(0);
  });
});

describe("depaqueter", () => {
  it("rend le projet et ses octets intacts", async () => {
    const { projet: relu, medias } = await depaqueter(await empaqueter(projet(), emporte()));
    expect(relu.nom).toBe("Écrins 2026");
    expect(relu.planches.length).toBe(1);
    expect(medias).toHaveLength(1);
    expect(medias[0]!.media.id).toBe("media-1");
    expect(medias[0]!.octets).toEqual(octets());
  });

  it("ouvre quand même quand une photo manque", async () => {
    const p = projet();
    const paquet = await empaqueter(p, []);
    const { projet: relu, medias } = await depaqueter(paquet);
    expect(relu.nom).toBe("Écrins 2026");
    expect(medias).toHaveLength(0);
  });

  it("refuse une archive qui n'est pas du studio", async () => {
    const zip = ecrireZip([{ nom: "autre.txt", donnees: new Uint8Array([1]) }]);
    await expect(depaqueter(zip)).rejects.toThrow(/studio\.json/);
  });
});
