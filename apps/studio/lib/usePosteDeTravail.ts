"use client";

// lib/usePosteDeTravail.ts
//
// L'état du poste de travail : le document dans son historique, et ce qui n'est
// PAS le document — la planche regardée, la sélection, le tiroir ouvert, le
// zoom. Cette frontière compte : le zoom et le tiroir ne s'annulent pas au
// Ctrl+Z, et n'ont donc rien à faire dans le document.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  annuler as annulerH,
  creer,
  peutAnnuler,
  peutRefaire,
  pousser,
  refaire as refaireH,
  sceller as scellerH,
  formatDe,
  type Historique,
  type Media,
  type Projet,
} from "@locomotionlab/planche";

import { EN_COURS, charger, enregistrer } from "./depot";
import { avecPhotoA, historiqueNeuf } from "./projet";

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
  const [exportOuvert, setExport] = useState(false);

  const projet = histoire.present;
  const [sauvegarde, setSauvegarde] = useState<"repos" | "en-cours" | "fait" | "souci">("repos");

  /**
   * L'AUTOSAUVEGARDE, différée d'une seconde et demie.
   *
   * Écrire à chaque frappe ferait une transaction IndexedDB par lettre ; ne rien
   * écrire du tout ferait perdre une demi-heure sur un onglet fermé par erreur.
   * Le délai se remet à zéro à chaque modification : on écrit quand la main
   * s'arrête.
   *
   * Elle écrase un unique emplacement « en cours ». Les projets NOMMÉS ne
   * bougent que sur demande — sinon « enregistrer » ne voudrait plus rien dire.
   */
  useEffect(() => {
    if (projet.planches.length === 0) return;
    let vivant = true;
    const minuteur = setTimeout(() => {
      setSauvegarde("en-cours");
      enregistrer(EN_COURS, projet).then(
        () => vivant && setSauvegarde("fait"),
        () => vivant && setSauvegarde("souci"),
      );
    }, 1500);
    return () => {
      vivant = false;
      clearTimeout(minuteur);
    };
  }, [projet]);

  /** Le brouillon de la dernière session, rouvert au démarrage. */
  useEffect(() => {
    let vivant = true;
    charger(EN_COURS).then((repris) => {
      // On ne remplace RIEN si l'auteur a déjà touché au document : rouvrir un
      // brouillon par-dessus un travail commencé serait la pire des surprises.
      if (vivant && repris && repris.planches.length > 0) {
        setHistoire((h) => (h.passe.length === 0 ? creer(repris) : h));
      }
    });
    return () => {
      vivant = false;
    };
  }, []);

  const modifier = useCallback(
    (transforme: (p: Projet) => Projet, options: Modification = {}) => {
      setHistoire((h) => pousser(h, transforme(h.present), options));
    },
    [],
  );

  const sceller = useCallback(() => setHistoire(scellerH), []);

  /** Pose une photo lâchée sur la planche, et la sélectionne. */
  const poserPhotoA = useCallback(
    (media: Media, point: { x: number; y: number }) => {
      let neuf = "";
      setHistoire((h) => {
        const r = avecPhotoA(h.present, planche, media, point, formatDe(h.present.format));
        neuf = r.id;
        return pousser(h, r.projet, { libelle: "poser une photo" });
      });
      if (neuf) setSelection([neuf]);
    },
    [planche],
  );
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
      exportOuvert,
      sauvegarde,
      peutAnnuler: peutAnnuler(histoire),
      peutRefaire: peutRefaire(histoire),
      modifier,
      sceller,
      annuler,
      refaire,
      poserPhotoA,
      setPlanche,
      setSelection,
      setTiroir,
      setZoom,
      setExport,
    }),
    [
      projet,
      plancheCourante,
      indexPlanche,
      selection,
      tiroir,
      zoom,
      exportOuvert,
      sauvegarde,
      histoire,
      modifier,
      sceller,
      annuler,
      refaire,
      poserPhotoA,
    ],
  );
}

export type PosteDeTravail = ReturnType<typeof usePosteDeTravail>;
