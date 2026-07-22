import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

import type { Config } from "../src/config";
import { IpRateLimiter } from "../src/ratelimit";
import { buildServer, type ServerDeps } from "../src/server";
import { DepotStore, type Depot } from "../src/store";

const ORIGIN = "https://ok.test";

const cleanups: Array<() => Promise<void> | void> = [];

interface App {
  app: FastifyInstance;
  store: DepotStore;
  dir: string;
}

function makeApp(overrides: Partial<Config> = {}, deps: Partial<ServerDeps> = {}): App {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "twin-depot-srv-"));
  const config: Config = {
    port: 0,
    dataDir: dir,
    allowedOrigins: [ORIGIN],
    adminToken: "jeton-test",
    ratePerMinute: 100,
    ratePerHour: 1000,
    maxArchiveMo: 1,
    montres: ["garmin", "polar", "strava", "coros", "suunto"],
    notifyEmail: "",
    ...overrides,
  };
  const store = new DepotStore(config.dataDir);
  const app = buildServer({ config, store, logger: false, notifier: null, ...deps });
  cleanups.push(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { app, store, dir };
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

interface FichierTest {
  name: string;
  content: Buffer;
}

/** Corps multipart construit à la main (champs texte PUIS fichier, comme un
 *  navigateur qui suit l'ordre du FormData du site). */
function multipart(fields: Record<string, string>, file?: FichierTest) {
  const boundary = "----vitest-boundary-7d8e9f";
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
      ),
    );
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="archive"; filename="${file.name}"\r\nContent-Type: application/zip\r\n\r\n`,
      ),
    );
    parts.push(file.content, Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

function champsValides(over: Record<string, string> = {}): Record<string, string> {
  return {
    prenom: "Chloé",
    nom: "Durand",
    email: "chloe@test.fr",
    montre: "garmin",
    objectifs: "Lavaredo 2025 en 18 h 40, objectif Diagonale 2026",
    consent: "oui",
    website: "",
    ...over,
  };
}

const PETITE_ARCHIVE: FichierTest = {
  name: "export-garmin.zip",
  content: Buffer.from("PK contenu de test"),
};

async function deposer(
  app: FastifyInstance,
  fields: Record<string, string>,
  file?: FichierTest,
) {
  const { payload, headers } = multipart(fields, file);
  return app.inject({
    method: "POST",
    url: "/twin/depots",
    payload,
    headers: { ...headers, origin: ORIGIN },
  });
}

describe("healthz", () => {
  it("répond ok avec le compte de dépôts", async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: "GET", url: "/twin/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, depots: 0, notification: "non_configuree" });
  });
});

describe("CORS", () => {
  it("préflight : ACAO pour l'origine du site uniquement", async () => {
    const { app } = makeApp();
    const ok = await app.inject({
      method: "OPTIONS",
      url: "/twin/depots",
      headers: { origin: ORIGIN },
    });
    expect(ok.statusCode).toBe(204);
    expect(ok.headers["access-control-allow-origin"]).toBe(ORIGIN);

    const autre = await app.inject({
      method: "OPTIONS",
      url: "/twin/depots",
      headers: { origin: "https://mechant.test" },
    });
    expect(autre.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("POST /twin/depots", () => {
  it("enregistre un dépôt complet : archive sur disque, sha256, référence", async () => {
    const { app, store } = makeApp();
    const res = await deposer(app, champsValides(), PETITE_ARCHIVE);

    expect(res.statusCode).toBe(200);
    const corps = res.json() as { ok: boolean; reference: string };
    expect(corps.ok).toBe(true);
    expect(corps.reference).toMatch(/^LL-TWIN-\d{4}-0001$/);

    const [depot] = store.list();
    expect(depot.prenom).toBe("Chloé");
    expect(depot.email).toBe("chloe@test.fr");
    expect(depot.montre).toBe("garmin");
    expect(depot.consent).toBe(true);
    expect(depot.nomFichier).toBe("export-garmin.zip");
    expect(depot.taille).toBe(PETITE_ARCHIVE.content.length);
    expect(depot.sha256).toBe(
      crypto.createHash("sha256").update(PETITE_ARCHIVE.content).digest("hex"),
    );
    expect(fs.readFileSync(store.archivePath(depot))).toEqual(PETITE_ARCHIVE.content);
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
  });

  it("accepte une archive au-dessus du Mio (bodyLimit de route relevé)", async () => {
    const { app, store } = makeApp({ maxArchiveMo: 4 });
    const grosse: FichierTest = {
      name: "grosse.zip",
      content: crypto.randomBytes(2 * 1048576), // 2 Mio > bodyLimit global (1 Mio)
    };
    const res = await deposer(app, champsValides(), grosse);
    expect(res.statusCode).toBe(200);
    expect(store.list()[0].taille).toBe(grosse.content.length);
  });

  it("413 quand l'archive dépasse maxArchiveMo, sans rien laisser traîner", async () => {
    const { app, store, dir } = makeApp({ maxArchiveMo: 1 });
    const trop: FichierTest = { name: "trop.zip", content: crypto.randomBytes(1048576 + 1024) };
    const res = await deposer(app, champsValides(), trop);

    expect(res.statusCode).toBe(413);
    expect(res.json()).toEqual({ ok: false, error: "archive_trop_grosse", maxMo: 1 });
    expect(store.count()).toBe(0);
    expect(fs.readdirSync(path.join(dir, "archives"))).toEqual([]);
  });

  it("honeypot rempli → faux succès, rien d'écrit", async () => {
    const { app, store, dir } = makeApp();
    const res = await deposer(app, champsValides({ website: "http://spam.test" }), PETITE_ARCHIVE);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(store.count()).toBe(0);
    expect(fs.readdirSync(path.join(dir, "archives"))).toEqual([]);
  });

  it.each([
    ["archive manquante", champsValides(), undefined, "archive_requise"],
    ["prénom vide", champsValides({ prenom: "  " }), PETITE_ARCHIVE, "prenom_invalide"],
    ["email invalide", champsValides({ email: "pas-un-email" }), PETITE_ARCHIVE, "email_invalide"],
    ["montre inconnue", champsValides({ montre: "casio" }), PETITE_ARCHIVE, "montre_invalide"],
    ["consentement absent", champsValides({ consent: "" }), PETITE_ARCHIVE, "consentement_requis"],
  ] as const)(
    "400 %s (et aucun fichier ne reste)",
    async (_libelle, fields, file, code) => {
      const { app, store, dir } = makeApp();
      const res = await deposer(app, { ...fields }, file);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ ok: false, error: code });
      expect(store.count()).toBe(0);
      expect(fs.readdirSync(path.join(dir, "archives"))).toEqual([]);
    },
  );

  it("400 si le corps n'est pas multipart", async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/twin/depots",
      payload: { prenom: "Chloé" },
      headers: { origin: ORIGIN },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ ok: false, error: "multipart_requis" });
  });

  it("429 quand la limite de débit est atteinte", async () => {
    let t = 0;
    const limiter = new IpRateLimiter(1, 10, () => t);
    const { app } = makeApp({}, { limiter });
    t = 1000;
    expect((await deposer(app, champsValides(), PETITE_ARCHIVE)).statusCode).toBe(200);
    const res = await deposer(app, champsValides(), PETITE_ARCHIVE);
    expect(res.statusCode).toBe(429);
  });

  it("notifie Valentin (best-effort : l'échec n'annule pas le dépôt)", async () => {
    const notifie: Depot[] = [];
    const { app } = makeApp({}, { notifier: async (d) => void notifie.push(d) });
    await deposer(app, champsValides(), PETITE_ARCHIVE);
    expect(notifie).toHaveLength(1);
    expect(notifie[0].prenom).toBe("Chloé");

    const enEchec = vi.fn().mockRejectedValue(new Error("smtp cassé"));
    const { app: app2, store: store2 } = makeApp({}, { notifier: enEchec });
    const res = await deposer(app2, champsValides(), PETITE_ARCHIVE);
    expect(res.statusCode).toBe(200);
    expect(store2.count()).toBe(1);
    expect(enEchec).toHaveBeenCalledOnce();
  });
});

describe("routes admin", () => {
  async function unDepot(app: FastifyInstance, store: DepotStore): Promise<Depot> {
    await deposer(app, champsValides(), PETITE_ARCHIVE);
    return store.list()[0];
  }

  it("exigent le Bearer (401 sinon, 404 si jeton non configuré)", async () => {
    const { app, store } = makeApp();
    await unDepot(app, store);

    expect((await app.inject({ method: "GET", url: "/twin/depots" })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/twin/depots",
          headers: { authorization: "Bearer mauvais" },
        })
      ).statusCode,
    ).toBe(401);

    const { app: sansJeton } = makeApp({ adminToken: "" });
    expect((await sansJeton.inject({ method: "GET", url: "/twin/depots" })).statusCode).toBe(404);
  });

  it("listing puis téléchargement de l'archive à l'octet près", async () => {
    const { app, store } = makeApp();
    const depot = await unDepot(app, store);
    const auth = { authorization: "Bearer jeton-test" };

    const listing = await app.inject({ method: "GET", url: "/twin/depots", headers: auth });
    expect(listing.statusCode).toBe(200);
    expect((listing.json() as { depots: Depot[] }).depots[0].id).toBe(depot.id);

    const dl = await app.inject({
      method: "GET",
      url: `/twin/depots/${depot.id}/archive`,
      headers: auth,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.headers["content-disposition"]).toContain(depot.reference);
    expect(dl.rawPayload).toEqual(PETITE_ARCHIVE.content);

    expect(
      (
        await app.inject({ method: "GET", url: "/twin/depots/inconnu/archive", headers: auth })
      ).statusCode,
    ).toBe(404);
  });

  it("purge un dépôt analysé (archive supprimée du disque)", async () => {
    const { app, store } = makeApp();
    const depot = await unDepot(app, store);
    const chemin = store.archivePath(depot);
    const auth = { authorization: "Bearer jeton-test" };

    const res = await app.inject({
      method: "DELETE",
      url: `/twin/depots/${depot.id}`,
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, supprime: depot.reference });
    expect(store.count()).toBe(0);
    expect(fs.existsSync(chemin)).toBe(false);

    expect(
      (await app.inject({ method: "DELETE", url: `/twin/depots/${depot.id}`, headers: auth }))
        .statusCode,
    ).toBe(404);
  });
});
