// packages/ui/src/components/contenu/Stresseurs.tsx
//
// LES STRESSEURS D'UNE PRÉPARATION.
//
// Schéma fixe : nom, dose, fréquence, intensité, pourquoi — et, quand il y a
// de quoi le dire, ce qu'on en a fait et le billet qui le raconte. Ce qui n'a
// pas été travaillé est une liste structurée, rendue en pastilles — pas une
// phrase.
//
// Le nom coiffe le filet ; sous lui, « Pourquoi » et les mesures renseignées
// sont des colonnes de même nature, donc de même largeur.

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

/** Le libellé d'une colonne, et son texte dessous. */
function Colonne({ libelle, children }: { libelle: string; children: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
        {libelle}
      </dt>
      <dd className="m-0 mt-1.5 font-sans leading-relaxed text-brand-soft [text-wrap:pretty]">
        {children}
      </dd>
    </div>
  );
}

export default function Stresseurs({ stresseurs, billets = {} }: StresseursProps) {
  const { travailles, non_travailles: nonTravailles } = stresseurs;

  return (
    <>
      {travailles.length > 0 ? (
        <div className="mt-5">
          {travailles.map((stresseur) => {
            const billet = stresseur.billet ? billets[stresseur.billet] : undefined;
            return (
              <div key={stresseur.nom} className="mt-8 first:mt-0">
                <h4 className="m-0 font-heading text-lecture font-bold leading-snug">
                  {stresseur.nom}
                </h4>
                {/* Colonnes de largeur égale, quel qu'en soit le nombre : au-delà
                    de deux, elles passent à la ligne plutôt que de se serrer. */}
                <dl className="m-0 mt-2.5 grid gap-x-8 gap-y-5 border-t border-brand-hairline pt-4 md:grid-cols-[repeat(auto-fit,minmax(min(18rem,100%),1fr))]">
                  <Colonne libelle="Pourquoi">{stresseur.pourquoi}</Colonne>
                  {MESURES.filter(({ cle }) => stresseur[cle]).map(({ cle, libelle }) => (
                    <Colonne key={cle} libelle={libelle}>
                      {stresseur[cle]!}
                    </Colonne>
                  ))}
                </dl>
                {billet ? (
                  <p className="m-0 mt-3.5">
                    <a
                      href={billet.url}
                      className="font-mono text-meta font-semibold uppercase tracking-lien text-brand-deep-dark no-underline underline-offset-4 hover:underline"
                    >
                      Lire {billet.titre}
                    </a>
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {nonTravailles.length > 0 ? (
        <div className="mt-7 flex flex-wrap items-center gap-2.5 font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
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
