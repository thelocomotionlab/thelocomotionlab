"use client";

// components/TiroirTexte.tsx
//
// POSER DU TEXTE, ET LES TROIS STYLES DE LA CHARTE.
//
// Le rail sert à AJOUTER ; l'inspecteur, à régler ce qui est sélectionné. Ici on
// pose — un titre, un surtitre, un paragraphe, une liste, un chiffre, une fiche.
//
// LES TROIS STYLES sont la hiérarchie du compte : surtitre en capitales
// espacées ouvertes d'un filet ambre, titre en 700, corps régulier et aéré. Les
// appliquer d'un clic est ce qui fait qu'un carrousel de douze planches se lit
// comme un tout — et « Propager » l'étend à toutes les planches d'un coup, ce
// qui n'était pas annulable en v1 et l'est ici.

import { ficheNeuve, statNeuve, styleDuRole, texteNeuf } from "@locomotionlab/planche";
import type { Element, ElementTexte, PlancheImage, Projet, RoleTexte } from "@locomotionlab/planche";

import { avecPlanches, surSelection } from "@/lib/projet";
import type { PosteDeTravail } from "@/lib/usePosteDeTravail";

/** Ce qu'on peut poser, et le texte d'exemple qui dit à quoi ça sert. */
const A_POSER: { cle: string; label: string; aide: string; fabriquer: () => Element }[] = [
  {
    cle: "titre",
    label: "Titre",
    aide: "700, deux lignes au plus.",
    fabriquer: () => texteNeuf({ x: 0.06, y: 0.4, l: 0.88, h: 0.12 }, "Un titre", "titre"),
  },
  {
    cle: "surtitre",
    label: "Surtitre",
    aide: "Capitales espacées, filet ambre.",
    fabriquer: () => texteNeuf({ x: 0.06, y: 0.34, l: 0.88, h: 0.04 }, "un surtitre", "surtitre"),
  },
  {
    cle: "paragraphe",
    label: "Paragraphe",
    aide: "Régulier, aéré.",
    fabriquer: () => texteNeuf({ x: 0.06, y: 0.55, l: 0.88, h: 0.16 }, "Un paragraphe.", "corps"),
  },
  {
    cle: "liste",
    label: "Liste",
    aide: "Un tiret par point ; « - :sac: » met une icône en puce.",
    fabriquer: () =>
      texteNeuf({ x: 0.06, y: 0.55, l: 0.88, h: 0.18 }, "- eau\n- bois\n- feu", "corps"),
  },
  {
    cle: "chiffre",
    label: "Chiffre",
    aide: "Une variable et son unité.",
    fabriquer: () => statNeuve({ x: 0.06, y: 0.5, l: 0.3, h: 0.12 }, "distance", "km"),
  },
  {
    cle: "fiche",
    label: "Fiche",
    aide: "Libellés à gauche, valeurs à droite.",
    fabriquer: () => ficheNeuve({ x: 0.06, y: 0.5, l: 0.88, h: 0.24 }),
  },
];

const STYLES: { role: RoleTexte; label: string }[] = [
  { role: "surtitre", label: "Surtitre" },
  { role: "titre", label: "Titre" },
  { role: "corps", label: "Corps" },
];

const CARTE =
  "w-full rounded-md border border-brand-field p-2 text-left transition-colors hover:bg-brand-primary/8 motion-reduce:transition-none";

export default function TiroirTexte({ poste }: { poste: PosteDeTravail }) {
  const { indexPlanche, selection, modifier, setSelection } = poste;
  const planche: PlancheImage | null =
    poste.plancheCourante?.type === "image" ? poste.plancheCourante : null;
  const textesChoisis = (planche?.elements ?? []).filter(
    (e): e is ElementTexte => selection.includes(e.id) && e.type === "texte",
  );

  function poser(fabriquer: () => Element) {
    const neuf = fabriquer();
    modifier(
      (p: Projet) => {
        const courante = p.planches[indexPlanche];
        if (!courante || courante.type !== "image") return p;
        const planches = [...p.planches];
        planches[indexPlanche] = { ...courante, elements: [...courante.elements, neuf] };
        return avecPlanches(p, planches);
      },
      { libelle: "poser un texte" },
    );
    // On sélectionne ce qu'on vient de poser : c'est ce qu'on va déplacer.
    queueMicrotask(() => setSelection([neuf.id]));
  }

  function appliquer(role: RoleTexte) {
    modifier(
      (p: Projet) =>
        surSelection(p, indexPlanche, selection, (e) =>
          e.type === "texte" ? ({ ...e, role, ...styleDuRole(role) } as Element) : e,
        ),
      { libelle: `appliquer le style ${role}` },
    );
  }

  /**
   * PROPAGER : le style d'un rôle, sur toutes les planches.
   *
   * C'est ce qui tient une série de douze planches. En v1 c'était sans retour ;
   * ici c'est UNE étape d'historique, donc un Ctrl+Z.
   */
  function propager(role: RoleTexte) {
    modifier(
      (p: Projet) => ({
        ...p,
        planches: p.planches.map((pl) =>
          pl.type !== "image"
            ? pl
            : {
                ...pl,
                elements: pl.elements.map((e) =>
                  e.type === "texte" && e.role === role
                    ? ({ ...e, ...styleDuRole(role) } as Element)
                    : e,
                ),
              },
        ),
        modifieLe: new Date().toISOString(),
      }),
      { libelle: `propager le style ${role}` },
    );
  }

  return (
    <div className="space-y-4 px-3.5 py-3">
      <section>
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
          Poser
        </h3>
        <ul className="space-y-1.5">
          {A_POSER.map((x) => (
            <li key={x.cle}>
              <button type="button" onClick={() => poser(x.fabriquer)} className={CARTE}>
                <span className="block text-[13px] font-medium">+ {x.label}</span>
                <span className="block text-[11px] leading-snug text-brand-muted">{x.aide}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
          Styles de la charte
        </h3>
        <ul className="space-y-1.5">
          {STYLES.map((s) => (
            <li key={s.role} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => appliquer(s.role)}
                disabled={textesChoisis.length === 0}
                title={
                  textesChoisis.length === 0
                    ? "Choisis d'abord un texte"
                    : `Appliquer le style ${s.label}`
                }
                className="flex-1 rounded-md border border-brand-field px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-brand-primary/10 motion-reduce:transition-none disabled:opacity-40"
              >
                {s.label}
              </button>
              <button
                type="button"
                onClick={() => propager(s.role)}
                title={`Remettre CE style sur tous les ${s.label.toLowerCase()}s du projet`}
                className="rounded-md border border-brand-field px-2 py-1.5 text-[12px] text-brand-soft transition-colors hover:bg-brand-primary/10 motion-reduce:transition-none"
              >
                Propager
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[11px] leading-snug text-brand-muted">
          Propager remet le style de la charte sur tous les textes de ce rôle, dans
          tout le projet. Une seule étape — Ctrl+Z suffit à revenir.
        </p>
      </section>
    </div>
  );
}
