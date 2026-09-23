"use client";

// components/BandeDesPlanches.tsx
//
// LA BANDE DES PLANCHES (108 px) : les vignettes du lot, dans l'ordre du
// carrousel.
//
// Les vignettes seront des rendus RÉELS, pas des icônes de modèle : c'est ce
// qui permet de juger une série d'un coup d'œil, et de voir qu'une planche
// détonne avant de l'avoir publiée.

import { useState } from "react";
import { ArrowLeft, ArrowRight, Copy, Plus, RotateCcw, Trash2 } from "lucide-react";
import { formatDe, themeDe, type Planche } from "@locomotionlab/planche";

import {
  avecPlancheDeplacee,
  avecPlanches,
  plancheNeuve,
  remiseAuModele,
  sansPlanche,
} from "@/lib/projet";
import type { PosteDeTravail } from "@/lib/usePosteDeTravail";

/** La hauteur d'une vignette. Les 108 px de la bande doivent porter, en plus,
 *  le cadre de sélection, l'air autour et le libellé sous la vignette. */
const VIGNETTE = 72;

const ACTION =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-brand-soft transition-colors hover:bg-brand-primary/12 hover:text-brand-text motion-reduce:transition-none disabled:opacity-35";

/**
 * Ce qu'on lit sous la vignette.
 *
 * Une planche de journée se reconnaît à sa journée, pas à son modèle : douze
 * vignettes marquées « etape » ne se distinguent pas les unes des autres.
 */
/**
 * L'interstice sous le pointeur : 0 avant la première vignette, n après la
 * dernière. Compté sur les CENTRES des vignettes plutôt que sur celle qu'on
 * survole : entre deux vignettes, le pointeur ne survole que la bande, et la
 * fente sauterait au bout du lot.
 */
function fenteSous(bande: HTMLElement, x: number): number {
  return [...bande.querySelectorAll<HTMLElement>("[data-rang]")].filter((v) => {
    const r = v.getBoundingClientRect();
    return r.left + r.width / 2 < x;
  }).length;
}

function legende(planche: Planche): string {
  if (planche.type !== "image" || planche.tranche.mode === "toutes") {
    return planche.type === "image" ? planche.modele : "survol";
  }
  const jour = `J${planche.tranche.jour + 1}`;
  return planche.tranche.mode === "seule" ? jour : `→ ${jour}`;
}

export default function BandeDesPlanches({
  poste,
  compact = false,
}: {
  poste: PosteDeTravail;
  /** Sur téléphone : une seule ligne, sans les actions — la place manque. */
  compact?: boolean;
}) {
  const { projet, indexPlanche, setPlanche, modifier } = poste;
  const format = formatDe(projet.format);
  const theme = themeDe(projet.theme);
  const hauteur = compact ? 34 : VIGNETTE;
  const largeur = Math.round((hauteur * format.width) / format.height);

  // ON SAUTE SUR LA PLANCHE QU'ON VIENT DE POSER. La créer sans y aller
  // obligerait à la chercher dans la bande, puis à revenir : les deux gestes
  // qu'on croyait avoir évités en cliquant sur « + ».
  const ajouter = () =>
    modifier(
      (p) => {
        queueMicrotask(() => setPlanche(p.planches.length));
        return avecPlanches(p, [...p.planches, plancheNeuve(p)]);
      },
      { libelle: "ajouter une planche" },
    );

  const dupliquer = () =>
    modifier(
      (p) => {
        const source = p.planches[indexPlanche];
        if (!source) return p;
        const copie = { ...source, id: `${source.id}-copie-${p.planches.length}` };
        const planches = [...p.planches];
        planches.splice(indexPlanche + 1, 0, copie);
        queueMicrotask(() => setPlanche(indexPlanche + 1));
        return avecPlanches(p, planches);
      },
      { libelle: "dupliquer la planche" },
    );

  const supprimer = () =>
    modifier(
      (p) => {
        // La dernière planche se supprime aussi : elle revient neuve, au même
        // modèle. Sinon il fallait en ajouter une pour pouvoir jeter celle-là.
        queueMicrotask(() => setPlanche(Math.max(0, indexPlanche - 1)));
        return sansPlanche(p, indexPlanche);
      },
      { libelle: "supprimer la planche" },
    );

  const remettre = () =>
    modifier((p) => remiseAuModele(p, indexPlanche), { libelle: "remettre le modèle" });

  // LA PLANCHE DÉPLACÉE DEVIENT LA COURANTE : on vient de la prendre en main,
  // et la pagination qu'elle porte dit aussitôt son nouveau rang.
  const deplacer = (de: number, vers: number) => {
    if (vers === de || vers < 0 || vers >= projet.planches.length) return;
    modifier(
      (p) => {
        queueMicrotask(() => setPlanche(vers));
        return avecPlancheDeplacee(p, de, vers);
      },
      { libelle: "déplacer la planche" },
    );
  };

  // LE GLISSER-DÉPOSER : la vignette tirée, et l'interstice où elle tomberait.
  const [tiree, setTiree] = useState<number | null>(null);
  const [fente, setFente] = useState<number | null>(null);
  const lacher = () => {
    setTiree(null);
    setFente(null);
  };
  // Les deux interstices qui bordent la vignette tirée la laisseraient en place.
  const fenteUtile = tiree !== null && fente !== null && fente !== tiree && fente !== tiree + 1;

  return (
    <footer
      className={`flex shrink-0 items-center gap-2 border-brand-field bg-brand-paper px-2.5 ${
        compact ? "h-14 border-b" : "h-[108px] border-t"
      }`}
    >
      <ol
        className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1"
        onDragOver={(e) => {
          // Seule une vignette de la bande se range ici : une photo tirée du
          // bureau n'a rien à y faire.
          if (tiree === null) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setFente(fenteSous(e.currentTarget, e.clientX));
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFente(null);
        }}
        onDrop={(e) => {
          if (tiree === null) return;
          e.preventDefault();
          const f = fenteSous(e.currentTarget, e.clientX);
          deplacer(tiree, f > tiree ? f - 1 : f);
          lacher();
        }}
      >
        {projet.planches.map((planche, i) => (
          <li key={planche.id} data-rang={i} className="relative shrink-0">
            {fenteUtile && fente === i && <Fente cote="avant" />}
            {fenteUtile && fente === i + 1 && i === projet.planches.length - 1 && (
              <Fente cote="apres" />
            )}
            <button
              type="button"
              draggable={!compact}
              onDragStart={(e) => {
                setTiree(i);
                e.dataTransfer.effectAllowed = "move";
                // Firefox ne commence aucun glissé sans donnée attachée.
                e.dataTransfer.setData("text/plain", String(i + 1));
              }}
              onDragEnd={lacher}
              onClick={() => setPlanche(i)}
              aria-current={i === indexPlanche ? "true" : undefined}
              title={compact ? undefined : "Glisse la vignette pour changer l'ordre"}
              className={`flex flex-col items-center gap-1 rounded-md border-2 p-0.5 transition-colors motion-reduce:transition-none ${
                i === indexPlanche
                  ? "border-brand-primary-dark"
                  : "border-transparent hover:border-brand-field"
              } ${tiree === i ? "opacity-40" : ""}`}
            >
              <span
                className="block rounded-sm border border-brand-hairline"
                style={{ width: largeur, height: hauteur, background: theme.fond }}
              />
              <span className="tabulaire text-[10px] leading-none text-brand-muted">
                {String(i + 1).padStart(2, "0")} · {legende(planche)}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div
        className={`flex shrink-0 items-center gap-0.5 border-l border-brand-hairline pl-2 ${
          compact ? "hidden" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => deplacer(indexPlanche, indexPlanche - 1)}
          disabled={indexPlanche <= 0}
          title="Déplacer la planche à gauche"
          aria-label="Déplacer la planche à gauche"
          className={ACTION}
        >
          <ArrowLeft size={16} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => deplacer(indexPlanche, indexPlanche + 1)}
          disabled={indexPlanche >= projet.planches.length - 1}
          title="Déplacer la planche à droite"
          aria-label="Déplacer la planche à droite"
          className={ACTION}
        >
          <ArrowRight size={16} aria-hidden />
        </button>
        <span className="mx-0.5 h-5 w-px bg-brand-hairline" aria-hidden />
        <button type="button" onClick={ajouter} title="Ajouter une planche" aria-label="Ajouter une planche" className={ACTION}>
          <Plus size={16} aria-hidden />
        </button>
        <button type="button" onClick={dupliquer} title="Dupliquer" aria-label="Dupliquer la planche" className={ACTION}>
          <Copy size={16} aria-hidden />
        </button>
        <button
          type="button"
          onClick={remettre}
          disabled={poste.plancheCourante?.type !== "image"}
          title="Remettre le modèle — les positions reviennent à la charte, le texte reste"
          aria-label="Remettre le modèle"
          className={ACTION}
        >
          <RotateCcw size={16} aria-hidden />
        </button>
        <button
          type="button"
          onClick={supprimer}
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

/** Le trait qui montre où la vignette tombera, dans l'air entre deux vignettes. */
function Fente({ cote }: { cote: "avant" | "apres" }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute top-0 bottom-0 w-[3px] rounded-full bg-brand-primary-dark ${
        cote === "avant" ? "-left-[5.5px]" : "-right-[5.5px]"
      }`}
    />
  );
}
