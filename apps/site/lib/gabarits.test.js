// lib/gabarits.test.js
//
// Ce que les gabarits DÉRIVENT du contenu, plutôt que de le déclarer : le
// registre du Blog, le seuil de la barre de thèmes de Science, la lecture d'un
// chiffre de carte d'aventure.

import { describe, it, expect } from "vitest";

import { TYPES, parAnnee } from "./blogRegistre";
import { barreDeThemesVisible } from "./science";
import { chiffreDeCarte, campagneLisible, caloriesDe, ETATS } from "./aventure";
import { dateLisible, dateEnToutesLettres, minutesDeLecture } from "./lisible";
import { entrees } from "./blog";
import { aventures, parSorte, urlDe, blocAventuresDeLAccueil } from "./contenu";

describe("le registre du Blog", () => {
  it("accueille les billets ET les récits d'aventure", () => {
    const sortes = new Set(entrees().map((entree) => entree.sorte));
    expect(sortes.has("billet")).toBe(true);
    expect(sortes.has("recit")).toBe(true);
  });

  it("adresse un récit par le slug de son aventure", () => {
    const recit = entrees().find((entree) => entree.sorte === "recit");
    expect(recit.url).toMatch(/^\/aventures\/recit\/[a-z0-9-]+$/);
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

  it("tait l'année du début quand la période tient dans une seule", () => {
    expect(campagneLisible({ debut: "2025-09-29", fin: "2025-11-30" })).toBe(
      "Prépa du 29/09 au 30/11/2025",
    );
    expect(campagneLisible({ debut: "2026-12-28", fin: "2027-01-05" })).toBe(
      "Prépa du 28/12/2026 au 05/01/2027",
    );
  });

  it("n'annonce qu'un départ quand l'aventure n'a pas de fin", () => {
    expect(campagneLisible({ debut: "2027-01-10" })).toBe("Départ le 10/01/2027");
  });

  it("lit les calories dans la description d'un article de paquetage", () => {
    expect(caloriesDe("615 kcal")).toBe(615);
    expect(caloriesDe("Gruau maison, 615 kcal par portion")).toBe(615);
    expect(caloriesDe("1 200 kcal")).toBe(1200);
    expect(caloriesDe("920,5 kcal")).toBe(920.5);
    expect(caloriesDe("environ 920 Cal")).toBe(920);
    expect(caloriesDe("sans indication")).toBe(null);
    expect(caloriesDe(null)).toBe(null);
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
    const cartes = blocAventuresDeLAccueil();
    for (const carte of cartes) {
      if (carte.genre === "recit") {
        expect(carte.url).toMatch(/^\/aventures\/recit\//);
      } else {
        expect(carte.url).toMatch(/^\/aventures\/[a-z0-9-]+$/);
      }
    }

    // Une aventure, une carte : jamais son récit ET sa campagne.
    expect(cartes.length).toBe(aventures().length);
  });

  it("annonce la sorte en surtitre et porte le titre du récit en titre", () => {
    const recits = blocAventuresDeLAccueil().filter((entree) => entree.genre === "recit");
    expect(recits.length, "aucune carte de récit sur l'accueil").toBeGreaterThan(0);

    const titres = parSorte("recit").map((page) => page.frontmatter.titre);
    for (const carte of recits) {
      expect(carte.surtitre).toBe("Récit");
      expect(titres, `« ${carte.titre} » ne vient d'aucun récit publié`).toContain(carte.titre);
    }
  });

  it("dit « Lire le récit » sur une aventure terminée, « Suivre l'aventure » sinon", () => {
    for (const carte of blocAventuresDeLAccueil()) {
      if (carte.etat === "termine") {
        expect(carte.action).toMatch(/^(Lire le récit|Voir l'aventure)$/);
      } else {
        expect(carte.action).toBe("Suivre l'aventure");
      }
    }
  });

  it("trie sur la date de l'événement le plus récent", () => {
    const dates = blocAventuresDeLAccueil().map((carte) => carte.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
