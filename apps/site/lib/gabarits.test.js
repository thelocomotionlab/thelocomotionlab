// lib/gabarits.test.js
//
// Ce que les gabarits DÉRIVENT du contenu, plutôt que de le déclarer : le
// registre du Blog, le seuil de la barre de thèmes de Science, la lecture d'un
// chiffre de carte d'aventure.

import { describe, it, expect } from "vitest";

import { TYPES, parAnnee } from "./blogRegistre";
import { barreDeThemesVisible } from "./science";
import { chiffreDeCarte, campagneLisible, ETATS } from "./aventure";
import { dateLisible, dateEnToutesLettres, minutesDeLecture } from "./lisible";
import { entrees } from "./blog";
import { aventures, parSorte, urlDe, blocAventuresDeLAccueil } from "./contenu";

describe("le registre du Blog", () => {
  it("accueille les billets ET les récits d'aventure", () => {
    const sortes = new Set(entrees().map((entree) => entree.sorte));
    expect(sortes.has("billet")).toBe(true);
    expect(sortes.has("recit")).toBe(true);
  });

  it("garde au récit son URL sous son aventure", () => {
    const recit = entrees().find((entree) => entree.sorte === "recit");
    expect(recit.url).toMatch(/^\/aventures\/[a-z0-9-]+\/recit$/);
  });

  it("nomme chaque type, récits d'aventure compris", () => {
    for (const entree of entrees()) {
      expect(TYPES[entree.type], entree.slug).toBeTruthy();
      expect(entree.typeLabel).toBe(TYPES[entree.type]);
    }
  });

  it("groupe par année puis par mois, du plus récent au plus ancien", () => {
    const groupes = parAnnee([
      { date: "2026-05-17" },
      { date: "2025-12-09" },
      { date: "2026-02-26" },
    ]);
    expect(groupes.map((groupe) => groupe.annee)).toEqual(["2026", "2025"]);
    expect(groupes[0].mois.map((mois) => mois.libelle)).toEqual(["mai", "février"]);
    expect(groupes[0].mois[0].id).toBe("blog-2026-05");
  });
});

describe("la barre de thèmes de Science", () => {
  it("reste masquée sous deux thèmes portant chacun deux articles", () => {
    expect(barreDeThemesVisible([])).toBe(false);
    expect(barreDeThemesVisible([{ nom: "a", compte: 5 }])).toBe(false);
    expect(barreDeThemesVisible([{ nom: "a", compte: 2 }, { nom: "b", compte: 1 }])).toBe(false);
  });

  it("s'affiche au-dessus du seuil", () => {
    expect(barreDeThemesVisible([{ nom: "a", compte: 2 }, { nom: "b", compte: 2 }])).toBe(true);
  });

  it("est masquée sur le contenu réel, qui n'a qu'un thème", () => {
    expect(barreDeThemesVisible()).toBe(false);
  });
});

describe("l'étagère des aventures", () => {
  it("détache la valeur du libellé, et laisse entier ce qui n'est pas un nombre", () => {
    expect(chiffreDeCarte("9 800 m D+")).toEqual({ valeur: "9 800", libelle: "m D+" });
    expect(chiffreDeCarte("170 km")).toEqual({ valeur: "170", libelle: "km" });
    expect(chiffreDeCarte("sandales")).toEqual({ valeur: "sandales", libelle: null });
  });

  it("abrège la campagne quand elle tient dans une année", () => {
    expect(campagneLisible({ debut: "2025-09-29", fin: "2025-11-30" })).toBe(
      "Campagne 29/09 → 30/11/2025",
    );
    expect(campagneLisible({ debut: "2026-12-28", fin: "2027-01-05" })).toBe(
      "Campagne 28/12/2026 → 05/01/2027",
    );
  });

  it("n'annonce qu'un départ quand la campagne n'a pas de fin", () => {
    expect(campagneLisible({ debut: "2027-01-10" })).toBe("Départ le 10/01/2027");
  });

  it("nomme les trois états du modèle", () => {
    expect(Object.keys(ETATS)).toEqual(["termine", "en-cours", "en-preparation"]);
  });
});

describe("les pages routées", () => {
  it("ne routent que ce qui déclare statut: publie", () => {
    for (const page of [...aventures(), ...parSorte("billet"), ...parSorte("article")]) {
      expect(page.frontmatter.statut, page.chemin).toBe("publie");
    }
  });

  it("donnent à chaque sorte l'URL du modèle", () => {
    expect(urlDe(aventures()[0])).toMatch(/^\/aventures\//);
    expect(urlDe(parSorte("billet")[0])).toMatch(/^\/blog\//);
    expect(urlDe(parSorte("article")[0])).toMatch(/^\/science\//);
  });
});

describe("les mises en forme partagées", () => {
  it("écrit les dates en français", () => {
    expect(dateLisible("2026-05-17")).toBe("17/05/2026");
    expect(dateEnToutesLettres("2026-05-17")).toBe("17 mai 2026");
  });

  it("laisse le frontmatter l'emporter sur la durée estimée", () => {
    expect(minutesDeLecture("un texte court", 12)).toBe(12);
    expect(minutesDeLecture("mot ".repeat(440))).toBe(2);
    expect(minutesDeLecture("")).toBe(1);
  });
});

describe("le bloc Aventures de l'accueil", () => {
  it("montre le récit d'une campagne quand il existe, la campagne sinon", () => {
    for (const carte of blocAventuresDeLAccueil()) {
      if (carte.genre === "recit") {
        expect(carte.url).toMatch(/\/recit$/);
      } else {
        expect(carte.url).toMatch(/^\/aventures\/[a-z0-9-]+$/);
      }
    }
  });

  it("annonce la sorte en surtitre et porte le titre du récit en titre", () => {
    const carte = blocAventuresDeLAccueil().find((entree) => entree.genre === "recit");
    const campagne = aventures().find((page) => page.frontmatter.recit);

    expect(carte.surtitre).toBe("Récit");
    expect(carte.titre).toBe(
      parSorte("recit").find((page) => page.frontmatter.slug === campagne.frontmatter.recit)
        .frontmatter.titre,
    );
  });

  it("dit « Lire le récit » sur une campagne terminée, « Suivre la campagne » sinon", () => {
    for (const carte of blocAventuresDeLAccueil()) {
      if (carte.etat === "termine") {
        expect(carte.action).toMatch(/^(Lire le récit|Voir la campagne)$/);
      } else {
        expect(carte.action).toBe("Suivre la campagne");
      }
    }
  });

  it("trie sur la date de l'événement le plus récent", () => {
    const dates = blocAventuresDeLAccueil().map((carte) => carte.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
