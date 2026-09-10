// packages/trace/src/lissage.ts
//
// Les trois façons d'écrêter le bruit d'un capteur, et la réduction de points.
//
// MOYENNE ou MÉDIANE, ce n'est pas le même geste. Une moyenne glissante lisse le
// TREMBLEMENT de fond d'un altimètre sans décaler la courbe — c'est ce qu'on
// veut avant de compter du dénivelé. Une médiane, elle, efface le PIC isolé (un
// point GPS qui saute de trente mètres) sans arrondir le relief autour : c'est
// ce qu'on veut sous une caméra qui vole au ras du sol, où un pic isolé se voit
// comme une secousse.

/** Moyenne glissante centrée, fenêtre en NOMBRE DE POINTS. */
export function moyenneGlissante(valeurs: readonly number[], fenetre: number): number[] {
  if (!(fenetre > 1)) return valeurs.slice();
  const demi = Math.floor(fenetre / 2);
  const out = new Array<number>(valeurs.length);
  for (let i = 0; i < valeurs.length; i += 1) {
    let somme = 0;
    let n = 0;
    for (let j = Math.max(0, i - demi); j <= Math.min(valeurs.length - 1, i + demi); j += 1) {
      somme += valeurs[j]!;
      n += 1;
    }
    out[i] = somme / n;
  }
  return out;
}

/** Médiane glissante centrée, fenêtre en NOMBRE DE POINTS. */
export function medianeGlissante(valeurs: readonly number[], fenetre: number): number[] {
  if (!(fenetre > 1)) return valeurs.slice();
  const demi = Math.floor(fenetre / 2);
  const out = new Array<number>(valeurs.length);
  const tampon: number[] = [];
  for (let i = 0; i < valeurs.length; i += 1) {
    tampon.length = 0;
    for (let j = Math.max(0, i - demi); j <= Math.min(valeurs.length - 1, i + demi); j += 1) {
      tampon.push(valeurs[j]!);
    }
    tampon.sort((a, b) => a - b);
    const m = tampon.length >> 1;
    out[i] = tampon.length % 2 ? tampon[m]! : (tampon[m - 1]! + tampon[m]!) / 2;
  }
  return out;
}

/**
 * Réduit une suite à ~`cible` éléments par échantillonnage régulier.
 *
 * Le DERNIER est toujours conservé : c'est lui qui porte le total, et une
 * silhouette qui s'arrête avant l'arrivée se voit tout de suite.
 */
export function decimer<T>(suite: readonly T[], cible = 400): T[] {
  if (suite.length <= cible) return suite.slice();
  const pas = suite.length / cible;
  const out: T[] = [];
  for (let i = 0; i < cible; i += 1) out.push(suite[Math.floor(i * pas)]!);
  out.push(suite[suite.length - 1]!);
  return out;
}
