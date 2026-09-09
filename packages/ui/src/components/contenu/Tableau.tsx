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

export type TableauProps = {
  colonnes: readonly string[];
  lignes: readonly (readonly string[])[];
  /** Index des colonnes à aligner à droite, en mono. */
  numeriques?: readonly number[];
};

const TOTAL = /^total\b/i;

export default function Tableau({ colonnes, lignes, numeriques = [] }: TableauProps) {
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
                key={colonne}
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
            const total = TOTAL.test((ligne[0] ?? "").trim());
            return (
              <tr key={rang}>
                {ligne.map((cellule, index) => (
                  <td
                    key={index}
                    className={`border-b border-brand-grid px-3 py-2.5 align-middle first:pl-0 last:pr-0 ${
                      estNumerique(index)
                        ? "whitespace-nowrap text-center font-mono tabular-nums"
                        : "font-sans"
                    } ${total ? "font-bold" : ""} ${
                      cellule.trim() === "" ? "text-brand-faint" : ""
                    }`}
                  >
                    {cellule.trim() === "" ? "—" : cellule}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
