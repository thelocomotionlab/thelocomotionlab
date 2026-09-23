// lib/twinCourse.test.js
//
// Ce que ces tests gardent : ce que l'éditeur enregistre se traduit toujours en carnet
// de route — le départ au km 0, les ravitaillements dans l'ordre, les phases posées sur
// des ravitaillements.

import { describe, expect, it } from "vitest";

import {
  aimanter,
  bornerLesPhases,
  composerLeDepart,
  decomposerLeDepart,
  deplacer,
  estUneExtremite,
  importerLesWaypoints,
  poser,
  poserUnePhase,
  remettre,
  resume,
  retirer,
  trier,
} from "./twinCourse.mjs";

const r = (nom, km, extra = {}) => ({ nom, km, base_majeure: false, assistance: false, arret_min: null, ...extra });
const BASE = trier([r("Départ", 0), r("Isola", 37.6, { base_majeure: true, assistance: true }), r("Nice", 169.7)]);

describe("les ravitaillements", () => {
  it("se rangent par kilomètre et se numérotent dans cet ordre", () => {
    const liste = trier([r("B", 20), r("A", 0), r("C", 10)]);
    expect(liste.map((x) => [x.index, x.nom])).toEqual([[0, "A"], [1, "C"], [2, "B"]]);
  });

  it("un ravitaillement posé prend sa place et rend son index", () => {
    const { liste, index } = poser(BASE, 8.1, "St-Étienne");
    expect(index).toBe(1);
    expect(liste[1]).toMatchObject({ nom: "St-Étienne", km: 8.1, index: 1 });
    expect(liste.some((x) => "_suivi" in x)).toBe(false);
  });

  it("un ravitaillement déplacé au-delà d'un voisin change de rang", () => {
    const { liste, index } = deplacer(poser(BASE, 8.1, "St-Étienne").liste, 1, 50);
    expect(index).toBe(2);
    expect(liste.map((x) => x.nom)).toEqual(["Départ", "Isola", "St-Étienne", "Nice"]);
  });

  it("le départ reste au km 0", () => {
    expect(deplacer(BASE, 0, 12).liste[0].km).toBe(0);
  });

  it("le départ et l'arrivée ne se retirent pas, le reste se retire et se remet", () => {
    expect(estUneExtremite(BASE, 0) && estUneExtremite(BASE, 2)).toBe(true);
    expect(retirer(BASE, 0).retire).toBe(null);
    const { liste, retire } = retirer(BASE, 1);
    expect(liste.map((x) => x.nom)).toEqual(["Départ", "Nice"]);
    const remis = remettre(liste, retire);
    expect(remis.liste.map((x) => x.nom)).toEqual(["Départ", "Isola", "Nice"]);
    expect(remis.liste[1].base_majeure).toBe(true);
    expect(remis.index).toBe(1);
  });

  it("les waypoints s'ajoutent sans doubler un point déjà posé", () => {
    const liste = importerLesWaypoints(
      [r("Départ", 0), r("Isola (saisi)", 37.6)],
      [{ nom: "Isola", km: 37.65 }, { nom: "Rimplas", km: 68.4 }, { nom: "sans km", km: null }],
      169.7,
    );
    expect(liste.map((x) => x.nom)).toEqual(["Départ", "Isola (saisi)", "Rimplas", "Arrivée"]);
  });

  it("se résument en une ligne", () => {
    // le départ ne se compte pas : la bibliothèque et l'éditeur disent le même nombre
    expect(resume(BASE)).toEqual({ poses: 2, assistance: 1, bases: 1 });
  });
});

describe("les phases", () => {
  const kms = [0, 37.6, 83.5, 169.7];

  it("commencent sur le ravitaillement le plus proche", () => {
    expect(aimanter(40, kms)).toBe(37.6);
    const phases = poserUnePhase([], 41, kms, "Retenue");
    expect(phases).toEqual([{ nom: "Retenue", du_km: 37.6, au_km: 169.7, note: "" }]);
  });

  it("courent jusqu'au début de la suivante, la dernière jusqu'à l'arrivée", () => {
    const phases = bornerLesPhases(
      [{ nom: "Exécution", du_km: 83.5 }, { nom: "Retenue", du_km: 0 }],
      kms,
    );
    expect(phases.map((p) => [p.nom, p.du_km, p.au_km])).toEqual([
      ["Retenue", 0, 83.5],
      ["Exécution", 83.5, 169.7],
    ]);
  });

  it("ne se posent ni deux fois au même endroit ni à l'arrivée", () => {
    const une = poserUnePhase([], 1, kms);
    expect(poserUnePhase(une, 2, kms)).toBe(null);
    expect(poserUnePhase([], 169, kms)).toBe(null);
  });
});

describe("le départ", () => {
  it("se décompose et se recompose sans rien perdre", () => {
    const vu = decomposerLeDepart("2026-09-25T13:00:00+02:00");
    expect(vu).toEqual({ date: "2026-09-25", heure: "13:00", fuseau: "+02:00" });
    expect(composerLeDepart(vu)).toBe("2026-09-25T13:00:00+02:00");
  });

  it("n'invente pas de départ sans date", () => {
    expect(composerLeDepart({ date: "", heure: "13:00", fuseau: "+02:00" })).toBe("");
    expect(decomposerLeDepart("")).toEqual({ date: "", heure: "", fuseau: "+02:00" });
  });

  it("lit Z comme UTC", () => {
    expect(decomposerLeDepart("2026-09-25T11:00:00Z").fuseau).toBe("+00:00");
  });
});
