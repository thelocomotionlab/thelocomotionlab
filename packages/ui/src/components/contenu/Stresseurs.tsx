// packages/ui/src/components/contenu/Stresseurs.tsx
//
// LES STRESSEURS HORMÉTIQUES D'UNE PRÉPARATION.
//
// Schéma fixe : nom, dose, fréquence, intensité, pourquoi — et, quand il y a
// de quoi le dire, ce qu'on en a fait et le billet qui le raconte. Ce qui n'a
// pas été travaillé est une liste structurée, rendue en pastilles — pas une
// phrase.

import type { Section } from "@locomotionlab/contenu/sections";
import type { BilletDeSeance } from "./LigneSeance.tsx";

type Preparation = Extract<Section, { type: "preparation" }>;
type Stresseurs = NonNullable<Preparation["stresseurs"]>;

export type StresseursProps = {
  stresseurs: Stresseurs;
  /** Les billets par slug — le même dictionnaire que les séances. */
  billets?: Record<string, BilletDeSeance>;
};

// Les colonnes possibles, dans l'ordre. Seules celles que le stresseur
// renseigne sont rendues : une fréquence qui n'a pas lieu d'être n'occupe pas
// une colonne pour y afficher un tiret. « En pratique » prend la place laissée
// par celles qui manquent.
const MESURES = [
  { cle: "dose", libelle: "Dose" },
  { cle: "frequence", libelle: "Fréquence" },
  { cle: "intensite", libelle: "Intensité" },
  { cle: "en_pratique", libelle: "En pratique" },
] as const;

/** Écrites en toutes lettres : une classe fabriquée échappe à Tailwind. */
const COLONNES: Record<number, string> = {
  1: "grid-cols-1 md:w-[19rem]",
  2: "grid-cols-2 md:w-[25rem]",
  3: "grid-cols-3 md:w-[28rem]",
  4: "grid-cols-2 md:grid-cols-4 md:w-[34rem]",
};

export default function Stresseurs({ stresseurs, billets = {} }: StresseursProps) {
  const { travailles, non_travailles: nonTravailles } = stresseurs;

  return (
    <>
      {travailles.length > 0 ? (
        <div className="mt-4 border-t border-brand-hairline">
          {travailles.map((stresseur) => {
            const mesures = MESURES.filter(({ cle }) => stresseur[cle]);
            return (
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
                {stresseur.billet && billets[stresseur.billet] ? (
                  <p className="m-0 mt-2.5">
                    <a
                      href={billets[stresseur.billet]!.url}
                      className="font-mono text-meta font-semibold uppercase tracking-lien text-brand-deep-dark no-underline underline-offset-4 hover:underline"
                    >
                      Lire {billets[stresseur.billet]!.titre}
                    </a>
                  </p>
                ) : null}
              </div>
              {mesures.length > 0 ? (
                <dl className={`m-0 grid divide-x divide-brand-grid ${COLONNES[mesures.length]}`}>
                  {/* Une mesure se lit comme le « pourquoi » d'à côté : même
                      corps, même interligne, même gris. « En pratique » y porte
                      des phrases entières — en petit mono, elles ne faisaient
                      pas le poids face au paragraphe voisin. */}
                  {mesures.map(({ cle, libelle }) => (
                    <div key={cle} className="flex flex-col items-start gap-1.5 px-4 first:pl-0">
                      <dt className="font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
                        {libelle}
                      </dt>
                      <dd className="m-0 font-sans leading-relaxed text-brand-soft [text-wrap:pretty]">
                        {stresseur[cle]}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
            );
          })}
        </div>
      ) : null}

      {nonTravailles.length > 0 ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-2.5 font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
          <span className="mr-1">Non travaillés durant cette prépa</span>
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
