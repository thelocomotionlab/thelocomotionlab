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

const MESURES = [
  { cle: "dose", libelle: "Dose" },
  { cle: "frequence", libelle: "Fréquence" },
  { cle: "intensite", libelle: "Intensité" },
] as const;

export default function Stresseurs({ stresseurs, billets = {} }: StresseursProps) {
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
                {/* Ce qui a réellement été fait, sous l'intention : les trois
                    mesures donnent des ordres de grandeur, celle-ci le geste. */}
                {stresseur.en_pratique ? (
                  <p className="mt-2 mb-0 max-w-[62ch] font-sans leading-relaxed text-brand-ink [text-wrap:pretty]">
                    <span className="mr-2.5 font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
                      En pratique
                    </span>
                    {stresseur.en_pratique}
                  </p>
                ) : null}
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
              {/* Les mesures renseignées, en colonnes de largeur fixe : d'un
                  stresseur au suivant, elles restent alignées. Un stresseur qui
                  n'en déclare aucune n'a pas de colonne vide. */}
              {MESURES.some(({ cle }) => stresseur[cle]) ? (
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
                        {stresseur[cle] ?? <span className="text-brand-faint">—</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          ))}
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
