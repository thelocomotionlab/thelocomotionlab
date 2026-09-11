// packages/planche/src/carte.ts
//
// L'ÉLÉMENT CARTE : l'itinéraire, ses journées, ses étiquettes.
//
// LE RENDU RESTE SYNCHRONE, et les tuiles viennent du réseau. La contradiction
// se résout en deux temps : la carte DIT ce dont elle a besoin (`besoinsDeFond`),
// l'app va le chercher et le range dans le contexte, puis le dessin lit une
// mosaïque déjà là. C'est ce qui permettra d'exporter une vidéo image par image
// sans jamais attendre au milieu d'un rendu — et c'est aussi ce qui fait qu'une
// carte sans réseau se dessine quand même, sur son aplat.
//
// LE CADRAGE VIENT DE LA TRACE DE CADRAGE, pas de la tranche montrée : changer
// « toutes les journées » en « jour 3 seul » ne doit pas recadrer la carte,
// sinon la série glisse d'une planche à l'autre.

import { FONDS, urlDeTuile, type NomDeFond } from "@locomotionlab/tracking/fonds";
import type { Coord, Segment } from "@locomotionlab/trace";

import { LARGEUR_REFERENCE, couleurDuJour, rgba } from "./charte.ts";
import { brandColors } from "@locomotionlab/ui/tokens";
import type { Ctx2D, SourceImage } from "./canvas.ts";
import { vocabulaireDIcones } from "./canvas.ts";
import { cadrer, decimerPixels, tuilesDeLaVue, type Vue } from "./projection.ts";
import { segmentsMontres, type ContexteRendu } from "./contexte.ts";
import { CENTRE_CAPITALES, dessinerCapitales, fonteDe, largeurCapitales, morceauxCapitales } from "./texte.ts";
import type { Boite, BoitePx, DegradesCarte, ElementCarte, FondCarte } from "./types.ts";

/** Une mosaïque déjà assemblée, prête à poser sous la trace. */
export type FondPret = { image: SourceImage; coupeX: number; coupeY: number };

/** Ce qu'il faut aller chercher pour dessiner une carte. */
export type BesoinDeFond = {
  /** La clé sous laquelle le rendu ira la lire dans le contexte. */
  cle: string;
  fond: NomDeFond;
  zoom: number;
  colonnes: number;
  rangs: number;
  coupeX: number;
  coupeY: number;
  /** Les adresses, dans l'ordre de lecture : ligne par ligne, de gauche à droite. */
  urls: string[];
};

/** Le fond du studio, traduit en fond cartographique du dépôt. */
function nomDeFond(fond: FondCarte): NomDeFond | null {
  if (fond === "relief") return "relief";
  if (fond === "topo") return "topo";
  if (fond === "satellite") return "sat";
  return null; // « aucun » : la silhouette seule, sans tuile
}

/** La marge intérieure d'une carte — la trace ne colle jamais au cadre. */
function margeDeCadre(b: BoitePx): number {
  return Math.round(Math.min(b.l, b.h) * 0.08);
}

/**
 * La vue d'une carte : le cadrage figé de la trace, dans la boîte de l'élément.
 *
 * `null` quand il n'y a rien à cadrer — l'appelant dessine alors un aplat, pas
 * une erreur.
 */
export function vueDeLaCarte(
  b: BoitePx,
  coords: readonly Coord[],
  fenetre: Boite | null = null,
): Vue | null {
  const marge = margeDeCadre(b);
  // Les tuiles remplissent TOUJOURS la boîte ; seule la trace se cadre dans la
  // fenêtre. C'est ce qui donne une carte plein cadre dont l'itinéraire laisse
  // la place au titre posé dessus.
  const fit = fenetre
    ? {
        x: fenetre.x * b.l,
        y: fenetre.y * b.h,
        l: Math.max(1, fenetre.l * b.l),
        h: Math.max(1, fenetre.h * b.h),
      }
    : {
        x: marge,
        y: marge,
        l: Math.max(1, b.l - marge * 2),
        h: Math.max(1, b.h - marge * 2),
      };
  return cadrer(coords, fit, { canevas: { l: b.l, h: b.h } });
}

/** Les coordonnées qui CADRENT la carte : la trace de cadrage si elle est figée. */
export function coordsDeCadrage(c: ContexteRendu): Coord[] {
  return c.cadrage ?? c.variables.trace?.coords ?? [];
}

/**
 * Ce qu'une carte a besoin de télécharger.
 *
 * `null` sur un fond « aucun », ou quand la mosaïque dépasserait le garde-fou :
 * une carte ne doit jamais déclencher une avalanche de requêtes.
 */
export function besoinDeFond(
  element: ElementCarte,
  boite: BoitePx,
  c: ContexteRendu,
): BesoinDeFond | null {
  const nom = nomDeFond(element.fond);
  if (!nom) return null;
  const vue = vueDeLaCarte(boite, coordsDeCadrage(c), element.fenetre);
  if (!vue) return null;

  const m = tuilesDeLaVue(vue);
  if (m.colonnes * m.rangs > MAX_TUILES) return null;

  const fond = FONDS[nom];
  const urls: string[] = [];
  for (let dy = 0; dy < m.rangs; dy += 1) {
    for (let dx = 0; dx < m.colonnes; dx += 1) {
      urls.push(urlDeTuile(fond, m.zoom, m.tx0 + dx, m.ty0 + dy));
    }
  }
  return {
    cle: cleDuFond(nom, m.zoom, m.tx0, m.ty0, m.colonnes, m.rangs),
    fond: nom,
    zoom: m.zoom,
    colonnes: m.colonnes,
    rangs: m.rangs,
    coupeX: m.coupeX,
    coupeY: m.coupeY,
    urls,
  };
}

/** Le corps d'une étiquette de journée, en pixels d'une planche de 1080. */
const CORPS_ETIQUETTE = 29;

/** Jamais plus de 64 tuiles pour une carte : au-delà, l'aplat suffit. */
export const MAX_TUILES = 64;

/**
 * La clé d'une mosaïque.
 *
 * Elle décrit EXACTEMENT ce qui a été demandé : deux planches qui cadrent le
 * même terrain au même zoom partagent leur mosaïque, et un export vidéo ne
 * retélécharge rien entre deux images.
 */
export function cleDuFond(
  fond: NomDeFond,
  zoom: number,
  tx0: number,
  ty0: number,
  colonnes: number,
  rangs: number,
): string {
  return `${fond}/${zoom}/${tx0}/${ty0}/${colonnes}x${rangs}`;
}

/** L'attribution à écrire sous une carte — obligatoire, et c'est la règle. */
export function attributionDe(fond: FondCarte): string | null {
  const nom = nomDeFond(fond);
  return nom ? FONDS[nom].attribution : null;
}

/* ------------------------------------------------------------------ dessin */

function polyligne(
  ctx: Ctx2D,
  points: readonly [number, number][],
  couleur: string,
  epaisseur: number,
  liseré: boolean,
  couleurLiseré: string,
): void {
  if (points.length < 2) return;
  const tracer = () => {
    ctx.beginPath();
    ctx.moveTo(points[0]![0], points[0]![1]);
    for (const [x, y] of points) ctx.lineTo(x, y);
  };
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (liseré) {
    // Le liseré passe SOUS le trait, à peine plus large : c'est lui qui détache
    // un sentier fin d'une imagerie satellite bavarde.
    tracer();
    ctx.strokeStyle = couleurLiseré;
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * 0.55;
    ctx.lineWidth = epaisseur * 1.9;
    ctx.stroke();
    ctx.globalAlpha = alpha;
  }
  tracer();
  ctx.strokeStyle = couleur;
  ctx.lineWidth = epaisseur;
  ctx.stroke();
}

/** Le marqueur de départ ou d'arrivée : un disque cerclé, à la couleur du jour. */
function borne(ctx: Ctx2D, x: number, y: number, rayon: number, couleur: string, liseré: string) {
  ctx.beginPath();
  ctx.arc(x, y, rayon, 0, Math.PI * 2);
  ctx.fillStyle = couleur;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, rayon * 0.35);
  ctx.strokeStyle = liseré;
  ctx.stroke();
}

/**
 * L'ÉTIQUETTE D'UNE JOURNÉE.
 *
 * Elle s'ancre au point le plus HAUT du segment à l'écran, qui a par
 * construction du vide au-dessus de lui, puis se déplace à la main. Son fond
 * est un aplat du thème : sur une imagerie, un texte nu ne se lit pas.
 */
function etiquette(
  ctx: Ctx2D,
  texte: string,
  icone: string | null,
  x: number,
  y: number,
  corps: number,
  couleur: string,
  cadre: BoitePx,
  c: ContexteRendu,
): void {
  ctx.save();
  ctx.font = `500 ${corps}px ${c.police}`;
  const largeurTexte = ctx.measureText(texte).width;

  // LA MARQUE À GAUCHE DU TEXTE : une icône, ou la pastille de la journée.
  const cote = icone ? corps * 1.15 : corps * 0.34;
  const padX = corps * 0.62;
  const padY = corps * 0.42;
  const l = largeurTexte + padX * 2 + cote + corps * 0.4;
  const h = corps + padY * 2;

  // L'ÉTIQUETTE RESTE DANS LE CADRE. Elle se pose au-dessus du sommet de sa
  // journée, et un sommet près du bord haut la mettait hors de la carte, où le
  // découpage la coupe en deux — la journée perdait son nom sans rien dire.
  const marge = corps * 0.3;
  const gauche = Math.min(
    Math.max(x - l / 2, cadre.x + marge),
    Math.max(cadre.x + marge, cadre.x + cadre.l - l - marge),
  );
  const haut = Math.min(
    Math.max(y - h - corps * 0.9, cadre.y + marge),
    Math.max(cadre.y + marge, cadre.y + cadre.h - h - marge),
  );

  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(gauche + r, haut);
  ctx.lineTo(gauche + l - r, haut);
  ctx.quadraticCurveTo(gauche + l, haut, gauche + l, haut + r);
  ctx.quadraticCurveTo(gauche + l, haut + h, gauche + l - r, haut + h);
  ctx.lineTo(gauche + r, haut + h);
  ctx.quadraticCurveTo(gauche, haut + h, gauche, haut + r);
  ctx.quadraticCurveTo(gauche, haut, gauche + r, haut);
  ctx.closePath();
  ctx.fillStyle = `rgba(${c.theme.voileTexte}, ${c.theme.cle === "clair" ? 0.9 : 0.84})`;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, corps * 0.069);
  ctx.strokeStyle = couleur;
  ctx.globalAlpha = 0.9;
  ctx.stroke();
  ctx.globalAlpha = 1;

  const milieu = haut + h / 2;
  let curseur = gauche + padX;
  if (icone) {
    vocabulaireDIcones().dessiner(ctx, icone, curseur, milieu - cote / 2, cote, couleur);
  } else {
    ctx.beginPath();
    ctx.arc(curseur + cote / 2, milieu, cote / 2, 0, Math.PI * 2);
    ctx.fillStyle = couleur;
    ctx.fill();
  }
  curseur += cote + corps * 0.4;

  // Le texte reste à l'ENCRE : la couleur est déjà dite par la pastille et par
  // le liseré, et un mot de la teinte du jour se lit mal sur une imagerie.
  ctx.fillStyle = c.theme.encre;
  // Centré sur la HAUTEUR DE CAPITALE, sans toucher à `textBaseline` : le
  // contexte de comptoir des tests ne le porte pas, et un rendu qui dépend d'un
  // état global se décale dès qu'un voisin l'oublie.
  ctx.fillText(texte, curseur, milieu + corps * CENTRE_CAPITALES);
  ctx.restore();
}

/**
 * LE VOILE DU BAS ET CELUI DU HAUT.
 *
 * Les intensités MULTIPLIENT un dégradé de référence plutôt que de le décrire :
 * 1 est exactement celui de la charte, 0 l'éteint. Ouvrir le réglage ne
 * redessine donc pas les planches déjà composées.
 */
function degradesDeLaCarte(
  ctx: Ctx2D,
  d: DegradesCarte | null,
  b: BoitePx,
  c: ContexteRendu,
): void {
  if (!d) return;
  const echelle = b.l / LARGEUR_REFERENCE;

  const hautH = d.hautH * echelle;
  if (d.haut > 0 && hautH > 0) {
    const g = ctx.createLinearGradient(0, b.y, 0, b.y + hautH);
    g.addColorStop(0, `rgba(${c.theme.voileTexte}, ${d.haut.toFixed(3)})`);
    g.addColorStop(1, `rgba(${c.theme.voileTexte}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(b.x, b.y, b.l, hautH);
  }

  const basH = d.basH * echelle;
  if (d.bas > 0 && basH > 0) {
    const depuis = b.y + b.h - basH;
    const a = (v: number) => `rgba(${c.theme.voileTexte}, ${(v * d.bas).toFixed(3)})`;
    const g = ctx.createLinearGradient(0, depuis, 0, b.y + b.h);
    g.addColorStop(0, `rgba(${c.theme.voileTexte}, 0)`);
    g.addColorStop(0.4, a(0.5));
    g.addColorStop(0.75, a(0.82));
    g.addColorStop(1, a(0.92));
    ctx.fillStyle = g;
    ctx.fillRect(b.x, depuis, b.l, basH);
  }
}

/** Le point le plus haut d'un segment à l'écran — là où l'étiquette a du vide. */
function sommet(
  seg: Segment,
  projeter: (c: Coord) => [number, number],
): [number, number] | null {
  let meilleur: [number, number] | null = null;
  for (const coord of seg.coords) {
    const p = projeter(coord);
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    if (meilleur === null || p[1] < meilleur[1]) meilleur = p;
  }
  return meilleur;
}

export function dessinerCarte(
  ctx: Ctx2D,
  e: ElementCarte,
  b: BoitePx,
  c: ContexteRendu,
): void {
  const cadrage = coordsDeCadrage(c);
  const vue = vueDeLaCarte(b, cadrage, e.fenetre);

  ctx.save();
  ctx.beginPath();
  ctx.rect(b.x, b.y, b.l, b.h);
  ctx.clip();

  // 1. L'APLAT ATTEND LES TUILES. Une carte dont la mosaïque n'est pas encore
  // là reste une carte : le lavis dit sa place. Mais « aucun fond » n'attend
  // rien — c'est une SILHOUETTE, et le lavis y devenait une bande grise en
  // travers de la photo d'une story.
  if (e.fond !== "aucun") {
    ctx.fillStyle = rgba(c.theme.encre, 0.06);
    ctx.fillRect(b.x, b.y, b.l, b.h);
  }

  if (!vue) {
    ctx.restore();
    return;
  }

  // 2. La mosaïque, si l'app est allée la chercher.
  const besoin = besoinDeFond(e, b, c);
  const pret = besoin ? c.fonds.get(besoin.cle) : undefined;
  if (besoin && pret) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(vue.echelle, vue.echelle);
    ctx.drawImage(
      pret.image,
      besoin.coupeX,
      besoin.coupeY,
      vue.mosaiqueL,
      vue.mosaiqueH,
      0,
      0,
      vue.mosaiqueL,
      vue.mosaiqueH,
    );
    ctx.restore();
    // Le voile : un fond topo est clair et très bavard, la trace s'y perd.
    ctx.fillStyle = c.theme.voileCarte;
    ctx.fillRect(b.x, b.y, b.l, b.h);
  }

  // 2 bis. LES DEUX DÉGRADÉS, entre la mosaïque et la trace : ils éteignent le
  //        fond là où un texte va se poser, sans jamais toucher à l'itinéraire.
  degradesDeLaCarte(ctx, e.degrades, b, c);

  const projeter = (coord: Coord): [number, number] => {
    const [x, y] = vue.project(coord);
    return [b.x + x, b.y + y];
  };
  // L'ÉPAISSEUR EST EN PIXELS DE PLANCHE, pas en part de la boîte. Une carte
  // plein cadre et une carte en encart doivent porter le MÊME trait : c'est le
  // trait du labo. Mise en part de la boîte, la trace triplait d'épaisseur le
  // jour où la carte passait plein cadre.
  const epaisseur = Math.max(2, e.epaisseur * (c.format.width / LARGEUR_REFERENCE));
  // LE LISERÉ EST BLANC, quel que soit le thème : ce n'est pas une encre, c'est
  // un DÉTOURAGE — il décolle un sentier fin d'une imagerie bavarde. Pris sur
  // l'encre du thème, il cernait la trace d'un halo sombre qui la faisait lire
  // deux fois plus épaisse qu'elle n'est.
  const liseréCouleur = brandColors.paper;

  // 3. L'ITINÉRAIRE COMPLET EN SOURDINE : c'est lui qui SITUE la journée. On
  //    peut l'éteindre — une pièce détachée destinée à un montage n'a pas
  //    toujours à porter le tour entier.
  if (e.itineraireSourdine && cadrage.length > 1) {
    polyligne(
      ctx,
      decimerPixels(cadrage.map(projeter)),
      rgba(c.theme.encre, 0.26),
      epaisseur * 0.62,
      false,
      liseréCouleur,
    );
  }

  // 4. Les journées montrées, chacune à sa couleur.
  const montres = segmentsMontres(c);
  const journees = montres.length > 0 ? montres : segmentsEntiers(c);
  for (const seg of journees) {
    if (seg.coords.length < 2) continue;
    polyligne(
      ctx,
      decimerPixels(seg.coords.map(projeter)),
      couleurDuJour(e.couleurs, seg.index),
      epaisseur,
      true,
      liseréCouleur,
    );
  }

  // 5. Les bornes de départ et d'arrivée, sur la portion montrée.
  const rayon = Math.max(4, epaisseur * 1.5);
  const premier = journees[0];
  const dernier = journees[journees.length - 1];
  if (e.depart && premier && premier.coords.length > 0) {
    const [x, y] = projeter(premier.coords[0]!);
    borne(ctx, x, y, rayon, couleurDuJour(e.couleurs, premier.index), liseréCouleur);
  }
  if (e.arrivee && dernier && dernier.coords.length > 0) {
    const [x, y] = projeter(dernier.coords[dernier.coords.length - 1]!);
    borne(ctx, x, y, rayon, c.theme.accent, liseréCouleur);
  }

  // 6. UNE ÉTIQUETTE PAR JOURNÉE MONTRÉE, déplaçable à la main depuis son
  //    ancrage calculé. La liste de la carte ne les crée pas : elle les
  //    RÉÉCRIT, une entrée par journée. Une trace découpée après la planche se
  //    nomme donc toute seule.
  // LE CORPS D'UNE ÉTIQUETTE EST EN PIXELS DE PLANCHE, comme le trait de la
  // trace : pris en part de la boîte, il enflait d'un tiers le jour où la carte
  // passait plein cadre.
  const corps = Math.max(11, CORPS_ETIQUETTE * (c.format.width / LARGEUR_REFERENCE));
  if (e.etiquettesAuto !== false && journees.length > 1) {
    for (const seg of journees) {
      const dit = e.etiquettes.find((t) => t.segment === seg.index);
      if (dit?.masquee) continue;
      const texte = dit?.texte?.trim() || `J${seg.index + 1}`;
      const ancre = sommet(seg, projeter);
      if (!ancre) continue;
      etiquette(
        ctx,
        texte,
        dit?.icone ?? null,
        ancre[0] + (dit?.dx ?? 0) * b.l,
        ancre[1] + (dit?.dy ?? 0) * b.h - corps * 0.5,
        corps,
        couleurDuJour(e.couleurs, seg.index),
        b,
        c,
      );
    }
  }

  ctx.restore();
}

/** Toute la trace vue comme une seule journée, quand rien n'est découpé. */
function segmentsEntiers(c: ContexteRendu): Segment[] {
  const trace = c.variables.trace;
  if (!trace || trace.coords.length < 2) return [];
  return [
    {
      index: 0,
      kmDebut: 0,
      kmFin: trace.totalKm,
      distanceKm: trace.totalKm,
      coords: trace.coords,
      profil: trace.profil,
      dPlusM: trace.dPlusM,
      dMinusM: trace.dMinusM,
      altMax: null,
    },
  ];
}

/**
 * LA MINI-CARTE D'UNE CASE : la boucle entière en sourdine, une journée en
 * couleur.
 *
 * Ce n'est pas `dessinerCarte` en petit — ni fond, ni étiquettes, ni bornes. La
 * boucle entière revient dans CHAQUE case et c'est elle qui SITUE la journée :
 * seule la portion colorée se déplace d'une case à l'autre, et c'est ce
 * déplacement qui fait lire une progression. Quatre cartes recadrées sur leur
 * propre journée se ressembleraient toutes.
 */
export function miniCarte(
  ctx: Ctx2D,
  b: BoitePx,
  cadrage: readonly Coord[],
  journee: { coords: readonly Coord[]; couleur: string } | null,
  c: ContexteRendu,
): void {
  const vue = vueDeLaCarte(b, cadrage);
  if (!vue) return;
  const projeter = ([lon, lat]: Coord): [number, number] => {
    const [x, y] = vue.project([lon, lat]);
    return [b.x + x, b.y + y];
  };
  const epaisseur = Math.max(1.5, b.l * 0.022);

  ctx.save();
  polyligne(
    ctx,
    decimerPixels(cadrage.map(projeter)),
    rgba(c.theme.encre, 0.26),
    epaisseur * 0.62,
    false,
    brandColors.paper,
  );
  if (journee && journee.coords.length > 1) {
    polyligne(
      ctx,
      decimerPixels(journee.coords.map(projeter)),
      journee.couleur,
      epaisseur,
      true,
      brandColors.paper,
    );
  }
  ctx.restore();
}
