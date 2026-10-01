import { describe, expect, it } from "vitest";

import { CONSENTEMENT_SUPPRESSION, paragrapheConservation } from "../src/mailer";
import type { Depot } from "../src/store";

function depot(over: Partial<Depot> = {}): Depot {
  return {
    id: "x", reference: "LL-TWIN-2026-0001", prenom: "Chloé", nom: "", email: "c@t.fr",
    montre: "garmin", objectifs: "", objectifCible: "", objectifHeures: null, consent: true,
    nomFichier: "a.zip", taille: 1, sha256: "s", createdAt: "2026-10-01T10:00:00.000Z",
    ip: "1.1.1.1", ...over,
  };
}

describe("ce que la confirmation promet", () => {
  it("l'ancien consentement : suppression après analyse, mot pour mot", () => {
    for (const d of [depot(), depot({ consentementVersion: CONSENTEMENT_SUPPRESSION })]) {
      expect(paragrapheConservation(d, 183).join(" ")).toContain("supprimée immédiatement");
    }
  });

  it("le consentement à la conservation : la date d'échéance, puis la suppression", () => {
    const texte = paragrapheConservation(depot({ consentementVersion: "2026-10" }), 183).join(" ");
    expect(texte).toContain("conservée chiffrée");
    expect(texte).toContain("2 avril 2027");
    expect(texte).not.toContain("immédiatement");
  });
});
