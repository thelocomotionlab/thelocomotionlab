// Client minimal de l'API Bot Telegram (fetch natif Node 22).
// Interface injectable : les tests et le simulateur fournissent leur propre stub.

import type { TgFile, TgUpdate, TgWebhookInfo } from "./types";

export type TgMediaMethod = "sendPhoto" | "sendVideo" | "sendAudio" | "sendDocument";

export interface TgMediaUpload {
  /** Méthode Telegram + nom du champ multipart (photo/video/audio/document). */
  method: TgMediaMethod;
  field: "photo" | "video" | "audio" | "document";
  buffer: Buffer;
  filename: string;
  mimeType: string;
  /** Légende (≤ 1024 car. côté Telegram). */
  caption?: string;
}

export interface TelegramApi {
  /** Envoie un message (confirmations au terrain, messages privés des visiteurs). */
  sendMessage(chatId: number | string, text: string, replyToMessageId?: number): Promise<void>;
  /** Envoie un média (photo/vidéo/audio/document) en upload multipart. */
  sendMedia(chatId: number | string, media: TgMediaUpload): Promise<void>;
  /** Résout un file_id en chemin de téléchargement. */
  getFile(fileId: string): Promise<TgFile>;
  /** Télécharge un fichier (borné : maxBytes, sinon erreur). */
  downloadFile(filePath: string, maxBytes: number): Promise<Buffer>;
  /** Long-polling getUpdates (mode dev uniquement). */
  getUpdates(offset: number, timeoutSeconds: number): Promise<TgUpdate[]>;
  /** État du webhook (auto-surveillance PR5). */
  getWebhookInfo(): Promise<TgWebhookInfo>;
}

const CALL_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const UPLOAD_TIMEOUT_MS = 120_000;

export function createTelegramApi(botToken: string, apiBase: string): TelegramApi {
  const base = apiBase.replace(/\/$/, "");
  const methodUrl = (method: string) => `${base}/bot${botToken}/${method}`;

  async function call<T>(method: string, payload: Record<string, unknown>, timeoutMs = CALL_TIMEOUT_MS): Promise<T> {
    const res = await fetch(methodUrl(method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!res.ok || !body.ok) {
      // Jamais le contenu dans les logs : statut + description Telegram seulement.
      throw new Error(`Telegram ${method} → ${res.status} ${body.description ?? ""}`.trim());
    }
    return body.result as T;
  }

  return {
    async sendMessage(chatId, text, replyToMessageId) {
      const payload: Record<string, unknown> = { chat_id: chatId, text };
      if (replyToMessageId !== undefined) {
        payload.reply_parameters = { message_id: replyToMessageId };
      }
      await call("sendMessage", payload);
    },

    async sendMedia(chatId, media) {
      // Upload multipart (le fichier n'est jamais stocké côté service : il
      // transite en mémoire depuis la requête visiteur vers Telegram).
      const form = new FormData();
      form.append("chat_id", String(chatId));
      if (media.caption) form.append("caption", media.caption);
      form.append(
        media.field,
        new Blob([media.buffer], { type: media.mimeType }),
        media.filename,
      );
      const res = await fetch(methodUrl(media.method), {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
      const body = (await res.json()) as { ok: boolean; description?: string };
      if (!res.ok || !body.ok) {
        // Jamais le contenu dans les logs : statut + description seulement.
        throw new Error(`Telegram ${media.method} → ${res.status} ${body.description ?? ""}`.trim());
      }
    },

    async getFile(fileId) {
      return call<TgFile>("getFile", { file_id: fileId });
    },

    async downloadFile(filePath, maxBytes) {
      const res = await fetch(`${base}/file/bot${botToken}/${filePath}`, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Telegram download → ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.byteLength > maxBytes) {
        throw new Error(`Fichier trop lourd (${buffer.byteLength} octets > ${maxBytes}).`);
      }
      return buffer;
    },

    async getWebhookInfo() {
      return call<TgWebhookInfo>("getWebhookInfo", {});
    },

    async getUpdates(offset, timeoutSeconds) {
      return call<TgUpdate[]>(
        "getUpdates",
        {
          offset,
          timeout: timeoutSeconds,
          allowed_updates: ["message", "edited_message"],
        },
        (timeoutSeconds + 10) * 1000,
      );
    },
  };
}
