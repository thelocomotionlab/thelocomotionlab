// lib/nonIndexation.test.js
//
// LE TABLEAU DE BORD N'EXISTE POUR AUCUN MOTEUR DE RECHERCHE.
//
// Quatre gardes, parce qu'aucune ne suffit seule :
//   • la balise `robots` de la page — ne vaut que si le robot exécute le HTML ;
//   • l'en-tête `X-Robots-Tag` (public/_headers) — vaut aussi pour ce qu'il
//     télécharge sans le lire ;
//   • `robots.txt` — dit de ne pas venir, plutôt que de ne pas publier ;
//   • le plan de site, qui ne le nomme pas.
//
// Et `Referrer-Policy: no-referrer`, parce qu'un chemin privé s'échappe surtout par
// l'en-tête Referer du premier appel sortant de la page.
//
// Les pages de plan des athlètes (/services/twin/plan/*) ont les mêmes gardes, avec une
// raison de plus : leur adresse porte une clé. Elles sont rendues par une fonction Edge,
// que public/_headers n'atteint pas — leurs en-têtes viennent de next.config.mjs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import robots from "../app/robots";
import sitemap from "../app/sitemap";
import nextConfig, { PAGES_DE_PLAN } from "../next.config.mjs";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREFIXE = "/services/twin/tableau-de-bord";

const PAGES = [
  "app/services/twin/tableau-de-bord/page.jsx",
  "app/services/twin/tableau-de-bord/athletes/page.jsx",
];

describe("le tableau de bord n'est pas indexable", () => {
  it("robots.txt l'interdit à TOUS les agents, pas seulement à l'étoile", () => {
    const regles = robots().rules;
    expect(regles.length).toBeGreaterThan(1);
    for (const regle of regles) {
      expect(regle.disallow, `${regle.userAgent} n'est pas couvert`).toContain(PREFIXE);
    }
  });

  it("le plan de site ne le nomme nulle part", async () => {
    const entrees = await sitemap();
    expect(entrees.length).toBeGreaterThan(0);
    expect(entrees.filter((e) => e.url.includes("tableau-de-bord"))).toEqual([]);
    expect(entrees.filter((e) => e.url.includes("/twin/plan"))).toEqual([]);
  });

  it("public/_headers pose X-Robots-Tag et Referrer-Policy sur le préfixe", () => {
    const entetes = fs.readFileSync(path.join(RACINE, "public/_headers"), "utf8");
    const bloc = entetes.slice(entetes.indexOf(`${PREFIXE}/*`));
    expect(bloc).toContain("X-Robots-Tag: noindex, nofollow");
    expect(bloc).toContain("Referrer-Policy: no-referrer");
    // Le chemin nu compte autant que le sous-arbre : c'est celui de la File.
    expect(entetes).toContain(`\n${PREFIXE}\n`);
  });

  it.each(PAGES)("%s se déclare noindex, nofollow", (relatif) => {
    const source = fs.readFileSync(path.join(RACINE, relatif), "utf8");
    expect(source).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  });

  it("aucun lien du site public n'y mène", () => {
    // Une page qu'on ne peut atteindre qu'en connaissant son adresse : c'est la
    // première des protections, et la seule qui ne dépende de personne.
    const liens = [];
    const parcourir = (dossier) => {
      for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
        const complet = path.join(dossier, entree.name);
        if (entree.isDirectory()) {
          if (entree.name !== "node_modules" && !complet.includes("tableau-de-bord")) {
            parcourir(complet);
          }
        } else if (/\.(jsx?|tsx?|mjs)$/.test(entree.name)) {
          const source = fs.readFileSync(complet, "utf8");
          if (new RegExp(`href=["'\`]${PREFIXE}`).test(source)) {
            liens.push(path.relative(RACINE, complet));
          }
        }
      }
    };
    for (const racine of ["app", "components", "lib"]) {
      parcourir(path.join(RACINE, racine));
    }
    expect(liens).toEqual([]);
  });
});


describe("la page d'un plan n'est pas indexable, et sa clé ne fuit pas", () => {
  const PLAN = "/services/twin/plan";
  const PAGE = "app/services/twin/plan/[ref]/page.jsx";

  it("robots.txt l'interdit à tous les agents", () => {
    for (const regle of robots().rules) {
      expect(regle.disallow, `${regle.userAgent} n'est pas couvert`).toContain(PLAN);
    }
  });

  it("next.config.mjs pose noindex, no-referrer et no-store sur toute page de plan", async () => {
    const regles = await nextConfig("phase-production-build").headers();
    const index = regles.indexOf(PAGES_DE_PLAN);
    expect(index, "la règle des pages de plan est servie").toBeGreaterThan(-1);
    const valeurs = Object.fromEntries(PAGES_DE_PLAN.headers.map((h) => [h.key, h.value]));
    expect(valeurs["X-Robots-Tag"]).toContain("noindex");
    expect(valeurs["Referrer-Policy"]).toBe("no-referrer");
    expect(valeurs["Cache-Control"]).toContain("no-store");
    expect(PAGES_DE_PLAN.source.startsWith(`${PLAN}/`)).toBe(true);
    // À clé égale, la dernière règle l'emporte : la générale (strict-origin…) doit
    // passer AVANT, sinon elle rendrait le Referer à une page qui porte une clé.
    const generale = regles.findIndex(
      (r) => r.source === "/(.*)" && r.headers.some((h) => h.key === "Referrer-Policy"),
    );
    expect(generale).toBeGreaterThan(-1);
    expect(index).toBeGreaterThan(generale);
  });

  it("la page se déclare noindex et no-referrer, et se rend à la demande", () => {
    const source = fs.readFileSync(path.join(RACINE, PAGE), "utf8");
    expect(source).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
    expect(source).toMatch(/referrer:\s*"no-referrer"/);
    expect(source).toMatch(/export const runtime = "edge"/);
  });

  it("aucun lien du site public n'y mène", () => {
    const liens = [];
    const parcourir = (dossier) => {
      for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
        const complet = path.join(dossier, entree.name);
        if (entree.isDirectory()) {
          if (entree.name !== "node_modules") parcourir(complet);
        } else if (/\.(jsx?|tsx?|mjs)$/.test(entree.name) && !entree.name.includes(".test.")) {
          const source = fs.readFileSync(complet, "utf8");
          if (new RegExp(`href=["'\`]${PLAN}`).test(source)) liens.push(path.relative(RACINE, complet));
        }
      }
    };
    for (const racine of ["app", "components", "lib"]) parcourir(path.join(RACINE, racine));
    expect(liens).toEqual([]);
  });

  it("le bouton de partage du site n'y apparaît pas", () => {
    // Il partagerait l'adresse courante — clé privée comprise.
    const source = fs.readFileSync(path.join(RACINE, "components/ChromeDuSite.jsx"), "utf8");
    expect(source).toMatch(new RegExp(`PLEIN_ECRAN = \\[[^\\]]*"${PLAN}"`));
  });

  it("les appels à l'API ne portent pas de Referer", () => {
    const source = fs.readFileSync(path.join(RACINE, "components/twin/plan/api.js"), "utf8");
    expect(source).toContain('referrerPolicy: "no-referrer"');
  });
});
