// packages/ui/src/components/contenu/Graphe.tsx
//
// LE GRAPHE DE VOLUME D'UNE PRÉPARATION.
//
// Des barres groupées par point d'abscisse, une série par grandeur. Les
// hauteurs sont des pourcentages du maximum de chaque série : deux unités
// différentes (km et mètres) restent lisibles côte à côte sans axe commun.

import type { Section } from "@locomotionlab/contenu/sections";

type Preparation = Extract<Section, { type: "preparation" }>;
type Graphe = NonNullable<Preparation["graphe"]>;

export type GrapheProps = { graphe: Graphe };

/** Deux séries au plus reçoivent une couleur de marque ; au-delà, elles alternent. */
const COULEURS = ["bg-brand-deep", "bg-brand-accent", "bg-brand-primary-dark"] as const;

function couleur(index: number): string {
  return COULEURS[index % COULEURS.length]!;
}

export default function Graphe({ graphe }: GrapheProps) {
  const maxima = graphe.series.map((serie) => Math.max(...serie.valeurs, 1));

  return (
    <div className="mt-3.5 rounded-lg border border-brand-hairline bg-brand-paper px-5 pb-3.5 pt-4.5">
      <div
        className="grid h-48 items-end gap-4 border-b border-brand-gauge-full"
        style={{ gridTemplateColumns: `repeat(${graphe.abscisse.length}, minmax(0, 1fr))` }}
      >
        {graphe.abscisse.map((point, rang) => (
          <div key={point} className="flex h-full items-end gap-1.5">
            {graphe.series.map((serie, index) => (
              <div
                key={serie.nom}
                className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
              >
                <span className="font-mono text-meta text-brand-soft tabular-nums">
                  {serie.valeurs[rang]}
                </span>
                <div
                  className={`w-full rounded-t-sm ${couleur(index)}`}
                  style={{ height: `${(serie.valeurs[rang]! / maxima[index]!) * 100}%` }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div
        className="mt-2 grid gap-4 text-center font-mono text-meta text-brand-muted"
        style={{ gridTemplateColumns: `repeat(${graphe.abscisse.length}, minmax(0, 1fr))` }}
      >
        {graphe.abscisse.map((point) => (
          <span key={point}>{point}</span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-4.5 font-mono text-meta text-brand-muted">
        {graphe.series.map((serie, index) => (
          <span key={serie.nom} className="inline-flex items-center gap-1.5">
            <i className={`h-2.5 w-2.5 rounded-xs ${couleur(index)}`} aria-hidden="true" />
            {serie.nom} ({serie.unite})
          </span>
        ))}
      </div>
    </div>
  );
}
