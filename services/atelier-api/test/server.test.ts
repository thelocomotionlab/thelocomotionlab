import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

import type { Config } from "../src/config";
import type { FicheMail } from "../src/mailer";
import { IpRateLimiter } from "../src/ratelimit";
import { buildServer, type ServerDeps } from "../src/server";
import { InscriptionStore } from "../src/store";

const ORIGIN = "https://ok.test";

const cleanups: Array<() => Promise<void> | void> = [];

const FICHE_CONFIG = {
  responsable: { nom: "Valentin Fer", email: "contact@test.fr" },
  assurance: { assureur: "AsurTest", numero: "123" },
  image: { supports: "le site", duree: "3 ans" },
  atelier: { duree: "1 h 30", contexte: "en extérieur", encadrant: "Valentin Fer" },
};

function makeApp(
  overrides: Partial<Config> = {},
  deps: Partial<ServerDeps> = {},
): FastifyInstance {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atelier-api-"));
  const config: Config = {
    port: 0,
    dataDir: dir,
    allowedOrigins: [ORIGIN],
    adminToken: "jeton-test",
    ratePerMinute: 100,
    ratePerHour: 1000,
    ateliers: [
      { id: "ouvert", capacity: 2, status: "open", title: "Atelier ouvert", dateLabel: "Samedi 1 mai", lieu: "Parc" },
      { id: "force-complet", capacity: 2, status: "full", title: "Complet", dateLabel: "Dim. 2 mai", lieu: "Bois" },
      { id: "passe", capacity: 2, status: "past", title: "Passé", dateLabel: "Lundi 3 mai", lieu: "Pré" },
    ],
    fiche: FICHE_CONFIG,
    twinEngineUrl: "",
    ...overrides,
  };
  const store = new InscriptionStore(config.dataDir);
  const app = buildServer({ config, store, logger: false, ...deps });
  cleanups.push(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return app;
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function ficheValide(over: Record<string, unknown> = {}) {
  return {
    participant: { prenom: "Ana", nom: "Souza", email: "ana@test.fr", telephone: "06 11 22 33 44" },
    urgence: { nom: "Bob Souza", telephone: "06 99 88 77 66" },
    mineur: { actif: false, nom: "", prenom: "", date_naissance: "" },
    sante: { attestation: true, commentaire_libre: "" },
    image: { autorise: false },
    consentement: {
      consignes: true,
      majeur: true,
      exactitude: true,
      autorite_parentale: false,
      soins_urgence: false,
    },
    ...over,
  };
}

const CONTENU = {
  consignes: [
    { titre: "Échauffe-toi.", texte: "Obligatoire." },
    { titre: "Retire-toi quand tu veux.", texte: "Jamais un échec." },
  ],
  consignesMineur: "plafonds réduits de moitié.",
  sante: ["Question A ?", "Question B ?"],
};

function inscrire(app: FastifyInstance, over: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/ateliers/inscriptions",
    headers: { origin: ORIGIN },
    payload: {
      atelierId: "ouvert",
      website: "",
      fiche: ficheValide(),
      contenu: CONTENU,
      ...over,
    },
  });
}

function attente(app: FastifyInstance, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/ateliers/inscriptions",
    headers: { origin: ORIGIN },
    payload: { atelierId: "ouvert", website: "", waitlist: true, ...payload },
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

describe("POST /ateliers/inscriptions — inscription complète", () => {
  it("inscrit, référence le dossier et décompte", async () => {
    const app = makeApp();
    const res = await inscrire(app);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ ok: true, waitlist: false, fiche: "email_non_configure" });
    expect(body.reference).toMatch(/^LL-ATL-\d{4}-0001$/);
    expect(body.horodatage).toContain("202");
    expect(body.places).toMatchObject({ registered: 1, remaining: 1 });
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
  });

  it("rend le PDF et envoie l'email (statut envoyee)", async () => {
    const mails: FicheMail[] = [];
    const render = vi.fn(async () => Buffer.from("%PDF-fake"));
    const app = makeApp({}, {
      renderFiche: render,
      envoyerEmail: async (mail) => {
        mails.push(mail);
      },
    });

    const res = await inscrire(app);
    expect(res.json().fiche).toBe("envoyee");
    expect(render).toHaveBeenCalledOnce();
    // le payload de rendu porte le contenu émis par la page (source unique)
    const payload = render.mock.calls[0][0] as Record<string, any>;
    expect(payload.consignes.liste).toHaveLength(2);
    expect(payload.sante.questions).toEqual(["Question A ?", "Question B ?"]);
    expect(payload.atelier.intitule).toBe("Atelier ouvert");
    expect(payload.dossier.reference).toMatch(/0001$/);
    expect(payload.preuve.ip).toBeTruthy();

    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe("ana@test.fr");
    expect(mails[0].pdf?.toString()).toContain("%PDF");
  });

  it("échec du rendu PDF → email quand même, statut envoyee_sans_pdf", async () => {
    const mails: FicheMail[] = [];
    const app = makeApp({}, {
      renderFiche: async () => {
        throw new Error("xelatex en panne");
      },
      envoyerEmail: async (mail) => {
        mails.push(mail);
      },
    });
    const res = await inscrire(app);
    expect(res.json()).toMatchObject({ ok: true, fiche: "envoyee_sans_pdf" });
    expect(mails[0].pdf).toBeNull();
  });

  it("échec de l'email → inscription conservée, statut email_echec", async () => {
    const app = makeApp({}, {
      renderFiche: async () => Buffer.from("%PDF"),
      envoyerEmail: async () => {
        throw new Error("SMTP down");
      },
    });
    const res = await inscrire(app);
    expect(res.json()).toMatchObject({ ok: true, fiche: "email_echec" });
    const places = await app.inject({ method: "GET", url: "/ateliers/places" });
    expect(places.json().places["ouvert"].registered).toBe(1);
  });

  it("coches obligatoires manquantes → 400 avec la liste des champs", async () => {
    const app = makeApp();
    const fiche = ficheValide({
      urgence: { nom: "", telephone: "" },
      consentement: {
        consignes: false,
        majeur: false,
        exactitude: true,
        autorite_parentale: false,
        soins_urgence: false,
      },
      image: {},
    });
    const res = await inscrire(app, { fiche });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe("fiche_incomplete");
    expect(body.champs).toEqual(
      expect.arrayContaining([
        "urgence.nom",
        "urgence.telephone",
        "image.autorise",
        "consentement.consignes",
        "consentement.majeur",
      ]),
    );
    const places = await app.inject({ method: "GET", url: "/ateliers/places" });
    expect(places.json().places["ouvert"].registered).toBe(0);
  });

  it("mineur : autorité parentale + soins remplacent majeur", async () => {
    const app = makeApp();
    const fiche = ficheValide({
      mineur: { actif: true, prenom: "Lou", nom: "Souza", date_naissance: "2013-03-12" },
      consentement: {
        consignes: true,
        majeur: false,
        exactitude: true,
        autorite_parentale: true,
        soins_urgence: true,
      },
    });
    expect((await inscrire(app, { fiche })).statusCode).toBe(200);

    const sans = ficheValide({
      participant: { prenom: "Zoe", nom: "Lima", email: "zoe@test.fr", telephone: "06" },
      mineur: { actif: true, prenom: "Max", nom: "Lima", date_naissance: "2012-01-01" },
      consentement: {
        consignes: true,
        majeur: false,
        exactitude: true,
        autorite_parentale: true,
        soins_urgence: false,
      },
    });
    const refus = await inscrire(app, { fiche: sans });
    expect(refus.statusCode).toBe(400);
    expect(refus.json().champs).toContain("consentement.soins_urgence");
  });

  it("même email → idempotent, sans doublon ni nouvel email", async () => {
    let envois = 0;
    const app = makeApp({}, {
      renderFiche: null,
      envoyerEmail: async () => {
        envois += 1;
      },
    });
    await inscrire(app);
    const res = await inscrire(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().fiche).toBe("deja_inscrit");
    expect(res.json().places.registered).toBe(1);
    expect(envois).toBe(1);
  });

  it("capacité atteinte → 409 complet", async () => {
    const app = makeApp();
    await inscrire(app);
    await inscrire(app, {
      fiche: ficheValide({
        participant: { prenom: "Bea", nom: "Nunes", email: "bea@test.fr", telephone: "06" },
      }),
    });
    const res = await inscrire(app, {
      fiche: ficheValide({
        participant: { prenom: "Caro", nom: "Dias", email: "caro@test.fr", telephone: "06" },
      }),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "complet" });
  });

  it("atelier passé → 410", async () => {
    const app = makeApp();
    const res = await inscrire(app, { atelierId: "passe" });
    expect(res.statusCode).toBe(410);
  });

  it("honeypot rempli → faux succès, rien stocké", async () => {
    const app = makeApp();
    const res = await inscrire(app, { website: "http://spam" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    const places = await app.inject({ method: "GET", url: "/ateliers/places" });
    expect(places.json().places["ouvert"].registered).toBe(0);
  });
});

describe("POST /ateliers/inscriptions — liste d'attente", () => {
  it("prénom + email suffisent sur un atelier complet", async () => {
    const app = makeApp();
    const res = await attente(app, {
      atelierId: "force-complet",
      prenom: "Ana",
      email: "ana@test.fr",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, waitlist: true });
    expect(res.json().places.registered).toBe(0); // la liste d'attente ne décompte pas
  });

  it("valide prénom et email", async () => {
    const app = makeApp();
    expect((await attente(app, { prenom: " ", email: "a@b.fr" })).statusCode).toBe(400);
    expect((await attente(app, { prenom: "Ana", email: "pas-un-email" })).statusCode).toBe(400);
  });

  it("limite de débit → 429", async () => {
    const app = makeApp({}, { limiter: new IpRateLimiter(2, 100) });
    await attente(app, { prenom: "A", email: "a@t.fr" });
    await attente(app, { prenom: "B", email: "b@t.fr" });
    const res = await attente(app, { prenom: "C", email: "c@t.fr" });
    expect(res.statusCode).toBe(429);
  });
});

describe("CORS", () => {
  it("origine inconnue → traité mais sans ACAO (protection navigateur)", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/ateliers/inscriptions",
      headers: { origin: "https://mechant.test" },
      payload: { atelierId: "ouvert", website: "", fiche: ficheValide(), contenu: CONTENU },
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
  it("liste (avec fiche) et purge avec le jeton ; refuse sans", async () => {
    const app = makeApp();
    await inscrire(app);

    const sans = await app.inject({ method: "GET", url: "/ateliers/inscriptions" });
    expect(sans.statusCode).toBe(401);

    const avec = await app.inject({
      method: "GET",
      url: "/ateliers/inscriptions?atelier=ouvert",
      headers: { authorization: "Bearer jeton-test" },
    });
    expect(avec.statusCode).toBe(200);
    const [inscription] = avec.json().inscriptions;
    expect(inscription).toMatchObject({ prenom: "Ana", email: "ana@test.fr" });
    expect(inscription.reference).toMatch(/^LL-ATL-/);
    expect(inscription.empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(inscription.fiche.urgence).toEqual({ nom: "Bob Souza", telephone: "06 99 88 77 66" });

    const purge = await app.inject({
      method: "DELETE",
      url: "/ateliers/inscriptions?atelier=ouvert",
      headers: { authorization: "Bearer jeton-test" },
    });
    expect(purge.json()).toEqual({ ok: true, supprimees: 1 });
  });

  it("désistement individuel : DELETE /:id libère la place, 404 si inconnu", async () => {
    const app = makeApp();
    await inscrire(app);

    const listing = await app.inject({
      method: "GET",
      url: "/ateliers/inscriptions?atelier=ouvert",
      headers: { authorization: "Bearer jeton-test" },
    });
    const [inscription] = listing.json().inscriptions;

    const sans = await app.inject({
      method: "DELETE",
      url: `/ateliers/inscriptions/${inscription.id}`,
    });
    expect(sans.statusCode).toBe(401);

    const res = await app.inject({
      method: "DELETE",
      url: `/ateliers/inscriptions/${inscription.id}`,
      headers: { authorization: "Bearer jeton-test" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      ok: true,
      supprimee: inscription.reference,
      atelierId: "ouvert",
      places: { registered: 0, remaining: 2 },
    });

    const encore = await app.inject({
      method: "DELETE",
      url: `/ateliers/inscriptions/${inscription.id}`,
      headers: { authorization: "Bearer jeton-test" },
    });
    expect(encore.statusCode).toBe(404);
    expect(encore.json()).toEqual({ ok: false, error: "inscription_inconnue" });
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
