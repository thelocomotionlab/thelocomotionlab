// Client minimal de l'API Bot Telegram (fetch natif Node 22).
// Interface injectable : les tests et le simulateur fournissent leur propre stub.

import type { TgFile, TgUpdate } from "./types";

export interface TelegramApi {
  /** Envoie un message (confirmations au terrain, messages privés des visiteurs). */
  sendMessage(chatId: number | string, text: string, replyToMessageId?: number): Promise<void>;
  /** Résout un file_id en chemin de téléchargement. */
  getFile(fileId: string): Promise<TgFile>;
  /** Télécharge un fichier (borné : maxBytes, sinon erreur). */
  downloadFile(filePath: string, maxBytes: number): Promise<Buffer>;
  /** Long-polling getUpdates (mode dev uniquement). */
  getUpdates(offset: number, timeoutSeconds: number): Promise<TgUpdate[]>;
}

const CALL_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;

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
