// packages/ui/src/components/contenu/Tableau.tsx
//
// LE TABLEAU ORDONNÉ des sections geo et nutrition.
//
// Colonnes libres : le composant ne connaît pas leurs noms. Il aligne à droite
// et passe en chiffres tabulaires les colonnes déclarées numériques, et rend
// une cellule vide par un tiret cadratin plutôt que par du blanc. La gouttière
// est portée par les cellules : sans elle, deux libellés voisins se touchent.

export type TableauProps = {
  colonnes: readonly string[];
  lignes: readonly (readonly string[])[];
  /** Index des colonnes à aligner à droite, en mono. */
  numeriques?: readonly number[];
};

export default function Tableau({ colonnes, lignes, numeriques = [] }: TableauProps) {
  const estNumerique = (index: number) => numeriques.includes(index);

  return (
    <table className="mt-4 w-full border-collapse text-tableau">
      <thead>
        <tr>
          {colonnes.map((colonne, index) => (
            <th
              key={colonne}
              scope="col"
              className={`border-b border-brand-hairline pb-2 pr-4 font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted last:pr-0 ${
                estNumerique(index) ? "text-right" : "text-left"
              }`}
            >
              {colonne}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lignes.map((ligne, rang) => (
          <tr key={rang}>
            {ligne.map((cellule, index) => (
              <td
                key={index}
                className={`border-b border-brand-grid py-2.5 pr-4 align-top last:pr-0 ${
                  estNumerique(index) ? "text-right font-mono tabular-nums" : "font-sans"
                } ${cellule.trim() === "" ? "text-brand-faint" : ""}`}
              >
                {cellule.trim() === "" ? "—" : cellule}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
