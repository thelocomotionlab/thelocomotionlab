// Export d'archive : conformité au contrat docs/live-tracking.md §15
// (option A : littéraux français + champs additifs optionnels), chat[] vide
// par construction, validation bloquante.

import { describe, expect, it } from "vitest";

import { buildArchive, validateArchive, type ArchiveFile } from "../src/export/archive";
import type { JournalEntry } from "../src/journal/types";

const META = {
  slug: "tour-des-ecrins-2026",
  nom: "Tour des Écrins en autonomie",
  dateDebut: "2026-08-20",
  dateFin: "2026-08-24",
  distanceKm: 194,
  denivelePositifM: 12000,
};

const LIVE_POSITIONS = {
  stats: {
    distance: 194230.4,
    dplus: 12040.2,
    dminus: 12080.9,
    durationSeconds: 375600,
    lastFixTime: "2026-08-24T05:41:00.000Z",
  },
  profile: [
    { idx: 0, fixTime: "2026-08-20T04:00:12.000Z", latitude: 44.9182, longitude: 6.3021, alt: 1450.2, distMeters: 0 },
    { idx: 1, fixTime: "2026-08-20T04:01:12.000Z", latitude: 44.919, longitude: 6.303, alt: 1460, distMeters: 120.6 },
    { idx: 2, fixTime: null, latitude: null, longitude: null }, // point invalide → écarté
  ],
};

function entry(partial: Partial<JournalEntry> & { id: string; ts: string; type: JournalEntry["type"] }): JournalEntry {
  return { ...partial } as JournalEntry;
}

const JOURNAL = {
  entries: [
    entry({ id: "e1", ts: "2026-08-20T05:00:00.000Z", type: "text", text: "Départ." }),
    entry({
      id: "e2",
      ts: "2026-08-21T11:42:00.000Z",
      type: "photo",
      text: "Col franchi.",
      media: { url: "/journal/media/ph-abc123.webp", width: 1600, height: 1200 },
      editedAt: "2026-08-21T12:00:00.000Z",
    }),
    entry({
      id: "e3",
      ts: "2026-08-22T09:00:00.000Z",
      type: "audio",
      media: { url: "/journal/media/au-def456.m4a", duration: 102 },
    }),
    entry({
      id: "e4",
      ts: "2026-08-23T18:00:00.000Z",
      type: "video",
      media: { url: "/journal/media/vi-ghi789.mp4", duration: 22, width: 1280, height: 720 },
    }),
  ],
};

describe("buildArchive — mapping option A", () => {
  const { archive, media } = buildArchive({ meta: META, livePositions: LIVE_POSITIONS, journal: JOURNAL });

  it("littéraux français + champs additifs, texte = corps ou légende", () => {
    expect(archive.journal.map((e) => e.type)).toEqual(["texte", "photo", "audio", "video"]);
    expect(archive.journal[0]).toMatchObject({ time: "2026-08-20T05:00:00.000Z", texte: "Départ.", id: "e1" });
    expect(archive.journal[1]).toMatchObject({
      texte: "Col franchi.",
      media: "journal/ph-abc123.webp",
      largeur: 1600,
      hauteur: 1200,
      edite: true,
    });
    expect(archive.journal[2]).toMatchObject({ media: "journal/au-def456.m4a", duree: 102 });
    expect(archive.journal[2].edite).toBeUndefined();
  });

  it("liste des médias à copier (URL vivante → journal/<fichier>)", () => {
    expect(media).toEqual([
      { fromUrl: "/journal/media/ph-abc123.webp", to: "journal/ph-abc123.webp" },
      { fromUrl: "/journal/media/au-def456.m4a", to: "journal/au-def456.m4a" },
      { fromUrl: "/journal/media/vi-ghi789.mp4", to: "journal/vi-ghi789.mp4" },
    ]);
  });

  it("positions : forme du contrat, arrondis, points invalides écartés, ré-indexées", () => {
    expect(archive.positions).toHaveLength(2);
    expect(archive.positions[1]).toEqual({
      idx: 1,
      fixTime: "2026-08-20T04:01:12.000Z",
      latitude: 44.919,
      longitude: 6.303,
      altitude: 1460,
      distance: 121,
    });
  });

  it("stats arrondies, chat STRICTEMENT vide, schemaVersion 1", () => {
    expect(archive.stats).toEqual({
      distance: 194230,
      dplus: 12040,
      dminus: 12081,
      durationSeconds: 375600,
      lastFixTime: "2026-08-24T05:41:00.000Z",
    });
    expect(archive.chat).toEqual([]);
    expect(archive.schemaVersion).toBe(1);
  });

  it("l'archive produite est conforme au contrat", () => {
    expect(validateArchive(archive)).toEqual([]);
  });
});

describe("validateArchive — garde-fous", () => {
  const { archive } = buildArchive({ meta: META, livePositions: LIVE_POSITIONS, journal: JOURNAL });

  it("refuse meta incomplète, positions vides, chat non vide, type inconnu", () => {
    expect(validateArchive({ ...archive, meta: { ...META, slug: "" } })).not.toEqual([]);
    expect(validateArchive({ ...archive, positions: [] })).not.toEqual([]);
    expect(
      validateArchive({ ...archive, chat: [{ pseudo: "x" }] as never }),
    ).toContainEqual(expect.stringContaining("chat doit rester VIDE"));
    expect(
      validateArchive({
        ...archive,
        journal: [{ time: "2026-08-20T05:00:00Z", type: "selfie" }] as never,
      }),
    ).toContainEqual(expect.stringContaining("type de journal inconnu"));
  });

  it("refuse un média hors de journal/", () => {
    const bad = {
      ...archive,
      journal: [{ time: "2026-08-20T05:00:00Z", type: "photo", media: "../secret.webp" }],
    } as ArchiveFile;
    expect(validateArchive(bad)).toContainEqual(expect.stringContaining("media hors de journal/"));
  });
});
