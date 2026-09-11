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

import { CORPS, LETTRAGE, couleurDuJour, rgba } from "./charte.ts";
import type { Ctx2D } from "./canvas.ts";
import { coordsDeCadrage, dessinerCarte, miniCarte } from "./carte.ts";
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
import type { PointProfil, Segment } from "@locomotionlab/trace";

/** Le nom, tel que la navbar du site l'écrit — capitales espacées, sans « The ». */
const MARQUE = "LOCOMOTION LAB";

/** Le logo est teinté à la couleur du nom : même encre, même présence. */
const MARQUE_OPACITE = 0.68;

/** L'interlettrage du nom dans la bande d'en-tête. */
const LETTRAGE_MARQUE = 0.28;

/** L'aire d'une journée reste transparente : les journées voisines se touchent
 *  par leur borne, et deux aplats opaques feraient une frise de blocs. */
const AIRE_JOURNEE = 0.46;

/** La crête, elle, porte la couleur — c'est la ligne qu'on suit de l'œil. */
const CRETE_JOURNEE = 0.9;

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
    corps: CORPS,
    lettrages: LETTRAGE,
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
): number {
  const morceaux = morceauxCapitales(resoudre(e.contenu, c.variables));
  const corps = style.taille;
  ctx.font = fonteDe({ texte: "" }, style);
  ctx.fillStyle = style.couleur;
  const largeur = largeurCapitales(ctx, morceaux, corps, e.lettrage);

  // Le filet ambre qui OUVRE un surtitre : c'est le point d'entrée du regard,
  // et il se pose avant les lettres, sur la même ligne optique.
  let x =
    boite.x + decalageAlignement(e.alignement, boite.l, largeur + filetOuvrantLarge(e, corps));
  const ligneDeBase = boite.y + corps;
  if (e.filetOuvrant) {
    const f = e.filetOuvrant;
    ctx.fillStyle = f.couleur || c.theme.accent;
    ctx.fillRect(x, ligneDeBase - corps * 0.34 - f.epaisseur / 2, f.largeur, f.epaisseur);
    x += f.largeur + corps * 0.55;
    ctx.fillStyle = style.couleur;
  }
  dessinerCapitales(ctx, morceaux, x, ligneDeBase, corps, e.lettrage, c.theme.accent, {
    douce: c.theme.encreDouce,
  });
  return ligneDeBase;
}

/** L'encombrement du filet d'ouverture, écart compris. */
function filetOuvrantLarge(e: ElementTexte, corps: number): number {
  return e.filetOuvrant ? e.filetOuvrant.largeur + corps * 0.55 : 0;
}

/** Le plus petit corps qu'un ajustement s'autorise : sous ça, ce n'est plus le
 *  même titre, et mieux vaut que l'auteur voie que son texte est trop long. */
const AJUSTEMENT_PLANCHER = 0.4;

/**
 * Le style, réduit jusqu'à ce que le texte tienne dans sa boîte.
 *
 * Une mesure suffit dans le cas courant — le texte tient, on n'a rien à faire.
 * Sinon une dichotomie de six pas trouve le corps, et le rendu reste au même
 * coût d'une image à l'autre : le texte d'une planche se remesure à chaque
 * glissement de souris.
 */
function styleQuiTient(
  ctx: Ctx2D,
  e: ElementTexte,
  boite: BoitePx,
  c: ContexteRendu,
  style: StyleTexte,
): StyleTexte {
  const ajuste = e.ajuster ?? (e.role === "titre" || e.role === "surtitre");
  if (!ajuste || !(boite.h > 0) || !(boite.l > 0)) return style;
  const texte = resoudre(e.contenu, c.variables);

  // En capitales, c'est la LARGEUR qui borne : le bloc tient sur une ligne, et
  // c'est elle qui sort du cadre.
  const tient = (taille: number): boolean => {
    const essai = { ...style, taille };
    if (e.casse === "capitales") {
      ctx.font = fonteDe({ texte: "" }, essai);
      return largeurCapitales(ctx, morceauxCapitales(texte), taille, e.lettrage) +
        filetOuvrantLarge(e, taille) <= boite.l;
    }
    return hauteurBlocs(blocsDeTexte(ctx, texte, boite.l, essai), essai) <= boite.h;
  };

  if (tient(style.taille)) return style;

  let trop = style.taille;
  let bon = style.taille * AJUSTEMENT_PLANCHER;
  for (let i = 0; i < 6; i += 1) {
    const milieu = (bon + trop) / 2;
    if (tient(milieu)) bon = milieu;
    else trop = milieu;
  }
  return { ...style, taille: bon };
}

function dessinerTexte(ctx: Ctx2D, e: ElementTexte, boite: BoitePx, c: ContexteRendu): void {
  const style = styleQuiTient(ctx, e, boite, c, styleDe(e, c));
  ctx.save();
  poserOmbre(ctx, e, c);

  const bas =
    e.casse === "capitales"
      ? dessinerTexteCapitales(ctx, e, boite, c, style)
      : poserBlocs(ctx, blocsDeTexte(ctx, resoudre(e.contenu, c.variables), boite.l, style), boite.x, boite.y, style, {
          align: e.alignement,
          largeur: boite.l,
          puce: e.puce,
        });

  // Le filet court SOUS le titre — il se pose après le texte, à la place que le
  // texte a réellement prise, pas à celle qu'on lui avait réservée. Un titre en
  // capitales y a droit comme un autre : c'est le même filet.
  if (e.filetSousTitre) {
    const f = e.filetSousTitre;
    ctx.shadowColor = "rgba(0, 0, 0, 0)";
    ctx.fillStyle = f.couleur || c.theme.accent;
    ctx.fillRect(
      boite.x + decalageAlignement(e.alignement, boite.l, f.largeur),
      bas + style.taille * 0.42,
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
    dessinerCapitales(ctx, analyserRiche(MARQUE), x, ligneDeBase, taille, LETTRAGE_MARQUE, teinte);
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
  const echelle = echelleDuProfil(profil, b);
  if (!echelle) return null;
  const { min, max, base, points } = echelle;
  return { base, min, max, points: points.map((p) => [echelle.x(p.km), echelle.y(p.alt)]) };
}

/**
 * L'ÉCHELLE D'UN PROFIL DANS SA BOÎTE : de quoi projeter n'importe quel point,
 * y compris ceux d'une portion.
 *
 * C'est la pièce qui manquait pour découper. Chaque portion qui recalculait son
 * propre minimum d'altitude se réétirait sur toute la hauteur de la boîte : une
 * journée de fond de vallée montait aussi haut qu'une journée de crête, et la
 * part parcourue d'un survol flottait au-dessus de la silhouette censée la
 * porter. Une seule échelle, prise sur le profil de référence, et tout se pose
 * au même endroit.
 */
type EchelleProfil = {
  base: number;
  min: number;
  max: number;
  points: readonly { km: number; alt: number }[];
  x(km: number): number;
  y(alt: number): number;
};

function echelleDuProfil(
  profil: readonly { km: number; alt: number }[],
  b: BoitePx,
): EchelleProfil | null {
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
    points,
    x: (km) => b.x + (Math.min(total, Math.max(0, km - depart)) / total) * b.l,
    y: (alt) => b.y + (1 - (alt - min) / amplitude) * b.h,
  };
}

function dessinerProfil(ctx: Ctx2D, e: ElementProfil, b: BoitePx, c: ContexteRendu): void {
  const montres = segmentsMontres(c);
  const complet = c.variables.trace?.profil ?? [];

  // SUR UN SURVOL, LA PART MONTRÉE EST CE QUI EST DÉJÀ PARCOURU. Le profil se
  // remplit alors jusqu'au point, image après image, et dit d'un coup d'œil où
  // l'on en est dans la sortie — ce qu'aucun chiffre ne montre aussi vite. Le
  // reste du temps, c'est la tranche de journées qui décide, comme partout.
  const instant = c.variables.instant;
  const profil = instant
    ? jusquAu(complet, instant.dist / 1000)
    : montres.length
      ? montres.flatMap((s) => s.profil)
      : complet;

  // LE RESTANT ESTOMPÉ : la silhouette entière en sourdine, la part parcourue
  // par-dessus. C'est ce qui dit « on en est là » sans deux images — et ça n'a
  // rien à dire quand la part montrée EST le tout : on tracerait alors deux fois
  // la même courbe.
  const partiel = profil.length > 1 && profil.length < complet.length;
  const estompe = e.restantEstompe && partiel && complet.length > 1;

  // Toute la planche se projette sur LA MÊME échelle, celle du profil de
  // référence : les portions s'y découpent au lieu de s'y réétirer.
  const echelle = echelleDuProfil(estompe ? complet : profil, b);
  if (!echelle) return;

  if (estompe) traceProfil(ctx, echelle, complet, c.theme.profilRestant, null);

  // UNE AIRE PAR JOURNÉE MONTRÉE, chacune dans SA couleur : c'est ce qui fait
  // lire une progression au lieu d'un bloc d'un seul tenant. Une planche « le
  // jour 3 seul » n'en montre qu'une, et c'est justement elle qu'on veut voir
  // à SA couleur — la même que sur la carte juste à côté.
  const parJournee = !instant && e.parJournee !== false && montres.length >= 1;
  if (parJournee) {
    for (const segment of montres) {
      const dedans = entre(echelle.points, segment.kmDebut, segment.kmFin);
      if (dedans.length > 1)
        aireDeProfil(ctx, echelle, dedans, e.remplissage || couleurDuJour(e.couleurs, segment.index));
    }
    bornesDeJournees(ctx, echelle, montres, c.theme.filet, b);
    return;
  }

  traceProfil(ctx, echelle, profil, e.remplissage || c.theme.accent, c.theme.accentAire);
}

/** Les points d'un profil entre deux kilomètres, bornes comprises. */
function entre(
  points: readonly { km: number; alt: number }[],
  kmA: number,
  kmB: number,
): readonly { km: number; alt: number }[] {
  return points.filter((p) => p.km >= kmA && p.km <= kmB);
}

/**
 * Le profil jusqu'à un kilomètre donné, bornes comprises.
 *
 * Au moins deux points : une portion d'un seul point ne se trace pas, et le
 * profil disparaîtrait pendant la première seconde d'un survol.
 */
function jusquAu(profil: readonly PointProfil[], km: number): PointProfil[] {
  if (profil.length < 2) return [...profil];
  const gardes = profil.filter((p) => p.km <= km);
  return gardes.length >= 2 ? gardes : profil.slice(0, 2);
}

/** L'aire d'une journée et sa crête, dans la couleur de la journée. */
function aireDeProfil(
  ctx: Ctx2D,
  echelle: EchelleProfil,
  points: readonly { km: number; alt: number }[],
  couleur: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(echelle.x(points[0]!.km), echelle.base);
  for (const p of points) ctx.lineTo(echelle.x(p.km), echelle.y(p.alt));
  ctx.lineTo(echelle.x(points[points.length - 1]!.km), echelle.base);
  ctx.closePath();
  ctx.globalAlpha = AIRE_JOURNEE;
  ctx.fillStyle = couleur;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(echelle.x(points[0]!.km), echelle.y(points[0]!.alt));
  for (const p of points) ctx.lineTo(echelle.x(p.km), echelle.y(p.alt));
  ctx.globalAlpha = CRETE_JOURNEE;
  ctx.strokeStyle = couleur;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

/** Les bornes de journée, en pointillés discrets : c'est là qu'on dort. */
function bornesDeJournees(
  ctx: Ctx2D,
  echelle: EchelleProfil,
  segments: readonly { kmDebut: number }[],
  couleur: string,
  b: BoitePx,
): void {
  ctx.save();
  ctx.setLineDash([b.h * 0.027, b.h * 0.04]);
  ctx.strokeStyle = couleur;
  ctx.lineWidth = Math.max(1, b.h * 0.012);
  for (const s of segments) {
    if (!(s.kmDebut > 0)) continue;
    const x = echelle.x(s.kmDebut);
    ctx.beginPath();
    ctx.moveTo(x, b.y);
    ctx.lineTo(x, echelle.base);
    ctx.stroke();
  }
  ctx.restore();
}

function traceProfil(
  ctx: Ctx2D,
  echelle: EchelleProfil,
  points: readonly { km: number; alt: number }[],
  couleur: string,
  aire: string | null,
): void {
  if (points.length < 2) return;
  ctx.save();

  if (aire) {
    ctx.beginPath();
    ctx.moveTo(echelle.x(points[0]!.km), echelle.base);
    for (const p of points) ctx.lineTo(echelle.x(p.km), echelle.y(p.alt));
    ctx.lineTo(echelle.x(points[points.length - 1]!.km), echelle.base);
    ctx.closePath();
    ctx.fillStyle = `rgba(${aire}, 0.3)`;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.moveTo(echelle.x(points[0]!.km), echelle.y(points[0]!.alt));
  for (const p of points) ctx.lineTo(echelle.x(p.km), echelle.y(p.alt));
  ctx.strokeStyle = couleur;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ cases */

/**
 * Ce qu'une case écrit quand personne ne l'a écrite : le numéro du jour, et les
 * deux chiffres que la trace connaît de lui.
 */
export function texteDeJournee(segment: Segment): string {
  const bouts = [
    segment.distanceKm > 0 ? `${nombreFr(segment.distanceKm, 1)} km` : "",
    segment.dPlusM > 0 ? `${nombreFr(segment.dPlusM, 0)} m D+` : "",
  ].filter(Boolean);
  return `*Jour ${segment.index + 1}*${bouts.length ? `\n${bouts.join(" · ")}` : ""}`;
}

/** Un nombre à la française — l'espace fine des milliers, la virgule décimale. */
function nombreFr(valeur: number, decimales: number): string {
  return valeur.toLocaleString("fr-FR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/**
 * LES JOURNÉES EN GRILLE : une case par journée, sa portion de trace, son
 * relief et ce qu'on en dit.
 *
 * La boucle entière et la silhouette entière reviennent dans CHAQUE case, en
 * sourdine, avec la seule journée en couleur : c'est ce qui fait qu'on lit une
 * progression et non quatre images sans rapport.
 */
function dessinerCases(ctx: Ctx2D, e: ElementCases, b: BoitePx, c: ContexteRendu): void {
  const segments = segmentsMontres(c);
  if (segments.length === 0) return;

  const ecrites = Array.isArray(e.cases) ? e.cases : [];
  const colonnes = Math.max(1, Math.round(e.colonnes));
  const rangs = Math.ceil(segments.length / colonnes);
  const gouttiereX = b.l * 0.03;
  const gouttiereY = b.h * 0.04;
  const largeur = (b.l - (colonnes - 1) * gouttiereX) / colonnes;
  const hauteur = (b.h - (rangs - 1) * gouttiereY) / rangs;
  if (!(largeur > 0 && hauteur > 0)) return;

  const cadrage = coordsDeCadrage(c);
  const complet = c.variables.trace?.profil ?? [];
  const avecCarte = e.miniCarte !== false && cadrage.length > 1;
  const avecProfil = e.miniProfil !== false && complet.length > 1;

  const style: StyleTexte = {
    police: c.police,
    taille: Math.max(10, e.taille || CORPS.corps),
    couleur: c.theme.encre,
    accent: c.theme.accent,
    douce: c.theme.encreDouce,
    // Une légende de case n'est pas un texte suivi : chaque ligne tapée reste
    // une ligne (« Jour 1 × Rapace », puis « 57 km · 4 700 m D+ »).
    lignesDures: true,
  };

  segments.forEach((segment, i) => {
    const col = i % colonnes;
    const rang = Math.floor(i / colonnes);
    const x = b.x + col * (largeur + gouttiereX);
    const y = b.y + rang * (hauteur + gouttiereY);
    const couleur = couleurDuJour(e.couleurs ?? [], segment.index);

    // Le filet de séparation, au-dessus de chaque rangée sauf la première :
    // c'est lui qui fait une GRILLE et non des blocs posés au hasard.
    if (e.filet && rang > 0 && col === 0) {
      ctx.save();
      ctx.fillStyle = c.theme.filet;
      ctx.fillRect(b.x, y - gouttiereY / 2, b.l, Math.max(1, b.h * 0.002));
      ctx.restore();
    }

    const cote = avecCarte ? Math.min(hauteur, largeur * 0.34) : 0;
    if (avecCarte) {
      miniCarte(
        ctx,
        { x, y: y + (hauteur - cote) / 2, l: cote, h: cote },
        cadrage,
        { coords: segment.coords, couleur },
        c,
      );
    }

    const ecart = avecCarte ? largeur * 0.06 : 0;
    const xTexte = x + cote + ecart;
    const lTexte = largeur - cote - ecart;
    if (!(lTexte > 0)) return;

    const hProfil = avecProfil ? Math.min(hauteur * 0.42, style.taille * 3) : 0;
    const ecrite = ecrites.find((k) => k.jour === segment.index);
    const texte = ecrite?.texte?.trim() ? ecrite.texte : texteDeJournee(segment);
    const blocs = blocsDeTexte(ctx, resoudre(texte, c.variables), lTexte, style);

    // Texte et profil se partagent la case : le texte se cale au milieu de ce
    // qui reste, le profil garde toujours sa place en bas.
    const dispo = hauteur - hProfil;
    poserBlocs(
      ctx,
      blocs,
      xTexte,
      y + Math.max(0, (dispo - hauteurBlocs(blocs, style)) / 2),
      style,
      { align: "gauche", largeur: lTexte },
    );

    if (!avecProfil) return;
    // LA JOURNÉE SITUÉE DANS LA COURSE : la silhouette entière au trait, la
    // seule journée remplie. La même silhouette revient dans les quatre cases
    // et seule la portion colorée se déplace.
    const boite: BoitePx = { x: xTexte, y: y + hauteur - hProfil, l: lTexte, h: hProfil };
    const echelle = echelleDuProfil(complet, boite);
    if (!echelle) return;
    traceProfil(ctx, echelle, complet, c.theme.profilRestant, null);
    const dedans = entre(echelle.points, segment.kmDebut, segment.kmFin);
    if (dedans.length > 1) aireDeProfil(ctx, echelle, dedans, couleur);
  });
}
