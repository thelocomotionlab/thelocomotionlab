// Serveur HTTP (Fastify). En production, Caddy ne proxifie vers ce serveur QUE
// /journal/telegram/webhook, /journal/message et /journal/healthz — journal.json
// et les médias sont servis par Caddy depuis le volume. Les routes statiques
// ci-dessous n'existent qu'en dev/simulation (pas de Caddy en local).

import fs from "node:fs";
import path from "node:path";

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";

import type { Config } from "./config";
import { counters as ingestCounters, handleUpdate, type IngestDeps } from "./journal/ingest";
import type { JournalStore } from "./journal/store";
import { createMessageModule, messageCounters } from "./message";
import { IpRateLimiter } from "./ratelimit";
import { storyCard } from "./og/cards";
import { renderPng } from "./og/render";
import type { OgDataSource } from "./og/data";
import type { OgScheduler } from "./og/scheduler";
import type { TelegramApi } from "./telegram/api";
import type { TgUpdate } from "./telegram/types";

/** Instantanés live produits par le simulateur (servis en dev uniquement). */
export interface SimSnapshotProvider {
  getPositions(): unknown;
  getTimer(): unknown;
}

export interface ServerDeps {
  config: Config;
  store: JournalStore;
  telegram: TelegramApi;
  ingest: IngestDeps;
  /** Présent en mode simulation : expose /live-positions.json et /live-timer.json. */
  sim?: SimSnapshotProvider;
  /** Sert journal.json + médias depuis le volume (dev/simulation, pas de Caddy). */
  serveStatic?: boolean;
  /** Cartes de partage (PR4) : source de données + planificateur de og.png. */
  og?: { source: OgDataSource; scheduler: OgScheduler };
}

const MEDIA_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
};

export function buildServer(deps: ServerDeps): FastifyInstance {
  const { config, store, ingest } = deps;
  const prefix = config.publicPrefix;

  const app = Fastify({
    logger: false, // logs applicatifs maison (compteurs anonymes) — pas de log par requête
    bodyLimit: 64 * 1024,
    trustProxy: true,
  });

  // Erreurs JSON → codes français, pattern email-gateway.
  app.setErrorHandler((err: { statusCode?: number }, _req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? 400 : 500;
    reply
      .status(status)
      .send({ ok: false, error: status === 400 ? "corps_invalide" : "erreur_interne" });
  });

  // --- Webhook Telegram (uniquement si un secret est configuré : mode webhook) ---
  if (config.telegram.webhookSecret) {
    app.post(`${prefix}/telegram/webhook`, async (req, reply) => {
      const secret = req.headers["x-telegram-bot-api-secret-token"];
      if (secret !== config.telegram.webhookSecret) {
        reply.status(403).send({ ok: false });
        return;
      }
      // Traitement synchrone puis 200 : la dédup par update_id rend un
      // éventuel retry Telegram (timeout) inoffensif.
      await handleUpdate(req.body as TgUpdate, ingest);
      reply.status(200).send({ ok: true });
    });
  }

  // --- Messages privés des visiteurs ---
  const message = createMessageModule(config, deps.telegram);
  app.options(`${prefix}/message`, (req, reply) => message.handleOptions(req, reply));
  app.post(`${prefix}/message`, (req, reply) => message.handlePost(req, reply));

  // --- Story 1080×1920 à la demande (lien discret de /live, usage manuel) ---
  if (deps.og) {
    const og = deps.og;
    // Garde-fou global : la rasterisation coûte ~1 s de CPU.
    const storyLimiter = new IpRateLimiter(10, 100);
    app.get(`${prefix}/story.png`, async (_req, reply) => {
      if (!storyLimiter.allow("story")) {
        reply.status(429).send({ ok: false, error: "trop_de_requetes" });
        return;
      }
      const data = await og.source.collect();
      const png = await renderPng(storyCard(data), 1080, 1920);
      reply
        .headers({ "Content-Type": "image/png", "Cache-Control": "no-store" })
        .send(png);
    });

    // Dev/simulation : og.png est aussi servi ici (en prod, c'est Caddy).
    if (deps.serveStatic) {
      app.get(`${prefix}/og.png`, (_req, reply) => {
        const filePath = path.join(store.publicDir, "og.png");
        if (!fs.existsSync(filePath)) {
          reply.status(404).send();
          return;
        }
        reply
          .headers({ "Content-Type": "image/png", "Cache-Control": "no-cache" })
          .send(fs.readFileSync(filePath));
      });
    }
  }

  // --- Healthcheck (compose + auto-surveillance PR5) ---
  app.get(`${prefix}/healthz`, async () => ({
    ok: true,
    uptimeSeconds: Math.round(process.uptime()),
    mode: config.telegram.mode,
    simulation: config.simulation.enabled,
    videoEnabled: config.videoEnabled,
    entryCount: store.entryCount(),
    lastWriteAt: store.lastWriteAt,
    og: deps.og
      ? { lastGeneratedAt: deps.og.scheduler.lastGeneratedAt, variant: deps.og.scheduler.lastVariant }
      : null,
    counters: { ingest: ingestCounters, message: messageCounters },
  }));

  // --- Dev/simulation : statique + instantanés positions ---
  if (deps.serveStatic) {
    app.get(`${prefix}/journal.json`, (_req, reply) => {
      const filePath = path.join(store.publicDir, "journal.json");
      reply
        .headers({
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Content-Type": "application/json",
        })
        .send(fs.readFileSync(filePath, "utf8"));
    });

    app.get(`${prefix}/media/:file`, (req, reply) => {
      const { file } = req.params as { file: string };
      if (!/^[a-z0-9.-]+$/i.test(file) || file.includes("..")) {
        reply.status(404).send();
        return;
      }
      const filePath = path.join(store.mediaDir, file);
      if (!fs.existsSync(filePath)) {
        reply.status(404).send();
        return;
      }
      serveWithRange(req, reply, filePath);
    });
  }

  if (deps.sim) {
    const sim = deps.sim;
    const liveJsonHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    };
    app.get("/live-positions.json", (_req, reply) => {
      reply.headers(liveJsonHeaders).send(sim.getPositions());
    });
    app.get("/live-timer.json", (_req, reply) => {
      reply.headers(liveJsonHeaders).send(sim.getTimer());
    });
  }

  return app;
}

/**
 * Range minimal (une plage) : Safari iOS exige des réponses 206 pour lire
 * l'audio/vidéo — indispensable pour tester le journal sur téléphone en dev.
 */
function serveWithRange(req: FastifyRequest, reply: FastifyReply, filePath: string): void {
  const stat = fs.statSync(filePath);
  const contentType = MEDIA_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
  const baseHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    "Content-Type": contentType,
  };

  const range = req.headers.range;
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (match && (match[1] !== "" || match[2] !== "")) {
    const start = match[1] === "" ? Math.max(0, stat.size - Number(match[2])) : Number(match[1]);
    const end = match[1] !== "" && match[2] !== "" ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    if (start >= stat.size || start > end) {
      reply.status(416).header("Content-Range", `bytes */${stat.size}`).send();
      return;
    }
    reply
      .status(206)
      .headers({
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Content-Length": String(end - start + 1),
      })
      .send(fs.createReadStream(filePath, { start, end }));
    return;
  }

  reply.headers({ ...baseHeaders, "Content-Length": String(stat.size) }).send(fs.createReadStream(filePath));
}
