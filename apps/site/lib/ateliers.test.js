// lib/ateliers.test.js
//
// Un seul invariant, mais celui qui a cassé un déploiement le 5 août 2026 :
// la liste des paramètres statiques de /pratiquer/inscription/[slug] ne doit
// JAMAIS être vide, même quand plus aucun atelier n'est programmé.

import { describe, expect, it } from "vitest";

import { atelierSlugParams, listAteliers, SLUG_AUCUN_ATELIER } from "./ateliers.mjs";

describe("atelierSlugParams — garde-fou du build Cloudflare", () => {
  it("ne renvoie jamais une liste vide", () => {
    // Sans chemin à prérendre, Next laisse la route dynamique et lui émet une
    // fonction Node ; next-on-pages la refuse alors faute de runtime edge, et
    // `deploy:staging` échoue en accusant la route plutôt que le catalogue.
    expect(atelierSlugParams().length).toBeGreaterThan(0);
  });

  it("catalogue vide → uniquement le slug bouchon (404 statique)", () => {
    if (listAteliers().length === 0) {
      expect(atelierSlugParams()).toEqual([{ slug: SLUG_AUCUN_ATELIER }]);
    }
  });

  it("catalogue rempli → un paramètre par atelier, et pas de bouchon", () => {
    const ateliers = listAteliers();
    if (ateliers.length > 0) {
      expect(atelierSlugParams()).toEqual(ateliers.map((a) => ({ slug: a.slug })));
      expect(atelierSlugParams().some((p) => p.slug === SLUG_AUCUN_ATELIER)).toBe(false);
    }
  });

  it("chaque slug est utilisable dans une URL", () => {
    for (const { slug } of atelierSlugParams()) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
