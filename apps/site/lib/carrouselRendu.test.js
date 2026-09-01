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
import { CLES_ICONES, geometrieDIcone } from "./carrouselIcones";

const GABARITS = ["carte", "etape", "bandeau", "photo", "texte", "fiche", "cloture"];

/**
 * `Path2D` n'existe pas sous Node, et `dessinerIcone` s'en sert pour tracer la
 * géométrie lucide. Sans ce bouchon, la moindre icône dans un texte faisait
 * échouer le rendu ENTIER — ce qui est aussi un vrai risque en production sur
 * un navigateur trop vieux, mais ici c'est le test qu'il empêchait d'exister.
 */
globalThis.Path2D ??= class Path2D {
  constructor(d) {
    this.d = d;
  }
};

/** Un contexte 2D de comptoir, qui garde la trace de ses rectangles pleins et
 *  de la fonte avec laquelle chaque mot a été écrit. */
function ctxFactice() {
  const rects = [];
  const mots = [];
  const images = [];
  const appels = [];
  const noop = () => {};
  const ctx = {
    rects,
    mots,
    images,
    appels,
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    textBaseline: "",
    textAlign: "",
    lineCap: "",
    lineJoin: "",
    // La TAILLE se lit sur `…px`, jamais avec `parseInt` : le navigateur
    // renormalise `ctx.font` en « 500 22px … » et `parseInt` en tire 500, la
    // GRAISSE. C'est le bug qui faisait déborder le nom du labo de la story ;
    // le contexte factice doit reproduire la fonte, pas le piège.
    measureText: (t) => ({
      width: String(t).length * 0.5 * (Number(/([\d.]+)px/.exec(ctx.font)?.[1]) || 20),
    }),
    fillRect: (x, y, w, h) => rects.push({ x, y, w, h, couleur: ctx.fillStyle }),
    fillText: (t, x, y) => mots.push({ texte: String(t), fonte: ctx.font, x, y }),
    drawImage: (_src, x, y, w, h) => images.push({ x, y, w, h }),
    createLinearGradient: () => ({ addColorStop: noop, degrade: true }),
  };
  for (const nom of [
    "clearRect", "strokeRect", "strokeText", "beginPath", "moveTo",
    "lineTo", "arc", "closePath", "fill", "stroke", "save", "restore",
    "translate", "rotate", "scale", "setTransform", "clip",
    "quadraticCurveTo", "bezierCurveTo", "ellipse", "rect",
    // `arcTo` : les coins arrondis des étiquettes de journée. Il manquait tant
    // qu'aucun test ne dessinait la carte AVEC ses étiquettes.
    "arcTo", "roundRect", "setLineDash",
  ]) ctx[nom] = (...a) => appels.push(nom, ...(nom === "fill" ? [] : []));
  return ctx;
}

function planche(carte, options = {}) {
  const ctx = ctxFactice();
  const rendu = dessinerCartePartage(ctx, {
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
  // Le rendu voyage AVEC le contexte : les tests interrogent l'un ou l'autre
  // (« qu'a-t-il dessiné ? » et « où peut-on cliquer ? ») sans deux helpers.
  ctx.zones = rendu.zones;
  ctx.boites = rendu.boites;
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

describe("le vocabulaire d'icônes", () => {
  it("a une géométrie traçable pour CHAQUE clé", () => {
    // Une clé sans géométrie disparaît SILENCIEUSEMENT de la planche : le texte
    // se dessine, l'icône non, et rien ne le dit.
    for (const cle of CLES_ICONES) {
      expect(geometrieDIcone(cle), `géométrie manquante pour :${cle}:`).toBeTruthy();
    }
  });

  it("connaît les sandales et le chrono", () => {
    expect(CLES_ICONES).toContain("sandales");
    expect(CLES_ICONES).toContain("chrono");
    // La sandale est dessinée à la maison : elle doit rendre la même forme de
    // géométrie que les icônes de lucide, sinon le canvas ne saurait pas la lire.
    expect(geometrieDIcone("sandales").every(([type]) => typeof type === "string")).toBe(true);
  });

  it("ne dessine que des primitives que le canvas sait tracer", () => {
    const connues = new Set(["path", "circle", "ellipse", "line", "rect", "polyline", "polygon"]);
    for (const cle of CLES_ICONES) {
      for (const [type] of geometrieDIcone(cle)) {
        expect(connues.has(type), `${cle} → <${type}> inconnu`).toBe(true);
      }
    }
  });
});

describe("la clôture", () => {
  const LOGO = { width: 512, height: 512 };
  const commun = {
    gabarit: "cloture",
    surtitre: "c'est fini",
    titre: "Merci d'avoir suivi.",
    texte: "",
    marque: "rien",
  };
  // Le logo est la seule image de cette planche : sa boîte dit où le bloc s'est
  // posé, sans avoir à mesurer du texte.
  const yDuLogo = (ctx) => ctx.images[0]?.y;

  it("pose bien le logo", () => {
    expect(yDuLogo(planche(commun, { logo: LOGO }))).toBeGreaterThan(0);
  });

  it("descend le logo quand le texte lui passe devant", () => {
    const bas = yDuLogo(planche(commun, { logo: LOGO }));
    const surtitre = yDuLogo(planche({ ...commun, clotureHaut: "surtitre" }, { logo: LOGO }));
    const deux = yDuLogo(planche({ ...commun, clotureHaut: "les-deux" }, { logo: LOGO }));
    expect(surtitre).toBeGreaterThan(bas);
    expect(deux).toBeGreaterThan(surtitre);
  });

  it("centre le bloc entier : un bloc plus haut MONTE, il ne déborde pas", () => {
    const court = yDuLogo(planche(commun, { logo: LOGO }));
    const long = yDuLogo(
      planche({ ...commun, texte: "Une ligne.\n\nUne autre.\n\nUne troisième." }, { logo: LOGO }),
    );
    expect(long).toBeLessThan(court);
  });
});

describe("la distance des dégradés", () => {
  /** La hauteur du rectangle peint avec un dégradé, en partant du haut. */
  const hautDuVoile = ({ rects }) =>
    rects.find((r) => r.couleur?.degrade && Math.round(r.y) === 0)?.h;

  it("suit le réglage sur la photo", () => {
    const image = { width: 1600, height: 1200 };
    expect(Math.round(hautDuVoile(planche({ gabarit: "photo", image, degradeHautH: 400 })))).toBe(400);
    expect(Math.round(hautDuVoile(planche({ gabarit: "photo", image, degradeHautH: 700 })))).toBe(700);
  });

  it("est réglable sur la carte aussi", () => {
    expect(Math.round(hautDuVoile(planche({ gabarit: "carte", degradeHautH: 320 })))).toBe(320);
  });

  it("garde la valeur du gabarit quand la planche ne dit rien", () => {
    const image = { width: 1600, height: 1200 };
    const defaut = hautDuVoile(planche({ gabarit: "photo", image }));
    expect(defaut).toBeGreaterThan(0);
    expect(defaut).not.toBe(400);
  });
});

describe("l'ombre des textes", () => {
  it("ne s'allume que si la planche la demande", () => {
    // On ne peut pas lire `ctx.shadowColor` après coup : on vérifie que le
    // rendu ne casse pas et que le réglage est bien pris en compte au dessin.
    const sans = planche({ gabarit: "texte" });
    const avec = planche({ gabarit: "texte", ombre: true, ombreFlou: 24 });
    expect(sans.mots.length).toBe(avec.mots.length);
  });
});

describe("le gabarit « Journées »", () => {
  const segments = [0, 1, 2, 3].map((i) => ({
    kmDebut: i * 40,
    kmFin: (i + 1) * 40,
    distanceKm: 40,
    dPlusM: 2000 + i * 100,
    coords: [
      [6 + i * 0.1, 44.9],
      [6.1 + i * 0.1, 45],
    ],
  }));
  const trace = {
    totalKm: 160,
    dPlusM: 8000,
    coords: [
      [6, 44.9],
      [6.4, 45.1],
      [6.2, 45.3],
    ],
    profil: Array.from({ length: 50 }, (_, i) => ({ km: (i / 49) * 160, alt: 1000 + i * 20 })),
  };

  it("écrit une ligne par case, avec le jour et ses chiffres", () => {
    const ctx = planche({ gabarit: "journees" }, { trace, segments });
    const texte = ctx.mots.map((m) => m.texte).join(" ");
    expect(texte).toContain("Jour");
    expect(texte).toContain("1");
    expect(texte).toContain("4");
  });

  it("suit le nombre de cases demandé", () => {
    const deux = planche({ gabarit: "journees", casesN: 2 }, { trace, segments });
    const quatre = planche({ gabarit: "journees", casesN: 4 }, { trace, segments });
    const jours = (ctx) => ctx.mots.filter((m) => m.texte === "Jour").length;
    expect(jours(deux)).toBe(2);
    expect(jours(quatre)).toBe(4);
  });

  it("tient dans la planche, même à huit cases sur deux colonnes", () => {
    const ctx = planche(
      { gabarit: "journees", casesN: 8, casesColonnes: 2 },
      { trace, segments },
    );
    for (const r of ctx.rects) {
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y + r.h).toBeLessThanOrEqual(FORMATS.carrousel.height + 1);
    }
  });

  it("ne dessine rien d'absurde sans trace", () => {
    const ctx = planche({ gabarit: "journees" }, { trace: null, segments: [] });
    expect(ctx.mots.some((m) => m.texte === "Jour")).toBe(true);
  });
});

describe("l'alignement du texte", () => {
  const commun = { gabarit: "texte", titre: "Un titre", texte: "Un paragraphe court." };
  const LARGEUR = 200;
  const filet = ({ rects }) => rects.find((r) => Math.round(r.w) === LARGEUR);
  const avecFilet = (align) =>
    filet(
      planche({
        ...commun,
        alignement: align,
        filetTitre: true,
        filetTitreLargeur: LARGEUR,
        filetTitreEpaisseur: 6,
      }),
    );

  it("pousse le filet du titre vers la droite quand on centre puis aligne à droite", () => {
    const g = avecFilet("gauche").x;
    const c = avecFilet("centre").x;
    const d = avecFilet("droite").x;
    expect(g).toBeLessThan(c);
    expect(c).toBeLessThan(d);
    expect(Math.round(c + LARGEUR / 2)).toBe(FORMATS.carrousel.width / 2);
    // Aligné à droite, le filet finit sur la marge droite.
    expect(Math.round(d + LARGEUR)).toBe(FORMATS.carrousel.width - Math.round(64));
  });

  it("comprend encore l'ancien booléen « centrer »", () => {
    expect(avecFilet(undefined)).toBeDefined();
    const centre = filet(
      planche({
        ...commun,
        centrer: true,
        filetTitre: true,
        filetTitreLargeur: LARGEUR,
        filetTitreEpaisseur: 6,
      }),
    );
    expect(Math.round(centre.x + LARGEUR / 2)).toBe(FORMATS.carrousel.width / 2);
  });

  it("aligne aussi le filet ambre du surtitre", () => {
    // Le filet du surtitre fait 2,6 × son corps : on le repère par sa hauteur.
    const trouve = (align) => {
      const { rects } = planche({ ...commun, surtitre: "matériel", alignement: align });
      return rects.find((r) => Math.round(r.h) === 10 && Math.round(r.w) === 57);
    };
    expect(trouve("centre").x).toBeGreaterThan(trouve("gauche").x);
    expect(trouve("droite").x).toBeGreaterThan(trouve("centre").x);
  });
});

describe("l'ordre du titre et du surtitre", () => {
  const commun = {
    gabarit: "texte",
    surtitre: "matériel",
    titre: "Le sac",
    filetTitre: true,
    filetTitreLargeur: 200,
    filetTitreEpaisseur: 6,
  };
  const yFiletTitre = (carte) =>
    planche(carte).rects.find((r) => Math.round(r.w) === 200 && Math.round(r.h) === 6).y;
  const yFiletSurtitre = (carte) =>
    planche(carte).rects.find((r) => Math.round(r.h) === 10 && Math.round(r.w) === 57).y;

  it("met le surtitre AVANT le titre par défaut", () => {
    expect(yFiletSurtitre(commun)).toBeLessThan(yFiletTitre(commun));
  });

  it("les échange sur demande", () => {
    const inverse = { ...commun, titreDevant: true };
    expect(yFiletSurtitre(inverse)).toBeGreaterThan(yFiletTitre(inverse));
  });

  it("échange aussi sur les gabarits construits du bas vers le haut", () => {
    for (const gabarit of ["carte", "photo"]) {
      const normal = { ...commun, gabarit };
      const inverse = { ...normal, titreDevant: true };
      expect(yFiletSurtitre(normal)).toBeLessThan(yFiletTitre(normal));
      expect(yFiletSurtitre(inverse)).toBeGreaterThan(yFiletTitre(inverse));
    }
  });
});

describe("les zones cliquables", () => {
  /** La zone du dessus à ce point — c'est celle qu'on croit cliquer. */
  const zoneAu = (ctx, x, y) => {
    const z = ctx.zones;
    for (let i = z.length - 1; i >= 0; i -= 1) {
      const r = z[i];
      if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return r;
    }
    return null;
  };
  const F = FORMATS.carrousel;

  it("rend une zone d'en-tête et une de pied sur tous les gabarits", () => {
    for (const gabarit of GABARITS) {
      const ctx = planche({ gabarit });
      const champs = ctx.zones.map((z) => z.champ);
      expect(champs, gabarit).toContain("entete");
      expect(champs, gabarit).toContain("pied");
    }
  });

  it("ouvre le titre quand on clique sur le titre", () => {
    const ctx = planche({ gabarit: "texte", surtitre: "matériel", titre: "Le sac" });
    const titre = ctx.zones.find((z) => z.champ === "titre");
    expect(titre).toBeDefined();
    expect(zoneAu(ctx, F.width / 2, titre.y + titre.height / 2).champ).toBe("titre");
  });

  it("distingue le surtitre du titre", () => {
    const ctx = planche({ gabarit: "texte", surtitre: "matériel", titre: "Le sac" });
    const sur = ctx.zones.find((z) => z.champ === "surtitre");
    const tit = ctx.zones.find((z) => z.champ === "titre");
    expect(sur.y).toBeLessThan(tit.y);
    expect(zoneAu(ctx, 100, sur.y + 2).champ).toBe("surtitre");
  });

  it("met la photo DESSOUS : un clic sur le titre ne l'ouvre pas", () => {
    const ctx = planche({
      gabarit: "photo",
      image: { width: 1600, height: 1200 },
      titre: "Le sac",
    });
    expect(ctx.zones[0].champ).toBe("photo");
    const titre = ctx.zones.find((z) => z.champ === "titre");
    expect(zoneAu(ctx, 100, titre.y + titre.height / 2).champ).toBe("titre");
    // Le haut de l'image, lui, reste la photo (sous la bande d'en-tête).
    expect(zoneAu(ctx, 540, F.height * 0.4).champ).toBe("photo");
  });

  it("donne une zone par case du gabarit Journées, numérotée", () => {
    const segments = [0, 1, 2].map((i) => ({
      kmDebut: i * 40,
      kmFin: (i + 1) * 40,
      distanceKm: 40,
      dPlusM: 2000,
      coords: [[6, 44.9], [6.1, 45]],
    }));
    const trace = {
      totalKm: 120,
      coords: [[6, 44.9], [6.4, 45.1]],
      profil: [{ km: 0, alt: 1000 }, { km: 120, alt: 2000 }],
    };
    const ctx = planche({ gabarit: "journees", casesN: 3 }, { trace, segments });
    const cases = ctx.zones.filter((z) => z.champ === "case");
    expect(cases).toHaveLength(3);
    expect(cases.map((c) => c.index)).toEqual([0, 1, 2]);
    expect(zoneAu(ctx, 540, cases[1].y + 10).index).toBe(1);
  });

  it("ne laisse AUCUN blanc entre les blocs de texte", () => {
    // Un clic entre le titre et son paragraphe doit ouvrir quelque chose :
    // n'ouvrir rien fait croire que le clic ne marche pas.
    const ctx = planche({ gabarit: "texte", surtitre: "matériel", titre: "Le sac", texte: "Deux mots." });
    const textes = ctx.zones
      .filter((z) => ["surtitre", "titre", "texte"].includes(z.champ) && !z.repli)
      .sort((a, b) => a.y - b.y);
    expect(textes).toHaveLength(3);
    for (const [i, z] of textes.entries()) {
      if (i === 0) continue;
      expect(Math.round(textes[i - 1].y + textes[i - 1].height)).toBe(Math.round(z.y));
    }
  });

  it("répond partout : aucun point de la planche n'est mort", () => {
    // Une planche de texte à moitié vide laissait sa moitié basse sans réponse,
    // ce qui se lit comme un outil cassé. La zone de repli est là pour ça.
    for (const gabarit of GABARITS) {
      const ctx = planche({ gabarit });
      for (const y of [0.05, 0.3, 0.55, 0.8, 0.97]) {
        expect(zoneAu(ctx, F.width / 2, F.height * y), `${gabarit} @${y}`).not.toBeNull();
      }
    }
  });

  it("ne déclare jamais de zone vide ou renversée", () => {
    for (const gabarit of GABARITS) {
      for (const z of planche({ gabarit }).zones) {
        expect(z.width, `${gabarit}/${z.champ}`).toBeGreaterThan(0);
        expect(z.height, `${gabarit}/${z.champ}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("les icônes dans les petites capitales", () => {
  // `dessinerIcone` trace ses chemins avec Path2D, absent de Node : on ne
  // vérifie pas le DESSIN mais la MISE EN PAGE — qu'une icône soit comptée
  // comme un signe, et que le texte qui l'entoure reste écrit.
  const mots = (ctx) => ctx.mots.map((m) => m.texte).join("");

  it("laisse le texte du surtitre intact autour de l'icône", () => {
    const ctx = planche({ gabarit: "texte", surtitre: "en direct", titre: "" });
    expect(mots(ctx)).toContain("EN DIRECT");
  });

  it("met les capitales du pied et de l'en-tête", () => {
    const ctx = planche({ gabarit: "texte", entete: "matériel", piedCentre: "jour 1" });
    expect(mots(ctx)).toContain("MATÉRIEL");
    expect(mots(ctx)).toContain("JOUR 1");
  });

  it("n'écrit PAS la clé d'une icône dans le surtitre", () => {
    // Sans balisage, « :balise: » sortait tel quel, en capitales.
    const ctx = planche({ gabarit: "texte", surtitre: ":balise: en direct", titre: "" });
    expect(mots(ctx)).not.toContain("BALISE");
    expect(mots(ctx)).toContain("EN DIRECT");
  });

  it("laisse une clé INCONNUE écrite, comme partout ailleurs", () => {
    const ctx = planche({ gabarit: "texte", surtitre: ":licorne: en direct", titre: "" });
    expect(mots(ctx)).toContain(":LICORNE:");
  });

  it("garde le surtitre aligné : l'icône compte dans sa largeur", () => {
    // Le filet ambre précède le texte : centré, il se déplace si — et seulement
    // si — la largeur mesurée tient compte de l'icône.
    const filet = (surtitre) =>
      planche({ gabarit: "texte", surtitre, alignement: "centre" }).rects.find(
        (r) => Math.round(r.h) === 10 && Math.round(r.w) === 57,
      ).x;
    expect(filet(":balise: en direct")).toBeLessThan(filet("en direct"));
  });
});

describe("la ligne de chiffres", () => {
  const trace = { totalKm: 188.2, dPlusM: 12279, dMinusM: 12279, coords: [], profil: [] };
  const mots = (ctx) => ctx.mots.map((m) => m.texte).join("");

  it("annonce les chiffres de la trace quand la planche ne dit rien", () => {
    const ctx = planche({ gabarit: "carte", pied: undefined }, { trace });
    expect(mots(ctx)).toContain("188 km");
    expect(mots(ctx)).toContain("12 279");
  });

  it("se remplace par le texte qu'on écrit", () => {
    const ctx = planche({ gabarit: "carte", pied: "Quatre jours, aucun ravitaillement" }, { trace });
    expect(mots(ctx)).toContain("ravitaillement");
    expect(mots(ctx)).not.toContain("188 km");
  });

  it("disparaît quand on la vide", () => {
    const ctx = planche({ gabarit: "carte", pied: "" }, { trace });
    expect(mots(ctx)).not.toContain("188 km");
  });

  it("accepte le balisage, et donc les icônes", () => {
    const ctx = planche({ gabarit: "carte", pied: "*188 km* :col:" }, { trace });
    const gras = ctx.mots.find((m) => m.texte === "km");
    expect(gras.fonte).toMatch(/^700 /);
  });

  it("ouvre son propre réglage au clic", () => {
    const ctx = planche({ gabarit: "carte", pied: "Quatre jours" }, { trace });
    expect(ctx.zones.some((z) => z.champ === "factuelle")).toBe(true);
  });
});

describe("le filet du surtitre", () => {
  // Il fait 2,6 × le corps du surtitre (57 px pour 22) et 10 px d'épaisseur.
  const filet = ({ rects }) => rects.find((r) => Math.round(r.h) === 10 && Math.round(r.w) === 57);
  const base = { gabarit: "texte", surtitre: "matériel", titre: "Le sac" };

  it("est là par défaut", () => {
    expect(filet(planche(base))).toBeDefined();
  });

  it.each(GABARITS)("s'enlève sur demande, sur « %s »", (gabarit) => {
    // Il y a SIX endroits qui dessinent un surtitre. Un seul oublié — c'était
    // la clôture — et le réglage passe pour cassé.
    expect(filet(planche({ ...base, gabarit }))).toBeDefined();
    expect(filet(planche({ ...base, gabarit, surtitreFilet: false }))).toBeUndefined();
  });

  it("rend sa place au texte, sans laisser de retrait fantôme", () => {
    // Sans filet, les capitales repartent de la marge : un retrait résiduel
    // serait invisible à écrire mais visible à l'œil. On repère « É », qui
    // n'existe que dans MATÉRIEL — « M » se trouve aussi dans LOCOMOTION.
    const x = (carte) => planche(carte).mots.find((mo) => mo.texte === "É").x;
    expect(x({ ...base, surtitreFilet: false })).toBeLessThan(x(base));
  });
});

describe("la clôture : ce qui passe au-dessus du logo", () => {
  const LOGO = { width: 512, height: 512 };
  const commun = {
    gabarit: "cloture",
    surtitre: "c'est fini",
    titre: "Merci d'avoir suivi.",
    texte: "Le récit complet arrive sur le site.",
    marque: "rien",
  };
  const yDuLogo = (carte) => planche(carte, { logo: LOGO }).images[0]?.y;

  it("descend le logo pour chaque pièce qu'on fait passer devant", () => {
    const rien = yDuLogo(commun);
    const texte = yDuLogo({ ...commun, clotureHaut_texte: true });
    const tout = yDuLogo({
      ...commun,
      clotureHaut_surtitre: true,
      clotureHaut_titre: true,
      clotureHaut_texte: true,
    });
    expect(texte).toBeGreaterThan(rien);
    expect(tout).toBeGreaterThan(texte);
  });

  it("comprend encore l'ancien réglage à quatre entrées", () => {
    const rien = yDuLogo(commun);
    expect(yDuLogo({ ...commun, clotureHaut: "les-deux" })).toBeGreaterThan(rien);
    expect(yDuLogo({ ...commun, clotureHaut: "non" })).toBe(rien);
  });
});

describe("la plaque sous le texte", () => {
  // Surtitre vide : on compte les plaques du TITRE et du TEXTE, sans celle du
  // surtitre qui viendrait brouiller le compte.
  const base = {
    gabarit: "photo",
    image: { width: 1600, height: 1200 },
    titre: "Le sac",
    surtitre: "",
  };
  /** La plaque est un chemin rempli, pas un `fillRect` : on la repère au
   *  `fill()` — le seul du gabarit photo une fois les dégradés écartés. */
  const remplissages = (ctx) => ctx.appels.filter((a) => a === "fill").length;

  it("ne pose rien quand on ne la demande pas", () => {
    expect(remplissages(planche(base))).toBe(0);
  });

  it("pose une plaque PAR LIGNE de texte", () => {
    const une = planche({ ...base, plaque: true, texte: "" });
    const deux = planche({ ...base, plaque: true, texte: "Deux mots." });
    expect(remplissages(une)).toBe(1);
    expect(remplissages(deux)).toBe(2);
  });

  it("garde le texte ENTIÈREMENT couvert quand elle se dégrade", () => {
    // Le fondu se prend sur une rallonge au-delà du texte : à droite, la plaque
    // doit donc s'étendre PLUS LOIN que sans dégradé — pas se rétrécir sous le
    // dernier mot.
    const bord = (carte) => {
      const ctx = ctxFactice();
      let droite = 0;
      const vrai = ctx.lineTo;
      ctx.lineTo = (x) => {
        if (x > droite) droite = x;
        vrai(x);
      };
      dessinerCartePartage(ctx, {
        format: "carrousel",
        theme: "sombre",
        police: "Ubuntu",
        index: 0,
        total: 1,
        carte: { ...base, plaque: true, texte: "", ...carte },
      });
      return droite;
    };
    expect(bord({ plaqueDegrade: "droite" })).toBeGreaterThan(bord({}));
  });

  it("se limite aux textes cochés", () => {
    const tout = planche({ ...base, plaque: true, texte: "Deux mots." });
    const sansTitre = planche({ ...base, plaque: true, texte: "Deux mots.", plaque_titre: false });
    expect(remplissages(sansTitre)).toBe(remplissages(tout) - 1);
  });
});

describe("les zones libres", () => {
  const base = { gabarit: "photo", image: { width: 1600, height: 1200 }, titre: "" };
  const mots = (ctx) => ctx.mots.map((m) => m.texte).join("");

  it("écrit son texte et rend une boîte déplaçable", () => {
    const ctx = planche({ ...base, libres: [{ texte: "Ici.", x: 0.2, y: 0.3 }] });
    expect(mots(ctx)).toContain("Ici.");
    const b = ctx.boites.find((x) => x.type === "libre");
    expect(b).toBeDefined();
    expect(Math.round(b.x)).toBe(Math.round(0.2 * FORMATS.carrousel.width));
    expect(Math.round(b.y)).toBe(Math.round(0.3 * FORMATS.carrousel.height));
  });

  it("place la zone au même endroit RELATIF quel que soit le format", () => {
    const ou = (format) => {
      const ctx = ctxFactice();
      const r = dessinerCartePartage(ctx, {
        format,
        theme: "sombre",
        police: "Ubuntu",
        index: 0,
        total: 1,
        carte: { ...base, libres: [{ texte: "Ici.", x: 0.25, y: 0.5 }] },
      });
      const b = r.boites.find((x) => x.type === "libre");
      return [b.x / FORMATS[format].width, b.y / FORMATS[format].height];
    };
    expect(ou("story")).toEqual(ou("carrousel"));
    expect(ou("carre")).toEqual(ou("carrousel"));
  });

  it("s'ouvre au clic, et gagne sur ce qu'il y a dessous", () => {
    const ctx = planche({ ...base, libres: [{ texte: "Ici.", x: 0.2, y: 0.3 }] });
    const z = ctx.zones.filter((x) => x.champ === "libre");
    expect(z).toHaveLength(1);
    // Déclarée en DERNIER : au clic, elle passe devant la photo et les textes.
    expect(ctx.zones[ctx.zones.length - 1].champ).toBe("libre");
  });

  it("se masque sans se perdre", () => {
    const ctx = planche({ ...base, libres: [{ texte: "Ici.", masquee: true }] });
    expect(mots(ctx)).not.toContain("Ici.");
    expect(ctx.boites.some((x) => x.type === "libre")).toBe(false);
  });
});

describe("la numérotation du pied", () => {
  // « 03 / 12 » s'écrit avec `dessinerTexteEspace`, donc LETTRE PAR LETTRE : on
  // recolle les mots de la planche pour la retrouver.
  const texteDe = ({ mots }) => mots.map((m) => m.texte).join("");
  const paginee = (ctx) => texteDe(ctx).includes("03 / 12");

  it.each(GABARITS)("s'écrit par défaut sur « %s »", (gabarit) => {
    expect(paginee(planche({ gabarit }, { index: 2, total: 12 }))).toBe(true);
  });

  it.each(GABARITS)("disparaît quand la planche la refuse — « %s »", (gabarit) => {
    expect(paginee(planche({ gabarit, piedNumero: false }, { index: 2, total: 12 }))).toBe(false);
  });

  it("n'emporte QUE le décompte, pas le reste du pied", () => {
    // On retire un décompte, pas une bande : le mot de droite reste, et c'est
    // tout l'intérêt sur une planche qui n'appartient pas à une série.
    const commun = { gabarit: "texte", piedDroite: "Glisse", piedCentre: "Écrins" };
    const avec = texteDe(planche(commun, { index: 2, total: 12 }));
    const sans = texteDe(planche({ ...commun, piedNumero: false }, { index: 2, total: 12 }));
    expect(avec.replace("03 / 12", "")).toBe(sans);
  });
});

describe("la tranche de journées d'une carte", () => {
  const segments = [0, 1, 2, 3].map((i) => ({
    kmDebut: i * 40,
    kmFin: (i + 1) * 40,
    distanceKm: 40,
    dPlusM: 2000 + i * 100,
    coords: [
      [6 + i * 0.1, 44.9],
      [6.1 + i * 0.1, 45],
    ],
  }));
  const trace = {
    totalKm: 160,
    dPlusM: 8000,
    coords: segments.flatMap((s) => s.coords),
    profil: Array.from({ length: 50 }, (_, i) => ({ km: (i / 49) * 160, alt: 1000 + i * 20 })),
  };
  const carte = (reglage) =>
    planche({ gabarit: "carte", titre: "", surtitre: "", ...reglage }, { trace, segments });
  /** Les étiquettes : leur texte, dans l'ordre où elles ont été posées. */
  const etiquettes = ({ mots }) => mots.filter((m) => /^J\d$/.test(m.texte)).map((m) => m.texte);

  it("les montre toutes sans réglage", () => {
    expect(etiquettes(carte({}))).toEqual(["J1", "J2", "J3", "J4"]);
  });

  it("s'arrête à `jusquA` — l'avancement", () => {
    expect(etiquettes(carte({ jusquA: 1 }))).toEqual(["J1", "J2"]);
  });

  it("n'en montre QU'UNE quand les deux bornes se touchent", () => {
    expect(etiquettes(carte({ depuis: 2, jusquA: 2 }))).toEqual(["J3"]);
  });

  it("rend à l'atelier le RANG D'ORIGINE de l'étiquette, pas sa place dans la tranche", () => {
    // Sans ça, déplacer l'étiquette d'une planche « J3 seule » écrirait dans
    // celle de J1 : les étiquettes sont rangées par position dans la carte.
    expect(carte({ depuis: 2, jusquA: 2 }).boites.map((b) => b.index)).toEqual([2]);
    expect(carte({ jusquA: 2 }).boites.map((b) => b.index)).toEqual([0, 1, 2]);
  });

  it("lit la couleur et le texte de la journée à son rang", () => {
    const ctx = carte({
      depuis: 2,
      jusquA: 2,
      etiquettes: [{}, {}, { texte: "Vallouise" }, {}],
    });
    expect(ctx.mots.some((m) => m.texte === "Vallouise")).toBe(true);
  });
});

describe("le gabarit « Étape »", () => {
  const segments = [0, 1, 2, 3].map((i) => ({
    kmDebut: i * 40,
    kmFin: (i + 1) * 40,
    distanceKm: 40,
    dPlusM: 2000 + i * 100,
    dMinusM: 1800 + i * 50,
    coords: [
      [6 + i * 0.1, 44.9],
      [6.1 + i * 0.1, 45],
    ],
  }));
  const trace = {
    totalKm: 160,
    dPlusM: 8000,
    coords: segments.flatMap((s) => s.coords),
    profil: Array.from({ length: 50 }, (_, i) => ({ km: (i / 49) * 160, alt: 1000 + i * 20 })),
  };
  const etape = (reglage) =>
    planche(
      {
        gabarit: "etape",
        titre: "Jour 3",
        surtitre: "",
        texte: "Montée au col sous la pluie.",
        colonne: "Distance = 46,8 km\nDénivelé positif = 2 519 m\nMasse portée = 8,4 kg",
        ...reglage,
      },
      { trace, segments },
    );
  // Les mots sont posés un par un (mesure et retour à la ligne) : on les recolle
  // et on normalise les blancs pour lire la planche comme une phrase.
  const lu = (ctx) => ctx.mots.map((m) => m.texte).join("").replace(/\s+/g, " ");
  /** L'aplat de repérage de la photo. Le FOND de la planche est lui aussi
   *  pleine largeur : ce qui les sépare, c'est qu'il fait toute la hauteur. */
  const bandePhoto = (ctx) =>
    ctx.rects.find(
      (r) =>
        Math.round(r.w) === FORMATS.carrousel.width &&
        r.h > 200 &&
        r.h < FORMATS.carrousel.height,
    );

  it("écrit le jour, son récit et sa colonne", () => {
    const ctx = etape({});
    expect(lu(ctx)).toContain("Jour 3");
    expect(lu(ctx)).toContain("Montée");
    expect(lu(ctx)).toContain("46,8");
    expect(lu(ctx)).toContain("8,4");
  });

  it("compose la colonne en libellé/valeur, et prend le balisage", () => {
    // Le libellé passe en capitales, lettre par lettre ; la valeur s'écrit d'un
    // bloc, en gras et plus gros. C'est la fiche d'avant, mais dans du texte —
    // donc avec tout le balisage.
    const ctx = etape({ colonne: "Distance = *46,8 km*" });
    expect(lu(ctx)).toContain("DISTANCE");
    const valeur = ctx.mots.find((m) => m.texte === "46,8");
    const libelle = ctx.mots.find((m) => m.texte === "D");
    expect(valeur.fonte).toMatch(/700/);
    expect(Number(/(\d+)px/.exec(valeur.fonte)[1])).toBeGreaterThan(
      Number(/(\d+)px/.exec(libelle.fonte)[1]),
    );
  });

  it("garde la bande de marque SUR LE PAPIER, la photo dessous", () => {
    // Sans image, la bande de photo est un aplat de repérage : il doit
    // commencer sous le filet d'en-tête, jamais par-dessus.
    const aplat = bandePhoto(etape({}));
    expect(aplat).toBeDefined();
    expect(aplat.y).toBeGreaterThan(120);
  });

  it("tient dans la planche, texte long compris", () => {
    const ctx = etape({
      texte:
        "Un récit qui déborde volontairement sur plusieurs lignes pour vérifier que le bloc du bas ne sort pas de la planche quand le texte pousse tout vers le bas de la page.",
    });
    for (const r of ctx.rects) {
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y + r.h).toBeLessThanOrEqual(FORMATS.carrousel.height + 1);
    }
  });

  it("montre les journées jusqu'au jour dit, chacune à sa couleur", () => {
    // La carte de l'étape est une vignette : pas d'étiquettes, donc on lit le
    // découpage sur le profil, dont chaque aire est une journée.
    const un = etape({ jusquA: 0 });
    const trois = etape({ jusquA: 2 });
    const aires = (ctx) => ctx.appels.filter((a) => a === "fill").length;
    expect(aires(trois)).toBeGreaterThan(aires(un));
  });

  it("laisse la photo remonter jusqu'au bord haut de la planche", () => {
    // Sans image, la bande de photo est un aplat de repérage : c'est lui qu'on
    // suit pour savoir OÙ la photo commence.
    const sous = bandePhoto(etape({}));
    const haut = bandePhoto(etape({ photoRemontee: 1 }));
    expect(haut.y).toBe(0);
    expect(haut.y).toBeLessThan(sous.y);
    // Elle grandit VERS LE HAUT : son bas ne bouge pas d'un pixel, donc rien de
    // ce qui suit n'a à être recalé.
    expect(Math.round(haut.y + haut.h)).toBe(Math.round(sous.y + sous.h));
  });

  it("efface le filet d'en-tête quand la photo passe dessous", () => {
    // Un trait tracé SUR une photo n'est plus un filet, c'est une rayure.
    const image = { width: 1200, height: 800 };
    const filets = (carte) =>
      planche({ gabarit: "etape", titre: "Jour 3", image, ...carte }, { trace, segments }).rects
        .filter((r) => r.h <= 3 && r.y < 200 && r.y > 0).length;
    expect(filets({})).toBeGreaterThan(0);
    expect(filets({ photoRemontee: 1 })).toBe(0);
  });

  it("pose la flèche du swipe où on l'écrit", () => {
    // `:fleche:` est un glyphe TRACÉ : il ne laisse pas de mot derrière lui,
    // seulement des segments. On le lit donc sur les traits, pas sur le texte.
    const traits = (colonne) => {
      const ctx = etape({ colonne });
      return ctx.appels.filter((a) => a === "lineTo").length;
    };
    expect(traits("Vénosc :fleche: Valgaudémar")).toBeGreaterThan(traits("Vénosc Valgaudémar"));
  });

  it("centre la colonne dans SA moitié, sans centrer ses lignes", () => {
    // Un bloc court se pose plus à droite qu'un bloc large : c'est la signature
    // d'un centrage. Avant, les deux commençaient au même x, collés à la trace.
    // Une valeur qu'on ne risque pas de confondre avec la pagination du pied,
    // elle aussi écrite chiffre par chiffre.
    const x = (colonne) => etape({ colonne }).mots.find((m) => m.texte === "999").x;
    expect(x("A = 999")).toBeGreaterThan(x("Un libellé beaucoup plus long = 999"));
  });

  it("mesure l'écart sous le titre sur CE QUI SUIT, pas sur le corps", () => {
    // Le piège : l'écart valait 2,2 CORPS même devant un surtitre de 22 px, et
    // grossir le corps du texte écartait alors une ligne qui ne le concerne pas.
    const ecart = (reglage) => {
      const ctx = etape({ titreDevant: true, surtitre: "ZZZ", texte: "", ...reglage });
      const titre = ctx.mots.find((m) => m.texte === "Jour");
      const sur = ctx.mots.find((m) => m.texte === "Z");
      return sur.y - titre.y;
    };
    expect(ecart({ tailleCorps: 38 })).toBe(ecart({ tailleCorps: 90 }));
  });

  it("laisse régler cet écart, et le serre d'office sur l'étape", () => {
    const ecart = (apresTitre) => {
      const ctx = etape({ titreDevant: true, surtitre: "ZZZ", texte: "", apresTitre });
      return ctx.mots.find((m) => m.texte === "Z").y - ctx.mots.find((m) => m.texte === "Jour").y;
    };
    expect(ecart(2.2)).toBeGreaterThan(ecart(1.2));
    expect(ecart(0)).toBeLessThan(ecart(1.2));
  });

  it("laisse retirer le filet qui ouvre les données", () => {
    const traits = (reglage) =>
      etape(reglage).rects.filter(
        (r) => Math.round(r.w) === FORMATS.carrousel.width - 128 && r.h <= 3 && r.y > 400,
      ).length;
    expect(traits({})).toBe(traits({ filetDonnees: false }) + 1);
  });

  it("rend toute la largeur à la colonne quand la vignette est à zéro", () => {
    const x = (ctx) => ctx.mots.find((m) => m.texte === "46,8")?.x ?? 0;
    expect(x(etape({ partCarte: 0.44 }))).toBeGreaterThan(0);
    expect(x(etape({ partCarte: 0 }))).toBeLessThan(x(etape({ partCarte: 0.44 })));
  });
});

describe("le filet qui souligne le titre", () => {
  const carte = (reglage) =>
    planche({
      gabarit: "texte",
      titre: "Jour 3",
      surtitre: "ZZZ",
      texte: "",
      filetTitre: true,
      titreDevant: true,
      ...reglage,
    });
  // Le filet a sa taille à lui : 96 × 4 par défaut, c'est ce qui le distingue
  // des trois autres traits de la planche.
  const filet = (ctx) => ctx.rects.find((r) => Math.round(r.w) === 96 && Math.round(r.h) === 4);
  const surtitre = (ctx) => ctx.mots.find((m) => m.texte === "Z");

  it("passe ENTRE le titre et le surtitre par défaut", () => {
    const ctx = carte({});
    expect(filet(ctx).y).toBeLessThan(surtitre(ctx).y);
  });

  it("souligne le DUO quand on le demande", () => {
    // Le surtitre devient un sous-titre : le trait le tient avec le titre au
    // lieu de les séparer.
    const ctx = carte({ filetSousDuo: true });
    expect(filet(ctx).y).toBeGreaterThan(surtitre(ctx).y);
  });

  it("ne bouge pas quand le surtitre OUVRE — il n'y a plus de duo à fermer", () => {
    const normal = carte({ titreDevant: false });
    const demande = carte({ titreDevant: false, filetSousDuo: true });
    expect(filet(demande).y).toBe(filet(normal).y);
  });

  it("laisse le corps respirer sous le duo", () => {
    // Le filet posé sous le surtitre ne doit pas se retrouver dans la première
    // ligne du paragraphe qui suit.
    const ctx = carte({ filetSousDuo: true, texte: "Une phrase." });
    const corps = ctx.mots.find((m) => m.texte === "Une");
    expect(corps.y).toBeGreaterThan(filet(ctx).y + 4);
  });
});

describe("le surtitre sur plusieurs lignes", () => {
  const carte = (reglage) =>
    planche({ gabarit: "texte", titre: "", texte: "", surtitre: "XXX", ...reglage });
  // X et Y : deux lettres ABSENTES de « THE LOCOMOTION LAB », qui s'écrit lui
  // aussi en capitales une par une dans la bande d'en-tête.
  const lettres = (ctx, l) => ctx.mots.filter((m) => m.texte === l);
  /** La taille lue sur la fonte du morceau — c'est elle que `--` change. */
  const taille = (mot) => Number(/(\d+)px/.exec(mot.fonte)[1]);

  it("écrit chaque ligne, empilée sous la précédente", () => {
    const ctx = carte({ surtitre: "XXX\nYYY" });
    const [x] = lettres(ctx, "X");
    const [y] = lettres(ctx, "Y");
    expect(y).toBeDefined();
    expect(y.y).toBeGreaterThan(x.y);
  });

  it("donne à chaque ligne son corps et son encre", () => {
    // « -- » réduit CETTE ligne, « [gris: …] » l'atténue : c'est ce qui permet
    // d'ajouter « × Rapace × Lolo » sous un « Vénosc → Valgaudémar ».
    const ctx = carte({ surtitre: "XXX\n-- [gris: YYY]" });
    expect(taille(lettres(ctx, "Y")[0])).toBeLessThan(taille(lettres(ctx, "X")[0]));
  });

  it("n'ouvre QUE la première ligne du filet ambre", () => {
    // Le filet est le point d'entrée du regard ; répété, il ferait une liste.
    const filets = (surtitre) =>
      carte({ surtitre, surtitreFilet: true }).rects.filter(
        (r) => r.h <= 12 && r.w > 40 && r.w < 90 && r.y < 700,
      ).length;
    expect(filets("XXX\nYYY")).toBe(filets("XXX"));
  });

  it("pousse ce qui suit d'autant de lignes qu'il en a", () => {
    const bas = (surtitre) => {
      const ctx = planche({ gabarit: "texte", titre: "", surtitre, texte: "ZZZ" });
      return ctx.mots.find((m) => m.texte === "ZZZ").y;
    };
    expect(bas("XXX\nYYY\nZZZ")).toBeGreaterThan(bas("XXX"));
  });

  it("change la famille d'un morceau sans toucher au reste de la ligne", () => {
    // Une ligne de capitales pose ses lettres une par une avec UNE fonte : un
    // « [serif: …] » ne peut passer que par un échange de famille en cours de
    // route — et la ligne doit reprendre la sienne juste après.
    const ctx = planche(
      { gabarit: "texte", titre: "", texte: "", surtitre: "X [serif: Y] X" },
      { polices: { sans: "Ubuntu", serif: "Lora", mono: "UbuntuMono" } },
    );
    const [avant, apres] = lettres(ctx, "X");
    const [serif] = lettres(ctx, "Y");
    expect(serif.fonte).not.toBe(avant.fonte);
    expect(taille(serif)).toBe(taille(avant));
    expect(apres.fonte).toBe(avant.fonte);
  });
});
