// packages/planche/src/elements.ts
//
// UNE FONCTION DE DESSIN PAR TYPE D'ÉLÉMENT.
//
// Chacune reçoit sa boîte en pixels de planche et ne connaît qu'elle : ni les
// voisins, ni la mise en page d'ensemble. C'est ce qui rend un élément
// déplaçable — une fonction qui calculerait sa place à partir de celle des
// autres redeviendrait un gabarit.
//
// Rotation, opacité et masquage sont posés par l'appelant (`dessinerAvecCadre`).
// Ici, on dessine à plat dans une boîte droite.

import { CORPS, couleurDuJour, rgba } from "./charte.ts";
import type { Ctx2D } from "./canvas.ts";
import { dessinerCarte } from "./carte.ts";
import { vocabulaireDIcones } from "./canvas.ts";
import { segmentsMontres, type ContexteRendu } from "./contexte.ts";
import {
  blocsDeTexte,
  decalageAlignement,
  dessinerCapitales,
  dessinerLigneRiche,
  fonteDe,
  hauteurBlocs,
  largeurCapitales,
  largeurLigne,
  lignesRiches,
  morceauxCapitales,
  poserBlocs,
  analyserRiche,
  type StyleTexte,
} from "./texte.ts";
import { ABSENT, resoudre, valeurDe } from "./variables.ts";
import type {
  BoitePx,
  Element,
  ElementCases,
  ElementFiche,
  ElementForme,
  ElementIcone,
  ElementMarque,
  ElementPhoto,
  ElementProfil,
  ElementStat,
  ElementTexte,
} from "./types.ts";
import type { PointProfil } from "@locomotionlab/trace";

const MARQUE = "THE LOCOMOTION LAB";

/** Le logo est teinté à la couleur du nom : même encre, même présence. */
const MARQUE_OPACITE = 0.68;

export function dessinerElement(
  ctx: Ctx2D,
  element: Element,
  boite: BoitePx,
  c: ContexteRendu,
): void {
  switch (element.type) {
    case "texte":
      return dessinerTexte(ctx, element, boite, c);
    case "photo":
      return dessinerPhoto(ctx, element, boite, c);
    case "forme":
      return dessinerForme(ctx, element, boite, c);
    case "icone":
      return dessinerIcone(ctx, element, boite, c);
    case "marque":
      return dessinerMarque(ctx, element, boite, c);
    case "stat":
      return dessinerStat(ctx, element, boite, c);
    case "fiche":
      return dessinerFiche(ctx, element, boite, c);
    case "profil":
      return dessinerProfil(ctx, element, boite, c);
    case "cases":
      return dessinerCases(ctx, element, boite, c);
    case "carte":
      return dessinerCarte(ctx, element, boite, c);
    default:
      return;
  }
}

/* ------------------------------------------------------------------ texte */

/** Le style de rendu d'un élément texte : ses réglages, sur l'encre du thème. */
export function styleDe(e: ElementTexte, c: ContexteRendu): StyleTexte {
  return {
    police: c.police,
    taille: e.corps,
    graisse: e.graisse,
    couleur: e.couleur || c.theme.encre,
    accent: c.theme.accent,
    douce: c.theme.encreDouce,
    plaque: e.plaque
      ? {
          rgb: e.plaque.couleur || c.theme.voileTexte,
          alpha: e.plaque.opacite,
          padX: e.plaque.margeX,
          padY: e.plaque.margeY,
          rayon: e.plaque.rayon,
          degrade: e.plaque.degrade,
          fondu: 0.4,
        }
      : null,
    interligne: e.interligne,
    lignesDures: e.lignesDures,
  };
}

/** Pose l'ombre du texte sur le contexte, ou l'éteint. */
function poserOmbre(ctx: Ctx2D, e: ElementTexte, c: ContexteRendu): void {
  if (!e.ombre) {
    ctx.shadowColor = "rgba(0, 0, 0, 0)";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    return;
  }
  const teinte = e.ombre.couleur || "0, 0, 0";
  ctx.shadowColor = teinte.startsWith("#")
    ? teinte
    : `rgba(${teinte}, ${e.ombre.opacite})`;
  ctx.shadowBlur = e.ombre.flou;
  ctx.shadowOffsetX = e.ombre.dx;
  ctx.shadowOffsetY = e.ombre.dy;
}

/**
 * La hauteur qu'occupe réellement un texte — ce qui permet d'ajuster sa boîte
 * au contenu plutôt que de laisser un titre déborder en silence.
 */
export function hauteurNaturelle(ctx: Ctx2D, e: ElementTexte, boite: BoitePx, c: ContexteRendu): number {
  const style = styleDe(e, c);
  if (e.casse === "capitales") return e.corps * 1.2;
  const texte = resoudre(e.contenu, c.variables);
  return hauteurBlocs(blocsDeTexte(ctx, texte, boite.l, style), style);
}

/**
 * LES CAPITALES ESPACÉES sont posées à part.
 *
 * Un surtitre, une bande d'en-tête, un pied : une seule ligne, dont toute
 * l'allure vient de l'interlettrage. Le modèle de blocs ne sait pas écarter des
 * lettres — il pose des mots — et c'est très bien ainsi : ce sont deux façons
 * de composer, pas deux réglages d'une même.
 */
function dessinerTexteCapitales(
  ctx: Ctx2D,
  e: ElementTexte,
  boite: BoitePx,
  c: ContexteRendu,
  style: StyleTexte,
): void {
  const morceaux = morceauxCapitales(resoudre(e.contenu, c.variables));
  ctx.font = fonteDe({ texte: "" }, style);
  ctx.fillStyle = style.couleur;
  const largeur = largeurCapitales(ctx, morceaux, e.corps, e.lettrage);

  // Le filet ambre qui OUVRE un surtitre : c'est le point d'entrée du regard,
  // et il se pose avant les lettres, sur la même ligne optique.
  let x = boite.x + decalageAlignement(e.alignement, boite.l, largeur + filetOuvrantLarge(e));
  const ligneDeBase = boite.y + e.corps;
  if (e.filetOuvrant) {
    const f = e.filetOuvrant;
    ctx.fillStyle = f.couleur || c.theme.accent;
    ctx.fillRect(x, ligneDeBase - e.corps * 0.34 - f.epaisseur / 2, f.largeur, f.epaisseur);
    x += f.largeur + e.corps * 0.55;
    ctx.fillStyle = style.couleur;
  }
  dessinerCapitales(ctx, morceaux, x, ligneDeBase, e.corps, e.lettrage, c.theme.accent, {
    douce: c.theme.encreDouce,
  });
}

/** L'encombrement du filet d'ouverture, écart compris. */
function filetOuvrantLarge(e: ElementTexte): number {
  return e.filetOuvrant ? e.filetOuvrant.largeur + e.corps * 0.55 : 0;
}

function dessinerTexte(ctx: Ctx2D, e: ElementTexte, boite: BoitePx, c: ContexteRendu): void {
  const style = styleDe(e, c);
  ctx.save();
  poserOmbre(ctx, e, c);

  if (e.casse === "capitales") {
    dessinerTexteCapitales(ctx, e, boite, c, style);
    ctx.restore();
    return;
  }

  const texte = resoudre(e.contenu, c.variables);
  const blocs = blocsDeTexte(ctx, texte, boite.l, style);
  const bas = poserBlocs(ctx, blocs, boite.x, boite.y, style, {
    align: e.alignement,
    largeur: boite.l,
    puce: e.puce,
  });

  // Le filet court SOUS le titre — il se pose après le texte, à la place que le
  // texte a réellement prise, pas à celle qu'on lui avait réservée.
  if (e.filetSousTitre) {
    const f = e.filetSousTitre;
    ctx.shadowColor = "rgba(0, 0, 0, 0)";
    ctx.fillStyle = f.couleur || c.theme.accent;
    ctx.fillRect(
      boite.x + decalageAlignement(e.alignement, boite.l, f.largeur),
      bas + e.corps * 0.42,
      f.largeur,
      f.epaisseur,
    );
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ photo */

/**
 * Le cadrage d'une photo dans son cadre, façon `object-fit: cover`.
 *
 * L'échelle part du plus GRAND rapport : la photo couvre toujours le cadre, elle
 * n'y laisse jamais de bande vide. `cadrage.x` et `cadrage.y` glissent ensuite la
 * partie visible, en fractions du débordement — ce qui marche aussi bien sur une
 * photo horizontale (débordement latéral) que verticale.
 */
export function cadrageCouverture(
  source: { width: number; height: number },
  cadre: { l: number; h: number },
  cadrage: { x: number; y: number; echelle: number },
): { sx: number; sy: number; sl: number; sh: number } | null {
  const { width: sw, height: sh } = source;
  if (!(sw > 0) || !(sh > 0) || !(cadre.l > 0) || !(cadre.h > 0)) return null;

  const zoom = Math.max(1, cadrage.echelle || 1);
  const echelle = Math.max(cadre.l / sw, cadre.h / sh) * zoom;
  const visibleL = cadre.l / echelle;
  const visibleH = cadre.h / echelle;
  const borne = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.5));
  return {
    sx: (sw - visibleL) * borne(cadrage.x),
    sy: (sh - visibleH) * borne(cadrage.y),
    sl: visibleL,
    sh: visibleH,
  };
}

/**
 * Où tomberait la photo ENTIÈRE, à l'échelle où le cadre la montre.
 *
 * C'est ce que le recadrage a besoin de savoir : on montre la photo complète en
 * sourdine autour du cadre, pour qu'on voie ce qu'on est en train d'écarter.
 * Sans cette boîte, recadrer serait tirer à l'aveugle sur ce qu'on ne voit pas.
 */
export function etendueDeLaPhoto(
  source: { width: number; height: number },
  cadre: BoitePx,
  cadrage: { x: number; y: number; echelle: number },
): BoitePx | null {
  const vue = cadrageCouverture(source, cadre, cadrage);
  if (!vue || !(vue.sl > 0) || !(vue.sh > 0)) return null;
  const echelle = cadre.l / vue.sl;
  return {
    x: cadre.x - vue.sx * echelle,
    y: cadre.y - vue.sy * echelle,
    l: source.width * echelle,
    h: source.height * echelle,
  };
}

/**
 * Le cadrage après un glissé de `dx`, `dy` PIXELS DE PLANCHE.
 *
 * Tirer la photo la fait glisser SOUS le cadre : déplacer la main vers la
 * droite montre ce qui était à gauche, donc `x` diminue. Une photo qui ne
 * déborde pas dans un sens ne bouge pas dans ce sens — il n'y a rien à révéler.
 */
export function glisserLeCadrage(
  source: { width: number; height: number },
  cadre: BoitePx,
  cadrage: { x: number; y: number; echelle: number },
  dx: number,
  dy: number,
): { x: number; y: number; echelle: number } {
  const vue = cadrageCouverture(source, cadre, cadrage);
  if (!vue) return cadrage;
  const parPixelX = cadre.l > 0 ? vue.sl / cadre.l : 0;
  const parPixelY = cadre.h > 0 ? vue.sh / cadre.h : 0;
  const margeX = source.width - vue.sl;
  const margeY = source.height - vue.sh;
  const borne = (v: number) => Math.min(1, Math.max(0, v));
  return {
    echelle: cadrage.echelle,
    x: margeX > 0 ? borne(cadrage.x - (dx * parPixelX) / margeX) : cadrage.x,
    y: margeY > 0 ? borne(cadrage.y - (dy * parPixelY) / margeY) : cadrage.y,
  };
}

/** Le chemin d'un rectangle à coins arrondis — le cadre d'une photo, d'une forme. */
function cheminArrondi(ctx: Ctx2D, b: BoitePx, rayon: number): void {
  const r = Math.max(0, Math.min(rayon, b.l / 2, b.h / 2));
  ctx.beginPath();
  ctx.moveTo(b.x + r, b.y);
  ctx.lineTo(b.x + b.l - r, b.y);
  ctx.quadraticCurveTo(b.x + b.l, b.y, b.x + b.l, b.y + r);
  ctx.lineTo(b.x + b.l, b.y + b.h - r);
  ctx.quadraticCurveTo(b.x + b.l, b.y + b.h, b.x + b.l - r, b.y + b.h);
  ctx.lineTo(b.x + r, b.y + b.h);
  ctx.quadraticCurveTo(b.x, b.y + b.h, b.x, b.y + b.h - r);
  ctx.lineTo(b.x, b.y + r);
  ctx.quadraticCurveTo(b.x, b.y, b.x, b.y + r);
  ctx.closePath();
}

function dessinerPhoto(ctx: Ctx2D, e: ElementPhoto, b: BoitePx, c: ContexteRendu): void {
  const image = e.mediaId ? c.images.get(e.mediaId) : null;
  ctx.save();
  cheminArrondi(ctx, b, e.coins);
  ctx.clip();

  if (image) {
    const cadre = cadrageCouverture(image, b, e.cadrage);
    if (cadre) {
      if (e.retournee) {
        // Le retournement se fait sur le CADRE, pas sur la planche : sans le
        // recentrage, la photo partirait hors de sa boîte.
        ctx.translate(b.x * 2 + b.l, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(image, cadre.sx, cadre.sy, cadre.sl, cadre.sh, b.x, b.y, b.l, b.h);
      if (e.retournee) {
        ctx.scale(-1, 1);
        ctx.translate(-(b.x * 2 + b.l), 0);
      }
    }
  } else {
    // Un cadre d'accueil : la place de la photo se voit, et on sait où la lâcher.
    ctx.fillStyle = rgba(c.theme.encre, 0.08);
    ctx.fillRect(b.x, b.y, b.l, b.h);
  }

  if (e.voile) {
    ctx.fillStyle = `rgba(${e.voile.couleur || c.theme.voileTexte}, ${e.voile.opacite})`;
    ctx.fillRect(b.x, b.y, b.l, b.h);
  }

  // LES DÉGRADÉS : ce qui rend un titre lisible sur une photo claire sans
  // repeindre l'image entière. Ils partent du bord et s'éteignent vers le milieu.
  if (e.degrades) {
    const rgb = c.theme.voileTexte;
    const hauteur = Math.max(0, e.degrades.hauteur) * b.h;
    if (e.degrades.haut > 0 && hauteur > 0) {
      const g = ctx.createLinearGradient(0, b.y, 0, b.y + hauteur);
      g.addColorStop(0, `rgba(${rgb}, ${e.degrades.haut})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(b.x, b.y, b.l, hauteur);
    }
    if (e.degrades.bas > 0 && hauteur > 0) {
      const g = ctx.createLinearGradient(0, b.y + b.h, 0, b.y + b.h - hauteur);
      g.addColorStop(0, `rgba(${rgb}, ${e.degrades.bas})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(b.x, b.y + b.h - hauteur, b.l, hauteur);
    }
  }
  ctx.restore();

  if (e.bordure && e.bordure.epaisseur > 0) {
    ctx.save();
    ctx.strokeStyle = e.bordure.couleur || c.theme.filet;
    ctx.lineWidth = e.bordure.epaisseur;
    cheminArrondi(ctx, b, e.coins);
    ctx.stroke();
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ forme */

function dessinerForme(ctx: Ctx2D, e: ElementForme, b: BoitePx, c: ContexteRendu): void {
  ctx.save();
  const remplissage = e.remplissage === null ? null : e.remplissage || c.theme.accent;

  if (e.forme === "ligne" || e.forme === "filet") {
    // Le FILET AMBRE de la charte : la même épaisseur que celui qui ouvre un
    // surtitre, mais posable n'importe où.
    ctx.fillStyle = remplissage ?? c.theme.accent;
    const epaisseur = e.forme === "filet" ? Math.max(2, b.h) : Math.max(1, b.h);
    ctx.fillRect(b.x, b.y, b.l, epaisseur);
    ctx.restore();
    return;
  }

  if (e.forme === "cercle") {
    ctx.beginPath();
    ctx.ellipse(b.x + b.l / 2, b.y + b.h / 2, b.l / 2, b.h / 2, 0, 0, Math.PI * 2);
  } else {
    cheminArrondi(ctx, b, e.coins);
  }
  if (remplissage) {
    ctx.fillStyle = remplissage;
    ctx.fill();
  }
  if (e.contour && e.contour.epaisseur > 0) {
    ctx.strokeStyle = e.contour.couleur || c.theme.encre;
    ctx.lineWidth = e.contour.epaisseur;
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ icône */

function dessinerIcone(ctx: Ctx2D, e: ElementIcone, b: BoitePx, c: ContexteRendu): void {
  // Une icône reste CARRÉE dans sa boîte : les pictogrammes lucide sont dessinés
  // dans un carré de 24, et les étirer déforme le trait.
  const cote = Math.min(b.l, b.h);
  ctx.save();
  ctx.lineWidth = e.epaisseur;
  vocabulaireDIcones().dessiner(
    ctx,
    e.cle,
    b.x + (b.l - cote) / 2,
    b.y + (b.h - cote) / 2,
    cote,
    e.couleur || c.theme.encre,
  );
  ctx.restore();
}

/* ----------------------------------------------------------------- marque */

function dessinerMarque(ctx: Ctx2D, e: ElementMarque, b: BoitePx, c: ContexteRendu): void {
  const teinte = e.teinte || c.theme.accent;
  ctx.save();

  if (e.variante === "cercle") {
    // LA CLÔTURE : la marque cerclée, centrée dans sa boîte.
    const rayon = Math.min(b.l, b.h) / 2;
    const cx = b.x + b.l / 2;
    const cy = b.y + b.h / 2;
    ctx.strokeStyle = teinte;
    ctx.lineWidth = Math.max(2, rayon * 0.045);
    ctx.beginPath();
    ctx.arc(cx, cy, rayon - ctx.lineWidth, 0, Math.PI * 2);
    ctx.stroke();
    if (c.logo) {
      const cote = rayon * 1.05;
      ctx.globalAlpha *= MARQUE_OPACITE;
      ctx.drawImage(c.logo, cx - cote / 2, cy - cote / 2, cote, cote);
    }
    ctx.restore();
    return;
  }

  const corps = Math.min(b.h, CORPS.entete * (b.h / CORPS.logo || 1));
  const taille = Math.max(8, Math.min(b.h * 0.55, corps));
  const ligneDeBase = b.y + b.h / 2 + taille * 0.35;
  let x = b.x;

  if (e.variante !== "nom" && c.logo) {
    const cote = b.h;
    ctx.save();
    ctx.globalAlpha *= MARQUE_OPACITE;
    ctx.drawImage(c.logo, x, b.y, cote, cote);
    ctx.restore();
    x += cote + taille * 0.5;
  }
  if (e.variante !== "logo") {
    ctx.font = `500 ${taille}px ${c.police}`;
    ctx.fillStyle = teinte;
    dessinerCapitales(ctx, analyserRiche(MARQUE), x, ligneDeBase, taille, 0.16, teinte);
  }
  ctx.restore();
}

/* ------------------------------------------------- chiffres liés aux données */

/** Ce qu'un chiffre affiche : sa valeur manuelle, sinon la variable, sinon rien. */
export function valeurAffichee(e: ElementStat, c: ContexteRendu): string {
  if (e.valeurManuelle !== null && e.valeurManuelle !== "") return e.valeurManuelle;
  return valeurDe(e.variable, c.variables) ?? ABSENT;
}

function dessinerStat(ctx: Ctx2D, e: ElementStat, b: BoitePx, c: ContexteRendu): void {
  const style: StyleTexte = {
    police: c.police,
    taille: e.taille,
    graisse: 700,
    couleur: c.theme.encre,
    accent: c.theme.accent,
  };
  ctx.save();
  const valeur = lignesRiches(ctx, analyserRiche(valeurAffichee(e, c)), b.l, style);
  const ligne = valeur[0] ?? [];
  const largeur = largeurLigne(ligne);
  const ligneDeBase = b.y + e.taille * 0.82;
  dessinerLigneRiche(ctx, ligne, b.x + (b.l - largeur) / 2, ligneDeBase, style);

  // L'UNITÉ SOUS LE CHIFFRE, en capitales espacées : c'est la grammaire des
  // quatre chiffres d'un survol, et celle des fiches du compte.
  if (e.libelle) {
    const petit = Math.max(9, e.taille * 0.3);
    ctx.font = `500 ${petit}px ${c.police}`;
    ctx.fillStyle = c.theme.encreDouce;
    const morceaux = morceauxCapitales(e.libelle);
    const large = largeurCapitales(ctx, morceaux, petit, 0.14);
    dessinerCapitales(
      ctx,
      morceaux,
      b.x + (b.l - large) / 2,
      ligneDeBase + petit * 1.5,
      petit,
      0.14,
      c.theme.accent,
      { douce: c.theme.encreDouce },
    );
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ fiche */

function dessinerFiche(ctx: Ctx2D, e: ElementFiche, b: BoitePx, c: ContexteRendu): void {
  if (e.lignes.length === 0) return;
  ctx.save();
  const pas = b.h / e.lignes.length;
  e.lignes.forEach((row, i) => {
    const y = b.y + i * pas;
    // LE LIBELLÉ À GAUCHE, LA VALEUR EN GROS À DROITE — la mise en page de la
    // fiche technique du compte.
    ctx.font = `500 ${e.tailleLibelle}px ${c.police}`;
    ctx.fillStyle = c.theme.encreDouce;
    const morceaux = morceauxCapitales(row.libelle);
    dessinerCapitales(
      ctx,
      morceaux,
      b.x,
      y + e.tailleLibelle * 1.1,
      e.tailleLibelle,
      0.14,
      c.theme.accent,
      { douce: c.theme.encreDouce },
    );

    const brut =
      row.variable !== null
        ? (valeurDe(row.variable, c.variables) ?? ABSENT)
        : (row.valeur ?? "");
    const style: StyleTexte = {
      police: c.police,
      taille: e.tailleValeur,
      graisse: 700,
      couleur: row.accent ? c.theme.accent : c.theme.encre,
      accent: c.theme.accent,
    };
    const ligne = lignesRiches(ctx, analyserRiche(brut), b.l, style)[0] ?? [];
    dessinerLigneRiche(
      ctx,
      ligne,
      b.x + b.l - largeurLigne(ligne),
      y + pas - e.tailleValeur * 0.24,
      style,
    );
  });
  ctx.restore();
}

/* ----------------------------------------------------------------- profil */

/**
 * Points du profil PROJETÉS dans une boîte, plus l'ordonnée de base.
 *
 * L'altitude est étirée sur toute la hauteur : ce n'est pas une échelle, c'est
 * une SILHOUETTE. Une échelle vraie écraserait le relief d'une sortie de
 * vallée et gonflerait celui d'une sortie de plaine ; la silhouette dit la
 * forme de l'effort, ce qu'on lit sur une planche.
 */
export function cheminDuProfil(
  // La silhouette ne lit que le kilomètre et l'altitude : le dénivelé accumulé
  // que porte aussi un point de profil ne lui sert à rien, et l'exiger
  // obligerait l'appelant à le fabriquer pour rien.
  profil: readonly { km: number; alt: number }[],
  b: BoitePx,
): { base: number; min: number; max: number; points: [number, number][] } | null {
  const points = (Array.isArray(profil) ? profil : []).filter(
    (p) => Number.isFinite(p?.km) && Number.isFinite(p?.alt),
  );
  if (points.length < 2) return null;

  const depart = points[0]!.km;
  const total = points[points.length - 1]!.km - depart;
  if (!(total > 0)) return null;

  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    if (p.alt < min) min = p.alt;
    if (p.alt > max) max = p.alt;
  }
  const amplitude = Math.max(1, max - min);

  return {
    base: b.y + b.h,
    min,
    max,
    points: points.map((p) => [
      b.x + (Math.min(total, Math.max(0, p.km - depart)) / total) * b.l,
      b.y + (1 - (p.alt - min) / amplitude) * b.h,
    ]),
  };
}

function dessinerProfil(ctx: Ctx2D, e: ElementProfil, b: BoitePx, c: ContexteRendu): void {
  const montres = segmentsMontres(c);
  const profil = montres.length
    ? montres.flatMap((s) => s.profil)
    : (c.variables.trace?.profil ?? []);
  const complet = c.variables.trace?.profil ?? [];

  // LE RESTANT ESTOMPÉ : la silhouette entière en sourdine, la part parcourue
  // par-dessus. C'est ce qui dit « on en est là » sans deux images — et ça n'a
  // rien à dire quand la part montrée EST le tout : on tracerait alors deux fois
  // la même courbe.
  const partiel = profil.length > 1 && profil.length < complet.length;
  if (e.restantEstompe && partiel && complet.length > 1) {
    const tout = cheminDuProfil(complet, b);
    if (tout) traceProfil(ctx, tout, c.theme.profilRestant, null);
  }

  const chemin = cheminDuProfil(profil, e.restantEstompe && partiel ? boiteDuSegment(b, complet, profil) : b);
  if (!chemin) return;
  traceProfil(ctx, chemin, e.remplissage || c.theme.accent, c.theme.accentAire);
}

/**
 * La boîte d'une PORTION de profil dans la boîte du profil entier.
 *
 * Sans ce recalage, la part parcourue serait étirée sur toute la largeur et se
 * superposerait mal au profil complet tracé dessous — deux silhouettes de la
 * même trace qui ne se ressemblent pas.
 */
function boiteDuSegment(
  b: BoitePx,
  complet: readonly PointProfil[],
  portion: readonly PointProfil[],
): BoitePx {
  if (complet.length < 2 || portion.length < 2) return b;
  const total = complet[complet.length - 1]!.km - complet[0]!.km;
  if (!(total > 0)) return b;
  const debut = (portion[0]!.km - complet[0]!.km) / total;
  const fin = (portion[portion.length - 1]!.km - complet[0]!.km) / total;
  return { x: b.x + debut * b.l, y: b.y, l: Math.max(1, (fin - debut) * b.l), h: b.h };
}

function traceProfil(
  ctx: Ctx2D,
  chemin: { base: number; points: [number, number][] },
  couleur: string,
  aire: string | null,
): void {
  const pts = chemin.points;
  if (pts.length < 2) return;
  ctx.save();

  if (aire) {
    ctx.beginPath();
    ctx.moveTo(pts[0]![0], chemin.base);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(pts[pts.length - 1]![0], chemin.base);
    ctx.closePath();
    ctx.fillStyle = `rgba(${aire}, 0.3)`;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.strokeStyle = couleur;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ cases */

/**
 * LES JOURNÉES EN GRILLE : une case par journée, son numéro et ses chiffres.
 *
 * La mini-carte de chaque case attend la couche cartographique ; le mini-profil,
 * lui, ne tient qu'à la silhouette et se dessine déjà.
 */
function dessinerCases(ctx: Ctx2D, e: ElementCases, b: BoitePx, c: ContexteRendu): void {
  const segments = segmentsMontres(c);
  if (segments.length === 0) return;

  const colonnes = Math.max(1, Math.round(e.colonnes));
  const rangs = Math.ceil(segments.length / colonnes);
  const largeur = b.l / colonnes;
  const hauteur = b.h / rangs;
  const marge = Math.min(largeur, hauteur) * 0.08;

  segments.forEach((segment, i) => {
    const cx = b.x + (i % colonnes) * largeur;
    const cy = b.y + Math.floor(i / colonnes) * hauteur;
    const dedans: BoitePx = {
      x: cx + marge,
      y: cy + marge,
      l: largeur - marge * 2,
      h: hauteur - marge * 2,
    };

    if (e.filet) {
      ctx.save();
      ctx.strokeStyle = c.theme.filet;
      ctx.lineWidth = 2;
      ctx.strokeRect(cx, cy, largeur, hauteur);
      ctx.restore();
    }

    const corps = Math.max(10, dedans.h * 0.16);
    ctx.save();
    ctx.font = `700 ${corps}px ${c.police}`;
    ctx.fillStyle = couleurDuJour([], segment.index);
    ctx.fillText(`J${segment.index + 1}`, dedans.x, dedans.y + corps);
    ctx.restore();

    if (e.miniProfil) {
      const boite: BoitePx = {
        x: dedans.x,
        y: dedans.y + dedans.h * 0.55,
        l: dedans.l,
        h: dedans.h * 0.45,
      };
      const chemin = cheminDuProfil(segment.profil, boite);
      if (chemin) traceProfil(ctx, chemin, couleurDuJour([], segment.index), null);
    }
  });
}
