// Serveur HTTP (Fastify). Derrière Caddy, seuls /ateliers/places,
// /ateliers/inscriptions et /ateliers/healthz sont proxifiés
// (infra/caddy/conf.d/api.caddy) ; trustProxy lit l'IP réelle dans
// X-Forwarded-For posé par Caddy.
//
// Deux chemins d'inscription :
//   * liste d'attente (waitlist: true) — prénom + email, comme avant ;
//   * inscription complète — payload `fiche` (page /pratiquer/inscription) :
//     validation serveur des coches obligatoires, référence de dossier,
//     horodatage Paris + IP + empreinte SHA-256, rendu PDF par twin-engine
//     (réseau interne) puis email récapitulatif (SMTP Brevo). PDF et email
//     sont BEST-EFFORT : leur échec n'annule jamais l'inscription (statut
//     remonté dans la réponse + logs pour rattrapage manuel).
//
// Garde-fous (pattern email-gateway) : CORS restreint aux origines du site
// pour le POST, honeypot `website` (robot → faux succès), limite de débit
// par IP, réponse identique inscription nouvelle / déjà connue (pas
// d'énumération d'emails).

import crypto from "node:crypto";

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";

import type { AtelierDef, Config } from "./config";
import { empreinte, horodatageParis, payloadFiche, validerFiche } from "./fiche";
import { createTransport, envoyerFiche, mailEnv, type FicheMail } from "./mailer";
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
  /** Rendu PDF de la fiche — injectable en test. null = désactivé. */
  renderFiche?: ((payload: Record<string, unknown>) => Promise<Buffer>) | null;
  /** Envoi de l'email récapitulatif — injectable en test. null = non configuré. */
  envoyerEmail?: ((mail: FicheMail) => Promise<void>) | null;
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

async function renderViaTwin(baseUrl: string, payload: Record<string, unknown>): Promise<Buffer> {
  const res = await fetch(`${baseUrl}/fiche`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`twin-engine ${res.status}: ${detail}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const { config, store } = deps;
  const limiter = deps.limiter ?? new IpRateLimiter(config.ratePerMinute, config.ratePerHour);
  const app = Fastify({ logger: deps.logger ?? true, trustProxy: true });

  const renderFiche =
    deps.renderFiche !== undefined
      ? deps.renderFiche
      : config.twinEngineUrl
        ? (payload: Record<string, unknown>) => renderViaTwin(config.twinEngineUrl, payload)
        : null;

  const smtp = mailEnv();
  const envoyerEmail =
    deps.envoyerEmail !== undefined
      ? deps.envoyerEmail
      : smtp
        ? (mail: FicheMail) => envoyerFiche(createTransport(smtp), smtp.from, mail)
        : null;

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
    pdf: renderFiche ? "actif" : "desactive",
    email: envoyerEmail ? "actif" : "non_configure",
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
    fiche?: unknown;
    contenu?: unknown;
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
    if (atelier.status === "past") {
      return reply.code(410).send({ ok: false, error: "atelier_passe" });
    }

    // ── Liste d'attente : prénom + email, comme avant. ──────────────────
    if (body.waitlist === true) {
      const prenom = typeof body.prenom === "string" ? body.prenom.trim() : "";
      if (!prenom || prenom.length > MAX_PRENOM_LENGTH) {
        return reply.code(400).send({ ok: false, error: "prenom_invalide" });
      }
      const email = typeof body.email === "string" ? body.email.trim() : "";
      if (!EMAIL_REGEX.test(email) || email.length > MAX_EMAIL_LENGTH) {
        return reply.code(400).send({ ok: false, error: "email_invalide" });
      }
      const existing = store.find(atelier.id, email);
      if (existing) {
        return { ok: true, waitlist: existing.waitlist, places: placesOf(store, atelier) };
      }
      store.add(atelier.id, prenom, email, true);
      return { ok: true, waitlist: true, places: placesOf(store, atelier) };
    }

    // ── Inscription complète (page /pratiquer/inscription). ─────────────
    const { fiche, contenu, champs } = validerFiche(body.fiche, body.contenu);
    if (champs.length) {
      return reply.code(400).send({ ok: false, error: "fiche_incomplete", champs });
    }

    const { full } = placesOf(store, atelier);
    if (full) {
      // La page propose de revenir aux ateliers pour la liste d'attente.
      return reply.code(409).send({ ok: false, error: "complet", places: placesOf(store, atelier) });
    }

    const email = fiche.participant.email;
    const existing = store.find(atelier.id, email);
    if (existing) {
      // Idempotent (pas d'énumération) : même réponse qu'une création, sans
      // nouvel envoi d'email.
      return {
        ok: true,
        waitlist: existing.waitlist,
        places: placesOf(store, atelier),
        reference: existing.reference ?? null,
        horodatage: null,
        fiche: "deja_inscrit",
      };
    }

    const reference = store.nextReference();
    const horodatage = horodatageParis();
    const payload = payloadFiche(config, atelier, fiche, contenu, {
      reference,
      horodatage,
      ip: req.ip,
    });
    store.add(atelier.id, fiche.participant.prenom, email, false, {
      nom: fiche.participant.nom,
      telephone: fiche.participant.telephone,
      reference,
      empreinte: empreinte(payload),
      fiche: payload,
    });

    // PDF puis email — best-effort : l'inscription est déjà acquise.
    let pdf: Buffer | null = null;
    if (renderFiche) {
      try {
        pdf = await renderFiche(payload);
      } catch (err) {
        req.log.error({ err, reference }, "rendu de la fiche PDF impossible");
      }
    }
    let ficheStatus: string;
    if (!envoyerEmail) {
      ficheStatus = "email_non_configure";
    } else {
      try {
        await envoyerEmail({
          to: email,
          prenom: fiche.participant.prenom,
          atelier: { title: atelier.title, dateLabel: atelier.dateLabel, lieu: atelier.lieu },
          reference,
          pdf,
        });
        ficheStatus = pdf ? "envoyee" : "envoyee_sans_pdf";
      } catch (err) {
        req.log.error({ err, reference }, "envoi de l'email récapitulatif impossible");
        ficheStatus = "email_echec";
      }
    }

    req.log.info({ atelierId: atelier.id, reference, ficheStatus }, "inscription enregistrée");
    return {
      ok: true,
      waitlist: false,
      places: placesOf(store, atelier),
      reference,
      horodatage,
      fiche: ficheStatus,
    };
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

  // Désistement INDIVIDUEL : retire une seule inscription (l'id vient du
  // listing admin). La référence de dossier n'est jamais réutilisée ; la
  // relance d'un éventuel inscrit en liste d'attente reste un geste manuel.
  app.delete("/ateliers/inscriptions/:id", async (req, reply) => {
    if (!requireAdmin(req, reply)) return reply;
    const { id } = req.params as { id: string };
    const removed = store.remove(id);
    if (!removed) {
      return reply.code(404).send({ ok: false, error: "inscription_inconnue" });
    }
    req.log.info(
      { id, atelierId: removed.atelierId, reference: removed.reference },
      "inscription retirée (désistement)",
    );
    const atelier = config.ateliers.find((a) => a.id === removed.atelierId);
    return {
      ok: true,
      supprimee: removed.reference ?? removed.id,
      atelierId: removed.atelierId,
      ...(atelier ? { places: placesOf(store, atelier) } : {}),
    };
  });

  return app;
}
