"use client";

// lib/usePosteDeTravail.ts
//
// L'état du poste de travail : le document dans son historique, et ce qui n'est
// PAS le document — la planche regardée, la sélection, le tiroir ouvert, le
// zoom. Cette frontière compte : le zoom et le tiroir ne s'annulent pas au
// Ctrl+Z, et n'ont donc rien à faire dans le document.

import { useCallback, useMemo, useState } from "react";
import {
  annuler as annulerH,
  peutAnnuler,
  peutRefaire,
  pousser,
  refaire as refaireH,
  sceller as scellerH,
  type Historique,
  type Projet,
} from "@locomotionlab/planche";

import { historiqueNeuf } from "./projet";

export type CleTiroir =
  | "modeles"
  | "texte"
  | "medias"
  | "donnees"
  | "elements"
  | "calques"
  | "projets";

export type Modification = {
  libelle?: string;
  /** Deux modifications de suite portant la même clé ne font qu'une étape. */
  fusion?: string | null;
};

export function usePosteDeTravail() {
  const [histoire, setHistoire] = useState<Historique<Projet>>(historiqueNeuf);
  const [planche, setPlanche] = useState(0);
  const [selection, setSelection] = useState<string[]>([]);
  const [tiroir, setTiroir] = useState<CleTiroir | null>("modeles");
  /** `null` = ajuster à la fenêtre ; un nombre = un facteur choisi à la main. */
  const [zoom, setZoom] = useState<number | null>(null);

  const projet = histoire.present;

  const modifier = useCallback(
    (transforme: (p: Projet) => Projet, options: Modification = {}) => {
      setHistoire((h) => pousser(h, transforme(h.present), options));
    },
    [],
  );

  const sceller = useCallback(() => setHistoire(scellerH), []);
  const annuler = useCallback(() => setHistoire(annulerH), []);
  const refaire = useCallback(() => setHistoire(refaireH), []);

  // Une planche supprimée ne doit pas laisser l'index pointer dans le vide.
  const indexPlanche = Math.max(0, Math.min(projet.planches.length - 1, planche));
  const plancheCourante = projet.planches[indexPlanche] ?? null;

  return useMemo(
    () => ({
      projet,
      plancheCourante,
      indexPlanche,
      selection,
      tiroir,
      zoom,
      peutAnnuler: peutAnnuler(histoire),
      peutRefaire: peutRefaire(histoire),
      modifier,
      sceller,
      annuler,
      refaire,
      setPlanche,
      setSelection,
      setTiroir,
      setZoom,
    }),
    [
      projet,
      plancheCourante,
      indexPlanche,
      selection,
      tiroir,
      zoom,
      histoire,
      modifier,
      sceller,
      annuler,
      refaire,
    ],
  );
}

export type PosteDeTravail = ReturnType<typeof usePosteDeTravail>;
