// packages/ui/src/components/contenu/LigneSeance.tsx
//
// UNE LIGNE DU TABLEAU DES SÉANCES.
//
// La colonne « Sortie » porte le nom de la séance en gras, et la DERNIÈRE
// colonne un slug de billet, résolu en lien vers son titre. Le composant ne
// résout rien lui-même : l'app lui passe le billet qu'elle a trouvé, ou rien.

export type BilletDeSeance = { titre: string; url: string };

export type LigneSeanceProps = {
  cellules: readonly string[];
  /** Index de la colonne « Sortie », mise en avant. */
  colonneSortie?: number;
  /** Le billet de la dernière colonne, quand il existe. */
  billet?: BilletDeSeance;
  /** Index des colonnes chiffrées, alignées à droite. */
  numeriques?: readonly number[];
  derniere?: boolean;
};

export default function LigneSeance({
  cellules,
  colonneSortie = 1,
  billet,
  numeriques = [],
  derniere = false,
}: LigneSeanceProps) {
  const derniereColonne = cellules.length - 1;
  const bordure = derniere ? "" : "border-b border-brand-grid";

  return (
    <tr>
      {cellules.map((cellule, index) => {
        // La gouttière est portée par la cellule : sans elle, une valeur
        // chiffrée colle au libellé de la colonne suivante.
        const commun = `px-3 py-3 text-center align-middle first:pl-0 last:pr-0 ${bordure}`;

        if (index === derniereColonne) {
          return (
            <td key={index} className={commun}>
              {billet ? (
                <a
                  href={billet.url}
                  className="font-semibold text-brand-deep-dark no-underline transition-colors hover:text-brand-accent-ink"
                >
                  {billet.titre}
                </a>
              ) : (
                <span className="font-mono text-xxs uppercase tracking-lien text-brand-faint">
                  {cellule.trim() === "" ? "à venir" : cellule}
                </span>
              )}
            </td>
          );
        }

        if (index === colonneSortie) {
          return (
            <td key={index} className={`${commun} font-semibold`}>
              {cellule}
            </td>
          );
        }

        if (numeriques.includes(index)) {
          return (
            <td key={index} className={`${commun} font-mono tabular-nums whitespace-nowrap`}>
              {cellule}
            </td>
          );
        }

        return (
          <td key={index} className={`${commun} font-sans text-brand-soft`}>
            {cellule}
          </td>
        );
      })}
    </tr>
  );
}
