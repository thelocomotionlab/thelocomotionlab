// Serveur HTTP (Fastify). Derrière Caddy, exposé sur {$DEPOT_DOMAIN}/twin/*
// (infra/caddy/conf.d/depot.caddy — sous-domaine DNS-only : le proxy
// Cloudflare plafonne les corps de requête à ~100 Mo, une archive en fait
// couramment plusieurs centaines) ; trustProxy lit l'IP réelle dans
// X-Forwarded-For posé par Caddy.
//
// L'archive est STREAMÉE vers un fichier temporaire du volume (jamais en
// mémoire), SHA-256 calculé au fil de l'eau, puis rename atomique dans
// archives/<id>/ une fois le formulaire validé. Tout chemin d'échec purge le
// temporaire ; les tmp orphelins d'un crash sont purgés au démarrage (store).
//
// Garde-fous (pattern atelier-api) : CORS restreint aux origines du site pour
// le POST, honeypot `website` (robot → faux succès, rien d'écrit), limite de
// débit par IP (les uploads sont lourds : borne basse), taille maximale
// d'archive (413), montre validée contre la config. Deux emails best-effort
// après enregistrement (leur échec n'annule jamais le dépôt) : notification à
// Valentin + confirmation au déposant (mailer.ts).

import crypto from "node:crypto";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";

import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";

import type { Config } from "./config";
import { createTransport, envoyerConfirmation, envoyerNotification, mailEnv } from "./mailer";
import { IpRateLimiter } from "./ratelimit";
import { nettoyerNomFichier, type Depot, type DepotStore } from "./store";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_PRENOM_LENGTH = 80;
const MAX_NOM_LENGTH = 80;
const MAX_OBJECTIFS_LENGTH = 4000;

export interface ServerDeps {
  config: Config;
  store: DepotStore;
  limiter?: IpRateLimiter;
  logger?: boolean;
  /** Notification « nouveau dépôt » — injectable en test. null = désactivée. */
  notifier?: ((depot: Depot) => Promise<void>) | null;
  /** Confirmation au déposant — injectable en test. null = désactivée. */
  confirmer?: ((depot: Depot) => Promise<void>) | null;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const { config, store } = deps;
  const limiter = deps.limiter ?? new IpRateLimiter(config.ratePerMinute, config.ratePerHour);
  const maxArchiveOctets = config.maxArchiveMo * 1048576;
  const app = Fastify({ logger: deps.logger ?? true, trustProxy: true });

  // throwFileSizeLimit: false → à la limite, busboy TRONQUE le flux au lieu
  // de jeter ; on détecte file.truncated et on répond un 413 propre.
  void app.register(multipart, {
    throwFileSizeLimit: false,
    limits: {
      files: 1,
      fileSize: maxArchiveOctets,
      fields: 20,
      fieldSize: 10_000,
      fieldNameSize: 100,
    },
  });

  const smtp = mailEnv();
  const notifier =
    deps.notifier !== undefined
      ? deps.notifier
      : smtp && config.notifyEmail
        ? (depot: Depot) =>
            envoyerNotification(createTransport(smtp), smtp.from, config.notifyEmail, depot)
        : null;
  // La confirmation ne dépend que du SMTP : le destinataire est le déposant.
  const confirmer =
    deps.confirmer !== undefined
      ? deps.confirmer
      : smtp
        ? (depot: Depot) => envoyerConfirmation(createTransport(smtp), smtp.from, depot)
        : null;

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

  app.get("/twin/healthz", async () => ({
    ok: true,
    depots: store.count(),
    notification: notifier ? "active" : "non_configuree",
    confirmation: confirmer ? "active" : "non_configuree",
  }));

  app.options("/twin/depots", async (req, reply) => {
    void reply.headers({
      ...corsFor(req),
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, Authorization",
      "access-control-max-age": "86400",
    });
    return reply.code(204).send();
  });

  // Dépôt d'une archive : multipart { prenom, nom, email, montre, objectifs,
  // consent, website (honeypot), archive (fichier) }. bodyLimit de ROUTE :
  // le défaut global (1 Mio) reste pour les autres routes.
  app.post(
    "/twin/depots",
    { bodyLimit: maxArchiveOctets + 16 * 1048576 },
    async (req, reply) => {
      void reply.headers(corsFor(req));

      if (!limiter.allow(req.ip)) {
        return reply.code(429).send({ ok: false, error: "trop_de_requetes" });
      }
      if (!req.isMultipart()) {
        return reply.code(400).send({ ok: false, error: "multipart_requis" });
      }

      const champs = new Map<string, string>();
      let archive: { tmp: string; nomFichier: string; taille: number; sha256: string } | null =
        null;
      let archiveTronquee = false;

      const purgerTmp = (): void => {
        if (archive) {
          fs.rmSync(archive.tmp, { force: true });
          archive = null;
        }
      };

      try {
        for await (const part of req.parts()) {
          if (part.type === "file") {
            // Robot détecté (honeypot rempli AVANT le fichier — l'ordre des
            // champs du formulaire) ou fichier surnuméraire : on draine sans
            // écrire. Un vrai navigateur envoie les champs texte d'abord.
            const robot = (champs.get("website") ?? "").trim() !== "";
            if (part.fieldname !== "archive" || archive !== null || robot) {
              part.file.resume();
              continue;
            }
            const tmp = store.tmpPath();
            const hash = crypto.createHash("sha256");
            let taille = 0;
            part.file.on("data", (chunk: Buffer) => {
              hash.update(chunk);
              taille += chunk.length;
            });
            await pipeline(part.file, fs.createWriteStream(tmp));
            if (part.file.truncated) {
              fs.rmSync(tmp, { force: true });
              archiveTronquee = true;
            } else {
              archive = {
                tmp,
                nomFichier: nettoyerNomFichier(part.filename ?? ""),
                taille,
                sha256: hash.digest("hex"),
              };
            }
          } else {
            champs.set(part.fieldname, String(part.value ?? ""));
          }
        }
      } catch (err) {
        // Multipart malformé, limites busboy (fields/files)… : rien à garder.
        purgerTmp();
        req.log.warn({ err }, "dépôt illisible (multipart)");
        return reply.code(400).send({ ok: false, error: "envoi_invalide" });
      }

      try {
        // Honeypot : un humain ne voit pas ce champ ; un robot qui le remplit
        // reçoit un faux succès (et on ne stocke rien).
        if ((champs.get("website") ?? "").trim() !== "") {
          purgerTmp();
          return { ok: true };
        }

        if (archiveTronquee) {
          purgerTmp();
          return reply
            .code(413)
            .send({ ok: false, error: "archive_trop_grosse", maxMo: config.maxArchiveMo });
        }

        const prenom = (champs.get("prenom") ?? "").trim();
        const nom = (champs.get("nom") ?? "").trim();
        const email = (champs.get("email") ?? "").trim();
        const montre = (champs.get("montre") ?? "").trim();
        const objectifs = (champs.get("objectifs") ?? "").trim();

        const invalide = (code: string) => {
          purgerTmp();
          return reply.code(400).send({ ok: false, error: code });
        };

        if (archive === null) return invalide("archive_requise");
        if (!prenom || prenom.length > MAX_PRENOM_LENGTH) return invalide("prenom_invalide");
        if (nom.length > MAX_NOM_LENGTH) return invalide("nom_invalide");
        if (!EMAIL_REGEX.test(email) || email.length > MAX_EMAIL_LENGTH) {
          return invalide("email_invalide");
        }
        if (!config.montres.includes(montre)) return invalide("montre_invalide");
        if (objectifs.length > MAX_OBJECTIFS_LENGTH) return invalide("objectifs_trop_longs");
        if (champs.get("consent") !== "oui") return invalide("consentement_requis");

        const fini: { tmp: string; nomFichier: string; taille: number; sha256: string } = archive;
        const depot = store.add(
          {
            prenom,
            nom,
            email,
            montre,
            objectifs,
            consent: true,
            nomFichier: fini.nomFichier,
            taille: fini.taille,
            sha256: fini.sha256,
            ip: req.ip,
          },
          fini.tmp,
        );
        archive = null; // le tmp n'existe plus (rename) : plus rien à purger

        // Emails best-effort : le dépôt est déjà acquis quoi qu'il arrive.
        let notification = "non_configuree";
        if (notifier) {
          try {
            await notifier(depot);
            notification = "envoyee";
          } catch (err) {
            req.log.error({ err, reference: depot.reference }, "notification email impossible");
            notification = "echec";
          }
        }
        let confirmation = "non_configuree";
        if (confirmer) {
          try {
            await confirmer(depot);
            confirmation = "envoyee";
          } catch (err) {
            req.log.error(
              { err, reference: depot.reference },
              "email de confirmation au déposant impossible",
            );
            confirmation = "echec";
          }
        }

        req.log.info(
          { reference: depot.reference, montre, taille: depot.taille, notification, confirmation },
          "dépôt enregistré",
        );
        return { ok: true, reference: depot.reference };
      } catch (err) {
        purgerTmp();
        throw err;
      }
    },
  );

  // === Routes admin (jeton TWIN_DEPOT_ADMIN_TOKEN) : lister les dépôts,
  // télécharger une archive pour l'analyser, puis la purger (règle du labo :
  // suppression immédiate après analyse). ===

  app.get("/twin/depots", async (req, reply) => {
    if (!requireAdmin(req, reply)) return reply;
    return { depots: store.list() };
  });

  app.get("/twin/depots/:id/archive", async (req, reply) => {
    if (!requireAdmin(req, reply)) return reply;
    const { id } = req.params as { id: string };
    const depot = store.find(id);
    if (!depot) {
      return reply.code(404).send({ ok: false, error: "depot_inconnu" });
    }
    const chemin = store.archivePath(depot);
    if (!fs.existsSync(chemin)) {
      return reply.code(410).send({ ok: false, error: "archive_absente" });
    }
    void reply.headers({
      "content-type": "application/octet-stream",
      "content-length": String(depot.taille),
      "content-disposition": `attachment; filename="${depot.reference}-${depot.nomFichier}"`,
    });
    return reply.send(fs.createReadStream(chemin));
  });

  app.delete("/twin/depots/:id", async (req, reply) => {
    if (!requireAdmin(req, reply)) return reply;
    const { id } = req.params as { id: string };
    const depot = store.remove(id);
    if (!depot) {
      return reply.code(404).send({ ok: false, error: "depot_inconnu" });
    }
    req.log.info({ reference: depot.reference }, "dépôt purgé");
    return { ok: true, supprime: depot.reference };
  });

  return app;
}
