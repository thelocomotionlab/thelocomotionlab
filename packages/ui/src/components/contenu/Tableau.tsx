// packages/ui/src/components/contenu/Tableau.tsx
//
// LE TABLEAU ORDONNÉ des sections geo et nutrition.
//
// Colonnes libres : le composant ne connaît pas leurs noms. Il centre et passe
// en chiffres tabulaires les colonnes déclarées numériques, laisse au fil du
// texte celles qui portent des phrases, et rend une cellule vide par un tiret
// cadratin plutôt que par du blanc. La gouttière est portée par les cellules :
// sans elle, deux libellés voisins se touchent.
//
// Une ligne dont la première cellule commence par « Total » est une somme : le
// tableau la met en gras, d'où qu'elle vienne — écrite à la main ou calculée.
//
// Une cellule peut porter autre chose que du texte : une pastille de statut, un
// bouton, un champ. Les deux égards que le tableau a pour le texte — le tiret cadratin
// d'une cellule vide, le gras d'une ligne de total — ne s'appliquent alors pas, et
// c'est normal : un bouton n'est ni vide ni un total.

import type { ReactNode } from "react";

export type TableauProps = {
  colonnes: readonly ReactNode[];
  lignes: readonly (readonly ReactNode[])[];
  /** Index des colonnes à aligner à droite, en mono. */
  numeriques?: readonly number[];
  /**
   * Une clé par ligne, quand le tableau est VIVANT : sans elle, React identifie les
   * lignes par leur rang, et une ligne insérée en tête fait glisser l'état — le focus
   * d'un champ, une saisie en cours — d'une ligne à sa voisine.
   */
  cles?: readonly string[];
};

const TOTAL = /^total\b/i;

/** Les deux égards ne valent que pour du texte : le reste passe tel quel. */
const texteDe = (cellule: ReactNode): string | null =>
  typeof cellule === "string" ? cellule : typeof cellule === "number" ? String(cellule) : null;

export default function Tableau({ colonnes, lignes, numeriques = [], cles }: TableauProps) {
  const estNumerique = (index: number) => numeriques.includes(index);

  return (
    // Un tableau ne se replie pas : passé quatre colonnes, il est plus large
    // qu'un téléphone. Il défile alors DANS sa boîte — sans quoi c'est la page
    // entière qui part de travers, tous ses paragraphes avec.
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-tableau">
        <thead>
          <tr>
            {colonnes.map((colonne, index) => (
              <th
                key={index}
                scope="col"
                className={`border-b border-brand-hairline px-3 pb-2 align-middle font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted first:pl-0 last:pr-0 ${
                  estNumerique(index) ? "text-center" : "text-left"
                }`}
              >
                {colonne}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne, rang) => {
            const premiere = texteDe(ligne[0]) ?? "";
            const total = TOTAL.test(premiere.trim());
            return (
              <tr key={cles?.[rang] ?? rang}>
                {ligne.map((cellule, index) => {
                  const texte = texteDe(cellule);
                  const vide = texte !== null && texte.trim() === "";
                  return (
                    <td
                      key={index}
                      className={`border-b border-brand-grid px-3 py-2.5 align-middle first:pl-0 last:pr-0 ${
                        estNumerique(index)
                          ? "whitespace-nowrap text-center font-mono tabular-nums"
                          : "font-sans"
                      } ${total ? "font-bold" : ""} ${vide ? "text-brand-faint" : ""}`}
                    >
                      {vide ? "—" : cellule}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
