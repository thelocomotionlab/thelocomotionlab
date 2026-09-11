"use client";

// components/BarreHaute.tsx
//
// LA BARRE HAUTE (48 px) : la marque pour sortir, le nom du projet, les deux
// réglages DU LOT, l'historique, le zoom, l'état de sauvegarde, l'export.
//
// Format et thème sont ici, et NULLE PART AILLEURS. En v1 ils vivaient dans la
// barre sur grand écran mais dans l'onglet « Projet » sur téléphone : deux
// endroits pour un même réglage, et on cherchait à chaque fois.

import { Maximize2, Minus, Plus, Redo2, Undo2 } from "lucide-react";
import { FORMATS, THEMES, type CleFormat, type CleTheme } from "@locomotionlab/planche";

import { ZOOMS } from "@/lib/usePosteDeTravail";
import type { PosteDeTravail } from "@/lib/usePosteDeTravail";
import { avecFormat, avecNom, avecTheme } from "@/lib/projet";


const BOUTON =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-35";

export default function BarreHaute({ poste }: { poste: PosteDeTravail }) {
  const { projet, zoom, setZoom, ajuster, zoomer, annuler, refaire, peutAnnuler, peutRefaire } =
    poste;
  const { modifier } = poste;

  return (
    <header className="z-30 flex h-12 shrink-0 items-center gap-2 border-b border-brand-field bg-brand-paper px-2.5">
      <a
        href="https://thelocomotionlab.com"
        title="Revenir au site"
        aria-label="Revenir au site"
        className="flex shrink-0 items-center rounded-full p-1 transition-opacity hover:opacity-70 motion-reduce:transition-none"
      >
        {/* Une balise `img` nue, et non `next/image` : l'optimiseur de Next ne
            redimensionne rien sur Cloudflare Pages, et une empreinte de 26 px
            n'a de toute façon rien à optimiser. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/assets/logo-mark-512.png" alt="" width={26} height={26} />
      </a>

      <input
        value={projet.nom}
        onChange={(e) => modifier((p) => avecNom(p, e.target.value), {
          libelle: "renommer le projet",
          fusion: "nom",
        })}
        onBlur={poste.sceller}
        aria-label="Nom du projet"
        className="min-w-0 max-w-56 flex-shrink rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] font-medium hover:border-brand-field focus:border-brand-primary-dark focus:outline-none"
      />

      <span className="h-5 w-px shrink-0 bg-brand-hairline" aria-hidden />

      <label className="sr-only" htmlFor="format">
        Format
      </label>
      <select
        id="format"
        value={projet.format}
        onChange={(e) =>
          modifier((p) => avecFormat(p, e.target.value as CleFormat), { libelle: "changer de format" })
        }
        className="h-8 rounded-md border border-brand-field bg-brand-bg px-2 text-[13px]"
      >
        {Object.values(FORMATS).map((f) => (
          <option key={f.cle} value={f.cle}>
            {f.label}
          </option>
        ))}
      </select>

      <div
        role="group"
        aria-label="Thème de la planche"
        className="flex overflow-hidden rounded-md border border-brand-field"
      >
        {Object.values(THEMES).map((t) => (
          <button
            key={t.cle}
            type="button"
            aria-pressed={projet.theme === t.cle}
            onClick={() =>
              modifier((p) => avecTheme(p, t.cle as CleTheme), { libelle: "changer de thème" })
            }
            className={`h-8 px-2.5 text-[12px] transition-colors motion-reduce:transition-none ${
              projet.theme === t.cle
                ? "bg-brand-primary-dark text-brand-bg"
                : "bg-brand-bg text-brand-soft hover:bg-brand-primary/12"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <span className="h-5 w-px shrink-0 bg-brand-hairline" aria-hidden />

      <button
        type="button"
        onClick={annuler}
        disabled={!peutAnnuler}
        title="Annuler (Ctrl+Z)"
        aria-label="Annuler"
        className={`${BOUTON} hover:bg-brand-primary/12`}
      >
        <Undo2 size={16} aria-hidden />
      </button>
      <button
        type="button"
        onClick={refaire}
        disabled={!peutRefaire}
        title="Rétablir (Ctrl+Maj+Z)"
        aria-label="Rétablir"
        className={`${BOUTON} hover:bg-brand-primary/12`}
      >
        <Redo2 size={16} aria-hidden />
      </button>

      {/* Le zoom : deux boutons et une liste. La molette et le pincement font
          la même chose, mais un bouton se voit — et se clique d'une main. */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => zoomer(-1)}
          disabled={(zoom ?? 0.5) <= ZOOMS[0]!}
          title="Dézoomer (Ctrl+−)"
          aria-label="Dézoomer"
          className={`${BOUTON} hover:bg-brand-primary/12`}
        >
          <Minus size={16} aria-hidden />
        </button>

        <label className="sr-only" htmlFor="zoom">
          Zoom
        </label>
        <select
          id="zoom"
          value={zoom === null ? "ajuster" : String(zoom)}
          onChange={(e) =>
            e.target.value === "ajuster" ? ajuster() : setZoom(Number(e.target.value))
          }
          className="tabulaire h-8 rounded-md border border-brand-field bg-brand-bg px-2 text-[13px]"
        >
          <option value="ajuster">Ajuster</option>
          {ZOOMS.map((z) => (
            <option key={z} value={z}>
              {Math.round(z * 100)} %
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => zoomer(1)}
          disabled={(zoom ?? 0.5) >= ZOOMS[ZOOMS.length - 1]!}
          title="Zoomer (Ctrl++)"
          aria-label="Zoomer"
          className={`${BOUTON} hover:bg-brand-primary/12`}
        >
          <Plus size={16} aria-hidden />
        </button>

        <button
          type="button"
          onClick={ajuster}
          title="Ajuster à la fenêtre et recentrer (Ctrl+0)"
          aria-label="Ajuster à la fenêtre"
          className={`${BOUTON} hover:bg-brand-primary/12`}
        >
          <Maximize2 size={15} aria-hidden />
        </button>
      </div>

      <p role="status" className="ml-auto hidden text-[12px] text-brand-muted lg:block">
        {
          {
            repos: "Brouillon local",
            "en-cours": "Enregistrement…",
            fait: "Enregistré sur cet appareil",
            souci: "Pas pu enregistrer — garde l'onglet ouvert",
          }[poste.sauvegarde]
        }
      </p>

      <button
        type="button"
        onClick={() => poste.setExport(true)}
        title="Exporter (Ctrl+E)"
        className={`${BOUTON} bg-brand-deep px-3 font-medium text-brand-bg hover:bg-brand-deep-dark`}
      >
        Exporter
      </button>
    </header>
  );
}
