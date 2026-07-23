// Store du journal : log d'événements append-only (private/state.json, source de
// vérité) + projection publique (public/journal.json, servie par Caddy).
// Les ids sont stables ; une suppression est un tombstone (l'événement reste) ;
// toutes les écritures sont atomiques.

import fs from "node:fs";
import path from "node:path";

import { ensureDir, writeJsonAtomic } from "../utils";
import type { JournalEntry, JournalEvent, JournalFile, StateFile } from "./types";

const PROCESSED_RING_SIZE = 5000;

export interface StoreOptions {
  dataDir: string;
  /** Préfixe public (URLs des médias dans journal.json), ex. "/journal". */
  publicPrefix: string;
  /** Les entrées vidéo ne sont projetées que si true (drapeau du brief). */
  videoEnabled: boolean;
}

export class JournalStore {
  readonly publicDir: string;
  readonly mediaDir: string;
  readonly sourcesDir: string;
  readonly tmpDir: string;

  private readonly stateFilePath: string;
  private readonly journalFilePath: string;
  private readonly opts: StoreOptions;

  private events: JournalEvent[] = [];
  private processedUpdateIds: number[] = [];
  private processedSet = new Set<number>();

  lastWriteAt: string | null = null;

  constructor(opts: StoreOptions) {
    this.opts = opts;
    this.publicDir = path.join(opts.dataDir, "public");
    this.mediaDir = path.join(this.publicDir, "media");
    const privateDir = path.join(opts.dataDir, "private");
    this.sourcesDir = path.join(privateDir, "sources");
    this.tmpDir = path.join(privateDir, "tmp");
    this.stateFilePath = path.join(privateDir, "state.json");
    this.journalFilePath = path.join(this.publicDir, "journal.json");

    for (const dir of [this.publicDir, this.mediaDir, this.sourcesDir, this.tmpDir]) {
      ensureDir(dir);
    }

    this.loadState();
    // Reprojette au démarrage : garantit que journal.json existe (Caddy a toujours
    // quelque chose à servir) et applique un éventuel changement du drapeau vidéo.
    this.project();
  }

  private loadState(): void {
    if (!fs.existsSync(this.stateFilePath)) return;
    const raw = JSON.parse(fs.readFileSync(this.stateFilePath, "utf8")) as StateFile;
    if (raw.schemaVersion !== 1) {
      // Refus poli d'une version inconnue : on s'arrête plutôt que de corrompre.
      throw new Error(`state.json schemaVersion=${raw.schemaVersion} inconnue (attendu 1).`);
    }
    this.events = raw.events ?? [];
    this.processedUpdateIds = raw.processedUpdateIds ?? [];
    this.processedSet = new Set(this.processedUpdateIds);
  }

  /** Fold du log d'événements → entrées vivantes (tri chronologique croissant). */
  reduceEntries(): JournalEntry[] {
    const byId = new Map<string, JournalEntry>();
    for (const event of this.events) {
      if (event.kind === "created") {
        byId.set(event.entry.id, { ...event.entry });
      } else if (event.kind === "edited") {
        const entry = byId.get(event.id);
        if (entry) {
          entry.text = event.text;
          entry.editedAt = event.editedAt;
        }
      } else {
        byId.delete(event.id);
      }
    }
    return [...byId.values()].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  }

  /** Retrouve l'id d'entrée créée par un message Telegram donné (édition, /supprimer). */
  findEntryIdByTelegram(chatId: number, messageId: number): string | undefined {
    for (const event of this.events) {
      if (
        event.kind === "created" &&
        event.telegram &&
        event.telegram.chatId === chatId &&
        event.telegram.messageId === messageId
      ) {
        return event.entry.id;
      }
    }
    return undefined;
  }

  hasProcessed(updateId: number): boolean {
    return this.processedSet.has(updateId);
  }

  markProcessed(updateId: number): void {
    if (this.processedSet.has(updateId)) return;
    this.processedSet.add(updateId);
    this.processedUpdateIds.push(updateId);
    while (this.processedUpdateIds.length > PROCESSED_RING_SIZE) {
      const evicted = this.processedUpdateIds.shift();
      if (evicted !== undefined) this.processedSet.delete(evicted);
    }
    this.persistState();
  }

  /** Ajoute un événement au log, persiste l'état et reprojette journal.json. */
  append(event: JournalEvent): void {
    this.events.push(event);
    this.persistState();
    this.project();
  }

  entryCount(): number {
    return this.reduceEntries().length;
  }

  /** Purge TOTALE du carnet (commande /purger) : vide toutes les entrées d'un
   *  coup. Le log d'événements est remis à zéro (l'anti-rejeu des updates
   *  Telegram est conservé) ; journal.json est reprojeté vide. Les médias déjà
   *  écrits sur le volume ne sont plus référencés (nettoyage disque à part). */
  purgeAll(): number {
    const removed = this.reduceEntries().length;
    this.events = [];
    this.persistState();
    this.project();
    return removed;
  }

  private persistState(): void {
    const state: StateFile = {
      schemaVersion: 1,
      events: this.events,
      processedUpdateIds: this.processedUpdateIds,
    };
    writeJsonAtomic(this.stateFilePath, state);
  }

  /** Projection publique : exclut les vidéos si le drapeau est OFF. */
  project(): void {
    const entries = this.reduceEntries().filter(
      (entry) => entry.type !== "video" || this.opts.videoEnabled,
    );
    const file: JournalFile = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      count: entries.length,
      entries,
    };
    writeJsonAtomic(this.journalFilePath, file);
    this.lastWriteAt = file.generatedAt;
  }

  /** URL publique d'un fichier de public/media/ (relative au domaine du service). */
  mediaUrl(fileName: string): string {
    return `${this.opts.publicPrefix}/media/${fileName}`;
  }
}
