// Serveur HTTP (Fastify). Derrière Caddy, seuls /ateliers/places,
// /ateliers/inscriptions et /ateliers/healthz sont proxifiés
// (infra/caddy/conf.d/api.caddy) ; trustProxy lit l'IP réelle dans
// X-Forwarded-For posé par Caddy.
//
// Garde-fous (pattern email-gateway) : CORS restreint aux origines du site
// pour le POST, honeypot `website` (robot → faux succès), limite de débit
// par IP, réponse identique inscription nouvelle / déjà connue (pas
// d'énumération d'emails).

import crypto from "node:crypto";

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";

import type { AtelierDef, Config } from "./config";
import { IpRateLimiter } from "./ratelimit";
import type { InscriptionStore } from "./store";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_PRENOM_LENGTH = 80;

export interface ServerDeps {
  config: Config;
  store: InscriptionStore;
  limiter?: IpRateLimiter;
  logger?: boolean;
}

export interface Places {
  capacity: number;
  registered: number;
  remaining: number;
  full: boolean;
  status: AtelierDef["status"];
}

export function placesOf(store: InscriptionStore, atelier: AtelierDef): Places {
  const registered = store.registered(atelier.id);
  return {
    capacity: atelier.capacity,
    registered,
    remaining: Math.max(0, atelier.capacity - registered),
    full: atelier.status === "full" || registered >= atelier.capacity,
    status: atelier.status,
  };
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const { config, store } = deps;
  const limiter = deps.limiter ?? new IpRateLimiter(config.ratePerMinute, config.ratePerHour);
  const app = Fastify({ logger: deps.logger ?? true, trustProxy: true });

  const allPlaces = (): Record<string, Places> =>
    Object.fromEntries(config.ateliers.map((a) => [a.id, placesOf(store, a)]));

  /** ACAO uniquement pour les origines du site ; sans Origin (curl, tests) on
   *  traite quand même — le CORS ne protège que le navigateur. */
  const corsFor = (req: FastifyRequest): Record<string, string> => {
    const origin = req.headers.origin;
    if (origin && config.allowedOrigins.includes(origin)) {
      return { "access-control-allow-origin": origin, vary: "Origin" };
    }
    return { vary: "Origin" };
  };

  const requireAdmin = (req: FastifyRequest, reply: FastifyReply): boolean => {
    if (!config.adminToken) {
      void reply.code(404).send({ ok: false, error: "not_found" });
      return false;
    }
    const auth = req.headers.authorization ?? "";
    if (!safeEqual(auth, `Bearer ${config.adminToken}`)) {
      void reply.code(401).send({ ok: false, error: "non_autorise" });
      return false;
    }
    return true;
  };

  app.get("/ateliers/healthz", async () => ({
    ok: true,
    ateliers: config.ateliers.length,
    inscriptions: store.count(),
  }));

  // Décompte public des places — données agrégées, CORS ouvert, jamais caché
  // (le front rafraîchit au montage de la page).
  app.get("/ateliers/places", async (_req, reply) => {
    void reply.headers({ "access-control-allow-origin": "*", "cache-control": "no-store" });
    return { places: allPlaces() };
  });

  app.options("/ateliers/inscriptions", async (req, reply) => {
    void reply.headers({
      ...corsFor(req),
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, Authorization",
      "access-control-max-age": "86400",
    });
    return reply.code(204).send();
  });

  interface InscriptionBody {
    atelierId?: unknown;
    prenom?: unknown;
    email?: unknown;
    website?: unknown;
    waitlist?: unknown;
  }

  app.post("/ateliers/inscriptions", async (req, reply) => {
    void reply.headers(corsFor(req));

    if (!limiter.allow(req.ip)) {
      return reply.code(429).send({ ok: false, error: "trop_de_requetes" });
    }

    const body = (req.body ?? {}) as InscriptionBody;

    // Honeypot : un humain ne voit pas ce champ ; un robot qui le remplit
    // reçoit un faux succès (et on ne stocke rien).
    if (typeof body.website === "string" && body.website.trim() !== "") {
      return { ok: true };
    }

    const atelierId = typeof body.atelierId === "string" ? body.atelierId : "";
    const atelier = config.ateliers.find((a) => a.id === atelierId);
    if (!atelier) {
      return reply.code(400).send({ ok: false, error: "atelier_inconnu" });
    }

    const prenom = typeof body.prenom === "string" ? body.prenom.trim() : "";
    if (!prenom || prenom.length > MAX_PRENOM_LENGTH) {
      return reply.code(400).send({ ok: false, error: "prenom_invalide" });
    }

    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!EMAIL_REGEX.test(email) || email.length > MAX_EMAIL_LENGTH) {
      return reply.code(400).send({ ok: false, error: "email_invalide" });
    }

    if (atelier.status === "past") {
      return reply.code(410).send({ ok: false, error: "atelier_passe" });
    }

    // Déjà inscrit·e (même email) → même réponse qu'une création : idempotent
    // et sans énumération d'emails.
    const existing = store.find(atelier.id, email);
    if (existing) {
      return { ok: true, waitlist: existing.waitlist, places: placesOf(store, atelier) };
    }

    const { full } = placesOf(store, atelier);
    if (full && body.waitlist !== true) {
      // Le front bascule la carte en état complet et propose la liste d'attente.
      return reply.code(409).send({ ok: false, error: "complet", places: placesOf(store, atelier) });
    }

    const inscription = store.add(atelier.id, prenom, email, full);
    // TODO (chantier emails) : déclencher ici la confirmation Listmonk/Brevo —
    // cf. README § Emails.
    req.log.info(
      { atelierId: atelier.id, waitlist: inscription.waitlist },
      "inscription enregistrée",
    );
    return { ok: true, waitlist: inscription.waitlist, places: placesOf(store, atelier) };
  });

  // === Routes admin (jeton ATELIER_ADMIN_TOKEN) : préparer l'atelier, puis
  // purger les données perso une fois l'atelier passé. ===

  app.get("/ateliers/inscriptions", async (req, reply) => {
    if (!requireAdmin(req, reply)) return reply;
    const atelierId = (req.query as Record<string, string | undefined>).atelier;
    return { inscriptions: store.list(atelierId) };
  });

  app.delete("/ateliers/inscriptions", async (req, reply) => {
    if (!requireAdmin(req, reply)) return reply;
    const atelierId = (req.query as Record<string, string | undefined>).atelier;
    if (!atelierId) {
      return reply.code(400).send({ ok: false, error: "atelier_requis" });
    }
    return { ok: true, supprimees: store.purge(atelierId) };
  });

  return app;
}
