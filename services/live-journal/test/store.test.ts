// Store : projection, stabilité des ids, tombstones, atomicité, anneau de dédup,
// drapeau vidéo appliqué à la (re)projection, ULID triable.

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { JournalStore } from "../src/journal/store";
import type { JournalEntry } from "../src/journal/types";
import { ulid } from "../src/utils";
import { makeConfig, readJournal } from "./helpers";

function entry(partial: Partial<JournalEntry> & { id: string; ts: string }): JournalEntry {
  return { type: "text", ...partial };
}

function makeRawStore(videoEnabled = false) {
  const config = makeConfig({ videoEnabled });
  const store = new JournalStore({
    dataDir: config.dataDir,
    publicPrefix: config.publicPrefix,
    videoEnabled,
  });
  return { config, store };
}

describe("JournalStore", () => {
  it("projette au démarrage : journal.json existe même vide (Caddy a toujours à servir)", () => {
    const { config } = makeRawStore();
    const journal = readJournal(config);
    expect(journal).toMatchObject({ schemaVersion: 1, count: 0, entries: [] });
  });

  it("tri chronologique croissant par ts, quel que soit l'ordre d'arrivée", () => {
    const { config, store } = makeRawStore();
    store.append({ kind: "created", entry: entry({ id: "b", ts: "2026-08-21T10:00:00.000Z", text: "2e" }) });
    store.append({ kind: "created", entry: entry({ id: "a", ts: "2026-08-20T10:00:00.000Z", text: "1re" }) });
    const journal = readJournal(config);
    expect(journal.entries.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("édition : id stable, texte remplacé, editedAt ; suppression : tombstone", () => {
    const { config, store } = makeRawStore();
    store.append({ kind: "created", entry: entry({ id: "x", ts: "2026-08-20T10:00:00.000Z", text: "avant" }) });
    store.append({ kind: "edited", id: "x", text: "après", editedAt: "2026-08-20T11:00:00.000Z" });
    expect(readJournal(config).entries[0]).toMatchObject({ id: "x", text: "après", editedAt: "2026-08-20T11:00:00.000Z" });

    store.append({ kind: "deleted", id: "x", deletedAt: "2026-08-20T12:00:00.000Z" });
    expect(readJournal(config).count).toBe(0);
  });

  it("état rechargé depuis state.json : événements et dédup survivent au redémarrage", () => {
    const { config, store } = makeRawStore();
    store.append({
      kind: "created",
      entry: entry({ id: "x", ts: "2026-08-20T10:00:00.000Z", text: "persisté" }),
      telegram: { chatId: 1, messageId: 42 },
    });
    store.markProcessed(777);

    const reloaded = new JournalStore({
      dataDir: config.dataDir,
      publicPrefix: config.publicPrefix,
      videoEnabled: false,
    });
    expect(reloaded.entryCount()).toBe(1);
    expect(reloaded.hasProcessed(777)).toBe(true);
    expect(reloaded.findEntryIdByTelegram(1, 42)).toBe("x");
  });

  it("state.json d'une version inconnue : refus poli (erreur), pas de corruption", () => {
    const { config } = makeRawStore();
    const statePath = path.join(config.dataDir, "private", "state.json");
    fs.writeFileSync(statePath, JSON.stringify({ schemaVersion: 99, events: [] }));
    expect(
      () =>
        new JournalStore({ dataDir: config.dataDir, publicPrefix: "/journal", videoEnabled: false }),
    ).toThrow(/schemaVersion/);
  });

  it("drapeau vidéo : OFF exclut de la projection, ON republie au redémarrage", () => {
    const { config, store } = makeRawStore(false);
    store.append({
      kind: "created",
      entry: entry({ id: "v", ts: "2026-08-20T10:00:00.000Z", type: "video", media: { url: "/journal/media/vi-a.mp4" } }),
    });
    expect(readJournal(config).count).toBe(0);

    new JournalStore({ dataDir: config.dataDir, publicPrefix: "/journal", videoEnabled: true });
    expect(readJournal(config).count).toBe(1); // republication automatique à l'activation
  });

  it("anneau de dédup borné : les plus anciens update_id sont évincés", () => {
    const { store } = makeRawStore();
    for (let i = 0; i < 5100; i++) store.markProcessed(i);
    expect(store.hasProcessed(0)).toBe(false);
    expect(store.hasProcessed(5099)).toBe(true);
  });

  it("écriture atomique : pas de .tmp résiduel, JSON toujours valide", () => {
    const { config, store } = makeRawStore();
    store.append({ kind: "created", entry: entry({ id: "x", ts: "2026-08-20T10:00:00.000Z" }) });
    const publicDir = path.join(config.dataDir, "public");
    expect(fs.readdirSync(publicDir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    expect(() => readJournal(config)).not.toThrow();
  });
});

describe("ulid", () => {
  it("26 caractères Crockford, unique, triable par temps", () => {
    const a = ulid(1_000_000);
    const b = ulid(2_000_000);
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(a < b).toBe(true);
    const many = new Set(Array.from({ length: 1000 }, () => ulid()));
    expect(many.size).toBe(1000);
  });
});
