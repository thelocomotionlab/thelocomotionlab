// lib/carrouselRendu.test.js
//
// CE QUI SE VÉRIFIE SANS ŒIL. Le dessin d'une planche se juge à l'aperçu — mais
// « est-ce que ce trait a seulement été tracé, et dans le cadre ? » est une
// question binaire, et on n'a pas envie d'y répondre en rouvrant l'atelier.
//
// Le filet sous le titre est né de là : allumé, il ne se voyait pas, et on ne
// savait pas dire si le problème était le dessin ou le réglage. Un contexte 2D
// factice qui NOTE ses `fillRect` tranche en une seconde, sur les six gabarits.

import { describe, expect, it } from "vitest";

import { FORMATS, dessinerCartePartage } from "./carrouselCartes";

const GABARITS = ["carte", "bandeau", "photo", "texte", "fiche", "cloture"];

/** Un contexte 2D de comptoir, qui garde la trace de ses rectangles pleins et
 *  de la fonte avec laquelle chaque mot a été écrit. */
function ctxFactice() {
  const rects = [];
  const mots = [];
  const noop = () => {};
  const ctx = {
    rects,
    mots,
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    textBaseline: "",
    textAlign: "",
    lineCap: "",
    lineJoin: "",
    measureText: (t) => ({ width: String(t).length * 0.5 * (parseInt(ctx.font, 10) || 20) }),
    fillRect: (x, y, w, h) => rects.push({ x, y, w, h, couleur: ctx.fillStyle }),
    fillText: (t) => mots.push({ texte: String(t), fonte: ctx.font }),
    createLinearGradient: () => ({ addColorStop: noop, degrade: true }),
  };
  for (const nom of [
    "clearRect", "strokeRect", "strokeText", "beginPath", "moveTo",
    "lineTo", "arc", "closePath", "fill", "stroke", "save", "restore",
    "translate", "rotate", "scale", "setTransform", "drawImage", "clip",
  ]) ctx[nom] = noop;
  return ctx;
}

function planche(carte, options = {}) {
  const ctx = ctxFactice();
  dessinerCartePartage(ctx, {
    format: "carrousel",
    theme: "sombre",
    police: "Ubuntu",
    index: 0,
    total: 3,
    ...options,
    carte: {
      surtitre: "matériel",
      titre: "Le sac, pesé au gramme.",
      texte: "Quatre jours de vivres, deux litres portés.",
      fiche: [{ label: "Distance", valeur: "188 km" }],
      ...carte,
    },
  });
  return ctx;
}

/** Les rectangles pleins de la planche. */
const rectsDe = (ctx) => ctx.rects;

describe("le filet sous le titre", () => {
  const LARGEUR = 220;
  const EPAISSEUR = 8;
  const reglage = { filetTitre: true, filetTitreLargeur: LARGEUR, filetTitreEpaisseur: EPAISSEUR };
  const filets = ({ rects }) =>
    rects.filter((r) => Math.round(r.w) === LARGEUR && Math.round(r.h) === EPAISSEUR);

  it.each(GABARITS)("se dessine sur le gabarit « %s »", (gabarit) => {
    expect(filets(planche({ gabarit, ...reglage }))).toHaveLength(1);
  });

  it.each(GABARITS)("reste DANS la planche sur « %s »", (gabarit) => {
    const [f] = filets(planche({ gabarit, ...reglage }));
    expect(f.x).toBeGreaterThanOrEqual(0);
    expect(f.y).toBeGreaterThanOrEqual(0);
    expect(f.x + f.w).toBeLessThanOrEqual(FORMATS.carrousel.width);
    expect(f.y + f.h).toBeLessThanOrEqual(FORMATS.carrousel.height);
  });

  it("ne se dessine pas quand il est éteint", () => {
    // La fiche est le seul gabarit qui l'allume d'office : `false` doit l'éteindre.
    for (const gabarit of GABARITS) {
      const rects = planche({ gabarit, filetTitre: false, filetTitreLargeur: LARGEUR, filetTitreEpaisseur: EPAISSEUR });
      expect(filets(rects)).toHaveLength(0);
    }
  });

  it("suit sa couleur quand on lui en donne une", () => {
    const [f] = filets(planche({ gabarit: "texte", ...reglage, couleurFiletTitre: "#D6246E" }));
    expect(f.couleur).toBe("#D6246E");
  });

  it("se centre avec le titre centré", () => {
    const [gauche] = filets(planche({ gabarit: "texte", ...reglage }));
    const [centre] = filets(planche({ gabarit: "texte", ...reglage, centrer: true }));
    expect(centre.x).toBeGreaterThan(gauche.x);
    expect(Math.round(centre.x + centre.w / 2)).toBe(FORMATS.carrousel.width / 2);
  });
});

describe("les dégradés réglables", () => {
  /** Un dégradé est un `fillRect` dont le style n'est pas une couleur. */
  const degrades = ({ rects }) => rects.filter((r) => r.couleur?.degrade);

  it.each(["carte", "photo", "bandeau"])(
    "s'éteignent tous les deux sur « %s » quand on les met à zéro",
    (gabarit) => {
      const image = { width: 1600, height: 1200 };
      const avec = degrades(planche({ gabarit, image }));
      const sans = degrades(planche({ gabarit, image, degradeHaut: 0, degradeBas: 0 }));
      expect(avec.length).toBeGreaterThan(0);
      expect(sans).toHaveLength(0);
    },
  );

  it("comprend encore l'ancien réglage à cocher", () => {
    const image = { width: 1600, height: 1200 };
    expect(degrades(planche({ gabarit: "photo", image, degradeHaut: false, degradeBas: false }))).toHaveLength(0);
    expect(degrades(planche({ gabarit: "photo", image, degradeHaut: true, degradeBas: true })).length)
      .toBeGreaterThan(0);
  });
});

describe("les polices par rôle", () => {
  /** La fonte avec laquelle un mot précis a été écrit. Les mots sont posés UN
   *  PAR UN (c'est ce qui permet le gras au mot près) : on cherche le mot, pas
   *  la phrase. */
  const fonteDuMot = (ctx, mot) => ctx.mots.find((m) => m.texte === mot)?.fonte ?? "";
  const TITRE = "gramme.";
  const CORPS = "portés.";
  const trois = { sans: "Ubuntu", serif: "Lora", mono: "UbuntuMono" };

  it("écrit tout en Ubuntu quand la planche ne demande rien", () => {
    const ctx = planche({ gabarit: "texte" }, { polices: trois });
    expect(fonteDuMot(ctx, TITRE)).toContain("Ubuntu");
    expect(fonteDuMot(ctx, CORPS)).toContain("Ubuntu");
  });

  it("met le TITRE en Lora sans toucher au texte", () => {
    const ctx = planche({ gabarit: "texte", policeTitre: "serif" }, { polices: trois });
    expect(fonteDuMot(ctx, TITRE)).toContain("Lora");
    expect(fonteDuMot(ctx, CORPS)).toContain("Ubuntu");
  });

  it("met le TEXTE en Ubuntu Mono sans toucher au titre", () => {
    const ctx = planche({ gabarit: "texte", policeCorps: "mono" }, { polices: trois });
    expect(fonteDuMot(ctx, CORPS)).toContain("UbuntuMono");
    expect(fonteDuMot(ctx, TITRE)).toBe("700 65px Ubuntu");
  });

  it("retombe sur la police unique quand aucun trousseau n'est fourni", () => {
    const ctx = planche({ gabarit: "texte", policeTitre: "serif" });
    expect(fonteDuMot(ctx, TITRE)).toContain("Ubuntu");
  });

  it("ignore une clé de police inconnue plutôt que d'écrire en vide", () => {
    const ctx = planche({ gabarit: "texte", policeTitre: "gothique" }, { polices: trois });
    expect(fonteDuMot(ctx, TITRE)).toBe("700 65px Ubuntu");
  });
});

describe("l'interligne du titre", () => {
  // Le filet suit la DERNIÈRE ligne du titre : sa position dit où le bloc s'est
  // arrêté, sans avoir à mesurer du texte.
  const titre = "Un massif, une boucle, aucune assistance pendant quatre jours";
  const yDuFilet = (interligneTitre) => {
    const { rects } = planche({
      gabarit: "texte",
      titre,
      filetTitre: true,
      filetTitreLargeur: 220,
      filetTitreEpaisseur: 8,
      interligneTitre,
    });
    return rects.find((r) => Math.round(r.w) === 220 && Math.round(r.h) === 8).y;
  };

  it("descend le bloc quand on l'ouvre, le remonte quand on le serre", () => {
    expect(yDuFilet(2)).toBeGreaterThan(yDuFilet(1.16));
    expect(yDuFilet(1)).toBeLessThan(yDuFilet(1.16));
  });
});
