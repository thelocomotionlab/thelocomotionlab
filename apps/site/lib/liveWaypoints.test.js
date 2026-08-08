// lib/liveWaypoints.test.js
//
// Ce qui compte : un repère saisi « au col » doit tomber AU col sur la carte
// (donc interpolation, pas point le plus proche), et une saisie bancale dans
// liveConfig ne doit jamais faire disparaître la carte en plein direct.

import { describe, expect, it } from "vitest";

import {
  pointAuKm,
  reperesAffichables,
  reperesSurCarte,
  reperesSurProfil,
} from "./liveWaypoints";
import { WAYPOINT_ICONES, iconeDuRepere } from "./liveWaypointIcons";

// Profil droit : 4 points espacés de 5 km, latitude et altitude qui montent
// linéairement — les valeurs interpolées sont donc vérifiables à la main.
const PROFILE = [
  { km: 0, alt: 900, lat: 45.0, lng: 5.9 },
  { km: 5, alt: 1400, lat: 45.1, lng: 6.0 },
  { km: 10, alt: 1900, lat: 45.2, lng: 6.1 },
  { km: 15, alt: 2400, lat: 45.3, lng: 6.2 },
];
const REFERENCE = { profile: PROFILE, totalKm: 15 };

describe("pointAuKm", () => {
  it("interpole entre deux points du profil", () => {
    // 7,5 km = pile entre le point à 5 km et celui à 10 km.
    const p = pointAuKm(PROFILE, 7.5);
    expect(p.lat).toBeCloseTo(45.15, 6);
    expect(p.lng).toBeCloseTo(6.05, 6);
    expect(p.alt).toBeCloseTo(1650, 6);
  });

  it("tombe exactement sur un point du profil", () => {
    const p = pointAuKm(PROFILE, 10);
    expect(p.lat).toBeCloseTo(45.2, 6);
    expect(p.alt).toBeCloseTo(1900, 6);
  });

  it("se cale sur les extrémités hors bornes plutôt que d'extrapoler", () => {
    expect(pointAuKm(PROFILE, 0).lat).toBeCloseTo(45.0, 6);
    expect(pointAuKm(PROFILE, 99).lat).toBeCloseTo(45.3, 6);
  });

  it("rend null sur une entrée inexploitable", () => {
    expect(pointAuKm(null, 5)).toBeNull();
    expect(pointAuKm([], 5)).toBeNull();
    expect(pointAuKm(PROFILE, NaN)).toBeNull();
    expect(pointAuKm(PROFILE, -3)).toBeNull();
  });
});

describe("reperesAffichables", () => {
  it("résout icône, position carte et position profil", () => {
    const [r] = reperesAffichables([{ nom: "Col Vert", km: 7.5, icone: "col" }], REFERENCE);
    expect(r.nom).toBe("Col Vert");
    expect(r.Icone).toBe(WAYPOINT_ICONES.col);
    expect(r.lat).toBeCloseTo(45.15, 6);
    expect(r.frac).toBeCloseTo(0.5, 6);
  });

  it("retombe sur le repère générique quand l'icône est absente ou inconnue", () => {
    const repères = reperesAffichables(
      [
        { nom: "Sans icône", km: 1 },
        { nom: "Faute de frappe", km: 2, icone: "sommmet" },
      ],
      REFERENCE,
    );
    expect(repères[0].Icone).toBe(iconeDuRepere("repere"));
    expect(repères[1].Icone).toBe(iconeDuRepere("repere"));
  });

  it("écarte les repères sans km exploitable", () => {
    const repères = reperesAffichables(
      [{ nom: "Sans km" }, { nom: "km texte", km: "12" }, { nom: "Bon", km: 3 }],
      REFERENCE,
    );
    expect(repères.map((r) => r.nom)).toEqual(["Bon"]);
  });

  it("borne la position sur le profil quand le km dépasse la distance totale", () => {
    const [r] = reperesAffichables([{ nom: "Trop loin", km: 40 }], REFERENCE);
    expect(r.frac).toBe(1);
  });

  it("donne des clés distinctes à deux repères de même nom", () => {
    const repères = reperesAffichables(
      [
        { nom: "Ravito", km: 4 },
        { nom: "Ravito", km: 11 },
      ],
      REFERENCE,
    );
    expect(repères[0].cle).not.toBe(repères[1].cle);
  });

  it("ne renvoie rien sans repères", () => {
    expect(reperesAffichables([], REFERENCE)).toEqual([]);
    expect(reperesAffichables(null, REFERENCE)).toEqual([]);
  });
});

describe("répartition carte / profil", () => {
  it("garde le profil mais pas la carte tant que la trace n'est pas chargée", () => {
    // Cas réel au premier rendu : liveConfig est là, le .track.json non.
    const sansTrace = { profile: null, totalKm: 15 };
    expect(reperesSurProfil([{ nom: "Col", km: 7.5 }], sansTrace)).toHaveLength(1);
    expect(reperesSurCarte([{ nom: "Col", km: 7.5 }], sansTrace)).toHaveLength(0);
  });

  it("pose tout une fois la trace chargée", () => {
    const repères = [{ nom: "Col", km: 7.5, icone: "col" }];
    expect(reperesSurCarte(repères, REFERENCE)).toHaveLength(1);
    expect(reperesSurProfil(repères, REFERENCE)).toHaveLength(1);
  });

  it("sans référence du tout, aucun repère ne s'affiche nulle part", () => {
    const repères = [{ nom: "Col", km: 7.5 }];
    expect(reperesSurCarte(repères, null)).toHaveLength(0);
    expect(reperesSurProfil(repères, null)).toHaveLength(0);
  });
});
