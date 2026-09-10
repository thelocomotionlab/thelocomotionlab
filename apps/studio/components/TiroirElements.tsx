"use client";

// components/TiroirElements.tsx
//
// LES FORMES, LES ICÔNES, LA MARQUE, ET CE QUI SE BRANCHE SUR LA TRACE.
//
// Le FILET AMBRE de la charte y est une forme à part entière, posable n'importe
// où : en v1 il n'existait qu'accroché à un surtitre, alors qu'il sert aussi
// bien à séparer deux blocs ou à souligner une ligne.
//
// LES ÉLÉMENTS LIÉS AUX DONNÉES — carte, profil, cases de journées — sont ce
// qu'aucun outil de mise en page généraliste ne sait faire : on les pose, ils se
// remplissent depuis la trace, et ils suivent la tranche de journées de la
// planche.

import { useState } from "react";
import { CLES_ICONES } from "@locomotionlab/ui/icones";
import {
  carteNeuve,
  casesNeuves,
  filetNeuf,
  formeNeuve,
  iconeNeuve,
  marqueNeuve,
  profilNeuf,
} from "@locomotionlab/planche";
import type { Element, PlancheImage, Projet } from "@locomotionlab/planche";

import { avecPlanches } from "@/lib/projet";
import { VOCABULAIRE } from "@/lib/icones";
import type { PosteDeTravail } from "@/lib/usePosteDeTravail";

/** Sans accent et sans casse : « col » trouve « col », « Col » et « côl ». */
const nu = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036F]/g, "");

const BOUTON =
  "rounded-md border border-brand-field px-2 py-1.5 text-[12px] transition-colors hover:bg-brand-primary/10 motion-reduce:transition-none";

export default function TiroirElements({ poste }: { poste: PosteDeTravail }) {
  const { indexPlanche, modifier, setSelection, projet } = poste;
  const [filtre, setFiltre] = useState("");
  const planche: PlancheImage | null =
    poste.plancheCourante?.type === "image" ? poste.plancheCourante : null;

  function poser(element: Element) {
    modifier(
      (p: Projet) => {
        const courante = p.planches[indexPlanche];
        if (!courante || courante.type !== "image") return p;
        const planches = [...p.planches];
        planches[indexPlanche] = { ...courante, elements: [...courante.elements, element] };
        return avecPlanches(p, planches);
      },
      { libelle: "poser un élément" },
    );
    queueMicrotask(() => setSelection([element.id]));
  }

  const cles = filtre
    ? CLES_ICONES.filter((c) => nu(c).includes(nu(filtre)))
    : CLES_ICONES;

  const aTrace = projet.donnees.trace !== null;
  const aCarte = (planche?.elements ?? []).some((e) => e.type === "carte");

  return (
    <div className="space-y-4 px-3.5 py-3">
      <section>
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
          Formes
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className={BOUTON}
            onClick={() => poser(formeNeuve({ x: 0.2, y: 0.4, l: 0.6, h: 0.2 }))}
          >
            Rectangle
          </button>
          <button
            type="button"
            className={BOUTON}
            onClick={() =>
              poser(formeNeuve({ x: 0.3, y: 0.4, l: 0.4, h: 0.32 }, { forme: "cercle" }))
            }
          >
            Cercle
          </button>
          <button
            type="button"
            className={BOUTON}
            onClick={() =>
              poser(formeNeuve({ x: 0.06, y: 0.5, l: 0.88, h: 0.002 }, { forme: "ligne" }))
            }
          >
            Ligne
          </button>
          <button
            type="button"
            title="Le filet de la charte, à son épaisseur — posable n'importe où"
            className={BOUTON}
            onClick={() => poser(filetNeuf({ x: 0.06, y: 0.5, l: 0.1, h: 0.0074 }))}
          >
            Filet ambre
          </button>
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
          Marque
        </h3>
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              ["logo-nom", "Logo + nom"],
              ["logo", "Logo"],
              ["cercle", "Cerclée"],
            ] as const
          ).map(([variante, label]) => (
            <button
              key={variante}
              type="button"
              className={BOUTON}
              onClick={() =>
                poser(
                  marqueNeuve(
                    variante === "cercle"
                      ? { x: 0.35, y: 0.35, l: 0.3, h: 0.24 }
                      : { x: 0.06, y: 0.06, l: 0.48, h: 0.031 },
                    { variante },
                  ),
                )
              }
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
          Données
        </h3>
        {!aTrace && (
          <p className="mb-1.5 text-[11px] leading-snug text-brand-muted">
            Aucune trace chargée : ces éléments se poseront vides.
          </p>
        )}
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            className={BOUTON}
            onClick={() => poser(carteNeuve({ x: 0.06, y: 0.3, l: 0.88, h: 0.36 }))}
          >
            Carte
          </button>
          <button
            type="button"
            className={BOUTON}
            onClick={() => poser(profilNeuf({ x: 0.06, y: 0.7, l: 0.88, h: 0.11 }))}
          >
            Profil
          </button>
          <button
            type="button"
            className={BOUTON}
            onClick={() => poser(casesNeuves({ x: 0.06, y: 0.3, l: 0.88, h: 0.4 }))}
          >
            Journées
          </button>
        </div>
        {aCarte && (
          <p className="mt-1.5 text-[11px] leading-snug text-brand-muted">
            La carte suit la tranche de journées de la planche.
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
          Icônes ({CLES_ICONES.length})
        </h3>
        <label className="sr-only" htmlFor="filtre-icones">
          Filtrer les icônes
        </label>
        <input
          id="filtre-icones"
          type="search"
          value={filtre}
          onChange={(e) => setFiltre(e.target.value)}
          placeholder="col, sac, eau…"
          className="w-full rounded-md border border-brand-field bg-brand-bg px-2 py-1.5 text-[13px]"
        />
        <ul className="mt-2 grid grid-cols-6 gap-1">
          {cles.map((cle) => (
            <li key={cle}>
              <button
                type="button"
                title={cle}
                aria-label={cle}
                onClick={() => poser(iconeNeuve({ x: 0.45, y: 0.45, l: 0.1, h: 0.08 }, cle))}
                className="flex aspect-square w-full items-center justify-center rounded border border-brand-field transition-colors hover:bg-brand-primary/12 motion-reduce:transition-none"
              >
                <Pictogramme cle={cle} />
              </button>
            </li>
          ))}
        </ul>
        {cles.length === 0 && (
          <p className="mt-2 text-[12px] text-brand-muted">Aucune icône de ce nom.</p>
        )}
      </section>
    </div>
  );
}

/**
 * L'aperçu d'une icône, tracé sur un petit canvas.
 *
 * Le même code que le rendu d'une planche : ce qu'on voit dans la palette est
 * exactement ce qui sera dessiné.
 */
function Pictogramme({ cle }: { cle: string }) {
  const peindre = (c: HTMLCanvasElement | null) => {
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    VOCABULAIRE.dessiner(ctx, cle, 3, 3, c.width - 6, "#4B5563");
  };
  return <canvas ref={peindre} width={28} height={28} aria-hidden className="block" />;
}
