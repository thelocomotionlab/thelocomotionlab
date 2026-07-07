// La matrice des cas Telegram (docs/live-pr1-plan.md §6), testée sur le vrai
// pipeline (store réel sur répertoire temporaire, Telegram + médias factices).

import { beforeEach, describe, expect, it } from "vitest";

import { handleUpdate, type IngestDeps } from "../src/journal/ingest";
import {
  makeConfig,
  makeMedia,
  makeStore,
  makeTelegram,
  readJournal,
  resetIds,
  update,
  VALENTIN_CHAT_ID,
  type RecordingTelegram,
} from "./helpers";
import type { Config } from "../src/config";

let config: Config;
let telegram: RecordingTelegram;
let deps: IngestDeps;

beforeEach(() => {
  resetIds();
  config = makeConfig();
  telegram = makeTelegram();
  deps = { store: makeStore(config), telegram, media: makeMedia(), config };
});

describe("matrice Telegram — créations", () => {
  it("texte → entrée text + « ✓ Publié »", async () => {
    await handleUpdate(update({ text: "Col franchi, gros vent." }), deps);
    const journal = readJournal(config);
    expect(journal.count).toBe(1);
    expect(journal.entries[0]).toMatchObject({ type: "text", text: "Col franchi, gros vent." });
    expect(journal.entries[0].id).toBeTruthy();
    expect(journal.entries[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(telegram.sent).toHaveLength(1);
    expect(telegram.sent[0].text).toBe("✓ Publié");
  });

  it("photo + caption → entrée photo (plus grande taille), caption = légende", async () => {
    await handleUpdate(
      update({
        caption: "Crête de l'Aup Martin",
        photo: [
          { file_id: "small", width: 320, height: 240, file_size: 20_000 },
          { file_id: "big", width: 2560, height: 1920, file_size: 400_000 },
        ],
      }),
      deps,
    );
    const entry = readJournal(config).entries[0];
    expect(entry).toMatchObject({
      type: "photo",
      text: "Crête de l'Aup Martin",
      media: { url: "/journal/media/ph-test1.webp", width: 1600, height: 1200 },
    });
    expect(telegram.sent[0].text).toBe("✓ Publié (photo)");
  });

  it("vocal → entrée audio avec durée + confirmation parlante", async () => {
    await handleUpdate(update({ voice: { file_id: "v1", duration: 100 } }), deps);
    const entry = readJournal(config).entries[0];
    expect(entry).toMatchObject({
      type: "audio",
      media: { url: "/journal/media/au-test1.m4a", duration: 102 },
    });
    expect(telegram.sent[0].text).toBe("✓ Publié (vocal, 1 min 42)");
  });

  it("document image/* → pipeline photo", async () => {
    await handleUpdate(
      update({ document: { file_id: "d1", mime_type: "image/jpeg", file_size: 5_000_000 } }),
      deps,
    );
    expect(readJournal(config).entries[0].type).toBe("photo");
  });

  it("album : une entrée par photo, media_group_id stocké sans regroupement", async () => {
    await handleUpdate(
      update({ media_group_id: "g1", caption: "légende", photo: [{ file_id: "a", width: 100, height: 100 }] }),
      deps,
    );
    await handleUpdate(
      update({ media_group_id: "g1", photo: [{ file_id: "b", width: 100, height: 100 }] }),
      deps,
    );
    const journal = readJournal(config);
    expect(journal.count).toBe(2);
    expect(journal.entries[0]).toMatchObject({ mediaGroupId: "g1", text: "légende" });
    expect(journal.entries[1].mediaGroupId).toBe("g1");
    expect(journal.entries[1].text).toBeUndefined(); // la légende reste sur la photo qui la porte
  });
});

describe("matrice Telegram — vidéo et drapeau", () => {
  it("vidéo drapeau OFF : ingérée mais absente du journal, réponse « en attente »", async () => {
    await handleUpdate(
      update({ video: { file_id: "vid", duration: 22, width: 1280, height: 720, file_size: 9_000_000 } }),
      deps,
    );
    expect(readJournal(config).count).toBe(0); // pas publiée
    expect(deps.store.entryCount()).toBe(1); // mais bien ingérée
    expect(telegram.sent[0].text).toBe("✓ Reçue (publiée quand la vidéo sera activée)");
  });

  it("vidéo drapeau ON : publiée avec dimensions et durée", async () => {
    config = makeConfig({ videoEnabled: true });
    deps = { store: makeStore(config), telegram, media: makeMedia(), config };
    await handleUpdate(
      update({ video: { file_id: "vid", duration: 22, width: 1280, height: 720 } }),
      deps,
    );
    const entry = readJournal(config).entries[0];
    expect(entry).toMatchObject({
      type: "video",
      media: { duration: 22, width: 1280, height: 720 },
    });
    expect(telegram.sent[0].text).toBe("✓ Publié (vidéo)");
  });

  it("vidéo > 20 Mo : refus propre, rien d'ingéré", async () => {
    await handleUpdate(
      update({ video: { file_id: "huge", duration: 60, width: 1920, height: 1080, file_size: 25_000_000 } }),
      deps,
    );
    expect(deps.store.entryCount()).toBe(0);
    expect(telegram.sent[0].text).toBe("✗ Trop lourd pour l'API (> 20 Mo)");
  });
});

describe("matrice Telegram — édition et suppression", () => {
  it("edited_message : texte corrigé, id stable, editedAt posé, pas de réponse bot", async () => {
    await handleUpdate(update({ message_id: 10, text: "Depart du refuge" }), deps);
    const idAvant = readJournal(config).entries[0].id;
    telegram.sent = [];

    await handleUpdate(update({ message_id: 10, text: "Départ du refuge" }, { edited: true }), deps);
    const entry = readJournal(config).entries[0];
    expect(entry.id).toBe(idAvant);
    expect(entry.text).toBe("Départ du refuge");
    expect(entry.editedAt).toBeTruthy();
    expect(telegram.sent).toHaveLength(0);
  });

  it("edited_message d'une caption de photo", async () => {
    await handleUpdate(
      update({ message_id: 11, caption: "legende", photo: [{ file_id: "p", width: 10, height: 10 }] }),
      deps,
    );
    await handleUpdate(update({ message_id: 11, caption: "légende corrigée" }, { edited: true }), deps);
    expect(readJournal(config).entries[0].text).toBe("légende corrigée");
  });

  it("/supprimer en réponse : tombstone + « 🗑 Supprimé »", async () => {
    await handleUpdate(update({ message_id: 20, text: "à supprimer" }), deps);
    await handleUpdate(
      update({
        text: "/supprimer",
        reply_to_message: { message_id: 20, date: 0, chat: { id: VALENTIN_CHAT_ID, type: "private" } },
      }),
      deps,
    );
    expect(readJournal(config).count).toBe(0);
    expect(telegram.sent[1].text).toBe("🗑 Supprimé");
  });

  it("/supprimer sans réponse : mode d'emploi, rien de supprimé", async () => {
    await handleUpdate(update({ text: "entrée" }), deps);
    await handleUpdate(update({ text: "/supprimer" }), deps);
    expect(readJournal(config).count).toBe(1);
    expect(telegram.sent[1].text).toBe("Réponds à l'entrée à supprimer avec /supprimer");
  });

  it("/supprimer sur un message inconnu : « Je ne retrouve pas cette entrée. »", async () => {
    await handleUpdate(
      update({
        text: "/supprimer",
        reply_to_message: { message_id: 999, date: 0, chat: { id: VALENTIN_CHAT_ID, type: "private" } },
      }),
      deps,
    );
    expect(telegram.sent[0].text).toBe("Je ne retrouve pas cette entrée.");
  });
});

describe("matrice Telegram — garde-fous", () => {
  it("chat étranger : ignoré en silence, rien de publié, aucune réponse", async () => {
    await handleUpdate(
      update({ text: "spam", chat: { id: 666, type: "private" } }),
      deps,
    );
    expect(readJournal(config).count).toBe(0);
    expect(telegram.sent).toHaveLength(0);
  });

  it("update_id dupliqué (retry Telegram) : une seule entrée", async () => {
    const u = update({ text: "une fois" });
    await handleUpdate(u, deps);
    await handleUpdate(u, deps);
    expect(readJournal(config).count).toBe(1);
    expect(telegram.sent).toHaveLength(1);
  });

  it("type inconnu (sticker) : rien publié + « Type non géré »", async () => {
    await handleUpdate(update({ sticker: { file_id: "s" } }), deps);
    expect(readJournal(config).count).toBe(0);
    expect(telegram.sent[0].text).toBe("Type non géré — rien n'a été publié");
  });

  it("commande inconnue ou /aide : mini-aide", async () => {
    await handleUpdate(update({ text: "/aide" }), deps);
    expect(telegram.sent[0].text).toContain("Journal de bord du live");
  });

  it("échec de téléchargement : « ✗ Échec du traitement, renvoie-le », rien de publié", async () => {
    telegram.getFile = async () => {
      throw new Error("réseau KO");
    };
    await handleUpdate(update({ voice: { file_id: "v", duration: 3 } }), deps);
    expect(readJournal(config).count).toBe(0);
    expect(telegram.sent[0].text).toBe("✗ Échec du traitement, renvoie-le");
  });
});
