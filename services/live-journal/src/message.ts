// « Laisse un mot à Valentin » : POST /message → transmission privée vers
// VALENTIN_CHAT_ID (Telegram). Texte (JSON) OU pièce jointe photo/vidéo/vocal
// (multipart). RÈGLE ABSOLUE (brief §0.9) : le contenu n'est JAMAIS stocké ni
// loggé — le fichier transite en mémoire (borné) de la requête vers Telegram,
// puis est jeté. Observabilité = compteurs anonymes uniquement.

import type { FastifyReply, FastifyRequest } from "fastify";

import type { Config } from "./config";
import { IpRateLimiter } from "./ratelimit";
import type { TelegramApi, TgMediaUpload } from "./telegram/api";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CAPTION_MAX = 1024; // limite Telegram
const TELEGRAM_PHOTO_MAX = 10 * 1024 * 1024; // au-delà, une image part en document

export const messageCounters = {
  accepted: 0,
  media: 0,
  honeypot: 0,
  rateLimited: 0,
  invalid: 0,
  upstreamError: 0,
  forbiddenOrigin: 0,
};

interface Fields {
  message: string;
  prenom: string;
  email: string;
  website: string; // honeypot
}

interface UploadedFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
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

/** Nom de fichier sûr (basename nettoyé) ou défaut d'après le type MIME. */
function safeFilename(name: string | undefined, mime: string): string {
  const base = (name ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^[._]+/, "").slice(0, 80);
  if (cleaned) return cleaned;
  if (mime.startsWith("image/")) return "photo.jpg";
  if (mime.startsWith("video/")) return "video.mp4";
  if (mime.startsWith("audio/")) return "vocal.ogg";
  return "fichier";
}

/** Choisit la méthode Telegram selon le type MIME — n'accepte QUE image/vidéo/
 *  audio (jamais un fichier arbitraire). Retourne null si le type est refusé. */
function pickMedia(file: UploadedFile, caption: string): TgMediaUpload | null {
  const mime = file.mimeType || "application/octet-stream";
  const filename = safeFilename(file.filename, mime);
  const common = { buffer: file.buffer, filename, mimeType: mime, caption: caption || undefined };
  if (mime.startsWith("image/")) {
    return file.buffer.byteLength <= TELEGRAM_PHOTO_MAX
      ? { method: "sendPhoto", field: "photo", ...common }
      : { method: "sendDocument", field: "document", ...common };
  }
  if (mime.startsWith("video/")) return { method: "sendVideo", field: "video", ...common };
  if (mime.startsWith("audio/")) return { method: "sendAudio", field: "audio", ...common };
  return null;
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

  /** Valide les champs + envoie (texte ou média). Commun aux deux chemins. */
  async function deliver(
    reply: FastifyReply,
    origin: string | undefined,
    fields: Fields,
    file: UploadedFile | null,
  ): Promise<void> {
    // Honeypot : un humain ne voit pas ce champ ; un robot reçoit un faux
    // succès (et rien n'est transmis).
    if (fields.website.trim() !== "") {
      messageCounters.honeypot += 1;
      log("honeypot");
      send(reply, origin, 200, { ok: true });
      return;
    }

    const message = fields.message.trim();
    // Sans pièce jointe, le texte est obligatoire ; avec, il est facultatif.
    if (!file && message.length === 0) {
      messageCounters.invalid += 1;
      send(reply, origin, 400, { ok: false, error: "message_invalide" });
      return;
    }
    if (message.length > config.message.maxMessageLength) {
      messageCounters.invalid += 1;
      send(reply, origin, 400, { ok: false, error: "message_invalide" });
      return;
    }

    const prenom = fields.prenom.trim();
    if (prenom.length > config.message.maxPrenomLength) {
      messageCounters.invalid += 1;
      send(reply, origin, 400, { ok: false, error: "prenom_invalide" });
      return;
    }

    const email = fields.email.trim();
    if (email !== "" && (!EMAIL_REGEX.test(email) || email.length > config.message.maxEmailLength)) {
      messageCounters.invalid += 1;
      send(reply, origin, 400, { ok: false, error: "email_invalide" });
      return;
    }

    try {
      if (file) {
        const caption = [`💬 Message de ${prenom || "Anonyme"}`, message ? `\n${message}` : ""]
          .join("")
          .slice(0, CAPTION_MAX);
        const media = pickMedia(file, caption);
        if (!media) {
          messageCounters.invalid += 1;
          send(reply, origin, 400, { ok: false, error: "type_non_supporte" });
          return;
        }
        await telegram.sendMedia(config.telegram.valentinChatId, media);
        messageCounters.media += 1;
      } else {
        const lines = [
          `💬 Message de ${prenom || "Anonyme"}`,
          "",
          message,
          "",
          `✉️ ${email || "pas d'email laissé"}`,
        ];
        await telegram.sendMessage(config.telegram.valentinChatId, lines.join("\n"));
      }
    } catch {
      messageCounters.upstreamError += 1;
      log("upstream KO");
      send(reply, origin, 502, { ok: false, error: "service_indisponible" });
      return;
    }

    messageCounters.accepted += 1;
    log(file ? "accepté (média)" : "accepté");
    send(reply, origin, 200, { ok: true });
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

      // Rate-limit AVANT toute lecture de corps (protège la mémoire des uploads).
      if (!limiter.allow(clientIp(req))) {
        messageCounters.rateLimited += 1;
        log("rate-limit");
        send(reply, origin, 429, { ok: false, error: "trop_de_requetes" });
        return;
      }

      // --- Chemin multipart : pièce jointe (photo/vidéo/vocal) ---
      if (req.isMultipart()) {
        const fields: Fields = { message: "", prenom: "", email: "", website: "" };
        let file: UploadedFile | null = null;
        let tooBig = false;
        try {
          for await (const part of req.parts()) {
            if (part.type === "file") {
              // Une seule pièce (limits.files=1) ; surnuméraire → on draine.
              if (part.fieldname !== "fichier" || file || tooBig) {
                part.file.resume();
                continue;
              }
              const chunks: Buffer[] = [];
              for await (const chunk of part.file) chunks.push(chunk as Buffer);
              if (part.file.truncated) {
                tooBig = true; // dépasse fileSize : on rejette proprement
              } else {
                file = {
                  buffer: Buffer.concat(chunks),
                  filename: part.filename,
                  mimeType: part.mimetype,
                };
              }
            } else if (
              part.fieldname === "message" ||
              part.fieldname === "prenom" ||
              part.fieldname === "email" ||
              part.fieldname === "website"
            ) {
              fields[part.fieldname] = String(part.value ?? "");
            }
          }
        } catch {
          messageCounters.invalid += 1;
          send(reply, origin, 400, { ok: false, error: "envoi_invalide" });
          return;
        }
        if (tooBig) {
          messageCounters.invalid += 1;
          send(reply, origin, 413, {
            ok: false,
            error: "fichier_trop_gros",
            maxMo: Math.round(config.message.maxUploadBytes / (1024 * 1024)),
          });
          return;
        }
        await deliver(reply, origin, fields, file);
        return;
      }

      // --- Chemin JSON : message texte seul ---
      const body = (req.body ?? {}) as Partial<Record<keyof Fields, unknown>>;
      const fields: Fields = {
        message: typeof body.message === "string" ? body.message : "",
        prenom: typeof body.prenom === "string" ? body.prenom : "",
        email: typeof body.email === "string" ? body.email : "",
        website: typeof body.website === "string" ? body.website : "",
      };
      await deliver(reply, origin, fields, null);
    },
  };
}
