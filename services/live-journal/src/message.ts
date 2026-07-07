// « Laisse un mot à Valentin » : POST /message → sendMessage vers VALENTIN_CHAT_ID.
// RÈGLE ABSOLUE (brief §0.9) : le contenu n'est JAMAIS stocké ni loggé côté serveur —
// transmission directe, observabilité = compteurs anonymes uniquement.

import type { FastifyReply, FastifyRequest } from "fastify";

import type { Config } from "./config";
import { IpRateLimiter } from "./ratelimit";
import type { TelegramApi } from "./telegram/api";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const messageCounters = {
  accepted: 0,
  honeypot: 0,
  rateLimited: 0,
  invalid: 0,
  upstreamError: 0,
  forbiddenOrigin: 0,
};

interface MessagePayload {
  message?: unknown;
  prenom?: unknown;
  email?: unknown;
  website?: unknown; // honeypot
}

export interface MessageModule {
  handleOptions(req: FastifyRequest, reply: FastifyReply): void;
  handlePost(req: FastifyRequest, reply: FastifyReply): Promise<void>;
}

/** IP réelle du visiteur : Cloudflare (domaine proxifié) puis Caddy. */
export function clientIp(req: FastifyRequest): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.length > 0) return cf;
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  return req.ip || "unknown";
}

function log(message: string): void {
  console.log(new Date().toISOString(), `[message] ${message}`);
}

export function createMessageModule(config: Config, telegram: TelegramApi): MessageModule {
  const limiter = new IpRateLimiter(config.message.ratePerMinute, config.message.ratePerHour);

  function corsHeaders(origin: string | undefined): Record<string, string> {
    const headers: Record<string, string> = {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    if (origin && config.allowedOrigins.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }
    return headers;
  }

  function send(
    reply: FastifyReply,
    origin: string | undefined,
    status: number,
    body: Record<string, unknown>,
  ): void {
    reply.status(status).headers(corsHeaders(origin)).send(body);
  }

  return {
    handleOptions(req, reply) {
      reply.status(204).headers(corsHeaders(req.headers.origin)).send();
    },

    async handlePost(req, reply) {
      const origin = req.headers.origin;

      // Origine navigateur inconnue → refus explicite. (Pas d'Origin = client
      // non-navigateur : autorisé mais soumis au même rate-limit.)
      if (origin && !config.allowedOrigins.includes(origin)) {
        messageCounters.forbiddenOrigin += 1;
        send(reply, origin, 403, { ok: false, error: "origine_non_autorisee" });
        return;
      }

      const payload = (req.body ?? {}) as MessagePayload;

      // Honeypot : un humain ne voit pas ce champ ; un robot qui le remplit
      // reçoit un faux succès (et rien n'est transmis).
      if (typeof payload.website === "string" && payload.website.trim() !== "") {
        messageCounters.honeypot += 1;
        log("honeypot");
        send(reply, origin, 200, { ok: true });
        return;
      }

      if (!limiter.allow(clientIp(req))) {
        messageCounters.rateLimited += 1;
        log("rate-limit");
        send(reply, origin, 429, { ok: false, error: "trop_de_requetes" });
        return;
      }

      const message = typeof payload.message === "string" ? payload.message.trim() : "";
      if (message.length === 0 || message.length > config.message.maxMessageLength) {
        messageCounters.invalid += 1;
        send(reply, origin, 400, { ok: false, error: "message_invalide" });
        return;
      }

      const prenom = typeof payload.prenom === "string" ? payload.prenom.trim() : "";
      if (prenom.length > config.message.maxPrenomLength) {
        messageCounters.invalid += 1;
        send(reply, origin, 400, { ok: false, error: "prenom_invalide" });
        return;
      }

      const email = typeof payload.email === "string" ? payload.email.trim() : "";
      if (email !== "" && (!EMAIL_REGEX.test(email) || email.length > config.message.maxEmailLength)) {
        messageCounters.invalid += 1;
        send(reply, origin, 400, { ok: false, error: "email_invalide" });
        return;
      }

      // Transmission directe — texte brut (pas de parse_mode : rien à échapper).
      const lines = [
        `💬 Message de ${prenom || "Anonyme"}`,
        "",
        message,
        "",
        `✉️ ${email || "pas d'email laissé"}`,
      ];
      try {
        await telegram.sendMessage(config.telegram.valentinChatId, lines.join("\n"));
      } catch {
        messageCounters.upstreamError += 1;
        log("upstream KO");
        send(reply, origin, 502, { ok: false, error: "service_indisponible" });
        return;
      }

      messageCounters.accepted += 1;
      log("accepté");
      send(reply, origin, 200, { ok: true });
    },
  };
}
