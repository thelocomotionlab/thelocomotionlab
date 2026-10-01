// lib/twinCohorte.test.js
//
// Les textes de consentement : la version en ligne ne change pas, la version à
// conservation dit ce que la conservation fait, et les versions restent en phase avec le
// service de dépôt.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { TEXTES_DE_CONSENTEMENT, VERSION_EN_LIGNE } from "./twinCohorte.mjs";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("les textes de consentement", () => {
  it("la page en ligne garde son texte", () => {
    expect(VERSION_EN_LIGNE).toBe("2026-07");
    expect(TEXTES_DE_CONSENTEMENT["2026-07"].case).toBe(
      "J\u2019accepte que mon archive d\u2019entraînement soit utilisée pour calibrer le Locomotion Twin, puis supprimée après analyse.",
    );
  });

  it("la version à conservation dit la durée, le chiffrement, la FC, la purge et l'anonymat", () => {
    const v = TEXTES_DE_CONSENTEMENT["2026-10"];
    for (const texte of [v.case, v.page]) {
      expect(texte).toContain("fréquence cardiaque");
      expect(texte).toContain("six mois");
      expect(texte).toContain("chiffrée");
      expect(texte).toContain("supprimée");
      expect(texte).toContain("anonyme");
    }
    for (const texte of [v.sousLEnvoi, v.succes]) {
      expect(texte).toContain("six mois");
      expect(texte).toContain("anonyme");
    }
  });

  it("chaque version a ses quatre textes et le service de dépôt les connaît", () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(RACINE, "services/twin-depot/twin-depot.config.json"), "utf8"),
    );
    for (const [version, textes] of Object.entries(TEXTES_DE_CONSENTEMENT)) {
      expect(Object.keys(textes).sort()).toEqual(["case", "page", "sousLEnvoi", "succes"]);
      expect(config.consentementVersions).toContain(version);
    }
    expect(config.consentementVersions[0]).toBe(VERSION_EN_LIGNE);
  });
});
