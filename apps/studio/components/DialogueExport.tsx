"use client";

// components/DialogueExport.tsx
//
// EXPORTER, EN UN SEUL ENDROIT.
//
// En v1, l'export vivait dans la barre ET dans l'onglet « Planche », les pièces
// détachées ailleurs encore, et il ne savait sortir que du JPEG à 92 % en
// rafale. Ici : quoi, en quel format, à quelle échelle, et comment ça part.
//
// L'APERÇU EST L'IMAGE FINALE, donc il n'y a rien à prévisualiser : ce qui sort
// est ce qu'on voit. Le dialogue ne montre que ce qui reste à décider.

import { useEffect, useRef, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import type { Projet } from "@locomotionlab/planche";

import {
  PAR_DEFAUT,
  partageDisponible,
  partager,
  rendre,
  telechargerToutes,
  type Reglages,
  type Sortie,
} from "@/lib/export";

const BOUTON =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-[13px] transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40";

export default function DialogueExport({
  projet,
  plancheCourante,
  onFermer,
}: {
  projet: Projet;
  plancheCourante: number;
  onFermer: () => void;
}) {
  const [reglages, setReglages] = useState<Reglages>(PAR_DEFAUT);
  const [quoi, setQuoi] = useState<"toutes" | "courante">("toutes");
  const [avancement, setAvancement] = useState<{ fait: number; total: number } | null>(null);
  const [souci, setSouci] = useState<string | null>(null);
  const premier = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    premier.current?.focus();
    const au = (e: KeyboardEvent) => e.key === "Escape" && onFermer();
    window.addEventListener("keydown", au);
    return () => window.removeEventListener("keydown", au);
  }, [onFermer]);

  const index = quoi === "courante" ? [plancheCourante] : projet.planches.map((_, i) => i);
  const combien = index.length;

  async function sortir(mode: "fichiers" | "partage") {
    setSouci(null);
    setAvancement({ fait: 0, total: combien });
    try {
      const sorties: Sortie[] = await rendre({ ...projet }, { ...reglages, planches: index }, (fait, total) =>
        setAvancement({ fait, total }),
      );
      if (sorties.length === 0) {
        setSouci("Rien à exporter.");
        return;
      }
      if (mode === "partage" && partageDisponible(sorties)) {
        await partager(sorties, projet.nom);
      } else {
        await telechargerToutes(sorties);
      }
      onFermer();
    } catch {
      setSouci("L'export a échoué. Une carte est peut-être encore en chargement.");
    } finally {
      setAvancement(null);
    }
  }

  const enCours = avancement !== null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Exporter"
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-text/40 p-4"
      onClick={(e) => e.target === e.currentTarget && !enCours && onFermer()}
    >
      <div className="w-full max-w-md rounded-lg border border-brand-field bg-brand-paper shadow-card">
        <header className="flex items-center justify-between border-b border-brand-hairline px-4 py-3">
          <h2 className="text-[13px] font-medium">Exporter</h2>
          <button
            type="button"
            onClick={onFermer}
            disabled={enCours}
            aria-label="Fermer"
            className="rounded p-1 text-brand-muted hover:bg-brand-primary/12"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="space-y-4 px-4 py-4">
          <Choix
            titre="Quoi"
            options={[
              { cle: "toutes", label: `Toutes (${projet.planches.length})` },
              { cle: "courante", label: "Planche courante" },
            ]}
            valeur={quoi}
            onChange={(v) => setQuoi(v as "toutes" | "courante")}
          />
          <Choix
            titre="Format"
            options={[
              { cle: "image/jpeg", label: "JPG · 92 %" },
              { cle: "image/png", label: "PNG" },
            ]}
            valeur={reglages.type}
            onChange={(v) => setReglages((r) => ({ ...r, type: v as Reglages["type"] }))}
            aide="Le PNG garde la transparence et les aplats nets ; le JPG pèse trois fois moins."
          />
          <Choix
            titre="Échelle"
            options={[
              { cle: "1", label: "1× · réseaux" },
              { cle: "2", label: "2× · impression" },
            ]}
            valeur={String(reglages.echelle)}
            onChange={(v) => setReglages((r) => ({ ...r, echelle: Number(v) }))}
            aide="La planche est REDESSINÉE deux fois plus grande, pas agrandie : les lettres restent nettes."
          />

          {souci && (
            <p role="alert" className="text-[12px] text-brand-deep-dark">
              {souci}
            </p>
          )}
          {enCours && (
            <p role="status" className="tabulaire text-[12px] text-brand-soft">
              Rendu {avancement.fait} / {avancement.total}…
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-brand-hairline px-4 py-3">
          <button
            type="button"
            onClick={() => sortir("partage")}
            disabled={enCours}
            className={`${BOUTON} border border-brand-field hover:bg-brand-primary/12`}
          >
            <Share2 size={15} aria-hidden />
            Partager
          </button>
          <button
            ref={premier}
            type="button"
            onClick={() => sortir("fichiers")}
            disabled={enCours}
            className={`${BOUTON} bg-brand-deep font-medium text-brand-bg hover:bg-brand-deep-dark`}
          >
            <Download size={15} aria-hidden />
            {combien > 1 ? `${combien} fichiers` : "Télécharger"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Choix({
  titre,
  options,
  valeur,
  onChange,
  aide,
}: {
  titre: string;
  options: { cle: string; label: string }[];
  valeur: string;
  onChange: (v: string) => void;
  aide?: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
        {titre}
      </legend>
      <div className="flex overflow-hidden rounded-md border border-brand-field">
        {options.map((o) => (
          <button
            key={o.cle}
            type="button"
            aria-pressed={valeur === o.cle}
            onClick={() => onChange(o.cle)}
            className={`h-9 flex-1 text-[13px] transition-colors motion-reduce:transition-none ${
              valeur === o.cle
                ? "bg-brand-primary-dark text-brand-bg"
                : "bg-brand-bg text-brand-soft hover:bg-brand-primary/12"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {aide && <p className="mt-1 text-[11px] leading-snug text-brand-muted">{aide}</p>}
    </fieldset>
  );
}
