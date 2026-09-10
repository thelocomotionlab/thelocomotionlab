// packages/trace/src/denivele.ts
//
// LE D+ ET LE D−, PAR HYSTÉRÉSIS : on n'accumule qu'au-delà de `seuil` mètres
// d'écart à une référence mobile. Sans ce filtre, le tremblement de l'altimètre
// se compte comme du relief et une sortie plate annonce trois cents mètres de
// dénivelé.
//
// Même principe que le back live-tracking (services/tracking-cache/src/compute.ts),
// mais le SEUIL est plus bas — 3 m contre 5 — parce que la source n'est pas la
// même : une montre exporte une altitude barométrique, déjà stable, là où le
// tracker envoie une altitude GNSS qui oscille en permanence. Filtrer aussi fort
// mangerait du relief réel.
//
// C'est le SEUL endroit du dépôt qui compte du dénivelé côté studio : les
// planches image et Survol appellent tous deux ici, sur la même altitude lissée,
// pour qu'une sortie n'ait jamais deux D+ selon l'écran qui l'affiche.

/** Le seuil d'hystérésis d'une altitude de montre, en mètres. */
export const SEUIL_DENIVELE = 3;

/** La fenêtre de lissage d'une altitude de montre, en nombre de points. */
export const LISSAGE_ALTITUDE = 5;

export type CumulDenivele = { dp: number; dm: number };

/**
 * L'hystérésis en gardant le CUMUL à chaque point — c'est ce qu'un profil
 * affiche au survol (« D+ accumulé ici »). Les totaux sont ceux du dernier point.
 */
export function deniveleCumule(
  altitudes: readonly number[],
  seuil: number = SEUIL_DENIVELE,
): { dPlus: number; dMinus: number; cumul: CumulDenivele[] } {
  const cumul = new Array<CumulDenivele>(altitudes.length);
  if (altitudes.length < 2) {
    cumul.fill({ dp: 0, dm: 0 });
    return { dPlus: 0, dMinus: 0, cumul };
  }
  let dPlus = 0;
  let dMinus = 0;
  let ref = altitudes[0]!;
  cumul[0] = { dp: 0, dm: 0 };
  for (let i = 1; i < altitudes.length; i += 1) {
    const ecart = altitudes[i]! - ref;
    if (ecart >= seuil) {
      dPlus += ecart;
      ref = altitudes[i]!;
    } else if (ecart <= -seuil) {
      dMinus += -ecart;
      ref = altitudes[i]!;
    }
    cumul[i] = { dp: dPlus, dm: dMinus };
  }
  return { dPlus, dMinus, cumul };
}

/** Les deux totaux seuls, quand le cumul point par point ne sert à rien. */
export function denivele(
  altitudes: readonly number[],
  seuil: number = SEUIL_DENIVELE,
): { dPlus: number; dMinus: number } {
  const { dPlus, dMinus } = deniveleCumule(altitudes, seuil);
  return { dPlus, dMinus };
}
