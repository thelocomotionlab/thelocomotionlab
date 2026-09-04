// lib/relations.mjs
//
// LE GRAPHE DES RELATIONS, et les quatre blocs qu'il engendre.
//
// Aucun de ces liens n'est écrit à la main dans un markdown : ils viennent des
// champs `concepts:`, `fiches:`, `parent:` et `lie:`, et se lisent dans les
// DEUX sens. C'est ce qui remplace les ancres profondes, qui cassaient en
// silence à la première découpe.
//
//   • « Sur le terrain »      — sur un concept : qui l'a éprouvé (inverse de concepts:)
//   • « Ce que j'ai compris » — sur un atome de terrain : les concepts qu'il cite
//   • « Dans cette page »     — les fiches déclarées, et celles qui se rattachent
//   • « Motifs voisins »      — les concepts liés, dans les deux sens
//
// Seuls les atomes PUBLIÉS entrent dans le graphe : un brouillon n'a pas de
// page, et la règle de build interdit déjà qu'un atome publié le cite.

import { listEntries } from "./contentRoutes.mjs";
import { itemRegistre, indexParSlug } from "./registre.mjs";


/** Ordonne les cartes par sorte puis par titre : un affichage stable. */
function ordonner(cartes) {
  return cartes.sort(
    (a, b) =>
      a.kindLabel.localeCompare(b.kindLabel) || a.title.localeCompare(b.title)
  );
}

/**
 * Les relations d'un atome, prêtes à rendre. Retourne toujours un objet : les
 * groupes vides sont des tableaux vides, et le composant n'affiche que ce qui
 * n'est pas vide.
 */
export function relationsDe(slug) {
  const publies = listEntries().filter((e) => e.published);
  const parSlug = indexParSlug(publies);
  const moi = parSlug.get(slug);
  // Un item de registre, comme aux index : même icône, même puce, même ligne.
  const carte = (entry) => itemRegistre(entry, parSlug);

  const vide = {
    surLeTerrain: [],
    ceQueJaiCompris: [],
    fiches: [],
    motifsVoisins: [],
    parent: null,
  };
  if (!moi) return vide;

  const resoudre = (slugs) =>
    ordonner(
      [...new Set(slugs)]
        .filter((s) => s !== slug)
        .map((s) => parSlug.get(s))
        .filter(Boolean)
        .map(carte)
    );

  return {
    // Relation inverse de `concepts:` — ce qui a éprouvé ce concept.
    surLeTerrain:
      moi.kind === "concept"
        ? ordonner(publies.filter((e) => e.concepts.includes(slug)).map(carte))
        : [],

    ceQueJaiCompris: resoudre(moi.concepts),

    // Les fiches déclarées, plus celles qui se rattachent à cet atome.
    fiches: resoudre([
      ...moi.fiches,
      ...publies
        .filter((e) => e.kind === "fiche" && e.parent === slug)
        .map((e) => e.slug),
    ]),

    // `lie:` se lit dans les deux sens : une brique voisine l'est toujours
    // réciproquement, sans qu'il faille écrire la relation deux fois.
    motifsVoisins: resoudre([
      ...moi.lie,
      ...publies.filter((e) => e.lie.includes(slug)).map((e) => e.slug),
    ]),

    // Le parent d'une fiche. Null s'il n'est pas publié : la fiche existe
    // seule, son lien de retour attend.
    parent: moi.parent && parSlug.has(moi.parent)
      ? carte(parSlug.get(moi.parent))
      : null,
  };
}
