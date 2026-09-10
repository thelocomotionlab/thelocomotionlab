"use client";

// components/BandeDesPlanches.tsx
//
// LA BANDE DES PLANCHES (108 px) : les vignettes du lot, dans l'ordre du
// carrousel.
//
// Les vignettes seront des rendus RÉELS, pas des icônes de modèle : c'est ce
// qui permet de juger une série d'un coup d'œil, et de voir qu'une planche
// détonne avant de l'avoir publiée.

import { Copy, Plus, Trash2 } from "lucide-react";
import { formatDe, themeDe } from "@locomotionlab/planche";

import { avecPlanches, plancheNeuve } from "@/lib/projet";
import type { PosteDeTravail } from "@/lib/usePosteDeTravail";

/** La hauteur d'une vignette. Les 108 px de la bande doivent porter, en plus,
 *  le cadre de sélection, l'air autour et le libellé sous la vignette. */
const VIGNETTE = 72;

const ACTION =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-brand-soft transition-colors hover:bg-brand-primary/12 hover:text-brand-text motion-reduce:transition-none disabled:opacity-35";

export default function BandeDesPlanches({ poste }: { poste: PosteDeTravail }) {
  const { projet, indexPlanche, setPlanche, modifier } = poste;
  const format = formatDe(projet.format);
  const theme = themeDe(projet.theme);
  const largeur = Math.round((VIGNETTE * format.width) / format.height);

  const ajouter = () =>
    modifier((p) => avecPlanches(p, [...p.planches, plancheNeuve(p)]), {
      libelle: "ajouter une planche",
    });

  const dupliquer = () =>
    modifier(
      (p) => {
        const source = p.planches[indexPlanche];
        if (!source) return p;
        const copie = { ...source, id: `${source.id}-copie-${p.planches.length}` };
        const planches = [...p.planches];
        planches.splice(indexPlanche + 1, 0, copie);
        return avecPlanches(p, planches);
      },
      { libelle: "dupliquer la planche" },
    );

  const supprimer = () =>
    modifier(
      (p) =>
        p.planches.length <= 1
          ? p
          : avecPlanches(
              p,
              p.planches.filter((_, i) => i !== indexPlanche),
            ),
      { libelle: "supprimer la planche" },
    );

  return (
    <footer className="flex h-[108px] shrink-0 items-center gap-2 border-t border-brand-field bg-brand-paper px-2.5">
      <ol className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1">
        {projet.planches.map((planche, i) => (
          <li key={planche.id} className="shrink-0">
            <button
              type="button"
              onClick={() => setPlanche(i)}
              aria-current={i === indexPlanche ? "true" : undefined}
              className={`flex flex-col items-center gap-1 rounded-md border-2 p-0.5 transition-colors motion-reduce:transition-none ${
                i === indexPlanche
                  ? "border-brand-primary-dark"
                  : "border-transparent hover:border-brand-field"
              }`}
            >
              <span
                className="block rounded-sm border border-brand-hairline"
                style={{ width: largeur, height: VIGNETTE, background: theme.fond }}
              />
              <span className="tabulaire text-[10px] leading-none text-brand-muted">
                {String(i + 1).padStart(2, "0")} · {planche.modele}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="flex shrink-0 items-center gap-0.5 border-l border-brand-hairline pl-2">
        <button type="button" onClick={ajouter} title="Ajouter une planche" aria-label="Ajouter une planche" className={ACTION}>
          <Plus size={16} aria-hidden />
        </button>
        <button type="button" onClick={dupliquer} title="Dupliquer" aria-label="Dupliquer la planche" className={ACTION}>
          <Copy size={16} aria-hidden />
        </button>
        <button
          type="button"
          onClick={supprimer}
          disabled={projet.planches.length <= 1}
          title="Supprimer"
          aria-label="Supprimer la planche"
          className={ACTION}
        >
          <Trash2 size={16} aria-hidden />
        </button>
      </div>
    </footer>
  );
}
