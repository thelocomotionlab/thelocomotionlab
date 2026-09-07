// packages/ui/src/components/contenu/Preparation.tsx
//
// LA SECTION PRÉPARATION : quatre éléments indépendants et TOUS facultatifs.
//
//   graphe      volume hebdomadaire
//   seances     entraînements spécifiques notables
//   stresseurs  contraintes dosées, et ce qui n'a pas été travaillé
//   protocoles  cartes de renvoi vers les blocs correspondants
//
// Une préparation qui n'a que des stresseurs rend les stresseurs, et rien
// d'autre : pas d'intertitre vide, pas de cadre en attente.

import type { Section } from "@locomotionlab/contenu/sections";
import type { CarteDeBloc as DonneesDeCarte } from "@locomotionlab/contenu/resolveur";
import Graphe from "./Graphe.tsx";
import LigneSeance from "./LigneSeance.tsx";
import type { BilletDeSeance } from "./LigneSeance.tsx";
import Stresseurs from "./Stresseurs.tsx";
import { VersProtocole } from "./CarteDeBloc.tsx";

export type PreparationProps = {
  section: Extract<Section, { type: "preparation" }>;
  /** Les billets de la dernière colonne des séances, par slug. */
  billets?: Record<string, BilletDeSeance>;
  /** Les blocs de `protocoles`, déjà résolus dans l'index. */
  protocoles?: readonly DonneesDeCarte[];
};

function Intertitre({ children }: { children: string }) {
  return (
    <h3 className="mt-8 mb-0 font-mono text-meta font-bold uppercase tracking-surtitre text-brand-muted">
      {children}
    </h3>
  );
}

function colonnesNumeriques(colonnes: readonly string[]): number[] {
  return colonnes
    .map((colonne, index) => (/^km$|d\+|d-|sac|durée|dénivelé/i.test(colonne) ? index : -1))
    .filter((index) => index >= 0);
}

export default function Preparation({ section, billets = {}, protocoles = [] }: PreparationProps) {
  const { graphe, seances, stresseurs } = section;

  return (
    <>
      {graphe ? (
        <>
          <Intertitre>Volume hebdomadaire</Intertitre>
          <Graphe graphe={graphe} />
        </>
      ) : null}

      {seances ? (
        <>
          <Intertitre>Entraînements spécifiques notables</Intertitre>
          <table className="mt-2 w-full border-collapse text-tableau">
            <thead>
              <tr>
                {seances.colonnes.map((colonne) => (
                  <th
                    key={colonne}
                    scope="col"
                    className="border-b border-brand-hairline px-3 py-2 text-center align-middle font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted first:pl-0 last:pr-0"
                  >
                    {colonne}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {seances.lignes.map((ligne, rang) => (
                <LigneSeance
                  key={rang}
                  cellules={ligne}
                  numeriques={colonnesNumeriques(seances.colonnes)}
                  billet={billets[(ligne[ligne.length - 1] ?? "").trim()]}
                  derniere={rang === seances.lignes.length - 1}
                />
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {stresseurs ? (
        <>
          <Intertitre>Stresseurs hormétiques</Intertitre>
          <Stresseurs stresseurs={stresseurs} />
        </>
      ) : null}

      {protocoles.length > 0 ? (
        <>
          <Intertitre>Protocoles rattachés</Intertitre>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {protocoles.map((bloc) => (
              <VersProtocole key={bloc.id} bloc={bloc} />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
