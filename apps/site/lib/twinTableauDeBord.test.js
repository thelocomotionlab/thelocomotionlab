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
  echelleDuProfil,
  ecartEnPourcent,
  heureDePassage,
  jourLisible,
  lePlusProche,
  lireUneDuree,
  nombre,
  pasFranchis,
  signe,
  statutDuDossier,
  statutDuPlan,
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
    // les milliers se séparent d'une espace fine insécable : « 9111 m » se lit mal
    expect(nombre(9111, 0, "m")).toBe("9\u202f111 m");
    expect(nombre(10698.4, 1)).toBe("10\u202f698,4");
    expect(nombre(169.7, 1)).toBe("169,7");
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


describe("un temps saisi à la main", () => {
  it("se lit comme on le recopie d'un classement", () => {
    expect(lireUneDuree("34h12")).toBeCloseTo(34.2, 6);
    expect(lireUneDuree("34 h 12")).toBeCloseTo(34.2, 6);
    expect(lireUneDuree("34:12")).toBeCloseTo(34.2, 6);
    expect(lireUneDuree("31:38:12")).toBeCloseTo(31 + 38 / 60 + 12 / 3600, 6);
    expect(lireUneDuree("34h")).toBe(34);
    expect(lireUneDuree("34,5")).toBe(34.5);
  });

  it("ne devine rien de ce qui ne se lit pas", () => {
    // un temps inventé fausserait le registre : mieux vaut ne rien lire
    for (const illisible of ["", "  ", "trente", "34h75", "0", "0:00", "12:30:99", null]) {
      expect(lireUneDuree(illisible), String(illisible)).toBe(null);
    }
  });
});

describe("une heure de passage", () => {
  it("se lit dans le fuseau de la course, jour compris", () => {
    expect(heureDePassage("2026-09-26T20:28:12+02:00")).toBe("sam. 20h28");
    expect(heureDePassage("")).toBe("");
  });
});

describe("un écart", () => {
  it("se dit signé, à la française", () => {
    expect(ecartEnPourcent(9111, 8900)).toBeCloseTo(2.37, 2);
    expect(signe(ecartEnPourcent(9111, 8900))).toBe("+2,4");
    expect(signe(-1)).toBe("−1,0");
    expect(ecartEnPourcent(9111, null)).toBe(null);
    expect(signe(null)).toBe("—");
  });
});

describe("l'aimant des phases", () => {
  it("rend le ravitaillement le plus proche", () => {
    expect(lePlusProche(36, [0, 8.1, 37.6, 50.1])).toBe(37.6);
    expect(lePlusProche(3, [])).toBe(null);
  });
});

describe("le profil altimétrique", () => {
  const profil = [[0, 1593], [8.1, 1152], [16.5, 2436], [169.7, 6]];

  it("occupe tout le cadre, du premier au dernier kilomètre", () => {
    const e = echelleDuProfil(profil, { largeur: 1000, hauteur: 300, marge: 0 });
    expect(e.x(0)).toBe(0);
    expect(e.x(169.7)).toBe(1000);
    expect(e.altMin).toBe(0);
    expect(e.altMax).toBe(2500);
    expect(e.y(2500)).toBe(0);
    expect(e.y(0)).toBe(300);
    expect(e.ligne.startsWith("M0.0 ")).toBe(true);
    expect(e.aire.endsWith("Z")).toBe(true);
  });

  it("interpole l'altitude entre deux points", () => {
    const e = echelleDuProfil(profil);
    expect(e.altitudeA(4.05)).toBeCloseTo((1593 + 1152) / 2, 6);
    expect(e.altitudeA(500)).toBe(6);
  });

  it("ne tombe pas sur un profil vide", () => {
    const e = echelleDuProfil([]);
    expect(e.ligne).toBe("");
    expect(e.aire).toBe("");
  });
});

describe("le statut d'un plan", () => {
  it("a toujours un mot et un ton", () => {
    expect(statutDuPlan("fige")).toEqual({ mot: "figé", ton: "derriere" });
    expect(statutDuPlan("inconnu").ton).toBe("annonce");
  });
});
