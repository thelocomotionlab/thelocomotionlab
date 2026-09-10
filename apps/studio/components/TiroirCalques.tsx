"use client";

// components/TiroirCalques.tsx
//
// LES CALQUES : la liste ordonnée des éléments de la planche.
//
// C'est LE SEUL CHEMIN CLAVIER vers un élément recouvert. Un titre posé sous une
// photo plein cadre n'est atteignable ni à la souris ni au doigt ; sans cette
// liste il serait perdu, et « masquer » serait un piège sans retour.
//
// L'ORDRE DU TABLEAU EST L'ORDRE DES CALQUES, du fond vers l'avant. La liste
// l'affiche donc À L'ENVERS : on lit ce qui est devant en premier, comme on le
// voit.

import { ChevronDown, ChevronUp, Eye, EyeOff, Lock, LockOpen, Trash2 } from "lucide-react";
import type { Element, PlancheImage, Projet } from "@locomotionlab/planche";

import { avecOrdre, sansSelection, surSelection } from "@/lib/projet";
import type { PosteDeTravail } from "@/lib/usePosteDeTravail";

const NOMS: Record<Element["type"], string> = {
  texte: "Texte",
  photo: "Photo",
  forme: "Forme",
  icone: "Icône",
  marque: "Marque",
  carte: "Carte",
  profil: "Profil",
  stat: "Chiffre",
  fiche: "Fiche",
  cases: "Journées",
};

/** Ce qu'on lit dans la liste : le contenu s'il y en a, le type sinon. */
function etiquette(e: Element): string {
  if (e.type === "texte" && e.contenu.trim()) {
    const nu = e.contenu.replace(/[*_~[\]]/g, "").trim();
    return nu.length > 28 ? `${nu.slice(0, 28)}…` : nu;
  }
  return e.nom || NOMS[e.type];
}

const ACTION =
  "inline-flex h-6 w-6 items-center justify-center rounded text-brand-muted transition-colors hover:bg-brand-primary/15 hover:text-brand-text motion-reduce:transition-none";

export default function TiroirCalques({ poste }: { poste: PosteDeTravail }) {
  const { selection, setSelection, modifier, indexPlanche } = poste;
  const planche: PlancheImage | null =
    poste.plancheCourante?.type === "image" ? poste.plancheCourante : null;
  if (!planche) return null;

  const dessus = [...planche.elements].reverse();

  const regler = (id: string, transforme: (e: Element) => Element, libelle: string) =>
    modifier((p: Projet) => surSelection(p, indexPlanche, [id], transforme), { libelle });

  return (
    <div className="px-2 py-2">
      <p className="mb-2 px-1.5 text-[11px] leading-snug text-brand-muted">
        Du plus en avant au plus au fond. Le seul chemin vers un élément
        recouvert.
      </p>
      <ol className="space-y-0.5">
        {dessus.map((e) => {
          const pris = selection.includes(e.id);
          return (
            <li key={e.id}>
              <div
                className={`group flex items-center gap-1 rounded-md px-1.5 py-1 ${
                  pris ? "bg-brand-primary/15" : "hover:bg-brand-primary/8"
                }`}
              >
                <button
                  type="button"
                  onClick={(ev) =>
                    setSelection(
                      ev.shiftKey
                        ? pris
                          ? selection.filter((id) => id !== e.id)
                          : [...selection, e.id]
                        : [e.id],
                    )
                  }
                  aria-current={pris ? "true" : undefined}
                  className={`min-w-0 flex-1 truncate text-left text-[12px] ${
                    e.masque ? "text-brand-muted line-through" : "text-brand-text"
                  }`}
                >
                  <span className="text-brand-muted">{NOMS[e.type]} · </span>
                  {etiquette(e)}
                </button>

                <button
                  type="button"
                  title="Monter d'un calque"
                  aria-label={`Monter ${etiquette(e)}`}
                  onClick={() =>
                    modifier((p: Projet) => avecOrdre(p, indexPlanche, e.id, "devant"), {
                      libelle: "monter d'un calque",
                    })
                  }
                  className={ACTION}
                >
                  <ChevronUp size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  title="Descendre d'un calque"
                  aria-label={`Descendre ${etiquette(e)}`}
                  onClick={() =>
                    modifier((p: Projet) => avecOrdre(p, indexPlanche, e.id, "derriere"), {
                      libelle: "descendre d'un calque",
                    })
                  }
                  className={ACTION}
                >
                  <ChevronDown size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  title={e.masque ? "Montrer" : "Masquer"}
                  aria-label={`${e.masque ? "Montrer" : "Masquer"} ${etiquette(e)}`}
                  onClick={() => regler(e.id, (x) => ({ ...x, masque: !x.masque }), "masquer")}
                  className={ACTION}
                >
                  {e.masque ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                </button>
                <button
                  type="button"
                  title={e.verrouille ? "Déverrouiller" : "Verrouiller"}
                  aria-label={`${e.verrouille ? "Déverrouiller" : "Verrouiller"} ${etiquette(e)}`}
                  onClick={() =>
                    regler(e.id, (x) => ({ ...x, verrouille: !x.verrouille }), "verrouiller")
                  }
                  className={ACTION}
                >
                  {e.verrouille ? <Lock size={14} aria-hidden /> : <LockOpen size={14} aria-hidden />}
                </button>
                <button
                  type="button"
                  title="Supprimer"
                  aria-label={`Supprimer ${etiquette(e)}`}
                  onClick={() => {
                    modifier((p: Projet) => sansSelection(p, indexPlanche, [e.id]), {
                      libelle: "supprimer",
                    });
                    setSelection(selection.filter((id) => id !== e.id));
                  }}
                  className={ACTION}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {dessus.length === 0 && (
        <p className="px-1.5 py-3 text-[12px] text-brand-muted">
          Cette planche est vide. Choisis un modèle.
        </p>
      )}
    </div>
  );
}
