import { describe, expect, it } from "vitest";

import { capMoyen, ecartAngulaire } from "./geo.ts";
import { pointA, remplirTrous, sansPauses, seanceDepuisGpx } from "./seance.ts";
import { statsDeGpx } from "./stats.ts";

/** Un degré de latitude ≈ 111 320 m — assez précis pour une fixture. */
const M_PAR_DEG = 111_320;

type OptionsCourse = {
  /** Nombre d'intervalles (le fichier porte n + 1 points). */
  n?: number;
  /** Secondes entre deux points enregistrés. */
  dt?: number;
  /** Mètres parcourus par intervalle. */
  metres?: number;
  /** Mètres de dénivelé par intervalle. */
  denivele?: number;
  /** Écart latéral alterné, en mètres — fait osciller le cap autour du nord. */
  zigzag?: number;
  /** Intervalle d'indices pendant lequel on ne bouge plus. */
  arret?: [number, number];
  avecFc?: boolean;
  avecTemps?: boolean;
};

/**
 * Une course plein NORD, à vitesse constante, éventuellement interrompue par un
 * arrêt. Le fichier porte sa distance cumulée : les chiffres attendus sont donc
 * exacts, sans dépendre de la formule de haversine.
 */
function gpxCourse(o: OptionsCourse = {}): string {
  const {
    n = 30,
    dt = 10,
    metres = 20,
    denivele = 5,
    zigzag = 0,
    arret,
    avecFc = false,
    avecTemps = true,
  } = o;
  const t0 = Date.parse("2026-06-14T05:30:00Z");
  let lat = 45;
  let alt = 1000;
  let dist = 0;
  const lignes: string[] = [];
  for (let i = 0; i <= n; i += 1) {
    const fige = arret !== undefined && i > arret[0] && i <= arret[1];
    if (i > 0 && !fige) {
      lat += metres / M_PAR_DEG;
      alt += denivele;
      dist += metres;
    }
    const lon = 6 + (zigzag && i % 2 ? zigzag / M_PAR_DEG : 0);
    const temps = avecTemps ? `<time>${new Date(t0 + i * dt * 1000).toISOString()}</time>` : "";
    const ext = `<extensions><gpxdata:distance>${dist.toFixed(2)}</gpxdata:distance>${
      avecFc ? `<gpxtpx:hr>${140 + (i % 5)}</gpxtpx:hr><gpxtpx:cad>${86 + (i % 3)}</gpxtpx:cad>` : ""
    }</extensions>`;
    lignes.push(
      `<trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"><ele>${alt.toFixed(1)}</ele>${temps}${ext}</trkpt>`,
    );
  }
  return `<gpx><trk><name>Croix de Belledonne</name><trkseg>${lignes.join("")}</trkseg></trk></gpx>`;
}

describe("seanceDepuisGpx — rééchantillonnage", () => {
  it("pose un point par seconde, du départ à l'arrivée", () => {
    // 30 intervalles de 10 s = 300 s. Une montre n'écrit pas à intervalle
    // régulier ; c'est ce pas fixe qui rend le survol régulier et l'export
    // reproductible d'un appareil à l'autre.
    const s = seanceDepuisGpx(gpxCourse())!;
    expect(s.pas).toBe(1);
    expect(s.points).toHaveLength(301);
    expect(s.points.map((p) => p.t).slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(s.points[300]!.t).toBe(300);
  });

  it("accepte un autre pas", () => {
    const s = seanceDepuisGpx(gpxCourse(), { pas: 5 })!;
    expect(s.points).toHaveLength(61);
    expect(s.points[1]!.t).toBe(5);
  });

  it("la distance croît sans jamais reculer, et finit sur le total", () => {
    const s = seanceDepuisGpx(gpxCourse())!;
    for (let i = 1; i < s.points.length; i += 1) {
      expect(s.points[i]!.dist).toBeGreaterThanOrEqual(s.points[i - 1]!.dist);
    }
    expect(s.points[300]!.dist).toBeCloseTo(600, 6);
    expect(s.resume.distanceKm).toBeCloseTo(0.6, 6);
    expect(s.resume.distanceSource).toBe("montre");
  });

  it("moins de deux points exploitables : null", () => {
    expect(seanceDepuisGpx("")).toBeNull();
    expect(seanceDepuisGpx('<gpx><trkpt lat="45" lon="6"/></gpx>')).toBeNull();
  });
});

describe("seanceDepuisGpx — les chiffres", () => {
  it("LE D+ EST CELUI DES PLANCHES, au mètre près", () => {
    // La règle qui compte : une même sortie ne doit pas afficher deux D+ selon
    // qu'on regarde une planche image ou un survol. Le dénivelé n'est donc pas
    // recalculé sur la série rééchantillonnée, il est repris de la chaîne des
    // statistiques et reporté sur la timeline par la distance.
    const gpx = gpxCourse({ n: 60, denivele: 5 });
    const s = seanceDepuisGpx(gpx)!;
    expect(s.resume.dPlusM).toBe(statsDeGpx(gpx)!.dPlusM);
    expect(s.resume.dMinusM).toBe(statsDeGpx(gpx)!.dMinusM);
  });

  it("le D+ accumulé croît le long de la séance et finit sur le total", () => {
    const s = seanceDepuisGpx(gpxCourse({ n: 60 }))!;
    for (let i = 1; i < s.points.length; i += 1) {
      expect(s.points[i]!.dPlus).toBeGreaterThanOrEqual(s.points[i - 1]!.dPlus - 1e-9);
    }
    expect(Math.round(s.points[s.points.length - 1]!.dPlus)).toBe(s.resume.dPlusM);
  });

  it("l'allure suit la vitesse : 2 m/s font 8 min 20 au kilomètre", () => {
    const s = seanceDepuisGpx(gpxCourse())!;
    const milieu = s.points[150]!;
    expect(milieu.vitesse).toBeCloseTo(2, 1);
    expect(milieu.allure).toBeCloseTo(500, 0);
    expect(s.resume.allureMoyenne).toBeCloseTo(500, 0);
  });

  it("la pente se déduit de l'altitude lissée", () => {
    // 5 m de montée pour 20 m parcourus = 25 %.
    const s = seanceDepuisGpx(gpxCourse({ n: 60 }))!;
    expect(s.points[150]!.pente).toBeCloseTo(25, 0);
  });

  it("FC et cadence sont lues, moyennées, et le maximum retenu", () => {
    const s = seanceDepuisGpx(gpxCourse({ avecFc: true }))!;
    expect(s.points[150]!.fc).toBeGreaterThanOrEqual(140);
    expect(s.resume.fcMax).toBe(144);
    expect(s.resume.cadenceMoyenne).toBeGreaterThanOrEqual(86);
  });

  it("sans ceinture, FC et cadence restent nulles plutôt que zéro", () => {
    // Un zéro s'afficherait comme une mesure — « 0 bpm » sur l'habillage.
    const s = seanceDepuisGpx(gpxCourse())!;
    expect(s.points[10]!.fc).toBeNull();
    expect(s.resume.fcMoyenne).toBeNull();
    expect(s.resume.fcMax).toBeNull();
  });
});

describe("seanceDepuisGpx — le cap", () => {
  it("une course plein nord garde un cap au nord", () => {
    const s = seanceDepuisGpx(gpxCourse())!;
    expect(Math.abs(ecartAngulaire(0, s.points[150]!.cap))).toBeLessThan(5);
  });

  it("UN CAP QUI OSCILLE AUTOUR DU NORD NE PART PAS AU SUD", () => {
    // Le piège : moyenner 350° et 10° en degrés donne 180°, l'exact opposé de
    // la direction suivie. La caméra de Survol ferait demi-tour à chaque
    // passage au nord ; le lissage passe donc par des vecteurs.
    const s = seanceDepuisGpx(gpxCourse({ dt: 2, zigzag: 8 }))!;
    for (const p of s.points.slice(20, -20)) {
      expect(Math.abs(ecartAngulaire(0, p.cap))).toBeLessThan(45);
    }
  });

  it("capMoyen moyenne des angles, pas des nombres", () => {
    expect(capMoyen([350, 10])).toBeCloseTo(0, 6);
    expect(capMoyen([80, 100])).toBeCloseTo(90, 6);
    expect(capMoyen([])).toBe(0);
  });
});

describe("seanceDepuisGpx — les arrêts", () => {
  const avecArret = gpxCourse({ n: 60, arret: [20, 26] }); // 60 s sans bouger

  it("repère un arrêt et le donne en intervalle", () => {
    const s = seanceDepuisGpx(avecArret)!;
    expect(s.pauses).toHaveLength(1);
    expect(s.pauses[0]!.debut).toBeGreaterThan(150);
    expect(s.pauses[0]!.fin).toBeLessThan(290);
    expect(s.points.some((p) => p.enPause)).toBe(true);
  });

  it("à l'arrêt, l'allure n'existe pas — elle ne vaut pas zéro", () => {
    const s = seanceDepuisGpx(avecArret)!;
    const arrete = s.points.find((p) => p.enPause)!;
    expect(arrete.allure).toBeNull();
  });

  it("une course sans arrêt n'en invente pas", () => {
    expect(seanceDepuisGpx(gpxCourse({ n: 60 }))!.pauses).toEqual([]);
  });

  it("sansPauses resserre la timeline sans toucher aux distances", () => {
    const s = seanceDepuisGpx(avecArret)!;
    const serre = sansPauses(s);
    expect(serre.points.length).toBeLessThan(s.points.length);
    expect(serre.pauses).toEqual([]);
    expect(serre.points.map((p) => p.t).slice(0, 3)).toEqual([0, 1, 2]);
    expect(serre.points[serre.points.length - 1]!.dist).toBeCloseTo(
      s.points[s.points.length - 1]!.dist,
      6,
    );
  });

  it("sansPauses rend la séance telle quelle s'il n'y a rien à retirer", () => {
    const s = seanceDepuisGpx(gpxCourse({ n: 60 }))!;
    expect(sansPauses(s)).toBe(s);
  });
});

describe("seanceDepuisGpx — un itinéraire sans horaires", () => {
  const s = seanceDepuisGpx(gpxCourse({ avecTemps: false }))!;

  it("se survole quand même, à vitesse constante", () => {
    expect(s.horodatee).toBe(false);
    expect(s.points.length).toBeGreaterThan(2);
    expect(s.points[s.points.length - 1]!.dist).toBeCloseTo(600, 6);
  });

  it("TAIT LES CHIFFRES DE TEMPS, qui n'y veulent rien dire", () => {
    // Les secondes ont été fabriquées : les annoncer comme une durée
    // publierait une allure inventée.
    expect(s.resume.dureeSecondes).toBeNull();
    expect(s.resume.allureMoyenne).toBeNull();
    expect(s.resume.vitesseMoyenne).toBeNull();
    expect(s.resume.debutMs).toBeNull();
  });

  it("garde en revanche distance, altitude et D+", () => {
    expect(s.resume.distanceKm).toBeCloseTo(0.6, 6);
    expect(s.resume.altMinM).toBe(1000);
    expect(s.resume.altMaxM).toBeGreaterThan(1000);
    expect(s.resume.dPlusM).toBeGreaterThan(0);
  });
});

describe("remplirTrous", () => {
  const x = [0, 1, 2, 3, 4];

  it("interpole un décrochage de capteur", () => {
    expect(remplirTrous([10, null, null, 40, 50], x)).toEqual([10, 20, 30, 40, 50]);
  });

  it("prolonge les bords par la valeur connue la plus proche", () => {
    expect(remplirTrous([null, null, 30, 40, null], x)).toEqual([30, 30, 30, 40, 40]);
  });

  it("une série entièrement vide reste vide — pas de zéro inventé", () => {
    expect(remplirTrous([null, null, null], [0, 1, 2])).toBeNull();
  });
});

describe("pointA", () => {
  const s = seanceDepuisGpx(gpxCourse())!;

  it("rend le point de l'instant demandé", () => {
    expect(pointA(s, 0)!.t).toBe(0);
    expect(pointA(s, 42)!.t).toBe(42);
  });

  it("borne aux extrémités plutôt que de rendre null", () => {
    // Le lecteur de Survol demande parfois une image après la fin (arrondi du
    // pas de temps) : rendre null l'obligerait à traiter le cas partout.
    expect(pointA(s, -10)!.t).toBe(0);
    expect(pointA(s, 99_999)!.t).toBe(300);
  });
});
