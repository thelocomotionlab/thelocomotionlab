import { describe, expect, it } from "vitest";

import {
  FENETRE_FUSION,
  annuler,
  creer,
  libelleAnnulation,
  libelleRetablissement,
  peutAnnuler,
  peutRefaire,
  pousser,
  refaire,
  sceller,
} from "./historique.ts";

describe("historique", () => {
  it("part sans passé ni futur", () => {
    const h = creer("a");
    expect(h.present).toBe("a");
    expect(peutAnnuler(h)).toBe(false);
    expect(peutRefaire(h)).toBe(false);
  });

  it("annule et refait", () => {
    let h = creer("a");
    h = pousser(h, "b", { libelle: "écrire" });
    h = pousser(h, "c", { libelle: "déplacer" });
    expect(h.present).toBe("c");

    h = annuler(h);
    expect(h.present).toBe("b");
    h = annuler(h);
    expect(h.present).toBe("a");
    expect(peutAnnuler(h)).toBe(false);

    h = refaire(h);
    expect(h.present).toBe("b");
    h = refaire(h);
    expect(h.present).toBe("c");
    expect(peutRefaire(h)).toBe(false);
  });

  it("annonce ce qu'on va annuler", () => {
    let h = pousser(creer("a"), "b", { libelle: "déplacer le titre" });
    expect(libelleAnnulation(h)).toBe("déplacer le titre");
    h = annuler(h);
    expect(libelleRetablissement(h)).toBe("déplacer le titre");
  });

  it("POUSSER EFFACE LE FUTUR", () => {
    // On vient de repartir dans une autre direction : garder un « refaire » qui
    // rejouerait l'ancienne branche donnerait un document que personne n'a
    // composé.
    let h = pousser(pousser(creer("a"), "b"), "c");
    h = annuler(h);
    expect(peutRefaire(h)).toBe(true);
    h = pousser(h, "autre");
    expect(peutRefaire(h)).toBe(false);
    expect(h.present).toBe("autre");
  });

  it("UN GLISSÉ EST UNE ÉTAPE, pas quarante", () => {
    // Un déplacement à la souris émet un état par image. La clé de fusion les
    // rassemble : Ctrl+Z ramène là où le geste a commencé, pas une image avant.
    let h = creer("x0");
    for (let i = 1; i <= 40; i += 1) {
      h = pousser(h, `x${i}`, { fusion: "deplacer:e1", maintenant: 1000 + i * 16 });
    }
    expect(h.present).toBe("x40");
    expect(h.passe).toHaveLength(1);
    expect(annuler(h).present).toBe("x0");
  });

  it("deux glissés du même élément restent deux étapes", () => {
    let h = creer("a");
    h = pousser(h, "b", { fusion: "deplacer:e1", maintenant: 0 });
    h = pousser(h, "c", { fusion: "deplacer:e1", maintenant: FENETRE_FUSION + 1 });
    expect(h.passe).toHaveLength(2);
  });

  it("sceller referme le geste : la poussée suivante ouvre une étape", () => {
    let h = creer("a");
    h = pousser(h, "b", { fusion: "deplacer:e1", maintenant: 0 });
    h = sceller(h);
    h = pousser(h, "c", { fusion: "deplacer:e1", maintenant: 10 });
    expect(h.passe).toHaveLength(2);
    expect(annuler(h).present).toBe("b");
  });

  it("deux gestes différents ne fusionnent pas, même collés", () => {
    let h = creer("a");
    h = pousser(h, "b", { fusion: "deplacer:e1", maintenant: 0 });
    h = pousser(h, "c", { fusion: "redimensionner:e1", maintenant: 5 });
    expect(h.passe).toHaveLength(2);
  });

  it("pousser le même état ne crée pas d'étape", () => {
    const h = creer("a");
    expect(pousser(h, "a")).toBe(h);
  });

  it("la pile a un fond : les états les plus anciens tombent", () => {
    let h = creer(0);
    for (let i = 1; i <= 12; i += 1) h = pousser(h, i, { profondeur: 5 });
    expect(h.passe).toHaveLength(5);
    expect(h.passe[0]!.etat).toBe(7);
  });

  it("annuler ou refaire dans le vide ne change rien", () => {
    const h = creer("a");
    expect(annuler(h)).toBe(h);
    expect(refaire(h)).toBe(h);
  });

  it("l'historique est immuable : chaque geste rend un nouvel objet", () => {
    const h = creer("a");
    const apres = pousser(h, "b");
    expect(apres).not.toBe(h);
    expect(h.present).toBe("a");
    expect(h.passe).toHaveLength(0);
  });
});
