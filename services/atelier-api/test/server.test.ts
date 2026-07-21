import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import type { Config } from "../src/config";
import { IpRateLimiter } from "../src/ratelimit";
import { buildServer } from "../src/server";
import { InscriptionStore } from "../src/store";

const ORIGIN = "https://ok.test";

const cleanups: Array<() => Promise<void> | void> = [];

function makeApp(overrides: Partial<Config> = {}, limiter?: IpRateLimiter): FastifyInstance {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atelier-api-"));
  const config: Config = {
    port: 0,
    dataDir: dir,
    allowedOrigins: [ORIGIN],
    adminToken: "jeton-test",
    ratePerMinute: 100,
    ratePerHour: 1000,
    ateliers: [
      { id: "ouvert", capacity: 2, status: "open" },
      { id: "force-complet", capacity: 2, status: "full" },
      { id: "passe", capacity: 2, status: "past" },
    ],
    ...overrides,
  };
  const store = new InscriptionStore(config.dataDir);
  const app = buildServer({ config, store, limiter, logger: false });
  cleanups.push(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return app;
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function inscription(app: FastifyInstance, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/ateliers/inscriptions",
    headers: { origin: ORIGIN },
    payload: {
      atelierId: "ouvert",
      prenom: "Ana",
      email: "ana@test.fr",
      website: "",
      ...payload,
    },
  });
}

describe("GET /ateliers/places", () => {
  it("expose capacité, inscrits, restantes et complet, CORS ouvert", async () => {
    const app = makeApp();
    const res = await app.inject({ method: "GET", url: "/ateliers/places" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["cache-control"]).toBe("no-store");
    const { places } = res.json();
    expect(places["ouvert"]).toEqual({
      capacity: 2,
      registered: 0,
      remaining: 2,
      full: false,
      status: "open",
    });
    expect(places["force-complet"].full).toBe(true);
  });
});

describe("POST /ateliers/inscriptions", () => {
  it("inscrit puis décompte", async () => {
    const app = makeApp();
    const res = await inscription(app, {});

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ ok: true, waitlist: false });
    expect(body.places).toMatchObject({ registered: 1, remaining: 1, full: false });
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
  });

  it("même email → idempotent, sans doublon", async () => {
    const app = makeApp();
    await inscription(app, {});
    const res = await inscription(app, { email: "ANA@test.fr", prenom: "Autre" });

    expect(res.statusCode).toBe(200);
    expect(res.json().places.registered).toBe(1);
  });

  it("capacité atteinte → 409 complet, puis liste d'attente acceptée", async () => {
    const app = makeApp();
    await inscription(app, { email: "un@test.fr" });
    await inscription(app, { email: "deux@test.fr" });

    const refus = await inscription(app, { email: "trois@test.fr" });
    expect(refus.statusCode).toBe(409);
    expect(refus.json()).toMatchObject({ error: "complet" });
    expect(refus.json().places.full).toBe(true);

    const attente = await inscription(app, { email: "trois@test.fr", waitlist: true });
    expect(attente.statusCode).toBe(200);
    expect(attente.json()).toMatchObject({ ok: true, waitlist: true });
    expect(attente.json().places.registered).toBe(2);
  });

  it("status full forcé → 409 même à 0 inscrit", async () => {
    const app = makeApp();
    const res = await inscription(app, { atelierId: "force-complet" });
    expect(res.statusCode).toBe(409);
  });

  it("atelier passé → 410", async () => {
    const app = makeApp();
    const res = await inscription(app, { atelierId: "passe" });
    expect(res.statusCode).toBe(410);
  });

  it("honeypot rempli → faux succès, rien stocké", async () => {
    const app = makeApp();
    const res = await inscription(app, { website: "http://spam" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    const places = await app.inject({ method: "GET", url: "/ateliers/places" });
    expect(places.json().places["ouvert"].registered).toBe(0);
  });

  it("valide atelier, prénom et email", async () => {
    const app = makeApp();
    expect((await inscription(app, { atelierId: "inconnu" })).statusCode).toBe(400);
    expect((await inscription(app, { prenom: "  " })).statusCode).toBe(400);
    expect((await inscription(app, { email: "pas-un-email" })).statusCode).toBe(400);
  });

  it("limite de débit → 429", async () => {
    const app = makeApp({}, new IpRateLimiter(2, 100));
    await inscription(app, { email: "un@test.fr" });
    await inscription(app, { email: "deux@test.fr" });
    const res = await inscription(app, { email: "trois@test.fr", waitlist: true });
    expect(res.statusCode).toBe(429);
  });

  it("origine inconnue → traité mais sans ACAO (protection navigateur)", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/ateliers/inscriptions",
      headers: { origin: "https://mechant.test" },
      payload: { atelierId: "ouvert", prenom: "Ana", email: "ana@test.fr", website: "" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("préflight OPTIONS → 204 avec les en-têtes CORS", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "OPTIONS",
      url: "/ateliers/inscriptions",
      headers: { origin: ORIGIN },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
  });
});

describe("routes admin", () => {
  it("liste et purge avec le jeton ; refuse sans", async () => {
    const app = makeApp();
    await inscription(app, {});

    const sans = await app.inject({ method: "GET", url: "/ateliers/inscriptions" });
    expect(sans.statusCode).toBe(401);

    const avec = await app.inject({
      method: "GET",
      url: "/ateliers/inscriptions?atelier=ouvert",
      headers: { authorization: "Bearer jeton-test" },
    });
    expect(avec.statusCode).toBe(200);
    expect(avec.json().inscriptions).toHaveLength(1);
    expect(avec.json().inscriptions[0]).toMatchObject({ prenom: "Ana", email: "ana@test.fr" });

    const purge = await app.inject({
      method: "DELETE",
      url: "/ateliers/inscriptions?atelier=ouvert",
      headers: { authorization: "Bearer jeton-test" },
    });
    expect(purge.json()).toEqual({ ok: true, supprimees: 1 });
  });

  it("jeton non configuré → 404 (routes admin désactivées)", async () => {
    const app = makeApp({ adminToken: "" });
    const res = await app.inject({
      method: "GET",
      url: "/ateliers/inscriptions",
      headers: { authorization: "Bearer jeton-test" },
    });
    expect(res.statusCode).toBe(404);
  });
});
