// Garde-fous du POST /message (via fastify.inject — pas de port ouvert) :
// honeypot, rate-limit, longueurs, email facultatif, CORS, 502 upstream.
// + webhook : secret_token exigé.

import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildServer } from "../src/server";
import type { Config } from "../src/config";
import {
  makeConfig,
  makeMedia,
  makeStore,
  makeTelegram,
  readJournal,
  resetIds,
  type RecordingTelegram,
} from "./helpers";

const ORIGIN = "https://thelocomotionlab.com";

let config: Config;
let telegram: RecordingTelegram;
let app: FastifyInstance;

function makeApp(overrides: Partial<Config> = {}): void {
  config = makeConfig(overrides);
  telegram = makeTelegram();
  const store = makeStore(config);
  app = buildServer({
    config,
    store,
    telegram,
    ingest: { store, telegram, media: makeMedia(), config },
  });
}

beforeEach(() => {
  resetIds();
  makeApp();
});

function postMessage(payload: unknown, headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: "/journal/message",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    payload: payload as Record<string, unknown>,
  });
}

/** Corps multipart construit à la main (champs texte + une pièce jointe). */
function multipartBody(
  fields: Record<string, string>,
  file?: { field: string; filename: string; mimeType: string; content: Buffer },
) {
  const boundary = "----ljtestboundary9f2a";
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
      ),
    );
    parts.push(file.content, Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

function postMultipart(
  fields: Record<string, string>,
  file?: { field: string; filename: string; mimeType: string; content: Buffer },
  headers: Record<string, string> = {},
) {
  const { body, contentType } = multipartBody(fields, file);
  return app.inject({
    method: "POST",
    url: "/journal/message",
    headers: { "content-type": contentType, origin: ORIGIN, ...headers },
    payload: body,
  });
}

describe("POST /journal/message", () => {
  it("message valide → 200 + transmission directe (prénom et email inclus)", async () => {
    const res = await postMessage({ message: "Allez Valentin !", prenom: "Jean", email: "jean@example.com" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(telegram.sent).toHaveLength(1);
    expect(telegram.sent[0].chatId).toBe(config.telegram.valentinChatId);
    expect(telegram.sent[0].text).toContain("Allez Valentin !");
    expect(telegram.sent[0].text).toContain("Jean");
    expect(telegram.sent[0].text).toContain("jean@example.com");
  });

  it("prénom et email facultatifs → « Anonyme » / « pas d'email laissé »", async () => {
    const res = await postMessage({ message: "Courage !" });
    expect(res.statusCode).toBe(200);
    expect(telegram.sent[0].text).toContain("Anonyme");
    expect(telegram.sent[0].text).toContain("pas d'email laissé");
  });

  it("honeypot rempli → faux succès, rien n'est transmis", async () => {
    const res = await postMessage({ message: "spam", website: "http://bot.example" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(telegram.sent).toHaveLength(0);
  });

  it("message manquant ou trop long → 400 message_invalide", async () => {
    expect((await postMessage({})).statusCode).toBe(400);
    expect((await postMessage({ message: "" })).json().error).toBe("message_invalide");
    expect((await postMessage({ message: "x".repeat(1001) })).json().error).toBe("message_invalide");
  });

  it("prénom trop long → 400 prenom_invalide ; email invalide → 400 email_invalide", async () => {
    expect((await postMessage({ message: "ok", prenom: "p".repeat(51) })).json().error).toBe("prenom_invalide");
    expect((await postMessage({ message: "ok", email: "pas-un-email" })).json().error).toBe("email_invalide");
  });

  it("corps non-JSON → 400 corps_invalide", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/journal/message",
      headers: { "content-type": "application/json", origin: ORIGIN },
      payload: "{invalide",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("corps_invalide");
  });

  it("rate-limit par IP : 6e requête dans la minute → 429 (IP via CF-Connecting-IP)", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await postMessage({ message: `n°${i}` }, { "cf-connecting-ip": "1.2.3.4" });
      expect(res.statusCode).toBe(200);
    }
    const blocked = await postMessage({ message: "n°6" }, { "cf-connecting-ip": "1.2.3.4" });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error).toBe("trop_de_requetes");

    // Une autre IP n'est pas affectée.
    const other = await postMessage({ message: "autre" }, { "cf-connecting-ip": "5.6.7.8" });
    expect(other.statusCode).toBe(200);
  });

  it("origine navigateur non listée → 403, rien n'est transmis", async () => {
    const res = await postMessage({ message: "ok" }, { origin: "https://evil.example" });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("origine_non_autorisee");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(telegram.sent).toHaveLength(0);
  });

  it("préflight OPTIONS → 204 avec CORS pour une origine autorisée", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/journal/message",
      headers: { origin: ORIGIN },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
  });

  it("Telegram indisponible → 502 service_indisponible (transmission directe, pas de file)", async () => {
    telegram.failNextSend = true;
    const res = await postMessage({ message: "perdu ?" });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("service_indisponible");
  });
});

describe("POST /journal/message — pièces jointes (multipart)", () => {
  const PIXEL = Buffer.from("89504e470d0a1a0a", "hex"); // en-tête PNG factice

  it("photo → 200, sendPhoto avec la légende (prénom + message)", async () => {
    const res = await postMultipart(
      { message: "Regarde ça", prenom: "Chloé", website: "" },
      { field: "fichier", filename: "vue.jpg", mimeType: "image/jpeg", content: PIXEL },
    );
    expect(res.statusCode).toBe(200);
    expect(telegram.media).toHaveLength(1);
    expect(telegram.media[0]).toMatchObject({ method: "sendPhoto", field: "photo", mimeType: "image/jpeg" });
    expect(telegram.media[0].caption).toContain("Chloé");
    expect(telegram.media[0].caption).toContain("Regarde ça");
    expect(telegram.sent).toHaveLength(0); // rien en texte
  });

  it("vocal enregistré (audio/*) → sendAudio ; vidéo → sendVideo", async () => {
    await postMultipart(
      { message: "", prenom: "", website: "" },
      { field: "fichier", filename: "vocal.webm", mimeType: "audio/webm", content: PIXEL },
    );
    expect(telegram.media[0]).toMatchObject({ method: "sendAudio", field: "audio" });

    await postMultipart(
      { website: "" },
      { field: "fichier", filename: "clip.mp4", mimeType: "video/mp4", content: PIXEL },
    );
    expect(telegram.media[1]).toMatchObject({ method: "sendVideo", field: "video" });
  });

  it("pièce jointe SANS texte → 200 (le texte est facultatif quand il y a un média)", async () => {
    const res = await postMultipart(
      { website: "" },
      { field: "fichier", filename: "photo.jpg", mimeType: "image/jpeg", content: PIXEL },
    );
    expect(res.statusCode).toBe(200);
    expect(telegram.media).toHaveLength(1);
  });

  it("type non supporté (pdf, exécutable…) → 400 type_non_supporte, rien n'est transmis", async () => {
    const res = await postMultipart(
      { website: "" },
      { field: "fichier", filename: "virus.pdf", mimeType: "application/pdf", content: PIXEL },
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("type_non_supporte");
    expect(telegram.media).toHaveLength(0);
  });

  it("fichier plus lourd que la limite → 413 fichier_trop_gros", async () => {
    makeApp({
      message: {
        maxMessageLength: 1000,
        maxPrenomLength: 50,
        maxEmailLength: 254,
        ratePerMinute: 5,
        ratePerHour: 30,
        maxUploadBytes: 64,
      },
    });
    const res = await postMultipart(
      { website: "" },
      { field: "fichier", filename: "gros.jpg", mimeType: "image/jpeg", content: Buffer.alloc(500, 1) },
    );
    expect(res.statusCode).toBe(413);
    expect(res.json().error).toBe("fichier_trop_gros");
    expect(telegram.media).toHaveLength(0);
  });

  it("honeypot rempli en multipart → faux succès, rien n'est transmis", async () => {
    const res = await postMultipart(
      { message: "spam", website: "rempli-par-un-robot" },
      { field: "fichier", filename: "x.jpg", mimeType: "image/jpeg", content: PIXEL },
    );
    expect(res.statusCode).toBe(200);
    expect(telegram.media).toHaveLength(0);
    expect(telegram.sent).toHaveLength(0);
  });

  it("Telegram indisponible sur un média → 502", async () => {
    telegram.failNextSend = true;
    const res = await postMultipart(
      { website: "" },
      { field: "fichier", filename: "photo.jpg", mimeType: "image/jpeg", content: PIXEL },
    );
    expect(res.statusCode).toBe(502);
  });
});

describe("POST /journal/telegram/webhook", () => {
  function postWebhook(secret: string | undefined, body: unknown) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (secret !== undefined) headers["x-telegram-bot-api-secret-token"] = secret;
    return app.inject({ method: "POST", url: "/journal/telegram/webhook", headers, payload: body as never });
  }

  it("secret_token absent ou faux → 403, rien n'est traité", async () => {
    const body = { update_id: 1, message: { message_id: 1, date: 1, chat: { id: 424242, type: "private" }, text: "x" } };
    expect((await postWebhook(undefined, body)).statusCode).toBe(403);
    expect((await postWebhook("mauvais", body)).statusCode).toBe(403);
    expect(readJournal(config).count).toBe(0);
  });

  it("secret_token correct → 200 et entrée publiée", async () => {
    const body = { update_id: 1, message: { message_id: 1, date: 1, chat: { id: 424242, type: "private" }, text: "via webhook" } };
    const res = await postWebhook("test-secret", body);
    expect(res.statusCode).toBe(200);
    expect(readJournal(config).count).toBe(1);
  });

  it("healthz expose l'état sans secret", async () => {
    const res = await app.inject({ method: "GET", url: "/journal/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, mode: "webhook", entryCount: 0 });
  });
});
