// packages/planche/src/geometrie.ts
//
// LA COUCHE D'INTERACTION : ce qu'il faut pour attraper un élément à la souris.
//
// Elle est posée SUR le moteur de rendu, pas dedans, et ne dessine rien. Le
// modèle range les positions en fractions du format ; l'écran, lui, travaille en
// pixels de planche. Tout ce qui suit fait la navette entre les deux, teste ce
// qu'il y a sous le curseur, et cale les bords sur ceux d'à côté.
//
// LES PIXELS SONT CEUX DE LA PLANCHE, jamais ceux de l'écran. Le plan de travail
// applique son propre zoom par-dessus : mêler les deux repères ferait varier le
// seuil du magnétisme avec le niveau de zoom, et un aimant qui colle plus fort
// quand on dézoome est un aimant cassé.
//
// LA ROTATION se traite en ramenant le point dans le repère de l'élément plutôt
// qu'en tournant l'élément : un rectangle non tourné se teste en quatre
// comparaisons, un quadrilatère quelconque non.

import { formatDe, MARGE } from "./charte.ts";
import type { Boite, BoitePx, CleFormat, Element } from "./types.ts";

/** Le côté d'une poignée, en pixels de planche. */
export const POIGNEE = 10;

/** Distance sous laquelle un bord se colle à son voisin, en pixels de planche. */
export const SEUIL_AIMANT = 8;

/** La plus petite taille qu'on laisse atteindre — sous ça, plus rien à saisir. */
export const TAILLE_MINIMALE = POIGNEE * 2;

export type Point = { x: number; y: number };

/* -------------------------------------------------- fractions ⇄ pixels */

export function enPixels(boite: Boite, format: CleFormat): BoitePx {
  const f = formatDe(format);
  return {
    x: boite.x * f.width,
    y: boite.y * f.height,
    l: boite.l * f.width,
    h: boite.h * f.height,
  };
}

export function enFractions(boite: BoitePx, format: CleFormat): Boite {
  const f = formatDe(format);
  return {
    x: boite.x / f.width,
    y: boite.y / f.height,
    l: boite.l / f.width,
    h: boite.h / f.height,
  };
}

export function centreDe(b: BoitePx): Point {
  return { x: b.x + b.l / 2, y: b.y + b.h / 2 };
}

/** Fait tourner `p` de `deg` autour de `centre`. */
export function tourner(p: Point, centre: Point, deg: number): Point {
  if (!deg) return { ...p };
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - centre.x;
  const dy = p.y - centre.y;
  return { x: centre.x + dx * cos - dy * sin, y: centre.y + dx * sin + dy * cos };
}

/** Les quatre coins d'une boîte tournée, dans le sens horaire depuis le nord-ouest. */
export function coinsDe(b: BoitePx, rotation = 0): Point[] {
  const c = centreDe(b);
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.l, y: b.y },
    { x: b.x + b.l, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ].map((p) => tourner(p, c, rotation));
}

/** La boîte droite qui enferme une boîte tournée — ce que la sélection encadre. */
export function englobante(boites: readonly BoitePx[]): BoitePx | null {
  if (boites.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boites) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.l);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, l: x1 - x0, h: y1 - y0 };
}

/* ------------------------------------------------------------ ce qu'on vise */

/** Le point est-il dans la boîte, rotation comprise. */
export function contient(b: BoitePx, rotation: number, p: Point, marge = 0): boolean {
  const local = tourner(p, centreDe(b), -rotation);
  return (
    local.x >= b.x - marge &&
    local.x <= b.x + b.l + marge &&
    local.y >= b.y - marge &&
    local.y <= b.y + b.h + marge
  );
}

/**
 * L'élément sous le curseur : le PLUS EN AVANT d'abord.
 *
 * L'ordre du tableau est celui des calques, du fond vers l'avant ; on le
 * parcourt donc à l'envers. Un élément masqué n'est pas visé — mais un élément
 * VERROUILLÉ l'est : sinon on ne pourrait jamais le déverrouiller au doigt.
 */
export function elementSous(
  elements: readonly Element[],
  p: Point,
  format: CleFormat,
): Element | null {
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const e = elements[i]!;
    if (e.masque) continue;
    if (contient(enPixels(e, format), e.rotation, p)) return e;
  }
  return null;
}

/** Les éléments entièrement pris dans un rectangle de sélection. */
export function elementsDans(
  elements: readonly Element[],
  rect: BoitePx,
  format: CleFormat,
): Element[] {
  const x1 = rect.x + rect.l;
  const y1 = rect.y + rect.h;
  return elements.filter((e) => {
    if (e.masque) return false;
    const coins = coinsDe(enPixels(e, format), e.rotation);
    return coins.every((c) => c.x >= rect.x && c.x <= x1 && c.y >= rect.y && c.y <= y1);
  });
}

/* ---------------------------------------------------------------- poignées */

export type ClePoignee = "no" | "n" | "ne" | "e" | "se" | "s" | "so" | "o" | "rotation";

/** Où tombe chaque poignée, rotation comprise. */
export function poignees(b: BoitePx, rotation = 0): Record<ClePoignee, Point> {
  const c = centreDe(b);
  const mx = b.x + b.l / 2;
  const my = b.y + b.h / 2;
  const brutes: Record<ClePoignee, Point> = {
    no: { x: b.x, y: b.y },
    n: { x: mx, y: b.y },
    ne: { x: b.x + b.l, y: b.y },
    e: { x: b.x + b.l, y: my },
    se: { x: b.x + b.l, y: b.y + b.h },
    s: { x: mx, y: b.y + b.h },
    so: { x: b.x, y: b.y + b.h },
    o: { x: b.x, y: my },
    // Au-dessus du bord haut, à deux poignées d'écart : assez loin pour ne pas
    // se confondre avec « n », assez près pour rester dans le geste.
    rotation: { x: mx, y: b.y - POIGNEE * 2.5 },
  };
  const out = {} as Record<ClePoignee, Point>;
  for (const [cle, p] of Object.entries(brutes)) {
    out[cle as ClePoignee] = tourner(p, c, rotation);
  }
  return out;
}

/** La poignée sous le curseur, ou `null` — la rotation est testée en premier. */
export function poigneeSous(b: BoitePx, rotation: number, p: Point): ClePoignee | null {
  const tout = poignees(b, rotation);
  const rayon = POIGNEE;
  const proche = (q: Point) => Math.abs(p.x - q.x) <= rayon && Math.abs(p.y - q.y) <= rayon;
  if (proche(tout.rotation)) return "rotation";
  for (const cle of ["no", "ne", "se", "so", "n", "e", "s", "o"] as const) {
    if (proche(tout[cle])) return cle;
  }
  return null;
}

export type OptionsRedimension = {
  /** Le rapport largeur / hauteur est conservé (les coins, par défaut). */
  proportionnel?: boolean;
  /** Le centre ne bouge pas (Alt). */
  depuisLeCentre?: boolean;
  minimum?: number;
};

/**
 * Applique un glissé de poignée.
 *
 * `dx` et `dy` sont exprimés dans le repère DE L'ÉLÉMENT : l'appelant fait
 * tourner le déplacement de la souris de `-rotation` avant d'appeler. Sans ça,
 * tirer le bord droit d'un texte incliné à 30° l'agrandirait en diagonale.
 *
 * La boîte ne se retourne jamais : passé la taille minimale, elle s'arrête.
 */
export function redimensionner(
  b: BoitePx,
  poignee: ClePoignee,
  dx: number,
  dy: number,
  options: OptionsRedimension = {},
): BoitePx {
  if (poignee === "rotation") return { ...b };
  const min = options.minimum ?? TAILLE_MINIMALE;
  const centre = options.depuisLeCentre === true;
  const facteur = centre ? 2 : 1;

  const tireOuest = poignee === "no" || poignee === "o" || poignee === "so";
  const tireEst = poignee === "ne" || poignee === "e" || poignee === "se";
  const tireNord = poignee === "no" || poignee === "n" || poignee === "ne";
  const tireSud = poignee === "so" || poignee === "s" || poignee === "se";

  let l = b.l + (tireEst ? dx : 0) * facteur - (tireOuest ? dx : 0) * facteur;
  let h = b.h + (tireSud ? dy : 0) * facteur - (tireNord ? dy : 0) * facteur;

  if (options.proportionnel === true && b.l > 0 && b.h > 0) {
    const ratio = b.l / b.h;
    // Le côté qui a le plus bougé mène : sinon un glissé presque horizontal sur
    // un coin ferait sauter la hauteur à chaque frémissement vertical.
    if (Math.abs(l - b.l) >= Math.abs(h - b.h)) h = l / ratio;
    else l = h * ratio;
  }

  l = Math.max(min, l);
  h = Math.max(min, h);

  if (centre) {
    const c = centreDe(b);
    return { x: c.x - l / 2, y: c.y - h / 2, l, h };
  }
  return {
    x: tireOuest ? b.x + b.l - l : b.x,
    y: tireNord ? b.y + b.h - h : b.y,
    l,
    h,
  };
}

/* -------------------------------------------------------------- magnétisme */

export type OrigineGuide = "planche" | "marge" | "zone-sure" | "element";

export type Guide = {
  axe: "x" | "y";
  /** Position en pixels de planche. */
  position: number;
  origine: OrigineGuide;
};

export type Cible = { position: number; origine: OrigineGuide };

/**
 * Les positions sur lesquelles un bord vient se coller, axe par axe.
 *
 * Trois familles, par ordre de force implicite : les bords et le centre de la
 * planche, les marges de la charte et la zone sûre, puis les bords et centres
 * des autres éléments. Toutes ont le même seuil — c'est la PLUS PROCHE qui
 * gagne, pas la plus importante.
 */
export function ciblesDAimant(
  format: CleFormat,
  voisins: readonly BoitePx[],
): { x: Cible[]; y: Cible[] } {
  const f = formatDe(format);
  const x: Cible[] = [
    { position: 0, origine: "planche" },
    { position: f.width / 2, origine: "planche" },
    { position: f.width, origine: "planche" },
    { position: MARGE, origine: "marge" },
    { position: f.width - MARGE, origine: "marge" },
  ];
  const y: Cible[] = [
    { position: 0, origine: "planche" },
    { position: f.height / 2, origine: "planche" },
    { position: f.height, origine: "planche" },
    { position: MARGE, origine: "marge" },
    { position: f.height - MARGE, origine: "marge" },
  ];
  if (f.zoneSure) {
    y.push({ position: f.zoneSure.top, origine: "zone-sure" });
    y.push({ position: f.zoneSure.bottom, origine: "zone-sure" });
  }
  for (const v of voisins) {
    x.push({ position: v.x, origine: "element" });
    x.push({ position: v.x + v.l / 2, origine: "element" });
    x.push({ position: v.x + v.l, origine: "element" });
    y.push({ position: v.y, origine: "element" });
    y.push({ position: v.y + v.h / 2, origine: "element" });
    y.push({ position: v.y + v.h, origine: "element" });
  }
  return { x, y };
}

export type ResultatAimant = { boite: BoitePx; guides: Guide[] };

/**
 * Colle une boîte DÉPLACÉE sur les cibles les plus proches.
 *
 * Trois bords par axe se présentent (début, milieu, fin) ; on retient le plus
 * petit écart, une fois par axe. La taille ne change pas : c'est un déplacement.
 */
export function aimanter(
  b: BoitePx,
  cibles: { x: Cible[]; y: Cible[] },
  seuil: number = SEUIL_AIMANT,
): ResultatAimant {
  const guides: Guide[] = [];
  let dx = 0;
  let dy = 0;

  const meilleur = (bords: number[], liste: Cible[]) => {
    let ecart: number | null = null;
    let cible: Cible | null = null;
    for (const bord of bords) {
      for (const c of liste) {
        const d = c.position - bord;
        if (Math.abs(d) <= seuil && (ecart === null || Math.abs(d) < Math.abs(ecart))) {
          ecart = d;
          cible = c;
        }
      }
    }
    return ecart === null || cible === null ? null : { ecart, cible };
  };

  const surX = meilleur([b.x, b.x + b.l / 2, b.x + b.l], cibles.x);
  if (surX) {
    dx = surX.ecart;
    guides.push({ axe: "x", position: surX.cible.position, origine: surX.cible.origine });
  }
  const surY = meilleur([b.y, b.y + b.h / 2, b.y + b.h], cibles.y);
  if (surY) {
    dy = surY.ecart;
    guides.push({ axe: "y", position: surY.cible.position, origine: surY.cible.origine });
  }

  return { boite: { ...b, x: b.x + dx, y: b.y + dy }, guides };
}

/* ------------------------------------------------------ aligner, répartir */

export type ModeAlignement = "gauche" | "centre-h" | "droite" | "haut" | "centre-v" | "bas";

/**
 * Aligne des boîtes sur leur englobante.
 *
 * Sur l'englobante et non sur la planche : aligner à gauche trois éléments
 * groupés au milieu doit les ranger entre eux, pas les jeter contre le bord.
 */
export function aligner(boites: readonly BoitePx[], mode: ModeAlignement): BoitePx[] {
  const cadre = englobante(boites);
  if (!cadre) return [];
  return boites.map((b) => {
    switch (mode) {
      case "gauche":
        return { ...b, x: cadre.x };
      case "centre-h":
        return { ...b, x: cadre.x + (cadre.l - b.l) / 2 };
      case "droite":
        return { ...b, x: cadre.x + cadre.l - b.l };
      case "haut":
        return { ...b, y: cadre.y };
      case "centre-v":
        return { ...b, y: cadre.y + (cadre.h - b.h) / 2 };
      case "bas":
        return { ...b, y: cadre.y + cadre.h - b.h };
      default:
        return { ...b };
    }
  });
}

/**
 * Met le même blanc entre chaque boîte, le long d'un axe.
 *
 * Les deux extrêmes ne bougent pas — c'est ce qui distingue « répartir » de
 * « aligner ». En dessous de trois boîtes il n'y a rien à répartir.
 */
export function repartir(boites: readonly BoitePx[], axe: "x" | "y"): BoitePx[] {
  if (boites.length < 3) return boites.map((b) => ({ ...b }));
  const taille = axe === "x" ? ("l" as const) : ("h" as const);
  const ordre = boites
    .map((b, i) => ({ b, i }))
    .sort((a, z) => a.b[axe] - z.b[axe]);

  const premier = ordre[0]!.b;
  const dernier = ordre[ordre.length - 1]!.b;
  const occupe = ordre.reduce((s, { b }) => s + b[taille], 0);
  const etendue = dernier[axe] + dernier[taille] - premier[axe];
  const blanc = (etendue - occupe) / (ordre.length - 1);

  const out = boites.map((b) => ({ ...b }));
  let curseur = premier[axe];
  for (const { b, i } of ordre) {
    out[i] = { ...b, [axe]: curseur } as BoitePx;
    curseur += b[taille] + blanc;
  }
  return out;
}
