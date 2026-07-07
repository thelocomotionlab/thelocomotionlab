// Long-polling getUpdates — MODE DEV UNIQUEMENT (Telegram ne peut pas joindre un
// localhost ; en prod c'est le webhook). Même pipeline d'ingestion que le webhook.

import { handleUpdate, type IngestDeps } from "../journal/ingest";
import type { TelegramApi } from "./api";

const POLL_TIMEOUT_S = 25;
const ERROR_BACKOFF_MS = 5_000;

export function startPolling(telegram: TelegramApi, ingest: IngestDeps): () => void {
  let stopping = false;
  let offset = 0;

  (async () => {
    console.log(new Date().toISOString(), "[polling] démarrage (mode dev)");
    while (!stopping) {
      try {
        const updates = await telegram.getUpdates(offset, POLL_TIMEOUT_S);
        for (const update of updates) {
          offset = Math.max(offset, update.update_id + 1);
          await handleUpdate(update, ingest);
        }
      } catch (err) {
        if (stopping) break;
        console.error(new Date().toISOString(), `[polling] erreur : ${(err as Error).message}`);
        await new Promise((resolve) => setTimeout(resolve, ERROR_BACKOFF_MS));
      }
    }
  })();

  return () => {
    stopping = true;
  };
}
