// Outillage commun des tests : config de test, store sur répertoire temporaire,
// API Telegram enregistreuse et pipeline médias factice. AUCUN réseau, AUCUN ffmpeg.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Config } from "../src/config";
import type { MediaPipeline } from "../src/journal/ingest";
import { JournalStore } from "../src/journal/store";
import type { TelegramApi } from "../src/telegram/api";
import type { TgFile, TgUpdate } from "../src/telegram/types";

export const VALENTIN_CHAT_ID = 424242;

export function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "live-journal-test-")),
    publicPrefix: "/journal",
    allowedOrigins: ["https://thelocomotionlab.com", "https://www.thelocomotionlab.com"],
    message: {
      maxMessageLength: 1000,
      maxPrenomLength: 50,
      maxEmailLength: 254,
      ratePerMinute: 5,
      ratePerHour: 30,
      maxUploadBytes: 20 * 1024 * 1024,
    },
    media: { photoMaxWidth: 1600, photoQuality: 80, maxDownloadBytes: 20 * 1024 * 1024 },
    videoEnabled: false,
    og: { enabled: false, intervalMinutes: 3 },
    selfCheck: { enabled: true, intervalMinutes: 30, diskMinMb: 500 },
    siteBase: "http://site.test",
    trackingBase: "http://tracking.test",
    telegram: {
      mode: "webhook",
      apiBase: "https://api.telegram.invalid",
      botToken: "test-token",
      webhookSecret: "test-secret",
      valentinChatId: String(VALENTIN_CHAT_ID),
    },
    simulation: { enabled: false, gpxPath: "", scenarioPath: "" },
    ...overrides,
  };
}

export function makeStore(config: Config): JournalStore {
  return new JournalStore({
    dataDir: config.dataDir,
    publicPrefix: config.publicPrefix,
    videoEnabled: config.videoEnabled,
  });
}

export interface RecordingTelegram extends TelegramApi {
  sent: Array<{ chatId: number | string; text: string; replyTo?: number }>;
  media: Array<{ chatId: number | string; method: string; field: string; mimeType: string; size: number; caption?: string }>;
  /** Fait échouer le prochain sendMessage/sendMedia (test du 502 de /message). */
  failNextSend: boolean;
}

export function makeTelegram(): RecordingTelegram {
  const api: RecordingTelegram = {
    sent: [],
    media: [],
    failNextSend: false,
    async sendMessage(chatId, text, replyToMessageId) {
      if (api.failNextSend) {
        api.failNextSend = false;
        throw new Error("Telegram indisponible (test)");
      }
      api.sent.push({ chatId, text, replyTo: replyToMessageId });
    },
    async sendMedia(chatId, m) {
      if (api.failNextSend) {
        api.failNextSend = false;
        throw new Error("Telegram indisponible (test)");
      }
      api.media.push({
        chatId,
        method: m.method,
        field: m.field,
        mimeType: m.mimeType,
        size: m.buffer.byteLength,
        caption: m.caption,
      });
    },
    async getFile(fileId): Promise<TgFile> {
      return { file_id: fileId, file_path: `files/${fileId}.bin` };
    },
    async downloadFile() {
      return Buffer.from("contenu-media-factice");
    },
    async getUpdates() {
      return [];
    },
    async getWebhookInfo() {
      return { url: "https://api.test/journal/telegram/webhook" };
    },
  };
  return api;
}

export function makeMedia(): MediaPipeline {
  let n = 0;
  return {
    async processPhoto() {
      n += 1;
      return { fileName: `ph-test${n}.webp`, width: 1600, height: 1200 };
    },
    async processAudio() {
      n += 1;
      return { fileName: `au-test${n}.m4a`, duration: 102 };
    },
    async processVideo() {
      n += 1;
      return { fileName: `vi-test${n}.mp4`, duration: 22, width: 1280, height: 720 };
    },
  };
}

let nextUpdateId = 1;
let nextMessageId = 1;

export function resetIds(): void {
  nextUpdateId = 1;
  nextMessageId = 1;
}

export function update(message: Record<string, unknown>, opts: { edited?: boolean } = {}): TgUpdate {
  const full = {
    message_id: (message.message_id as number | undefined) ?? nextMessageId++,
    date: Math.floor(Date.now() / 1000),
    chat: { id: VALENTIN_CHAT_ID, type: "private" },
    ...message,
  };
  return opts.edited
    ? { update_id: nextUpdateId++, edited_message: full as never }
    : { update_id: nextUpdateId++, message: full as never };
}

export function readJournal(config: Config): {
  schemaVersion: number;
  count: number;
  entries: Array<Record<string, unknown>>;
} {
  return JSON.parse(
    fs.readFileSync(path.join(config.dataDir, "public", "journal.json"), "utf8"),
  );
}
