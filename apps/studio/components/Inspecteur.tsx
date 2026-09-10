"use client";

// components/Inspecteur.tsx
//
// L'INSPECTEUR (296 px) : tout ce qui concerne la SÉLECTION, et rien d'autre.
//
// C'est la règle « un élément, un endroit ». En v1, le titre se saisissait dans
// « Texte », sa police dans « Allure › Polices », son corps dans « Allure ›
// Corps » et son filet dans « Texte › Titre » — six endroits pour une chose.
// Ici on sélectionne le titre, et on a tout.
//
// Sans sélection, il porte les réglages de la PLANCHE.

import { Eye, EyeOff, Lock, LockOpen } from "lucide-react";
import { enPixels, formatDe, type Element, type PlancheImage, type Projet } from "@locomotionlab/planche";

import { avecTranche, surSelection } from "@/lib/projet";
import type { PosteDeTravail } from "@/lib/usePosteDeTravail";
import ReglageTranche from "./ReglageTranche";

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

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-brand-hairline px-3.5 py-3">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
        {titre}
      </h3>
      {children}
    </section>
  );
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <p className="flex items-baseline justify-between gap-3 py-0.5 text-[13px]">
      <span className="text-brand-muted">{libelle}</span>
      <span className="tabulaire text-brand-text">{valeur}</span>
    </p>
  );
}

function Nombre({
  libelle,
  valeur,
  onChange,
  suffixe = "",
}: {
  libelle: string;
  valeur: number;
  onChange: (n: number) => void;
  suffixe?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-2 py-0.5 text-[12px]">
      <span className="text-brand-muted">{libelle}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={Math.round(valeur)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="tabulaire w-20 rounded border border-brand-field bg-brand-bg px-1.5 py-1 text-right text-[13px]"
        />
        {suffixe && <span className="w-4 text-brand-muted">{suffixe}</span>}
      </span>
    </label>
  );
}

export default function Inspecteur({ poste }: { poste: PosteDeTravail }) {
  const { projet, selection, modifier, indexPlanche } = poste;
  const planche: PlancheImage | null =
    poste.plancheCourante?.type === "image" ? poste.plancheCourante : null;
  const choisis = (planche?.elements ?? []).filter((e) => selection.includes(e.id));
  const seul = choisis.length === 1 ? choisis[0]! : null;
  const format = formatDe(projet.format);
  const jours = projet.donnees.coupures.length + (projet.donnees.trace ? 1 : 0);

  const regler = (transforme: (e: Element) => Element, libelle: string) =>
    modifier((p: Projet) => surSelection(p, indexPlanche, selection, transforme), { libelle });

  if (choisis.length === 0) {
    return (
      <aside
        aria-label="Inspecteur"
        className="flex w-[296px] shrink-0 flex-col overflow-y-auto border-l border-brand-field bg-brand-paper"
      >
        <Section titre="Planche">
          <Ligne libelle="Modèle" valeur={planche?.modele ?? "—"} />
          <Ligne libelle="Éléments" valeur={String(planche?.elements.length ?? 0)} />
        </Section>
        <Section titre="Journées">
          {planche ? (
            <ReglageTranche
              tranche={planche.tranche}
              jours={jours}
              onChange={(t) =>
                modifier((p: Projet) => avecTranche(p, indexPlanche, t), {
                  libelle: "changer la tranche",
                })
              }
            />
          ) : (
            <p className="text-[11px] text-brand-muted">—</p>
          )}
        </Section>
        <Section titre="Lot">
          <Ligne libelle="Format" valeur={projet.format} />
          <Ligne libelle="Thème" valeur={projet.theme} />
          <Ligne libelle="Planches" valeur={String(projet.planches.length)} />
        </Section>
        <Section titre="Données">
          <Ligne libelle="Trace" valeur={projet.donnees.trace?.nom ?? "aucune"} />
          <Ligne libelle="Séance" valeur={projet.donnees.seance ? "chargée" : "aucune"} />
          <Ligne libelle="Médias" valeur={String(projet.medias.length)} />
        </Section>
        <p className="px-3.5 py-3 text-[12px] leading-snug text-brand-muted">
          Clique un élément de la planche pour le régler.
        </p>
      </aside>
    );
  }

  const boite = seul ? enPixels(seul, projet.format) : null;

  return (
    <aside
      aria-label="Inspecteur"
      className="flex w-[296px] shrink-0 flex-col overflow-y-auto border-l border-brand-field bg-brand-paper"
    >
      <Section titre={seul ? NOMS[seul.type] : `${choisis.length} éléments`}>
        {seul && <p className="mb-2 text-[13px] text-brand-soft">{seul.nom}</p>}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => regler((e) => ({ ...e, verrouille: !e.verrouille }), "verrouiller")}
            aria-pressed={choisis.every((e) => e.verrouille)}
            title="Verrouiller — l'élément reste sélectionnable, mais ne se déplace plus"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-brand-field px-2 text-[12px] transition-colors hover:bg-brand-primary/12 motion-reduce:transition-none"
          >
            {choisis.every((e) => e.verrouille) ? <Lock size={14} /> : <LockOpen size={14} />}
            Verrou
          </button>
          <button
            type="button"
            onClick={() => regler((e) => ({ ...e, masque: !e.masque }), "masquer")}
            aria-pressed={choisis.every((e) => e.masque)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-brand-field px-2 text-[12px] transition-colors hover:bg-brand-primary/12 motion-reduce:transition-none"
          >
            {choisis.every((e) => e.masque) ? <EyeOff size={14} /> : <Eye size={14} />}
            Visible
          </button>
        </div>
      </Section>

      {seul && seul.type === "texte" && (
        <Section titre="Contenu">
          <textarea
            value={seul.contenu}
            onChange={(e) =>
              modifier(
                (p: Projet) =>
                  surSelection(p, indexPlanche, selection, (x) =>
                    x.type === "texte" ? { ...x, contenu: e.target.value } : x,
                  ),
                { libelle: "écrire", fusion: `contenu:${seul.id}` },
              )
            }
            onBlur={poste.sceller}
            rows={4}
            className="w-full resize-y rounded-md border border-brand-field bg-brand-bg px-2 py-1.5 text-[13px] leading-snug"
          />
          <p className="mt-1.5 text-[11px] leading-snug text-brand-muted">
            *gras* _italique_ [ambre] · {"{distance}"} pour une variable.
          </p>
        </Section>
      )}

      {seul && seul.type === "texte" && (
        <Section titre="Typographie">
          <Nombre
            libelle="Corps"
            valeur={seul.corps}
            suffixe="px"
            onChange={(n) =>
              regler((x) => (x.type === "texte" ? { ...x, corps: Math.max(6, n) } : x), "corps")
            }
          />
          <Nombre
            libelle="Graisse"
            valeur={seul.graisse}
            onChange={(n) =>
              regler(
                (x) =>
                  x.type === "texte"
                    ? { ...x, graisse: Math.max(300, Math.min(800, n)) }
                    : x,
                "graisse",
              )
            }
          />
          <label className="mt-2 flex items-center gap-2 text-[12px] text-brand-soft">
            <input
              type="checkbox"
              checked={seul.lignesDures}
              onChange={(e) =>
                regler(
                  (x) => (x.type === "texte" ? { ...x, lignesDures: e.target.checked } : x),
                  "lignes",
                )
              }
              className="accent-brand-primary-dark"
            />
            Entrée fait une ligne
          </label>
          <p className="mt-1 text-[11px] leading-snug text-brand-muted">
            300 → 800. La hiérarchie vient de la graisse, de la casse et de
            l&rsquo;interlettrage — la charte n&rsquo;a qu&rsquo;une police. Décoché,
            les lignes d&rsquo;un paragraphe se recollent, comme en v1.
          </p>
        </Section>
      )}

      {seul && boite && (
        <Section titre="Position">
          <Nombre
            libelle="X"
            valeur={boite.x}
            onChange={(n) => regler((e) => ({ ...e, x: n / format.width }), "position")}
          />
          <Nombre
            libelle="Y"
            valeur={boite.y}
            onChange={(n) => regler((e) => ({ ...e, y: n / format.height }), "position")}
          />
          <Nombre
            libelle="Largeur"
            valeur={boite.l}
            onChange={(n) =>
              regler((e) => ({ ...e, l: Math.max(1, n) / format.width }), "taille")
            }
          />
          <Nombre
            libelle="Hauteur"
            valeur={boite.h}
            onChange={(n) =>
              regler((e) => ({ ...e, h: Math.max(1, n) / format.height }), "taille")
            }
          />
          <Nombre
            libelle="Rotation"
            valeur={seul.rotation}
            suffixe="°"
            onChange={(n) => regler((e) => ({ ...e, rotation: n }), "rotation")}
          />
        </Section>
      )}
    </aside>
  );
}
