import { describe, expect, it } from "vitest";

import { indexDuMedia, indexSuivant, mediasDuJournal } from "./journalMedias";

const ENTREES = [
  { id: "c", type: "photo", text: "Le col", media: { url: "/journal/media/c.webp", width: 1600, height: 1200 } },
  { id: "b", type: "text", text: "Rien à voir ici" },
  { id: "a", type: "video", media: { url: "/journal/media/a.mp4", width: 720, height: 1280, duration: 12 } },
];

describe("mediasDuJournal", () => {
  it("ne garde que les photos et vidéos, DANS L'ORDRE reçu", () => {
    const medias = mediasDuJournal(ENTREES, "https://api.test");
    expect(medias.map((m) => m.id)).toEqual(["c", "a"]);
    expect(medias[0].src).toBe("https://api.test/journal/media/c.webp");
    expect(medias[0].legende).toBe("Le col");
    expect(medias[1].type).toBe("video");
  });

  it("une entrée sans fichier n'entre pas dans la visionneuse", () => {
    // Sinon la flèche « suivant » ouvrirait un média vide : le compteur
    // annoncerait 4 images pour 3 réellement affichables.
    expect(mediasDuJournal([{ id: "x", type: "photo" }])).toEqual([]);
    expect(mediasDuJournal([{ id: "x", type: "photo", media: { url: "" } }])).toEqual([]);
  });

  it("légende et dimensions absentes ne cassent rien", () => {
    const [m] = mediasDuJournal([{ id: "x", type: "photo", media: { url: "/a.webp" } }]);
    expect(m.legende).toBe("");
    expect(m.width).toBeNull();
    expect(m.height).toBeNull();
  });

  it("entrées absentes ou d'un type inconnu : liste vide, aucun plantage", () => {
    expect(mediasDuJournal(undefined)).toEqual([]);
    expect(mediasDuJournal(null)).toEqual([]);
    expect(mediasDuJournal([{ id: "x", type: "audio", media: { url: "/a.m4a" } }])).toEqual([]);
  });
});

describe("indexDuMedia", () => {
  it("retrouve la position d'un média, −1 s'il n'y est pas", () => {
    const medias = mediasDuJournal(ENTREES);
    expect(indexDuMedia(medias, "a")).toBe(1);
    expect(indexDuMedia(medias, "inconnu")).toBe(-1);
    expect(indexDuMedia(undefined, "a")).toBe(-1);
  });
});

describe("indexSuivant", () => {
  it("boucle dans les deux sens", () => {
    expect(indexSuivant(0, 1, 3)).toBe(1);
    expect(indexSuivant(2, 1, 3)).toBe(0);
    expect(indexSuivant(0, -1, 3)).toBe(2);
  });

  it("un seul média : on reste dessus", () => {
    expect(indexSuivant(0, 1, 1)).toBe(0);
    expect(indexSuivant(0, -1, 1)).toBe(0);
  });

  it("liste vide : index 0, jamais NaN ni négatif", () => {
    expect(indexSuivant(0, 1, 0)).toBe(0);
    expect(indexSuivant(3, -1, undefined)).toBe(0);
  });
});
