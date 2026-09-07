// packages/ui/src/components/contenu/Stresseurs.tsx
//
// LES STRESSEURS HORMÉTIQUES D'UNE PRÉPARATION.
//
// Schéma fixe : nom, dose, fréquence, intensité, pourquoi. Ce qui n'a pas été
// travaillé est une liste structurée, rendue en pastilles — pas une phrase.

import type { Section } from "@locomotionlab/contenu/sections";

type Preparation = Extract<Section, { type: "preparation" }>;
type Stresseurs = NonNullable<Preparation["stresseurs"]>;

export type StresseursProps = { stresseurs: Stresseurs };

const MESURES = [
  { cle: "dose", libelle: "Dose" },
  { cle: "frequence", libelle: "Fréquence" },
  { cle: "intensite", libelle: "Intensité" },
] as const;

export default function Stresseurs({ stresseurs }: StresseursProps) {
  const { travailles, non_travailles: nonTravailles } = stresseurs;

  return (
    <>
      {travailles.length > 0 ? (
        <div className="mt-4 border-t border-brand-hairline">
          {travailles.map((stresseur) => (
            <div
              key={stresseur.nom}
              className="grid items-center gap-x-8 gap-y-4 border-b border-brand-hairline py-5 md:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="min-w-0">
                <span className="font-heading text-lecture font-bold leading-snug">
                  {stresseur.nom}
                </span>
                <p className="mt-2 mb-0 max-w-[62ch] font-sans leading-relaxed text-brand-soft [text-wrap:pretty]">
                  <span className="mr-2.5 font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
                    Pourquoi
                  </span>
                  {stresseur.pourquoi}
                </p>
              </div>
              {/* Les trois mesures en colonnes de largeur fixe : d'un stresseur
                  au suivant, Dose, Fréquence et Intensité restent alignées. */}
              <dl className="m-0 grid grid-cols-3 divide-x divide-brand-grid md:w-[25rem]">
                {MESURES.map(({ cle, libelle }) => (
                  <div
                    key={cle}
                    className="flex flex-col items-center justify-start gap-1.5 px-3 text-center"
                  >
                    <dt className="font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
                      {libelle}
                    </dt>
                    <dd className="m-0 font-mono text-xs leading-snug text-balance">
                      {stresseur[cle]}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      ) : null}

      {nonTravailles.length > 0 ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-2.5 font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
          <span className="mr-1">Non travaillés pour cette campagne</span>
          {nonTravailles.map((nom) => (
            <span
              key={nom}
              className="rounded-xs border border-brand-gauge-full px-2 py-0.5 tracking-pastille text-brand-soft"
            >
              {nom}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}
