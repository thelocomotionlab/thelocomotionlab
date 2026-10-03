// packages/planche/src/chiffres.ts
//
// LE BLOC DE CHIFFRES : des cases rangées en lignes, chacune une valeur en
// gras et son libellé dessous, en capitales espacées.
//
// Les lignes se suivent à un interligne réglé, et le bloc se centre dans son
// cadre. Un seul corps pour tout le bloc : quand une valeur ou un libellé
// déborde de sa case, ou que les lignes dépassent la hauteur du cadre, c'est
// le corps du bloc entier qui diminue. Rétrécir la seule case trop large
// casserait l'alignement des valeurs sur une même ligne, et laisser
// `lignesRiches` couper « 10 662 » sur son espace n'en montrerait que la
// moitié.

import type { Ctx2D } from "./canvas.ts";
import type { ContexteRendu } from "./contexte.ts";
import {
  analyserRiche,
  dessinerCapitales,
  dessinerLigneRiche,
  largeurCapitales,
  largeurLigne,
  lignesRiches,
  morceauxCapitales,
  type Ligne,
  type StyleTexte,
} from "./texte.ts";
import { ABSENT, valeurDe } from "./variables.ts";
import type { BoitePx, CaseChiffre, ElementChiffres } from "./types.ts";

/** Le corps du libellé, en part de celui de la valeur — le rapport du Chiffre seul. */
const PART_LIBELLE = 0.3;
const LETTRAGE_LIBELLE = 0.14;
/** De la ligne de base de la valeur à celle du libellé, en corps du libellé. */
const SAUT_LIBELLE = 1.5;
/** La hauteur des chiffres d'Ubuntu Sans, en part du corps. */
const HAUTEUR_CHIFFRES = 0.7;
/** La part d'une case qu'une valeur ou un libellé peut occuper en largeur. */
const PART_UTILE = 0.92;
/** L'air entre deux lignes de cases, en part du corps des valeurs, quand rien n'est réglé. */
export const ENTRE_LIGNES = 0.6;

/** Ce qu'une case affiche : la valeur écrite, sinon sa variable, sinon un tiret. */
export function valeurDeLaCase(cs: CaseChiffre, c: ContexteRendu): string {
  if (cs.valeur !== null && cs.valeur !== "") return cs.valeur;
  if (!cs.variable) return ABSENT;
  return valeurDe(cs.variable, c.variables) ?? ABSENT;
}

/** Où se pose une case : sa colonne, et la ligne de base de sa valeur. */
export type PlaceDeCase = { x: number; l: number; ligneDeBase: number };

/**
 * La mise en page du bloc : le corps commun des valeurs, et la place de chaque
 * case. Les cases se rangent `colonnes` par ligne — une dernière ligne
 * incomplète se centre sous les autres quand le bloc est centré —, les lignes
 * se suivent à `entreLignes` corps d'air, et l'ensemble se centre en hauteur
 * dans le cadre. Le corps est celui du réglage, diminué juste assez pour que
 * tout tienne : chaque valeur et chaque libellé dans sa colonne, les lignes
 * dans la hauteur.
 */
export function miseEnPageDuBloc(
  ctx: Ctx2D,
  e: ElementChiffres,
  b: BoitePx,
  c: ContexteRendu,
): { taille: number; places: PlaceDeCase[] } {
  const n = e.cases.length;
  if (n === 0 || b.l <= 0 || b.h <= 0) return { taille: 0, places: [] };
  const colonnes = Math.max(1, Math.min(n, Math.round(e.colonnes) || 1));
  const rangs = Math.ceil(n / colonnes);
  const l = b.l / colonnes;
  const voulu = Math.max(8, e.taille || 8);

  // Les hauteurs se comptent en corps des valeurs : elles suivent le corps
  // quand il diminue, et le rapport qui fait tenir le bloc se calcule une fois.
  const pile = HAUTEUR_CHIFFRES + (e.cases.some((cs) => cs.libelle) ? PART_LIBELLE * SAUT_LIBELLE : 0);
  const air = entreLignesDe(e);
  const hauteur = rangs * pile + (rangs - 1) * air;
  let rapport = Math.min(1, b.h / (voulu * hauteur));

  const place = l * PART_UTILE;
  e.cases.forEach((cs) => {
    const large = largeurLigne(ligneDeValeur(ctx, valeurDeLaCase(cs, c), styleDesValeurs(e, c, voulu)));
    if (large > place) rapport = Math.min(rapport, place / large);
    if (cs.libelle) {
      const petit = voulu * PART_LIBELLE;
      ctx.font = `500 ${petit}px ${c.police}`;
      const libelle = largeurCapitales(ctx, morceauxCapitales(cs.libelle), petit, LETTRAGE_LIBELLE);
      if (libelle > place) rapport = Math.min(rapport, place / libelle);
    }
  });

  const taille = voulu * rapport;
  const haut = b.y + (b.h - taille * hauteur) / 2;
  const places = e.cases.map((_, i) => {
    const rang = Math.floor(i / colonnes);
    const dansLeRang = Math.min(colonnes, n - rang * colonnes);
    const decalage = e.alignement === "centre" ? ((colonnes - dansLeRang) * l) / 2 : 0;
    return {
      x: b.x + decalage + (i % colonnes) * l,
      l,
      ligneDeBase: haut + taille * (rang * (pile + air) + HAUTEUR_CHIFFRES),
    };
  });
  return { taille, places };
}

/** L'air entre deux lignes : le réglage, borné à zéro, sinon celui par défaut. */
function entreLignesDe(e: ElementChiffres): number {
  const v = e.entreLignes;
  return v !== null && v !== undefined && Number.isFinite(v) ? Math.max(0, v) : ENTRE_LIGNES;
}

function styleDesValeurs(e: ElementChiffres, c: ContexteRendu, taille: number): StyleTexte {
  return {
    police: c.police,
    taille,
    graisse: 700,
    couleur: e.couleurValeurs || c.theme.encre,
    accent: c.theme.accent,
    douce: c.theme.encreDouce,
  };
}

/** La valeur sur une seule ligne : une largeur infinie empêche toute coupure. */
function ligneDeValeur(ctx: Ctx2D, texte: string, style: StyleTexte): Ligne {
  return lignesRiches(ctx, analyserRiche(texte), Number.POSITIVE_INFINITY, style)[0] ?? [];
}

export function dessinerChiffres(
  ctx: Ctx2D,
  e: ElementChiffres,
  b: BoitePx,
  c: ContexteRendu,
): void {
  ctx.save();
  const { taille, places } = miseEnPageDuBloc(ctx, e, b, c);
  if (places.length === 0) {
    ctx.restore();
    return;
  }
  const petit = taille * PART_LIBELLE;
  const style = styleDesValeurs(e, c, taille);
  const encreLibelles = e.couleurLibelles || c.theme.accent;

  e.cases.forEach((cs, i) => {
    const { x: gauche, l, ligneDeBase } = places[i]!;
    const ligne = ligneDeValeur(ctx, valeurDeLaCase(cs, c), style);
    const large = largeurLigne(ligne);
    const x = e.alignement === "centre" ? gauche + (l - large) / 2 : gauche;
    dessinerLigneRiche(ctx, ligne, x, ligneDeBase, style);

    if (cs.libelle) {
      ctx.font = `500 ${petit}px ${c.police}`;
      ctx.fillStyle = encreLibelles;
      const morceaux = morceauxCapitales(cs.libelle);
      const largeLibelle = largeurCapitales(ctx, morceaux, petit, LETTRAGE_LIBELLE);
      dessinerCapitales(
        ctx,
        morceaux,
        e.alignement === "centre" ? gauche + (l - largeLibelle) / 2 : gauche,
        ligneDeBase + petit * SAUT_LIBELLE,
        petit,
        LETTRAGE_LIBELLE,
        c.theme.accent,
        { douce: c.theme.encreDouce },
      );
    }
  });
  ctx.restore();
}
