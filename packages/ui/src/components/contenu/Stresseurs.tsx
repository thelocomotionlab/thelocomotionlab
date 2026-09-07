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
            <div key={stresseur.nom} className="grid gap-2.5 border-b border-brand-hairline py-4.5">
              <div className="flex flex-wrap items-baseline justify-between gap-6">
                <span className="font-heading text-lecture font-bold leading-snug">
                  {stresseur.nom}
                </span>
                <div className="flex flex-wrap gap-7">
                  {MESURES.map(({ cle, libelle }) => (
                    <div key={cle} className="grid gap-1">
                      <span className="font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
                        {libelle}
                      </span>
                      <span className="font-mono text-xs leading-snug">
                        {stresseur[cle]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="m-0 max-w-[64ch] font-lora leading-relaxed text-brand-soft [text-wrap:pretty]">
                <span className="mr-2.5 font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
                  Pourquoi
                </span>
                {stresseur.pourquoi}
              </p>
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
