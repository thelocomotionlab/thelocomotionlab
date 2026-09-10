import { describe, expect, it } from "vitest";
import { seanceDepuisGpx } from "@locomotionlab/trace";
import type { Seance } from "@locomotionlab/trace";

import { capLisse, priseDe, prisesDuPlan, zoomSelonVitesse } from "./camera.ts";
import { imagesDuMontage, planDeSurvol, pointsRetenus } from "./montage.ts";
import { instancierSurvol } from "./modeles.ts";
import { valeurDe } from "./variables.ts";
import type { Camera, Montage } from "./types.ts";

const MONTAGE: Montage = instancierSurvol().montage;
const CAMERA: Camera = instancierSurvol().camera;

/** Une séance droite d'une heure, un point par seconde, vitesse constante. */
function seance(over: Partial<Seance> = {}): Seance {
  const n = 3601;
  const points = Array.from({ length: n }, (_, t) => ({
    t,
    lat: 45 + t * 1e-5,
    lon: 6,
    alt: 1000 + t * 0.1,
    dist: t * 2,
    vitesse: 2,
    allure: 500,
    pente: 0,
    cap: 0,
    fc: null,
    cadence: null,
    dPlus: t * 0.1,
    enPause: false,
  }));
  return {
    nom: "Droite",
    points,
    pauses: [],
    horodatee: true,
    pas: 1,
    resume: {
      nom: "Droite",
      debutMs: 0,
      distanceKm: 7.2,
      dPlusM: 360,
      dMinusM: 0,
      dureeSecondes: 3600,
      dureeMouvementSecondes: 3600,
      allureMoyenne: 500,
      vitesseMoyenne: 2,
      fcMoyenne: null,
      fcMax: null,
      cadenceMoyenne: null,
      altMinM: 1000,
      altMaxM: 1360,
      distanceSource: "montre",
    },
    ...over,
  };
}

describe("le plan de survol", () => {
  it("produit exactement durée × images par seconde", () => {
    const plan = planDeSurvol(seance(), MONTAGE);
    expect(plan.images).toHaveLength(imagesDuMontage(MONTAGE));
    expect(plan.images).toHaveLength(30 * 30);
  });

  it("tient le départ et l'arrivée le temps demandé", () => {
    const plan = planDeSurvol(seance(), { ...MONTAGE, tenueDepart: 2, tenueArrivee: 3 });
    // Deux secondes à 30 i/s : soixante images sur le premier point. La
    // soixante-et-unième vaut encore 0 — le mouvement commence AU départ —,
    // mais le point a quitté sa place quelques images plus loin.
    expect(plan.images.slice(0, 60).every((i) => i === 0)).toBe(true);
    expect(plan.images[75]!).toBeGreaterThan(0);
    // Trois secondes de tenue à l'arrivée : quatre-vingt-dix images.
    const dernier = plan.images[plan.images.length - 1]!;
    expect(plan.images.slice(-90).every((i) => i === dernier)).toBe(true);
    // La dernière image en mouvement atteint elle aussi l'arrivée : c'est
    // quelques images plus tôt que le point est encore en chemin.
    expect(plan.images[plan.images.length - 105]!).toBeLessThan(dernier);
  });

  it("avance sans jamais reculer", () => {
    const plan = planDeSurvol(seance(), MONTAGE);
    for (let i = 1; i < plan.images.length; i += 1) {
      expect(plan.images[i]!).toBeGreaterThanOrEqual(plan.images[i - 1]!);
    }
    expect(plan.images[plan.images.length - 1]).toBe(3600);
  });

  it("écarte les pauses quand on le demande, les garde sinon", () => {
    const s = seance();
    for (let t = 1000; t < 1600; t += 1) s.points[t]!.enPause = true;
    expect(pointsRetenus(s, { ...MONTAGE, retirerPauses: true })).toHaveLength(3001);
    expect(pointsRetenus(s, { ...MONTAGE, retirerPauses: false })).toHaveLength(3601);
  });

  it("respecte le rognage", () => {
    const gardes = pointsRetenus(seance(), { ...MONTAGE, debut: 600, fin: 1200 });
    expect(gardes[0]).toBe(600);
    expect(gardes[gardes.length - 1]).toBe(1200);
  });

  it("ne rend jamais une liste vide, même sur une séance entièrement en pause", () => {
    const s = seance();
    for (const p of s.points) p.enPause = true;
    expect(pointsRetenus(s, MONTAGE)).toEqual([0]);
  });

  it("rend un plan vide sans séance", () => {
    expect(planDeSurvol(null, MONTAGE).images).toEqual([]);
  });

  it("« au temps » ralentit là où la sortie a ralenti", () => {
    // Une séance qui traîne sur sa première moitié : deux fois moins de mètres
    // par seconde avant la mi-course.
    const s = seance();
    for (let t = 0; t <= 3600; t += 1) {
      s.points[t]!.dist = t < 1800 ? t : 1800 + (t - 1800) * 3;
    }
    const auTemps = planDeSurvol(s, { ...MONTAGE, vitesse: "temps", melange: 0, tenueDepart: 0, tenueArrivee: 0 });
    const aLaDistance = planDeSurvol(s, { ...MONTAGE, vitesse: "distance", melange: 0, tenueDepart: 0, tenueArrivee: 0 });
    const milieu = Math.floor(auTemps.images.length / 2);
    // À mi-vidéo : « au temps » est à la moitié du TEMPS, « à la distance » est
    // à la moitié des MÈTRES — donc bien plus loin, la seconde moitié étant
    // trois fois plus rapide.
    expect(auTemps.images[milieu]).toBeCloseTo(1800, -2);
    expect(aLaDistance.images[milieu]!).toBeGreaterThan(auTemps.images[milieu]!);
  });
});

describe("la caméra", () => {
  it("serre le zoom quand ça monte lentement, l'élargit quand ça descend vite", () => {
    expect(zoomSelonVitesse(0.5, 14)).toBeGreaterThan(zoomSelonVitesse(5, 14));
  });

  /** De combien de degrés on a tourné, par le plus court chemin. */
  const tourne = (de: number, vers: number) => Math.abs(((vers - de + 540) % 360) - 180);

  it("passe par le plus court chemin : de 350° vers 10°, vingt degrés par le nord", () => {
    // Et non trois cent quarante par le sud. Le cap franchit donc 360 et
    // repart de zéro — c'est bien vers 10 qu'il va, pas vers 340.
    expect(tourne(350, capLisse(350, 10, 10, 0.1, 90))).toBeCloseTo(20, 3);
    expect(capLisse(350, 10, 10, 0.1, 90)).toBeCloseTo(10, 3);
  });

  it("ne tourne JAMAIS plus vite que le plafond", () => {
    // Un demi-tour demandé en une image : la caméra n'en prend que sa part.
    // À exactement 180°, les deux sens valent — seule la QUANTITÉ compte.
    const dt = 1 / 30;
    expect(tourne(0, capLisse(0, 180, dt, 0.01, 25))).toBeLessThanOrEqual(25 * dt + 1e-9);
    expect(tourne(0, capLisse(0, 90, dt, 0.01, 25))).toBeLessThanOrEqual(25 * dt + 1e-9);
  });

  it("reste bornée à un tour", () => {
    let cap = 0;
    for (let i = 0; i < 400; i += 1) cap = capLisse(cap, 350, 1 / 30, 4, 25);
    expect(cap).toBeGreaterThanOrEqual(0);
    expect(cap).toBeLessThan(360);
  });

  it("suit le point : la prise est SUR le point", () => {
    const s = seance();
    const prise = priseDe(s, 100, CAMERA, null, 1 / 30);
    expect(prise.lat).toBeCloseTo(s.points[100]!.lat, 9);
    expect(prise.lng).toBeCloseTo(s.points[100]!.lon, 9);
    expect(prise.pitch).toBe(CAMERA.pitch);
  });

  it("le mode « ensemble » cadre toute la trace, pas le point", () => {
    const s = seance();
    const prise = priseDe(s, 0, { ...CAMERA, mode: "ensemble" }, null, 1 / 30);
    expect(prise.lat).toBeCloseTo(45 + (3600 * 1e-5) / 2, 6);
    expect(prise.zoom).toBeLessThan(CAMERA.zoom);
  });

  it("une même image donne la même prise, d'où qu'on vienne", () => {
    // C'est ce qui permet à l'export image par image de valoir l'aperçu.
    const s = seance();
    const plan = planDeSurvol(s, MONTAGE);
    const a = prisesDuPlan(s, plan.images, CAMERA, plan.imagesParSeconde);
    const b = prisesDuPlan(s, plan.images, CAMERA, plan.imagesParSeconde);
    expect(a).toEqual(b);
    expect(a).toHaveLength(plan.images.length);
  });

  it("ne secoue pas : deux images voisines ne tournent pas de plus que le plafond", () => {
    const s = seance();
    // Un cap qui part dans tous les sens, comme un lacet de sentier.
    for (let t = 0; t <= 3600; t += 1) s.points[t]!.cap = (t * 47) % 360;
    const plan = planDeSurvol(s, MONTAGE);
    const prises = prisesDuPlan(s, plan.images, CAMERA, plan.imagesParSeconde);
    const plafond = (CAMERA.rotationMax / plan.imagesParSeconde) + 1e-6;
    for (let i = 1; i < prises.length; i += 1) {
      const d = Math.abs(((prises[i]!.cap - prises[i - 1]!.cap + 540) % 360) - 180);
      expect(d).toBeLessThanOrEqual(plafond);
    }
  });
});

describe("une séance sans horaires", () => {
  it("se survole quand même — c'est un itinéraire, pas une sortie", () => {
    const gpx = `<gpx><trk><trkseg>${Array.from(
      { length: 50 },
      (_, i) => `<trkpt lat="45.${String(i).padStart(4, "0")}" lon="6.0"><ele>${1000 + i * 5}</ele></trkpt>`,
    ).join("")}</trkseg></trk></gpx>`;
    const s = seanceDepuisGpx(gpx);
    expect(s).not.toBeNull();
    expect(s!.horodatee).toBe(false);
    const plan = planDeSurvol(s, MONTAGE);
    expect(plan.images).toHaveLength(imagesDuMontage(MONTAGE));
  });
});

describe("les chiffres du survol", () => {
  const base = {
    trace: null,
    segments: [],
    tranche: { mode: "toutes", jour: 0 } as const,
    bilan: "apres" as const,
    nomProjet: "Écrins",
  };

  it("comptent À L'INSTANT, pas sur la sortie entière", () => {
    const s = seance();
    const ctx = { ...base, seance: s, instant: s.points[1800]! };
    // À mi-course : 3,6 km sur 7,2 — c'est le défilement qui fait la vidéo.
    expect(valeurDe("distance", ctx)).toBe("3,6");
    expect(valeurDe("duree", ctx)).toBe("30 min");
    expect(valeurDe("dplus", ctx)).toBe("180");
  });

  it("sans instant, disent la sortie entière", () => {
    const s = seance();
    expect(valeurDe("distance", { ...base, seance: s })).toBe("7,2");
  });

  it("un cœur qui ne bat pas rend un tiret, pas un blanc", () => {
    const s = seance();
    expect(valeurDe("fc", { ...base, seance: s, instant: s.points[10]! })).toBe("—");
    const battant = { ...s.points[10]!, fc: 137 };
    expect(valeurDe("fc", { ...base, seance: s, instant: battant })).toBe("137");
  });

  it("la FC et l'altitude à l'instant ne veulent rien dire sur une planche fixe", () => {
    const s = seance();
    expect(valeurDe("fc", { ...base, seance: s })).toBeNull();
    expect(valeurDe("altitude", { ...base, seance: s })).toBeNull();
  });

  it("laissent passer ce qui n'est pas affaire d'instant", () => {
    const s = seance();
    const ctx = { ...base, seance: s, instant: s.points[100]! };
    expect(valeurDe("nom", ctx)).toBe("Droite");
    expect(valeurDe("fc_max", ctx)).toBeNull();
  });
});
