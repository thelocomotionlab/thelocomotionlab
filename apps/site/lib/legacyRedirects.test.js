// lib/legacyRedirects.test.js
//
// La promesse du chantier : aucune adresse publiée un jour ne répond 404.
// Ces tests la vérifient sur le contenu RÉEL du site, puisque c'est lui que
// next.config.mjs redirige.

import { describe, it, expect } from "vitest";

import { buildLegacyRedirects } from "./legacyRedirects.mjs";
import { listEntries, routeFor, SLUG_ALIASES } from "./contentRoutes.mjs";

const redirects = buildLegacyRedirects();
const parSource = new Map(redirects.map((r) => [r.source, r.destination]));

describe("les redirections héritées", () => {
  it("émet un 308 permanent, jamais un 307", () => {
    for (const r of redirects) expect(r.permanent).toBe(true);
  });

  it("ne déclare jamais deux fois la même source", () => {
    expect(parSource.size).toBe(redirects.length);
  });

  it("ne redirige jamais une adresse vers elle-même", () => {
    for (const r of redirects) expect(r.source).not.toBe(r.destination);
  });

  it("couvre les deux anciens rayons pour chaque atome, brouillons compris", () => {
    for (const entry of listEntries()) {
      expect(parSource.get(`/articles/${entry.slug}`)).toBe(routeFor(entry));
      expect(parSource.get(`/projets/${entry.slug}`)).toBe(routeFor(entry));
    }
  });

  it("fait tomber les deux anciens index dans Explorer", () => {
    expect(parSource.get("/articles")).toBe("/explorer");
    expect(parSource.get("/projets")).toBe("/explorer");
  });
});

describe("les atomes renommés", () => {
  it("répond depuis les deux piliers et les deux rayons", () => {
    for (const [ancien, actuel] of Object.entries(SLUG_ALIASES)) {
      const cible = listEntries().find((e) => e.slug === actuel);
      const destination = routeFor(cible);

      for (const source of [
        `/comprendre/${ancien}`,
        `/explorer/${ancien}`,
        `/articles/${ancien}`,
        `/projets/${ancien}`,
      ]) {
        // Sauf la destination elle-même : un changement de pilier à slug
        // constant garde son adresse actuelle vivante.
        if (source === destination) {
          expect(parSource.has(source)).toBe(false);
        } else {
          expect(parSource.get(source)).toBe(destination);
        }
      }
    }
  });

  it("mène chaque redirection vers une page réellement générée", () => {
    const routes = new Set(listEntries().map(routeFor));
    for (const r of redirects) {
      if (r.destination === "/explorer") continue;
      expect(routes.has(r.destination)).toBe(true);
    }
  });

  it("couvre nommément les adresses publiées avant le chantier", () => {
    expect(parSource.get("/explorer/saison-trail-2026")).toBe(
      "/explorer/carnet-2026"
    );
    expect(parSource.get("/explorer/traversee-reunion")).toBe(
      "/explorer/carnet-2025"
    );
    expect(parSource.get("/explorer/recit-reunion-2025")).toBe(
      "/explorer/reunion-2025"
    );
    expect(parSource.get("/explorer/la-genese")).toBe("/comprendre/la-genese");
    expect(parSource.get("/projets/saison-trail-2026")).toBe(
      "/explorer/carnet-2026"
    );
  });
});
