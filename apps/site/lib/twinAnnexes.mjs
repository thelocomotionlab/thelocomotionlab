// lib/twinAnnexes.mjs
//
// LES ANNEXES DE RAPPORT TWIN — l'index de `public/twin-annexes/<ref>.json`.
//
// Chaque rapport Locomotion Twin porte un QR vers sa page d'annexe : tout ce
// que le PDF ne montre pas (méthode, calibration course par course, validation
// croisée, plan complet, glossaire, références). Le moteur écrit ce JSON à côté
// du PDF (`annexe.json`, cf. services/twin-engine) ; on le dépose ici sous le
// nom de sa référence, et la page est prérendue au déploiement suivant.
//
// La référence est le secret : elle n'est pas devinable, la page est en
// `noindex` et n'apparaît ni dans la navigation, ni dans le plan de site, ni
// dans la recherche. Un rapport retiré, c'est un fichier supprimé d'ici.
//
// Format .mjs pour la même raison que archives.mjs : lu par l'application ET
// hors de webpack.

import fs from "node:fs";
import path from "node:path";

const DOSSIER = "twin-annexes";

/** Une référence acceptable : celle que le moteur écrit (LL-TWIN-XXXXXXXX). */
export const REF_VALIDE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;

/**
 * Référence servie quand AUCUNE annexe n'est déposée.
 *
 * ⚠️ Même piège que `SLUG_AUCUN_ATELIER` (lib/ateliers.mjs) : sans chemin à
 * prérendre, Next garde la route dynamique et `@cloudflare/next-on-pages`
 * refuse le déploiement. La référence bouchon coûte un 404 statique.
 */
export const REF_AUCUNE_ANNEXE = "aucune-annexe";

function racine() {
  return path.join(process.cwd(), "public", DOSSIER);
}

/** Les références déposées, triées. */
export function listAnnexeRefs() {
  const dir = racine();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((nom) => nom.endsWith(".json"))
    .map((nom) => nom.slice(0, -5))
    .filter((ref) => REF_VALIDE.test(ref))
    .sort();
}

/** Une annexe par sa référence, ou null (référence illisible, fichier absent). */
export function getAnnexe(ref) {
  if (typeof ref !== "string" || !REF_VALIDE.test(ref)) return null;
  const fichier = path.join(racine(), `${ref}.json`);
  if (!fs.existsSync(fichier)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(fichier, "utf8"));
    return data && typeof data === "object" && data.ref ? data : null;
  } catch {
    return null;
  }
}

/** Paramètres statiques de /services/twin/annexe/[ref] — jamais vide. */
export function annexeRefParams() {
  const refs = listAnnexeRefs().map((ref) => ({ ref }));
  return refs.length > 0 ? refs : [{ ref: REF_AUCUNE_ANNEXE }];
}
