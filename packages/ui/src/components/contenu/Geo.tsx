// packages/ui/src/components/contenu/Geo.tsx
//
// LA SECTION GEO : une carte, un tableau ordonné, un téléchargement.
//
// La carte elle-même arrive en `children` : c'est l'app qui sait la rendre
// (maplibre, profil altimétrique). Les colonnes du tableau sont libres — une
// trace déclare « Repère / km / D+ cumulé », un voyage « Étape / jours / lieu ».

import type { ReactNode } from "react";
import type { Section } from "@locomotionlab/contenu/sections";
import Tableau from "./Tableau.tsx";

export type GeoProps = {
  section: Extract<Section, { type: "geo" }>;
  /** La carte, rendue par l'app. */
  children?: ReactNode;
  /** URL de téléchargement de la trace, quand la section déclare un gpx. */
  gpxUrl?: string;
};

/** Les colonnes chiffrées d'une trace s'alignent à droite. */
function colonnesNumeriques(colonnes: readonly string[]): number[] {
  return colonnes
    .map((colonne, index) => (/km|d\+|d-|dénivelé|jours|altitude/i.test(colonne) ? index : -1))
    .filter((index) => index >= 0);
}

export default function Geo({ section, children, gpxUrl }: GeoProps) {
  return (
    <>
      {children ? (
        <div className="mt-5 overflow-hidden rounded-md border border-brand-hairline">{children}</div>
      ) : null}

      <Tableau
        colonnes={section.colonnes}
        lignes={section.lignes}
        numeriques={colonnesNumeriques(section.colonnes)}
      />

      {section.gpx && gpxUrl ? (
        <a
          href={gpxUrl}
          className="mt-3.5 inline-block border-b border-brand-accent font-mono text-meta font-semibold uppercase tracking-lien text-brand-accent-ink no-underline"
        >
          Télécharger la trace (.gpx)
        </a>
      ) : null}
    </>
  );
}
