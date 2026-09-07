// lib/blogRegistre.js
//
// LA PART PURE DU REGISTRE DU BLOG : les libellés de type et le groupement par
// année puis par mois. Aucun accès disque, donc importable depuis le composant
// client qui porte le filtre.

/** Les libellés de type affichés et filtrés dans l'index. */
export const TYPES = {
  recit: "Récits d'aventure",
  "recit-de-sortie": "Récits de sortie",
  bilan: "Bilans",
  billet: "Billets",
  "note-de-terrain": "Notes de terrain",
};

/** Les mêmes, au singulier : une carte annonce UN billet, pas la rubrique. */
export const TYPE_AU_SINGULIER = {
  recit: "Récit d'aventure",
  "recit-de-sortie": "Récit de sortie",
  bilan: "Bilan",
  billet: "Billet",
  "note-de-terrain": "Note de terrain",
};

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** Le registre en années → mois → entrées, du plus récent au plus ancien. */
export function parAnnee(liste) {
  const annees = new Map();

  for (const entree of liste) {
    const [annee, mois] = entree.date.split("-");
    if (!annees.has(annee)) annees.set(annee, new Map());
    const moisDeLAnnee = annees.get(annee);
    if (!moisDeLAnnee.has(mois)) moisDeLAnnee.set(mois, []);
    moisDeLAnnee.get(mois).push(entree);
  }

  return [...annees.entries()].map(([annee, moisDeLAnnee]) => ({
    annee,
    mois: [...moisDeLAnnee.entries()].map(([numero, entrees]) => ({
      numero,
      id: `blog-${annee}-${numero}`,
      libelle: MOIS[Number(numero) - 1],
      entrees,
    })),
  }));
}
