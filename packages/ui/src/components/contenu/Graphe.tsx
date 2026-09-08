// packages/ui/src/components/contenu/Graphe.tsx
//
// LE GRAPHE DE VOLUME D'UNE PRÉPARATION.
//
// La PREMIÈRE série est en barres, lue sur l'axe de gauche ; les suivantes sont
// des courbes à points, lues sur l'axe de droite. C'est la lecture d'un carnet
// d'entraînement : le volume est une masse hebdomadaire, le dénivelé une
// trajectoire. Deux unités, deux axes — les empiler sur une échelle commune
// écrasait l'une des deux.
//
// Rien n'est écrit dans le frontmatter pour dire quelle série va où : l'ordre
// suffit, et une série de plus n'a pas de réglage à apprendre.
//
// SVG rendu par le serveur : pas de bibliothèque de graphes, pas de JavaScript
// chez le lecteur pour trois barres.

import type { Section } from "@locomotionlab/contenu/sections";

type Preparation = Extract<Section, { type: "preparation" }>;
type Graphe = NonNullable<Preparation["graphe"]>;

export type GrapheProps = { graphe: Graphe };

// Repère du dessin. Le bas laisse la place aux étiquettes inclinées, les côtés
// aux deux axes chiffrés.
const L = 44;
const R = 46;
const HAUT = 14;
const BAS = 40;
const LARGEUR = 720;
const HAUTEUR = 250;
const TRACE_L = LARGEUR - L - R;
const TRACE_H = HAUTEUR - HAUT - BAS;

const GRADUATIONS = 4;

/**
 * Un plafond d'axe qui tombe juste : le plus petit multiple de 1, 2, 2,5 ou 5
 * (fois une puissance de dix) au-dessus du maximum. Un axe qui s'arrête à
 * « 4 837 » ne se lit pas.
 */
function plafond(maximum: number): number {
  if (maximum <= 0) return 1;
  const puissance = 10 ** Math.floor(Math.log10(maximum));
  const reste = maximum / puissance;
  const pas = reste <= 1 ? 1 : reste <= 2 ? 2 : reste <= 2.5 ? 2.5 : reste <= 5 ? 5 : 10;
  return pas * puissance;
}

/** Les nombres à la française : 12 767 et non 12767. */
function lisible(valeur: number): string {
  return Math.round(valeur).toLocaleString("fr-FR").replace(/ | /g, " ");
}

export default function Graphe({ graphe }: GrapheProps) {
  const [barres, ...courbes] = graphe.series;
  if (!barres) return null;

  const points = graphe.abscisse.length;
  const pas = TRACE_L / points;
  const largeurBarre = Math.min(pas * 0.58, 46);

  const hautBarres = plafond(Math.max(...barres.valeurs, 1));
  const hautCourbes = plafond(Math.max(...courbes.flatMap((serie) => serie.valeurs), 1));

  /** Le centre horizontal d'un point d'abscisse. */
  const x = (rang: number) => L + pas * (rang + 0.5);
  const y = (valeur: number, plafondDeLAxe: number) =>
    HAUT + TRACE_H - (valeur / plafondDeLAxe) * TRACE_H;

  const niveaux = Array.from({ length: GRADUATIONS + 1 }, (_, rang) => rang / GRADUATIONS);

  return (
    <figure className="m-0 mt-3.5 overflow-hidden rounded-lg border border-brand-hairline bg-brand-paper px-3 pb-3 pt-4">
      <svg
        viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Volume par semaine : ${graphe.series
          .map((serie) => `${serie.nom} en ${serie.unite}`)
          .join(", ")}`}
      >
        {/* La grille et les deux échelles. */}
        {niveaux.map((part) => {
          const ligne = HAUT + TRACE_H - part * TRACE_H;
          return (
            <g key={part}>
              <line
                x1={L}
                x2={L + TRACE_L}
                y1={ligne}
                y2={ligne}
                stroke="var(--color-brand-hairline)"
                strokeWidth="1"
                strokeDasharray={part === 0 ? undefined : "3 4"}
              />
              <text
                x={L - 8}
                y={ligne + 4}
                textAnchor="end"
                className="fill-brand-muted font-mono text-[11px] tabular-nums"
              >
                {lisible(part * hautBarres)}
              </text>
              {courbes.length > 0 ? (
                <text
                  x={L + TRACE_L + 8}
                  y={ligne + 4}
                  textAnchor="start"
                  className="fill-brand-muted font-mono text-[11px] tabular-nums"
                >
                  {lisible(part * hautCourbes)}
                </text>
              ) : null}
            </g>
          );
        })}

        {barres.valeurs.map((valeur, rang) => {
          const haut = y(valeur, hautBarres);
          return (
            <rect
              key={graphe.abscisse[rang]}
              x={x(rang) - largeurBarre / 2}
              y={haut}
              width={largeurBarre}
              height={Math.max(HAUT + TRACE_H - haut, 0)}
              rx="2"
              fill="var(--color-brand-primary)"
            />
          );
        })}

        {courbes.map((serie) => (
          <g key={serie.nom}>
            <polyline
              points={serie.valeurs.map((v, rang) => `${x(rang)},${y(v, hautCourbes)}`).join(" ")}
              fill="none"
              stroke="var(--color-brand-accent)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {serie.valeurs.map((v, rang) => (
              <circle
                key={graphe.abscisse[rang]}
                cx={x(rang)}
                cy={y(v, hautCourbes)}
                r="4"
                fill="var(--color-brand-deep)"
                stroke="var(--color-brand-paper)"
                strokeWidth="1.5"
              />
            ))}
          </g>
        ))}

        {/* Les étiquettes montent vers leur point : le texte se lit de gauche à
            droite, et l'inclinaison lui coûte le tiers de la place qu'il
            prendrait à la verticale. */}
        {graphe.abscisse.map((point, rang) => (
          <text
            key={point}
            x={x(rang)}
            y={HAUT + TRACE_H + 14}
            textAnchor="end"
            transform={`rotate(-45 ${x(rang)} ${HAUT + TRACE_H + 14})`}
            className="fill-brand-muted font-mono text-[11px]"
          >
            {point}
          </text>
        ))}
      </svg>

      <figcaption className="mt-1 flex flex-wrap gap-4.5 font-mono text-meta text-brand-muted">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-xs bg-brand-primary" aria-hidden="true" />
          {barres.nom} ({barres.unite})
        </span>
        {courbes.map((serie) => (
          <span key={serie.nom} className="inline-flex items-center gap-1.5">
            <i className="h-0.5 w-4 rounded-full bg-brand-accent" aria-hidden="true" />
            <i className="-ml-2.5 h-2 w-2 rounded-full bg-brand-deep" aria-hidden="true" />
            {serie.nom} ({serie.unite})
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
