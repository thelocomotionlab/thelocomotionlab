// Cœur du service : un update Telegram → la matrice des cas (docs/live-pr1-plan.md §6)
// → événements du journal + confirmation au terrain. Testé unitairement avec des
// dépendances injectées (API Telegram et pipeline médias factices).

import type { Config } from "../config";
import { formatDuration, safeExt, ulid } from "../utils";
import type { TelegramApi } from "../telegram/api";
import type { TgMessage, TgPhotoSize, TgUpdate } from "../telegram/types";
import type { JournalStore } from "./store";
import type { EntryMedia, JournalEntry } from "./types";

/** Pipeline médias injectable (réel : sharp + ffmpeg ; tests : factice). */
export interface MediaPipeline {
  processPhoto(source: Buffer): Promise<{ fileName: string; width: number; height: number }>;
  processAudio(source: Buffer, sourceExt: string): Promise<{ fileName: string; duration: number }>;
  processVideo(
    source: Buffer,
    sourceExt: string,
  ): Promise<{ fileName: string; duration?: number; width?: number; height?: number }>;
}

export interface IngestDeps {
  store: JournalStore;
  telegram: TelegramApi;
  media: MediaPipeline;
  config: Config;
}

// Réponses du bot — les textes exacts de la matrice validée.
const REPLIES = {
  publishedText: "✓ Publié",
  publishedPhoto: "✓ Publié (photo)",
  publishedAudio: (duration: number) => `✓ Publié (vocal, ${formatDuration(duration)})`,
  publishedVideo: "✓ Publié (vidéo)",
  ingestedVideo: "✓ Reçue (publiée quand la vidéo sera activée)",
  tooBig: "✗ Trop lourd pour l'API (> 20 Mo)",
  failure: "✗ Échec du traitement, renvoie-le",
  deleted: "🗑 Supprimé",
  deleteUsage: "Réponds à l'entrée à supprimer avec /supprimer",
  deleteNotFound: "Je ne retrouve pas cette entrée.",
  purgeConfirm:
    "⚠️ /purger efface TOUT le carnet de bord (irréversible). Pour confirmer, envoie : /purger confirmer",
  purgeEmpty: "Le carnet est déjà vide.",
  purged: (n: number) => `🧹 Carnet vidé — ${n} entrée${n > 1 ? "s" : ""} supprimée${n > 1 ? "s" : ""}.`,
  unknownType: "Type non géré — rien n'a été publié",
  help: [
    "Journal de bord du live — envoie simplement :",
    "• un texte, une photo (légende possible), un vocal ou une vidéo (≤ 20 Mo) ;",
    "• corrige une entrée en éditant ton message ;",
    "• supprime-la en lui répondant /supprimer ;",
    "• vide TOUT le carnet avec /purger confirmer.",
  ].join("\n"),
} as const;

// Compteurs anonymes (observabilité sans contenu).
export const counters = {
  published: 0,
  edited: 0,
  deleted: 0,
  ignoredForeignChat: 0,
  ignoredDuplicate: 0,
  ignoredUnknown: 0,
  failures: 0,
};

function log(message: string): void {
  console.log(new Date().toISOString(), `[ingest] ${message}`);
}

/** Plus grande taille de photo téléchargeable (Telegram trie par taille croissante). */
function pickPhotoSize(sizes: TgPhotoSize[], maxBytes: number): TgPhotoSize | undefined {
  const candidates = sizes.filter((s) => s.file_size === undefined || s.file_size <= maxBytes);
  return candidates.length > 0 ? candidates[candidates.length - 1] : undefined;
}

function entryTs(message: TgMessage): string {
  return new Date(message.date * 1000).toISOString();
}

function cleanText(message: TgMessage): string | undefined {
  const raw = (message.text ?? message.caption ?? "").trim();
  return raw.length > 0 ? raw : undefined;
}

export async function handleUpdate(update: TgUpdate, deps: IngestDeps): Promise<void> {
  const { store, telegram, config } = deps;

  const message = update.message ?? update.edited_message;
  if (!message) {
    counters.ignoredUnknown += 1;
    return;
  }

  // ① Idempotence : Telegram rejoue un update tant qu'il n'a pas eu de 200.
  if (store.hasProcessed(update.update_id)) {
    counters.ignoredDuplicate += 1;
    return;
  }

  // ② Seul Valentin alimente le journal. Tout autre chat est ignoré en silence
  //    (200 pour ne pas déclencher de retries) — compteur anonyme uniquement.
  if (String(message.chat.id) !== String(config.telegram.valentinChatId)) {
    counters.ignoredForeignChat += 1;
    store.markProcessed(update.update_id);
    return;
  }

  // ③ Marqué traité AVANT le traitement : en cas d'échec on répond « renvoie-le »
  //    plutôt que de risquer un doublon au retry (décision du plan §6).
  store.markProcessed(update.update_id);

  const reply = async (text: string) => {
    try {
      await telegram.sendMessage(message.chat.id, text, message.message_id);
    } catch (err) {
      log(`réponse bot impossible : ${(err as Error).message}`);
    }
  };

  try {
    if (update.edited_message) {
      await handleEdit(update.edited_message, deps);
      return;
    }

    const text = message.text?.trim();

    // Commandes.
    if (text && text.startsWith("/")) {
      const command = text.split(/\s/)[0].toLowerCase();
      if (command === "/supprimer") {
        await handleDelete(message, deps, reply);
      } else if (command === "/purger") {
        await handlePurge(message, deps, reply);
      } else {
        await reply(REPLIES.help);
      }
      return;
    }

    // Contenus.
    if (message.photo && message.photo.length > 0) {
      await handlePhoto(message, deps, reply);
    } else if (message.voice || message.audio) {
      await handleAudio(message, deps, reply);
    } else if (message.video || message.video_note) {
      await handleVideo(message, deps, reply);
    } else if (message.document?.mime_type?.startsWith("image/")) {
      await handleDocumentPhoto(message, deps, reply);
    } else if (text) {
      createEntry(deps, message, { type: "text" });
      log("entrée texte publiée");
      await reply(REPLIES.publishedText);
    } else {
      counters.ignoredUnknown += 1;
      await reply(REPLIES.unknownType);
    }
  } catch (err) {
    counters.failures += 1;
    log(`échec de traitement : ${(err as Error).message}`);
    await reply(REPLIES.failure);
  }
}

function createEntry(
  deps: IngestDeps,
  message: TgMessage,
  fields: Pick<JournalEntry, "type"> & { media?: EntryMedia },
): void {
  const entry: JournalEntry = {
    id: ulid(),
    ts: entryTs(message),
    type: fields.type,
  };
  const text = cleanText(message);
  if (text) entry.text = text;
  if (fields.media) entry.media = fields.media;
  if (message.media_group_id) entry.mediaGroupId = message.media_group_id;

  deps.store.append({
    kind: "created",
    entry,
    telegram: { chatId: message.chat.id, messageId: message.message_id },
  });
  counters.published += 1;
}

async function downloadByFileId(deps: IngestDeps, fileId: string): Promise<Buffer> {
  const file = await deps.telegram.getFile(fileId);
  if (!file.file_path) throw new Error("getFile sans file_path");
  return deps.telegram.downloadFile(file.file_path, deps.config.media.maxDownloadBytes);
}

async function handlePhoto(
  message: TgMessage,
  deps: IngestDeps,
  reply: (text: string) => Promise<void>,
): Promise<void> {
  const size = pickPhotoSize(message.photo ?? [], deps.config.media.maxDownloadBytes);
  if (!size) {
    await reply(REPLIES.tooBig);
    return;
  }
  const source = await downloadByFileId(deps, size.file_id);
  const processed = await deps.media.processPhoto(source);
  createEntry(deps, message, {
    type: "photo",
    media: {
      url: deps.store.mediaUrl(processed.fileName),
      width: processed.width,
      height: processed.height,
    },
  });
  log("entrée photo publiée");
  await reply(REPLIES.publishedPhoto);
}

async function handleDocumentPhoto(
  message: TgMessage,
  deps: IngestDeps,
  reply: (text: string) => Promise<void>,
): Promise<void> {
  const doc = message.document;
  if (!doc) return;
  if (doc.file_size !== undefined && doc.file_size > deps.config.media.maxDownloadBytes) {
    await reply(REPLIES.tooBig);
    return;
  }
  const source = await downloadByFileId(deps, doc.file_id);
  const processed = await deps.media.processPhoto(source);
  createEntry(deps, message, {
    type: "photo",
    media: {
      url: deps.store.mediaUrl(processed.fileName),
      width: processed.width,
      height: processed.height,
    },
  });
  log("entrée photo (document) publiée");
  await reply(REPLIES.publishedPhoto);
}

async function handleAudio(
  message: TgMessage,
  deps: IngestDeps,
  reply: (text: string) => Promise<void>,
): Promise<void> {
  const media = message.voice ?? message.audio;
  if (!media) return;
  if (media.file_size !== undefined && media.file_size > deps.config.media.maxDownloadBytes) {
    await reply(REPLIES.tooBig);
    return;
  }
  const file = await deps.telegram.getFile(media.file_id);
  if (!file.file_path) throw new Error("getFile sans file_path");
  const source = await deps.telegram.downloadFile(file.file_path, deps.config.media.maxDownloadBytes);
  // Voix Telegram = .oga (Opus) ; on garde l'extension réelle pour la source conservée.
  const ext = message.voice ? ".oga" : safeExt(file.file_path,".oga");
  const processed = await deps.media.processAudio(source, ext);
  const duration = processed.duration > 0 ? processed.duration : media.duration;
  createEntry(deps, message, {
    type: "audio",
    media: { url: deps.store.mediaUrl(processed.fileName), duration },
  });
  log("entrée vocal publiée");
  await reply(REPLIES.publishedAudio(duration));
}

async function handleVideo(
  message: TgMessage,
  deps: IngestDeps,
  reply: (text: string) => Promise<void>,
): Promise<void> {
  const media = message.video ?? message.video_note;
  if (!media) return;
  if (media.file_size !== undefined && media.file_size > deps.config.media.maxDownloadBytes) {
    await reply(REPLIES.tooBig);
    return;
  }
  const file = await deps.telegram.getFile(media.file_id);
  if (!file.file_path) throw new Error("getFile sans file_path");
  const source = await deps.telegram.downloadFile(file.file_path, deps.config.media.maxDownloadBytes);
  const processed = await deps.media.processVideo(source, safeExt(file.file_path,".mp4"));

  const entryMedia: EntryMedia = { url: deps.store.mediaUrl(processed.fileName) };
  if (processed.duration !== undefined) entryMedia.duration = processed.duration;
  else if ("duration" in media) entryMedia.duration = media.duration;
  if (processed.width !== undefined) entryMedia.width = processed.width;
  if (processed.height !== undefined) entryMedia.height = processed.height;

  // Toujours ingérée (l'événement existe, le fichier est prêt) ; la PROJECTION
  // décide de la publication selon le drapeau — activation = republication auto.
  createEntry(deps, message, { type: "video", media: entryMedia });
  log(`entrée vidéo ingérée (drapeau ${deps.config.videoEnabled ? "ON" : "OFF"})`);
  await reply(deps.config.videoEnabled ? REPLIES.publishedVideo : REPLIES.ingestedVideo);
}

async function handleEdit(message: TgMessage, deps: IngestDeps): Promise<void> {
  const entryId = deps.store.findEntryIdByTelegram(message.chat.id, message.message_id);
  if (!entryId) {
    // Édition d'un message qui n'a pas produit d'entrée (commande, type ignoré…).
    counters.ignoredUnknown += 1;
    return;
  }
  const text = cleanText(message);
  deps.store.append({
    kind: "edited",
    id: entryId,
    text: text ?? "",
    editedAt: new Date().toISOString(),
  });
  counters.edited += 1;
  log("entrée corrigée (edited_message)");
  // Pas de réponse : l'édition est déjà visible dans Telegram.
}

async function handleDelete(
  message: TgMessage,
  deps: IngestDeps,
  reply: (text: string) => Promise<void>,
): Promise<void> {
  const target = message.reply_to_message;
  if (!target) {
    await reply(REPLIES.deleteUsage);
    return;
  }
  const entryId = deps.store.findEntryIdByTelegram(message.chat.id, target.message_id);
  if (!entryId) {
    await reply(REPLIES.deleteNotFound);
    return;
  }
  deps.store.append({ kind: "deleted", id: entryId, deletedAt: new Date().toISOString() });
  counters.deleted += 1;
  log("entrée supprimée (/supprimer)");
  await reply(REPLIES.deleted);
}

/** /purger — vide TOUT le carnet (utile après un test). Garde-fou : exige
 *  « /purger confirmer » pour éviter l'effacement accidentel. */
async function handlePurge(
  message: TgMessage,
  deps: IngestDeps,
  reply: (text: string) => Promise<void>,
): Promise<void> {
  const arg = (message.text ?? "").trim().split(/\s+/)[1]?.toLowerCase();
  if (arg !== "confirmer") {
    await reply(REPLIES.purgeConfirm);
    return;
  }
  const removed = deps.store.purgeAll();
  counters.deleted += removed;
  log(`carnet purgé (${removed} entrées, /purger)`);
  await reply(removed > 0 ? REPLIES.purged(removed) : REPLIES.purgeEmpty);
}
