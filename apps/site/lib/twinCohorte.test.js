// lib/twinCohorte.test.js
//
// Les textes de consentement : l'ancien texte ne change pas, la version en ligne dit ce
// que la conservation fait, et les versions restent en phase avec le service de dépôt.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { TES_DONNEES, TEXTES_DE_CONSENTEMENT, VERSION_EN_LIGNE } from "./twinCohorte.mjs";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("les textes de consentement", () => {
  it("l'ancien texte ne change pas : il porte les dépôts faits sous lui", () => {
    expect(TEXTES_DE_CONSENTEMENT["2026-07"].case).toBe(
      "J\u2019accepte que mon archive d\u2019entraînement soit utilisée pour calibrer le Locomotion Twin, puis supprimée après analyse.",
    );
  });

  it("la version en ligne dit la durée, le chiffrement, la FC, la recherche et la suppression sur demande", () => {
    expect(VERSION_EN_LIGNE).toBe("2026-10");
    const v = TEXTES_DE_CONSENTEMENT[VERSION_EN_LIGNE];
    expect(v.case).toContain("fréquence cardiaque");
    for (const texte of [v.case, v.sousLEnvoi, v.succes]) {
      expect(texte).toContain("six mois");
      expect(texte).toContain("chiffrée");
      expect(texte).toContain("recherche");
      expect(texte).toContain("supprim");
    }
    // les prénoms restent au registre : aucun texte ne promet l'anonymat
    for (const texte of Object.values(v)) expect(texte).not.toContain("anonyme");
  });

  it("le bloc « Tes données » dit quoi, pourquoi, combien de temps, où, et les droits", () => {
    const blocs = TES_DONNEES[VERSION_EN_LIGNE];
    expect(blocs.map((b) => b.titre)).toEqual([
      "Ce que tu confies", "Pour quoi faire", "Combien de temps", "Où", "Tes droits",
    ]);
    const tout = blocs.map((b) => b.texte).join(" ");
    expect(tout).toContain("accompagnement personnalisé");
    expect(tout).toContain("sous ton prénom");
    expect(tout).not.toContain("anonyme");
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
