import { describe, expect, it } from "vitest";
import { decouperTrace, seanceDepuisGpx, traceDepuisTrackJson } from "@locomotionlab/trace";
import type { Seance, Trace } from "@locomotionlab/trace";

import {
  ABSENT,
  VARIABLES,
  cleDe,
  dureeCourte,
  formatAllure,
  formatEntier,
  formatKm,
  formatVitesse,
  resoudre,
  segmentsDeLaTranche,
  valeurDe,
  variablesCitees,
} from "./variables.ts";
import type { Contexte } from "./variables.ts";
import type { Tranche } from "./types.ts";

/** Une trace en toit : 120 km, le sommet à mi-parcours. */
function traceDroite(totalKm = 120): Trace {
  const coords: [number, number][] = [];
  const profile: { km: number; alt: number }[] = [];
  for (let i = 0; i <= 120; i += 1) {
    const t = i / 120;
    coords.push([6 + t * 1.2, 44.9]);
    profile.push({ km: t * totalKm, alt: 1000 + (t < 0.5 ? t : 1 - t) * 2000 });
  }
  return traceDepuisTrackJson({
    schemaVersion: 1,
    totalKm,
    dPlusM: 1000,
    dMinusM: 1000,
    coords,
    profile,
    nom: "Tour des Écrins",
  })!;
}

const GPX = `<gpx><trk><name>Croix de Belledonne</name><trkseg>
  <trkpt lat="45.0000" lon="6"><ele>1000</ele><time>2026-06-14T05:30:00Z</time>
    <extensions><gpxdata:distance>0</gpxdata:distance><gpxtpx:hr>120</gpxtpx:hr></extensions></trkpt>
  <trkpt lat="45.0180" lon="6"><ele>1100</ele><time>2026-06-14T06:00:00Z</time>
    <extensions><gpxdata:distance>2000</gpxdata:distance><gpxtpx:hr>150</gpxtpx:hr></extensions></trkpt>
  <trkpt lat="45.0360" lon="6"><ele>1200</ele><time>2026-06-14T06:30:00Z</time>
    <extensions><gpxdata:distance>4000</gpxdata:distance><gpxtpx:hr>160</gpxtpx:hr></extensions></trkpt>
</trkseg></trk></gpx>`;

const TOUTES: Tranche = { mode: "toutes", jour: 0 };

function ctx(over: Partial<Contexte> = {}): Contexte {
  const trace = over.trace === undefined ? traceDroite() : over.trace;
  return {
    trace,
    seance: null,
    segments: trace ? decouperTrace(trace, [40, 80]) : [],
    tranche: TOUTES,
    bilan: "apres",
    nomProjet: "Écrins 2026",
    ...over,
  };
}

describe("les formats de chiffres", () => {
  it("écrit les nombres comme le labo les écrit", () => {
    expect(formatKm(24.26)).toBe("24,3");
    expect(formatEntier(1460)).toBe("1 460");
    expect(dureeCourte(27_900)).toBe("7 h 45");
    expect(dureeCourte(1500)).toBe("25 min");
    expect(formatAllure(320)).toBe(`5'20"`);
    expect(formatVitesse(3)).toBe("10,8");
  });

  it("PAS D'ESPACE FINE : la fonte n'en a pas", () => {
    // `Intl` en fr-FR sépare les milliers par U+202F, absent du sous-ensemble
    // latin des fontes du dépôt — le canvas dessinerait un carré blanc.
    expect(formatEntier(12_345)).not.toMatch(/[    ]/);
    expect(formatEntier(12_345)).toBe("12 345");
  });

  it("une allure absurde ne produit rien plutôt qu'un chiffre faux", () => {
    expect(formatAllure(0)).toBe("");
    expect(formatAllure(Number.NaN)).toBe("");
  });
});

describe("le catalogue", () => {
  it("reconnaît une clé écrite AVEC ou SANS accent", () => {
    // La spécification écrit `{durée}`, et c'est ce qu'un auteur tape ; la clé
    // canonique reste `duree`.
    expect(cleDe("duree")).toBe("duree");
    expect(cleDe("durée")).toBe("duree");
    expect(cleDe("DURÉE")).toBe("duree");
    expect(cleDe(" distance ")).toBe("distance");
    expect(cleDe("pouet")).toBeNull();
  });

  it("dit lesquelles exigent une séance horodatée", () => {
    const exigeantes = VARIABLES.filter((v) => v.exigeSeance).map((v) => v.cle);
    expect(exigeantes).toContain("allure");
    expect(exigeantes).toContain("fc_max");
    expect(exigeantes).not.toContain("distance");
  });
});

describe("valeurDe — sans séance", () => {
  it("donne les totaux de la trace", () => {
    const c = ctx();
    expect(valeurDe("distance", c)).toBe("120,0");
    expect(valeurDe("dplus", c)).toBe("1 000");
    expect(valeurDe("nom", c)).toBe("Tour des Écrins");
  });

  it("TAIT ce qui exige une montre", () => {
    const c = ctx();
    expect(valeurDe("allure", c)).toBeNull();
    expect(valeurDe("fc_max", c)).toBeNull();
    expect(valeurDe("date", c)).toBeNull();
  });

  it("sans trace ni séance, tout se tait", () => {
    const c = ctx({ trace: null, segments: [] });
    expect(valeurDe("distance", c)).toBeNull();
    expect(valeurDe("jour", c)).toBeNull();
    expect(valeurDe("nom", c)).toBe("Écrins 2026");
  });
});

describe("valeurDe — LES CHIFFRES SUIVENT LA TRANCHE", () => {
  it("« toutes » donne le tour entier", () => {
    expect(valeurDe("distance", ctx({ tranche: { mode: "toutes", jour: 1 } }))).toBe("120,0");
  });

  it("« jusqu'au jour N » donne l'avancement", () => {
    expect(valeurDe("distance", ctx({ tranche: { mode: "jusqua", jour: 1 } }))).toBe("80,0");
    expect(valeurDe("distance", ctx({ tranche: { mode: "jusqua", jour: 0 } }))).toBe("40,0");
  });

  it("« jour N seul » donne l'étape — c'est ce qu'on lit sur une planche d'étape", () => {
    expect(valeurDe("distance", ctx({ tranche: { mode: "seule", jour: 1 } }))).toBe("40,0");
    expect(valeurDe("jour", ctx({ tranche: { mode: "seule", jour: 1 } }))).toBe("2");
  });

  it("`jour_distance` nomme la journée quelle que soit la tranche", () => {
    const c = ctx({ tranche: { mode: "toutes", jour: 2 } });
    expect(valeurDe("distance", c)).toBe("120,0");
    expect(valeurDe("jour_distance", c)).toBe("40,0");
  });

  it("une tranche hors bornes est ramenée dans les journées existantes", () => {
    expect(valeurDe("jour", ctx({ tranche: { mode: "seule", jour: 99 } }))).toBe("3");
    expect(segmentsDeLaTranche(ctx().segments, { mode: "seule", jour: -5 })).toHaveLength(1);
  });

  it("la durée reste celle de la sortie : une étape n'a pas d'horaire", () => {
    // Une trace kilométrique ne porte aucun horaire de coupure, et un temps
    // d'étape inventé serait pire que pas de temps du tout.
    const trace = { ...traceDroite(), dureeSecondes: 27_900, vecue: true };
    const c = ctx({ trace, tranche: { mode: "seule", jour: 0 } });
    expect(valeurDe("duree", c)).toBe("7 h 45");
  });
});

describe("valeurDe — avec une séance", () => {
  const seance: Seance = seanceDepuisGpx(GPX)!;
  const c = ctx({ seance, trace: null, segments: [] });

  it("lit l'allure, la FC et la date de la montre", () => {
    expect(valeurDe("allure", c)).toMatch(/^\d+'\d\d"$/);
    expect(valeurDe("fc_max", c)).toBe("160");
    expect(valeurDe("date", c)).toBe("14 juin 2026");
    expect(valeurDe("duree", c)).toBe("1 h 00");
  });

  it("la séance l'emporte sur la trace pour l'altitude maximale", () => {
    expect(valeurDe("alt_max", c)).toBe("1 200");
  });
});

describe("resoudre", () => {
  it("remplace les variables d'un texte", () => {
    const c = ctx();
    expect(resoudre("{distance} km · {dplus} m D+", c)).toBe("120,0 km · 1 000 m D+");
  });

  it("accepte l'accent dans le texte de l'auteur", () => {
    const trace = { ...traceDroite(), dureeSecondes: 27_900, vecue: true };
    expect(resoudre("en {durée}", ctx({ trace }))).toBe("en 7 h 45");
  });

  it("une variable sans donnée se VOIT plutôt que de laisser un blanc", () => {
    expect(resoudre("allure {allure}", ctx())).toBe(`allure ${ABSENT}`);
    expect(resoudre("allure {allure}", ctx(), "")).toBe("allure ");
  });

  it("LAISSE INTACT ce qui n'est pas une variable", () => {
    // Le seul moyen d'écrire une accolade dans un titre sans que le studio la
    // mange.
    expect(resoudre("{pouet} et {distance}", ctx())).toBe("{pouet} et 120,0");
  });

  it("liste les variables citées, sans doublon", () => {
    expect(variablesCitees("{distance} puis {durée} puis {distance}")).toEqual([
      "distance",
      "duree",
    ]);
    expect(variablesCitees("rien du tout")).toEqual([]);
  });
});
