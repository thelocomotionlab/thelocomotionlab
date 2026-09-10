"use client";

// components/TiroirModeles.tsx
//
// LA GALERIE DES MODÈLES.
//
// Un modèle n'est pas un gabarit : c'est un POINT DE DÉPART. Il pose des
// éléments aux positions de la charte, après quoi tout se déplace. Choisir un
// modèle sur une planche déjà écrite la RECOMPOSE sans rien perdre — les
// contenus sont repris par rôle.
//
// Les vignettes seront des rendus réels dans le format et le thème du projet.
// Une image fixe mentirait dès qu'on change de thème, et c'est précisément la
// question qu'on se pose en choisissant.

import { modelesPour } from "@locomotionlab/planche";

import { avecModele, plancheNeuve } from "@/lib/projet";
import { avecPlanches } from "@/lib/projet";
import type { PosteDeTravail } from "@/lib/usePosteDeTravail";

export default function TiroirModeles({ poste }: { poste: PosteDeTravail }) {
  const { projet, indexPlanche, modifier, setPlanche } = poste;
  const modeles = modelesPour(projet.format);
  const courant = poste.plancheCourante?.modele ?? null;

  return (
    <div className="px-3.5 py-3">
      <p className="mb-2.5 text-[12px] text-brand-muted">
        Le modèle recompose la planche courante sans perdre ce qui est écrit.
      </p>
      <ul className="grid grid-cols-2 gap-2">
        {modeles.map((m) => (
          <li key={m.cle}>
            <button
              type="button"
              title={m.aide}
              onClick={() =>
                modifier((p) => avecModele(p, indexPlanche, m.cle), {
                  libelle: `passer en « ${m.label} »`,
                })
              }
              aria-current={courant === m.cle ? "true" : undefined}
              className={`flex w-full flex-col items-start gap-1 rounded-md border p-2 text-left transition-colors motion-reduce:transition-none ${
                courant === m.cle
                  ? "border-brand-primary-dark bg-brand-primary/10"
                  : "border-brand-field hover:bg-brand-primary/8"
              }`}
            >
              <span className="text-[13px] font-medium">{m.label}</span>
              <span className="line-clamp-2 text-[11px] leading-snug text-brand-muted">
                {m.aide}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() =>
          modifier(
            (p) => {
              const planches = [...p.planches, plancheNeuve(p, "etape")];
              // On saute sur la planche qu'on vient de créer : la créer sans y
              // aller obligerait à la chercher dans la bande.
              queueMicrotask(() => setPlanche(planches.length - 1));
              return avecPlanches(p, planches);
            },
            { libelle: "ajouter une planche de journée" },
          )
        }
        className="mt-3 w-full rounded-md border border-brand-field px-3 py-2 text-[13px] transition-colors hover:bg-brand-primary/10 motion-reduce:transition-none"
      >
        + Planche de journée
      </button>

      <p className="mt-3 text-[11px] leading-snug text-brand-muted">
        {projet.donnees.trace
          ? `Trace : ${projet.donnees.trace.nom ?? "sans nom"}.`
          : "Aucune trace chargée — les modèles Carte et Journées resteront vides."}
      </p>
    </div>
  );
}
