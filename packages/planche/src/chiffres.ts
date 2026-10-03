// packages/planche/src/chiffres.ts
//
// LE BLOC DE CHIFFRES : des cases rangées en lignes, chacune une valeur en
// gras et son libellé dessous, en capitales espacées.
//
// Un seul corps pour tout le bloc. Quand une valeur ou un libellé déborde de
// sa case, c'est le corps du bloc entier qui diminue : rétrécir la seule case
// trop large casserait l'alignement des valeurs sur une même ligne, et
// laisser `lignesRiches` couper « 10 662 » sur son espace n'en montrerait que
// la moitié.

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

/** Ce qu'une case affiche : la valeur écrite, sinon sa variable, sinon un tiret. */
export function valeurDeLaCase(cs: CaseChiffre, c: ContexteRendu): string {
  if (cs.valeur !== null && cs.valeur !== "") return cs.valeur;
  if (!cs.variable) return ABSENT;
  return valeurDe(cs.variable, c.variables) ?? ABSENT;
}

/**
 * Les boîtes des cases, `colonnes` par ligne. Une dernière ligne incomplète se
 * centre sous les autres quand le bloc est centré.
 */
export function casesDuBloc(e: ElementChiffres, b: BoitePx): BoitePx[] {
  const n = e.cases.length;
  if (n === 0 || b.l <= 0 || b.h <= 0) return [];
  const colonnes = Math.max(1, Math.min(n, Math.round(e.colonnes) || 1));
  const rangs = Math.ceil(n / colonnes);
  const l = b.l / colonnes;
  const h = b.h / rangs;
  return e.cases.map((_, i) => {
    const rang = Math.floor(i / colonnes);
    const dansLeRang = Math.min(colonnes, n - rang * colonnes);
    const decalage = e.alignement === "centre" ? ((colonnes - dansLeRang) * l) / 2 : 0;
    return { x: b.x + decalage + (i % colonnes) * l, y: b.y + rang * h, l, h };
  });
}

/**
 * Le corps commun des valeurs : celui du réglage, diminué juste assez pour que
 * la plus large valeur et le plus large libellé tiennent dans une case.
 */
export function corpsDuBloc(
  ctx: Ctx2D,
  e: ElementChiffres,
  b: BoitePx,
  c: ContexteRendu,
): number {
  const voulu = Math.max(8, e.taille || 8);
  const cases = casesDuBloc(e, b);
  if (cases.length === 0) return voulu;
  const place = cases[0]!.l * PART_UTILE;
  let rapport = 1;
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
  return voulu * rapport;
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
  const cases = casesDuBloc(e, b);
  if (cases.length === 0) return;
  ctx.save();
  const taille = corpsDuBloc(ctx, e, b, c);
  const petit = taille * PART_LIBELLE;
  const style = styleDesValeurs(e, c, taille);
  const encreLibelles = e.couleurLibelles || c.theme.accent;

  e.cases.forEach((cs, i) => {
    const boite = cases[i]!;
    const ligne = ligneDeValeur(ctx, valeurDeLaCase(cs, c), style);
    // La pile — hauteur des chiffres, puis le libellé — se centre dans sa case.
    const pile = taille * HAUTEUR_CHIFFRES + (cs.libelle ? petit * SAUT_LIBELLE : 0);
    const ligneDeBase = boite.y + (boite.h - pile) / 2 + taille * HAUTEUR_CHIFFRES;
    const large = largeurLigne(ligne);
    const x = e.alignement === "centre" ? boite.x + (boite.l - large) / 2 : boite.x;
    dessinerLigneRiche(ctx, ligne, x, ligneDeBase, style);

    if (cs.libelle) {
      ctx.font = `500 ${petit}px ${c.police}`;
      ctx.fillStyle = encreLibelles;
      const morceaux = morceauxCapitales(cs.libelle);
      const largeLibelle = largeurCapitales(ctx, morceaux, petit, LETTRAGE_LIBELLE);
      dessinerCapitales(
        ctx,
        morceaux,
        e.alignement === "centre" ? boite.x + (boite.l - largeLibelle) / 2 : boite.x,
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
