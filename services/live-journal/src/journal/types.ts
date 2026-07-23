// Contrat public de journal.json + état interne du store.
// journal.json est consommé par la page /live (polling client, PR2) : ne rien
// changer ici sans répercuter côté front. Cohérence avec docs/live-tracking.md §15 :
// le mapping vers archive.json (littéraux français, champs réduits) se fait à
// l'export en PR3 — cf. docs/live-pr1-plan.md §4.

export type EntryType = "text" | "photo" | "audio" | "video";

export interface EntryMedia {
  /** URL relative au domaine du service (ex. /journal/media/au-xxxx.m4a). */
  url: string;
  /** Durée en secondes — audio et vidéo. */
  duration?: number;
  /** Dimensions en pixels — photo et vidéo. */
  width?: number;
  height?: number;
}

export interface JournalEntry {
  /** ULID : stable, jamais réutilisé, triable chronologiquement. */
  id: string;
  /** UTC pur (ISO 8601). J-index et heure Paris calculés CÔTÉ FRONT depuis liveConfig. */
  ts: string;
  type: EntryType;
  /** Corps (type text) ou légende (photo/audio/video). Absent si vide. */
  text?: string;
  media?: EntryMedia;
  /** Présent si l'entrée a été corrigée depuis le terrain (edited_message). */
  editedAt?: string;
  /** media_group_id Telegram, stocké sans être exploité (albums : une entrée par photo). */
  mediaGroupId?: string;
}

/** Fichier public journal.json — projection de l'état interne. */
export interface JournalFile {
  schemaVersion: 1;
  generatedAt: string;
  count: number;
  /** Tri chronologique CROISSANT par ts. */
  entries: JournalEntry[];
}

/** Référence du message Telegram d'origine (retrouver l'entrée à éditer/supprimer). */
export interface TelegramRef {
  chatId: number;
  messageId: number;
}

/** Log d'événements append-only : la source de vérité interne (private/state.json). */
export type JournalEvent =
  | { kind: "created"; entry: JournalEntry; telegram?: TelegramRef }
  | { kind: "edited"; id: string; text: string; editedAt: string }
  | { kind: "deleted"; id: string; deletedAt: string };

export interface StateFile {
  schemaVersion: 1;
  events: JournalEvent[];
  /** Anneau des derniers update_id traités (idempotence des retries Telegram). */
  processedUpdateIds: number[];
}
