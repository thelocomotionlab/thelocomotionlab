// Journal scripté du simulateur : fabrique de FAUX updates Telegram et les
// injecte dans le VRAI pipeline d'ingestion (handleUpdate). Seul le
// téléchargement est remplacé (lecture des fixtures) : chaque run de sim
// re-teste le chemin de production de bout en bout — y compris sharp et ffmpeg.

import fs from "node:fs";
import path from "node:path";

import { handleUpdate, type IngestDeps } from "../journal/ingest";
import type { TelegramApi } from "../telegram/api";
import type { TgMessage, TgUpdate } from "../telegram/types";

export interface ScenarioJournalEvent {
  /** Secondes réelles après le démarrage. */
  at: number;
  kind: "text" | "photo" | "voice" | "edit" | "delete";
  text?: string;
  caption?: string;
  /** Nom de fixture dans sim/ (photo, voice). */
  fixture?: string;
  /** Index (0-based) de l'événement cible dans cette liste (edit, delete). */
  target?: number;
}

export interface Scenario {
  positions?: import("./positions").PositionsScenario;
  journal?: ScenarioJournalEvent[];
}

export function loadScenario(scenarioPath: string): Scenario {
  return JSON.parse(fs.readFileSync(scenarioPath, "utf8")) as Scenario;
}

/** Stub Telegram du simulateur : fixtures locales, réponses du bot en console. */
export function createSimTelegramApi(fixturesDir: string): TelegramApi {
  return {
    async sendMessage(_chatId, text) {
      console.log(new Date().toISOString(), `[sim] réponse bot : ${text.split("\n")[0]}`);
    },
    async getFile(fileId) {
      return { file_id: fileId, file_path: fileId.replace(/^sim:/, "") };
    },
    async downloadFile(filePath) {
      return fs.readFileSync(path.join(fixturesDir, path.basename(filePath)));
    },
    async getUpdates() {
      return [];
    },
    async getWebhookInfo() {
      return { url: "" };
    },
  };
}

export function startScenario(
  scenario: Scenario,
  ingest: IngestDeps,
  chatId: number,
): () => void {
  const events = scenario.journal ?? [];
  const timers: NodeJS.Timeout[] = [];
  // message_id déterministe par événement → les edit/delete retrouvent leur cible.
  const messageIdFor = (index: number) => 1000 + index;

  events.forEach((event, index) => {
    timers.push(
      setTimeout(() => {
        void handleUpdate(buildUpdate(event, index, chatId, messageIdFor), ingest).catch((err) =>
          console.error(new Date().toISOString(), `[sim] scénario : ${(err as Error).message}`),
        );
      }, event.at * 1000),
    );
  });

  console.log(new Date().toISOString(), `[sim] journal scripté : ${events.length} événements programmés`);
  return () => timers.forEach(clearTimeout);
}

function buildUpdate(
  event: ScenarioJournalEvent,
  index: number,
  chatId: number,
  messageIdFor: (index: number) => number,
): TgUpdate {
  const base: TgMessage = {
    message_id: messageIdFor(index),
    date: Math.floor(Date.now() / 1000),
    chat: { id: chatId, type: "private" },
  };

  switch (event.kind) {
    case "text":
      return { update_id: 100_000 + index, message: { ...base, text: event.text ?? "" } };
    case "photo":
      return {
        update_id: 100_000 + index,
        message: {
          ...base,
          caption: event.caption,
          photo: [{ file_id: `sim:${event.fixture}`, width: 1200, height: 900 }],
        },
      };
    case "voice":
      return {
        update_id: 100_000 + index,
        message: {
          ...base,
          voice: { file_id: `sim:${event.fixture}`, duration: 0 },
        },
      };
    case "edit":
      return {
        update_id: 100_000 + index,
        edited_message: {
          ...base,
          message_id: messageIdFor(event.target ?? 0),
          text: event.text,
        },
      };
    case "delete":
      return {
        update_id: 100_000 + index,
        message: {
          ...base,
          text: "/supprimer",
          reply_to_message: {
            message_id: messageIdFor(event.target ?? 0),
            date: base.date,
            chat: base.chat,
          },
        },
      };
  }
}
