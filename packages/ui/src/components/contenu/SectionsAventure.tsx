// packages/ui/src/components/contenu/SectionsAventure.tsx
//
// LA PAGE AVENTURE : la liste ordonnée des sections, rendue dans l'ordre.
//
// Une aventure n'a pas de gabarit. Ce composant parcourt le tableau `sections`
// et rend, pour chacune, le corps de son type dans l'enveloppe numérotée. Le
// numéro vient de l'index, l'ancre du slug de la section : une page à trois
// sections a l'air finie, et insérer une section en tête renumérote tout sans
// déplacer une seule ancre.
//
// Ce que le composant ne sait pas rendre lui-même — une carte, un replay, un
// paquetage lu sur disque, le corps MDX d'une section libre — arrive dans
// `rendus`, fourni par l'app.

import type { ReactNode } from "react";
import type { Section } from "@locomotionlab/contenu/sections";
import type { CarteDeBloc as DonneesDeCarte } from "@locomotionlab/contenu/resolveur";

import SectionAventure from "./SectionAventure.tsx";
import Caracteristiques from "./Caracteristiques.tsx";
import Geo from "./Geo.tsx";
import Preparation from "./Preparation.tsx";
import Paquetage from "./Paquetage.tsx";
import type { DonneesDePaquetage } from "./Paquetage.tsx";
import Nutrition from "./Nutrition.tsx";
import SectionLibre from "./SectionLibre.tsx";
import Direct from "./Direct.tsx";
import CarteRecit from "./CarteRecit.tsx";
import type { CarteRecitProps } from "./CarteRecit.tsx";
import type { BilletDeSeance } from "./LigneSeance.tsx";
import type { ReglageDuDirect } from "./Direct.tsx";

export type RendusDAventure = {
  /** La carte de la section geo, et l'URL de sa trace. */
  geo?: { carte?: ReactNode; gpxUrl?: string };
  /** Les billets de la dernière colonne des séances, par slug. */
  billets?: Record<string, BilletDeSeance>;
  /** Les blocs de `preparation.protocoles`, résolus dans l'index. */
  protocoles?: readonly DonneesDeCarte[];
  /** Les jeux de données de paquetage, par `ref`. */
  paquetages?: Record<
    string,
    { paquetage: DonneesDePaquetage; csvUrl?: string; provenance?: ReactNode }
  >;
  /** Les corps de section écrits dans le MDX, par `id`. Une section libre y
   *  puise tout son contenu ; une section structurée qui déclare un `id` y
   *  puise le texte qui présente son tableau. */
  libres?: Record<string, { corps: ReactNode; media?: ReactNode; cote?: "droite" | "gauche"; suite?: ReactNode }>;
  /** Le replay, la version et les réglages du direct. */
  direct?: { replay?: ReactNode; version?: ReactNode; reglages?: readonly ReglageDuDirect[] };
  /** La carte du récit, résolue depuis le champ `recit` du frontmatter. */
  recit?: CarteRecitProps;
};

export type SectionsAventureProps = {
  sections: readonly Section[];
  rendus?: RendusDAventure;
};

function corpsDeSection(section: Section, rendus: RendusDAventure): ReactNode {
  switch (section.type) {
    case "caracteristiques":
      return <Caracteristiques section={section} />;

    case "geo":
      return (
        <Geo section={section} gpxUrl={rendus.geo?.gpxUrl}>
          {rendus.geo?.carte}
        </Geo>
      );

    case "preparation":
      return (
        <Preparation
          section={section}
          billets={rendus.billets}
          protocoles={rendus.protocoles}
        />
      );

    case "paquetage": {
      const donnees = rendus.paquetages?.[section.ref];
      return donnees ? (
        <Paquetage
          paquetage={donnees.paquetage}
          csvUrl={donnees.csvUrl}
          provenance={donnees.provenance}
        />
      ) : null;
    }

    case "nutrition":
      return <Nutrition section={section} />;

    case "libre": {
      const libre = rendus.libres?.[section.id];
      return libre ? (
        <SectionLibre media={libre.media} cote={libre.cote} suite={libre.suite}>
          {libre.corps}
        </SectionLibre>
      ) : null;
    }

    case "direct":
      return (
        <Direct version={rendus.direct?.version} reglages={rendus.direct?.reglages}>
          {rendus.direct?.replay}
        </Direct>
      );

    case "recit":
      return rendus.recit ? <CarteRecit {...rendus.recit} /> : null;
  }
}

/**
 * Le texte qui présente une section structurée : les chiffres d'une trace, d'un
 * paquetage ou d'une nutrition ne disent pas pourquoi ils sont là. La section
 * déclare un `id`, le MDX écrit un `<SectionLibre>` du même id, et la prose se
 * rend au-dessus du tableau — le même mécanisme que les sections libres, sans
 * composant de plus.
 */
function introDeSection(section: Section, rendus: RendusDAventure): ReactNode {
  if (section.type === "libre" || !section.id) return null;
  return rendus.libres?.[section.id]?.corps ?? null;
}

export default function SectionsAventure({ sections, rendus = {} }: SectionsAventureProps) {
  return (
    <>
      {sections.map((section, index) => {
        const intro = introDeSection(section, rendus);
        return (
          <SectionAventure
            key={`${section.type}-${section.id ?? index}`}
            section={section}
            index={index}
          >
            {intro ? <div className="mt-5">{intro}</div> : null}
            {corpsDeSection(section, rendus)}
          </SectionAventure>
        );
      })}
    </>
  );
}
