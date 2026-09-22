// lib/twinTableauDeBord.test.js
//
// Ce que ces tests gardent : l'heure d'un départ ne bouge pas avec le fuseau de celui
// qui regarde, et le statut d'un dossier dit toujours quelque chose.

import { describe, expect, it } from "vitest";

import {
  COMPTEURS,
  NIVEAUX,
  PAS,
  VERBES,
  departLisible,
  duree,
  jourLisible,
  nombre,
  pasFranchis,
  statutDuDossier,
  tailleLisible,
} from "./twinTableauDeBord.mjs";

describe("l'heure d'un départ", () => {
  it("se lit dans le fuseau de la COURSE, pas dans celui du navigateur", () => {
    // 13h00 à Nice reste 13h00 qu'on le lise depuis Nice, depuis un serveur en UTC ou
    // depuis un avion. C'est l'heure du départ : elle ne se négocie pas.
    expect(departLisible("2026-09-25T13:00:00+02:00")).toContain("13h00");
    expect(departLisible("2026-10-22T22:00:00+04:00")).toContain("22h00");
    expect(departLisible("2026-01-15T06:30:00-05:00")).toContain("06h30");
  });

  it("garde le bon jour quand le décalage ferait changer de date", () => {
    // Minuit et demi à La Réunion, c'est la veille en UTC. Un jour de course faux,
    // c'est un athlète qui rate son départ.
    expect(jourLisible("2026-10-22T00:30:00+04:00")).toBe("22/10/2026");
    expect(departLisible("2026-10-22T00:30:00+04:00")).toContain("jeu. 22 oct.");
  });

  it("accepte un instant sans fuseau écrit", () => {
    expect(departLisible("2026-09-25T13:00:00Z")).toContain("13h00");
  });

  it("rend une chaîne vide plutôt qu'une date fausse", () => {
    expect(departLisible("")).toBe("");
    expect(departLisible("pas une date")).toBe("");
    expect(jourLisible(null)).toBe("");
  });
});

describe("le statut d'un dossier", () => {
  it("laisse parler l'ingestion tant que l'archive n'est pas lue", () => {
    expect(statutDuDossier({ ingestion: "recu" })).toEqual({
      mot: "Archive reçue",
      ton: "annonce",
    });
    expect(statutDuDossier({ ingestion: "illisible" }).ton).toBe("derriere");
  });

  it("passe la parole au plan une fois l'archive lue", () => {
    expect(statutDuDossier({ ingestion: "ingere", plan_statut: "publie" })).toEqual({
      mot: "publié",
      ton: "deroule",
    });
    expect(statutDuDossier({ ingestion: "ingere" }).mot).toBe("à composer");
  });

  it("ne rend jamais rien, même sur un état qu'il ne connaît pas", () => {
    expect(statutDuDossier({ ingestion: "martien" }).mot).toBe("—");
    expect(statutDuDossier({ ingestion: "ingere", plan_statut: "martien" }).mot).toBe("martien");
  });

  it("n'emploie que les trois tons de la charte", () => {
    const etats = ["recu", "en_cours", "ingere", "illisible"];
    const plans = [null, "a_composer", "genere", "publie", "envoye", "fige", "resultat"];
    for (const ingestion of etats) {
      for (const plan of plans) {
        const { ton } = statutDuDossier({ ingestion, plan_statut: plan });
        expect(["annonce", "deroule", "derriere"]).toContain(ton);
      }
    }
  });
});

describe("les sept pas", () => {
  it("s'arrêtent au premier tant que l'archive n'est pas lue", () => {
    for (const ingestion of ["recu", "en_cours", "illisible"]) {
      expect(pasFranchis({ ingestion })).toBe(1);
    }
  });

  it("avancent avec le plan, sans jamais dépasser", () => {
    expect(pasFranchis({ ingestion: "ingere" })).toBe(3);
    expect(pasFranchis({ ingestion: "ingere", plan_statut: "genere" })).toBe(4);
    expect(pasFranchis({ ingestion: "ingere", plan_statut: "resultat" })).toBe(PAS.length);
    expect(pasFranchis({ ingestion: "ingere", plan_statut: "martien" })).toBe(3);
  });
});

describe("les libellés", () => {
  it("couvrent les cinq verbes et les deux niveaux", () => {
    expect(Object.keys(VERBES).sort()).toEqual(
      ["composer", "envoyer", "ingerer", "publier", "rien", "saisir_resultat"].sort(),
    );
    expect(NIVEAUX).toEqual({ base: "Plan de base", calibre: "Plan calibré" });
  });

  it("montrent quatre compteurs, pas cinq", () => {
    // La cinquième case du moteur — « rien à faire » — existe pour que la partition
    // soit complète ; un tableau de bord, lui, montre ce qui attend un geste.
    expect(COMPTEURS).toHaveLength(4);
    expect(COMPTEURS.map(([cle]) => cle)).not.toContain("en_attente");
  });
});

describe("les chiffres", () => {
  it("rendent un tiret plutôt qu'un zéro inventé", () => {
    expect(nombre(null)).toBe("—");
    expect(nombre(undefined, 1, "km/h")).toBe("—");
    expect(duree(null)).toBe("—");
  });

  it("écrivent à la française", () => {
    expect(nombre(9.72, 1, "km/h")).toBe("9,7 km/h");
    expect(duree(21.25)).toBe("21 h 15");
    expect(duree(9.999)).toBe("10 h 00");
  });

  it("taisent une taille absente plutôt que d'écrire « 0 o »", () => {
    expect(tailleLisible(0)).toBe("");
    expect(tailleLisible(null)).toBe("");
    expect(tailleLisible(1024)).toBe("1 Ko");
    expect(tailleLisible(1_234_567)).toBe("1,2 Mo");
    expect(tailleLisible(12 * 1024 ** 3)).toBe("12 Go");
  });
});
