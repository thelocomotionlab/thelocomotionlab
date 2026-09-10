"use client";

// components/PosteMobile.tsx
//
// LE POSTE DE TRAVAIL SUR TÉLÉPHONE.
//
// La planche prend tout, et les réglages viennent par en dessous. Aucun rail,
// aucun tiroir permanent, aucun inspecteur : sur 390 px de large, une colonne
// de 320 px ne laisse rien à regarder.
//
// C'EST LE MÊME DOCUMENT ET LE MÊME RENDU. Le plan de travail est celui du
// bureau, avec ses poignées et son magnétisme ; seuls les panneaux changent.
// La v1 avait deux jeux de réglages selon l'écran, et le format se cherchait à
// deux endroits.

import { useState } from "react";

import BandeDesPlanches from "./BandeDesPlanches";
import BarreMobile from "./BarreMobile";
import DialogueExport from "./DialogueExport";
import PlanDeTravail from "./PlanDeTravail";
import Survol from "./Survol";
import { Download, Redo2, Undo2 } from "lucide-react";

import { avecNom } from "@/lib/projet";
import type { PosteDeTravail } from "@/lib/usePosteDeTravail";

const ICONE =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-brand-soft transition-colors hover:bg-brand-primary/12 disabled:opacity-35 motion-reduce:transition-none";

export default function PosteMobile({ poste }: { poste: PosteDeTravail }) {
  const { projet, modifier, annuler, refaire, peutAnnuler, peutRefaire } = poste;
  // La bande des planches est REPLIÉE par défaut : elle vaut soixante pixels de
  // planche, et sur un téléphone c'est la planche qu'on est venu regarder.
  const [bande, setBande] = useState(false);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <header className="z-30 flex h-11 shrink-0 items-center gap-1 border-b border-brand-field bg-brand-paper px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/assets/logo-mark-512.png" alt="" width={22} height={22} />
        <input
          value={projet.nom}
          onChange={(e) =>
            modifier((p) => avecNom(p, e.target.value), { libelle: "renommer", fusion: "nom" })
          }
          onBlur={poste.sceller}
          aria-label="Nom du projet"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] font-medium focus:border-brand-primary-dark focus:outline-none"
        />
        <button
          type="button"
          onClick={annuler}
          disabled={!peutAnnuler}
          aria-label="Annuler"
          className={ICONE}
        >
          <Undo2 size={17} aria-hidden />
        </button>
        <button
          type="button"
          onClick={refaire}
          disabled={!peutRefaire}
          aria-label="Refaire"
          className={ICONE}
        >
          <Redo2 size={17} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => poste.setExport(true)}
          aria-label="Exporter"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-brand-deep px-3 text-[13px] font-medium text-brand-bg"
        >
          <Download size={15} aria-hidden />
          Exporter
        </button>
      </header>

      {bande && <BandeDesPlanches poste={poste} compact />}

      <div className="relative flex min-h-0 flex-1 flex-col">
        {poste.plancheCourante?.type === "survol" ? (
          <Survol poste={poste} planche={poste.plancheCourante} />
        ) : (
          <PlanDeTravail poste={poste} avecBarre={false} />
        )}
        <BarreMobile poste={poste} bandeOuverte={bande} onBande={() => setBande((b) => !b)} />
      </div>

      {poste.exportOuvert && (
        <DialogueExport
          projet={poste.projet}
          plancheCourante={poste.indexPlanche}
          onFermer={() => poste.setExport(false)}
        />
      )}
    </div>
  );
}
