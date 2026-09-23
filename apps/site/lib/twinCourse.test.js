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
  direLImport,
  importerLesWaypoints,
  lireLeWaypoint,
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
    const { liste, bilan } = importerLesWaypoints(
      [r("Départ", 0), r("Isola (saisi)", 37.6)],
      [{ nom: "Isola", km: 37.65 }, { nom: "Rimplas", km: 68.4 }, { nom: "sans km", km: null }],
      169.7,
    );
    expect(liste.map((x) => x.nom)).toEqual(["Départ", "Isola (saisi)", "Rimplas", "Arrivée"]);
    expect(bilan).toEqual({ lus: 2, ajoutes: 1, completes: 0, deja: 1, assistance: 0 });
  });

  it("lisent l'assistance et la base que déclare le nom d'un waypoint", () => {
    expect(lireLeWaypoint("Isola (assistance)")).toEqual({ nom: "Isola", assistance: true, base_majeure: false });
    expect(lireLeWaypoint("Venanson [Base, assistance]")).toEqual({ nom: "Venanson", assistance: true, base_majeure: true });
    expect(lireLeWaypoint("Chapelle (St Michel)")).toEqual({ nom: "Chapelle (St Michel)", assistance: false, base_majeure: false });
    expect(lireLeWaypoint(undefined).nom).toBe("");
  });

  it("un GPX sur une course vide pose tout, assistance comprise", () => {
    const { liste, bilan } = importerLesWaypoints(
      [],
      [{ nom: "St-Étienne de Tinée", km: 8.16 }, { nom: "Isola (assistance)", km: 39.15 }],
      170.7,
    );
    expect(liste.map((x) => [x.nom, x.assistance])).toEqual([
      ["Départ", false], ["St-Étienne de Tinée", false], ["Isola", true], ["Arrivée", false],
    ]);
    expect(bilan).toMatchObject({ lus: 2, ajoutes: 2, assistance: 1 });
    expect(direLImport(bilan)).toBe("2 waypoints lus : 2 ajoutés — 1 marqué assistance.");
  });

  it("un waypoint complète le point déjà posé sans rien retirer de ce qui a été saisi", () => {
    const { liste, bilan } = importerLesWaypoints(
      [
        r("Départ", 0),
        r("Ravitaillement km 39,1", 39.1),
        r("Venanson (assistance)", 85.3),
        r("Levens", 125.2, { base_majeure: true, assistance: true, arret_min: 20 }),
        r("Nice", 169.7),
      ],
      [
        { nom: "Isola (assistance)", km: 39.15 },
        { nom: "Venanson (assistance)", km: 85.31 },
        { nom: "Levens", km: 125.22 },
      ],
      169.7,
    );
    expect(liste.map((x) => [x.nom, x.assistance, x.base_majeure])).toEqual([
      ["Départ", false, false],
      ["Isola", true, false],
      ["Venanson", true, false],
      ["Levens", true, true],
      ["Nice", false, false],
    ]);
    expect(liste[3].arret_min).toBe(20);
    expect(bilan).toMatchObject({ lus: 3, ajoutes: 0, completes: 2, deja: 1 });
  });

  it("disent quand il n'y avait rien à faire", () => {
    const { bilan } = importerLesWaypoints([r("Départ", 0), r("Isola", 39.1, { assistance: true })],
      [{ nom: "Isola (assistance)", km: 39.15 }], 0);
    expect(direLImport(bilan)).toBe("1 waypoint lu : tous déjà posés, rien à changer.");
    expect(direLImport({ lus: 0 })).toMatch(/aucun waypoint/);
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
