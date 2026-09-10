// lib/icones.ts
//
// LES ICÔNES DU LABO, TRACÉES SUR LE CANVAS.
//
// Une icône lucide EST un composant React, et le rendu des planches est un
// canvas 2D : `fillText` et `stroke`, pas un arbre de composants. Rien de ce que
// React produit n'arrive sur un canvas.
//
// Mais une icône lucide n'est pas VRAIMENT du React — c'est de la géométrie
// emballée dans du React. Chaque composant porte son `iconNode` : la liste des
// primitives SVG qui la dessinent (`[["path", { d: "m8 3 4 8…" }]]`). On lit
// donc cette géométrie et on la trace nous-mêmes. Aucune image à charger, aucun
// appel réseau, aucune attente : le tracé est synchrone, et la couleur est
// simplement celle du trait — donc une icône suit la couleur du mot qui la
// précède, y compris `[bleu: …]`.
//
// C'EST L'APP QUI DÉCLARE LE VOCABULAIRE, pas le paquet : `@locomotionlab/planche`
// ne fait que découper, mesurer et poser, et n'a pas à devenir un consommateur
// de React pour autant.

import { WAYPOINT_ICONES, iconeConnue } from "@locomotionlab/ui/icones";
import { definirVocabulaireDIcones, type Ctx2D, type Vocabulaire } from "@locomotionlab/planche";

/** Le repère lucide : 24×24, trait de 2, bouts et angles arrondis, sans remplissage. */
const COTE_SOURCE = 24;
const TRAIT_SOURCE = 2;

type Primitive = [string, Record<string, unknown>];

const cache = new Map<string, Primitive[] | null>();

/**
 * La géométrie d'une icône. `null` si la clé est inconnue — un texte ne doit
 * jamais faire échouer un rendu.
 *
 * `render({}, null)` déballe le `forwardRef` sans passer par React : on ne monte
 * rien, on lit juste les props que le composant aurait transmises.
 */
export function geometrieDIcone(cle: string): Primitive[] | null {
  const connu = cache.get(cle);
  if (connu !== undefined) return connu;
  const Composant = WAYPOINT_ICONES[cle] as
    | { render?: (p: object, r: null) => { props?: { iconNode?: Primitive[] } } }
    | undefined;
  let noeud: Primitive[] | null = null;
  try {
    noeud = Composant?.render?.({}, null)?.props?.iconNode ?? null;
  } catch {
    noeud = null;
  }
  cache.set(cle, noeud);
  return noeud;
}

/**
 * Trace une icône dans un carré de `taille`, coin haut-gauche en (x, y).
 *
 * L'épaisseur du trait suit la taille : une icône de 22 px et une de 65 px
 * doivent avoir le MÊME poids apparent que le texte qu'elles accompagnent, ce
 * qu'un trait fixe ne donne pas.
 */
export function dessinerIcone(
  ctx: Ctx2D,
  cle: string,
  x: number,
  y: number,
  taille: number,
  couleur: string,
): boolean {
  const noeud = geometrieDIcone(cle);
  if (!noeud) return false;

  const echelle = taille / COTE_SOURCE;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(echelle, echelle);
  ctx.strokeStyle = couleur;
  ctx.fillStyle = "transparent";
  ctx.lineWidth = TRAIT_SOURCE;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const [type, attrs] of noeud) {
    ctx.beginPath();
    switch (type) {
      case "path":
        // `Path2D` accepte la même syntaxe que l'attribut `d` d'un SVG : c'est
        // exactement ce qu'on a sous la main, il n'y a rien à convertir.
        ctx.stroke(new Path2D(String(attrs.d)));
        continue;
      case "circle":
        ctx.arc(Number(attrs.cx), Number(attrs.cy), Number(attrs.r), 0, Math.PI * 2);
        break;
      case "ellipse":
        ctx.ellipse(
          Number(attrs.cx),
          Number(attrs.cy),
          Number(attrs.rx),
          Number(attrs.ry),
          0,
          0,
          Math.PI * 2,
        );
        break;
      case "line":
        ctx.moveTo(Number(attrs.x1), Number(attrs.y1));
        ctx.lineTo(Number(attrs.x2), Number(attrs.y2));
        break;
      case "rect":
        ctx.rect(Number(attrs.x), Number(attrs.y), Number(attrs.width), Number(attrs.height));
        break;
      case "polyline":
      case "polygon": {
        const pts = String(attrs.points).trim().split(/[\s,]+/).map(Number);
        for (let i = 0; i + 1 < pts.length; i += 2) {
          if (i === 0) ctx.moveTo(pts[0]!, pts[1]!);
          else ctx.lineTo(pts[i]!, pts[i + 1]!);
        }
        if (type === "polygon") ctx.closePath();
        break;
      }
      default:
        continue;
    }
    ctx.stroke();
  }
  ctx.restore();
  return true;
}

export const VOCABULAIRE: Vocabulaire = { connue: iconeConnue, dessiner: dessinerIcone };

/** À appeler une fois, au montage du poste de travail. */
export function enregistrerIcones(): void {
  definirVocabulaireDIcones(VOCABULAIRE);
}
