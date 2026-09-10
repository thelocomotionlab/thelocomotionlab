"use client";

// components/BarreMobile.tsx
//
// LA BARRE DU BAS, SUR TÉLÉPHONE. Deux états, et rien d'autre.
//
// SANS SÉLECTION : trois actions. Ajouter, les planches, les données. C'est
// tout ce qu'on fait quand rien n'est choisi, et le reste n'a pas à encombrer.
//
// AVEC SÉLECTION : une rangée de chips qui défile, et chaque chip ouvre UNE
// feuille d'UN réglage. Le tiroir de bureau tient dans 320 px de large ; sur un
// téléphone il prendrait l'écran entier et cacherait ce qu'on règle.

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Layers,
  Plus,
  Route,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { deplacer, type Element, type Projet } from "@locomotionlab/planche";

import { avecDoublons, avecOrdre, sansSelection, surSelection } from "@/lib/projet";
import type { CleTiroir, PosteDeTravail } from "@/lib/usePosteDeTravail";
import Feuille from "./Feuille";
import { ContenuDeTiroir } from "./Tiroir";

/** Les chips de la sélection : un réglage, une feuille. */
type CleChip = "modifier" | "corps" | "couleur" | "position" | "calque";

const CHIPS: { cle: CleChip; label: string; pour: (e: Element) => boolean }[] = [
  { cle: "modifier", label: "Modifier", pour: (e) => e.type === "texte" },
  { cle: "corps", label: "Corps", pour: (e) => e.type === "texte" },
  { cle: "couleur", label: "Couleur", pour: (e) => e.type === "texte" || e.type === "icone" },
  { cle: "position", label: "Position", pour: () => true },
  { cle: "calque", label: "Calque", pour: () => true },
];

const CHIP =
  "h-11 shrink-0 rounded-full border border-brand-field px-3.5 text-[13px] text-brand-text transition-colors hover:bg-brand-primary/10 motion-reduce:transition-none";

const ACTION =
  "flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-brand-soft transition-colors hover:text-brand-text motion-reduce:transition-none";

const PALETTE = ["", "#F2C078", "#7FA6A0", "#C97B5A", "#D6246E"];

/** Ce qu'on peut ajouter : les cinq tiroirs qui posent quelque chose. */
const A_AJOUTER: { cle: CleTiroir; label: string }[] = [
  { cle: "modeles", label: "Modèles" },
  { cle: "texte", label: "Texte" },
  { cle: "medias", label: "Photos" },
  { cle: "elements", label: "Éléments" },
  { cle: "donnees", label: "Données" },
];

export default function BarreMobile({
  poste,
  bandeOuverte,
  onBande,
}: {
  poste: PosteDeTravail;
  bandeOuverte: boolean;
  onBande: () => void;
}) {
  const { projet, indexPlanche, selection, modifier, setSelection } = poste;
  const [ajout, setAjout] = useState<CleTiroir | null>(null);
  const [chip, setChip] = useState<CleChip | null>(null);

  const planche = poste.plancheCourante?.type === "image" ? poste.plancheCourante : null;
  const choisis = (planche?.elements ?? []).filter((e) => selection.includes(e.id));
  const seul = choisis.length === 1 ? choisis[0]! : null;

  const regler = (transforme: (e: Element) => Element, libelle: string) =>
    modifier((p: Projet) => surSelection(p, indexPlanche, selection, transforme), { libelle });

  /* ----------------------------------------------------------- sans choix */

  if (choisis.length === 0) {
    return (
      <>
        {ajout && (
          <Feuille titre="Ajouter" onFermer={() => setAjout(null)}>
            {/* La rangée choisit le tiroir, la feuille garde sa hauteur : c'est
                le même contenu qu'au bureau, sans la colonne. */}
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
              {A_AJOUTER.map((t) => (
                <button
                  key={t.cle}
                  type="button"
                  onClick={() => setAjout(t.cle)}
                  aria-pressed={ajout === t.cle}
                  className={`h-9 shrink-0 rounded-full border px-3 text-[12px] transition-colors motion-reduce:transition-none ${
                    ajout === t.cle
                      ? "border-brand-primary-dark bg-brand-primary/12"
                      : "border-brand-field text-brand-soft"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <ContenuDeTiroir cle={ajout} poste={poste} />
          </Feuille>
        )}
        <nav className="z-30 flex shrink-0 items-stretch border-t border-brand-field bg-brand-paper">
          <Bouton
            Icone={Plus}
            label="Ajouter"
            onClick={() => setAjout(ajout ? null : "modeles")}
          />
          <Bouton
            Icone={Layers}
            label={`Planches (${projet.planches.length})`}
            actif={bandeOuverte}
            onClick={onBande}
          />
          <Bouton
            Icone={Route}
            label="Données"
            onClick={() => setAjout(ajout === "donnees" ? null : "donnees")}
          />
        </nav>
      </>
    );
  }

  /* ----------------------------------------------------------- avec choix */

  const utiles = CHIPS.filter((c) => choisis.some((e) => c.pour(e)));

  return (
    <>
      {chip && seul && (
        <Feuille titre={CHIPS.find((c) => c.cle === chip)?.label ?? ""} onFermer={() => setChip(null)}>
          {chip === "modifier" && seul.type === "texte" && (
            <textarea
              autoFocus
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
              rows={4}
              className="w-full rounded-md border border-brand-field bg-brand-bg p-2 text-[14px] outline-none focus:border-brand-primary-dark"
            />
          )}

          {chip === "corps" && seul.type === "texte" && (
            <div className="space-y-3">
              <Curseur
                libelle="Corps"
                valeur={seul.corps}
                min={12}
                max={200}
                onChange={(n) =>
                  regler((x) => (x.type === "texte" ? { ...x, corps: n } : x), "corps")
                }
              />
              <Curseur
                libelle="Graisse"
                valeur={seul.graisse}
                min={300}
                max={800}
                pas={100}
                onChange={(n) =>
                  regler((x) => (x.type === "texte" ? { ...x, graisse: n } : x), "graisse")
                }
              />
              <button
                type="button"
                onClick={() =>
                  regler(
                    (x) =>
                      x.type === "texte"
                        ? {
                            ...x,
                            casse: x.casse === "capitales" ? "normale" : "capitales",
                            lettrage: x.casse === "capitales" ? 0 : 0.16,
                          }
                        : x,
                    "casse",
                  )
                }
                aria-pressed={seul.casse === "capitales"}
                className={`h-11 w-full rounded-md border text-[13px] ${
                  seul.casse === "capitales"
                    ? "border-brand-primary-dark bg-brand-primary/12"
                    : "border-brand-field"
                }`}
              >
                Capitales espacées
              </button>
            </div>
          )}

          {chip === "couleur" && (
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c || "theme"}
                  type="button"
                  onClick={() =>
                    regler(
                      (x) =>
                        x.type === "texte" || x.type === "icone" ? { ...x, couleur: c } : x,
                      "couleur",
                    )
                  }
                  aria-label={c || "Encre du thème"}
                  style={{ background: c || "transparent" }}
                  className="h-11 w-11 rounded-full border border-brand-field"
                />
              ))}
            </div>
          )}

          {chip === "position" && (
            <div className="grid grid-cols-3 gap-2">
              <span />
              <Fleche libelle="Monter" onClick={() => pousser(0, -10)} />
              <span />
              <Fleche libelle="Gauche" onClick={() => pousser(-10, 0)} />
              <span />
              <Fleche libelle="Droite" onClick={() => pousser(10, 0)} />
              <span />
              <Fleche libelle="Descendre" onClick={() => pousser(0, 10)} />
            </div>
          )}

          {chip === "calque" && (
            <div className="flex gap-2">
              <Petit
                Icone={ArrowUp}
                label="Devant"
                onClick={() => ordonner("devant")}
              />
              <Petit
                Icone={ArrowDown}
                label="Derrière"
                onClick={() => ordonner("derriere")}
              />
              <Petit Icone={Copy} label="Dupliquer" onClick={dupliquer} />
              <Petit Icone={Trash2} label="Supprimer" onClick={supprimer} />
            </div>
          )}
        </Feuille>
      )}

      <nav className="z-30 flex shrink-0 gap-2 overflow-x-auto border-t border-brand-field bg-brand-paper px-2 py-1.5">
        {utiles.map((c) => (
          <button
            key={c.cle}
            type="button"
            onClick={() => setChip(chip === c.cle ? null : c.cle)}
            aria-pressed={chip === c.cle}
            className={`${CHIP} ${chip === c.cle ? "bg-brand-primary/14" : ""}`}
          >
            {c.label}
          </button>
        ))}
        <button type="button" onClick={() => setSelection([])} className={CHIP}>
          Terminé
        </button>
      </nav>
    </>
  );

  function pousser(dx: number, dy: number) {
    modifier(
      (p: Projet) =>
        surSelection(p, indexPlanche, selection, (e) =>
          e.verrouille ? e : deplacer(e, dx, dy, p.format),
        ),
      { libelle: "déplacer", fusion: `mobile:${selection.join(",")}` },
    );
  }

  function ordonner(vers: "devant" | "derriere") {
    modifier(
      (p: Projet) => selection.reduce((acc, id) => avecOrdre(acc, indexPlanche, id, vers), p),
      { libelle: vers === "devant" ? "passer devant" : "passer derrière" },
    );
  }

  function dupliquer() {
    let neufs: string[] = [];
    modifier(
      (p: Projet) => {
        const r = avecDoublons(p, indexPlanche, selection);
        neufs = r.nouveaux;
        return r.projet;
      },
      { libelle: "dupliquer" },
    );
    queueMicrotask(() => neufs.length > 0 && setSelection(neufs));
  }

  function supprimer() {
    modifier((p: Projet) => sansSelection(p, indexPlanche, selection), { libelle: "supprimer" });
    setSelection([]);
    setChip(null);
  }
}

function Bouton({
  Icone,
  label,
  actif = false,
  onClick,
}: {
  Icone: LucideIcon;
  label: string;
  actif?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={`${ACTION} ${actif ? "text-brand-text" : ""}`}
    >
      <Icone size={18} strokeWidth={1.75} aria-hidden />
      {label}
    </button>
  );
}

function Petit({
  Icone,
  label,
  onClick,
}: {
  Icone: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-16 flex-1 flex-col items-center justify-center gap-1 rounded-md border border-brand-field text-[11px] text-brand-soft"
    >
      <Icone size={17} strokeWidth={1.75} aria-hidden />
      {label}
    </button>
  );
}

function Fleche({ libelle, onClick }: { libelle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={libelle}
      className="h-12 rounded-md border border-brand-field text-[12px] text-brand-soft"
    >
      {libelle}
    </button>
  );
}

function Curseur({
  libelle,
  valeur,
  min,
  max,
  pas = 1,
  onChange,
}: {
  libelle: string;
  valeur: number;
  min: number;
  max: number;
  pas?: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between text-[12px] text-brand-soft">
        {libelle}
        <span className="tabulaire text-brand-muted">{valeur}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={pas}
        value={valeur}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full accent-brand-primary-dark"
      />
    </label>
  );
}
