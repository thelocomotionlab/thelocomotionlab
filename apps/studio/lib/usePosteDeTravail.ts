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

/**
 * L'OUTIL ACTIF.
 *
 * `V` prend et déplace ; `T`, `R` et `L` posent — un glissé sur le fond trace
 * la boîte de ce qu'on ajoute, puis l'outil revient à `V`. Poser au clic
 * plutôt qu'au centre de la planche évite le geste « ajouter, puis chercher
 * ce qui vient d'apparaître ».
 */
export type Outil = "V" | "T" | "R" | "L";

/**
 * LES PALIERS DE ZOOM.
 *
 * Une seule liste : le menu de la barre haute et le Ctrl + du clavier doivent
 * s'arrêter aux mêmes crans, sinon le menu affiche un blanc dès qu'on a zoomé
 * au clavier.
 */
export const ZOOMS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2] as const;

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
  /** Le déplacement de la vue, en pixels d'écran. */
  const [vue, setVue] = useState({ x: 0, y: 0 });
  const [exportOuvert, setExport] = useState(false);
  const [outil, setOutil] = useState<Outil>("V");
  /**
   * LA PHOTO OUVERTE AU RECADRAGE.
   *
   * Elle vit ici et non dans le geste, parce que c'est le clavier du poste qui
   * en sort : Échap et Entrée ferment le recadrage avant de toucher à la
   * sélection, et un seul écouteur doit pouvoir en décider.
   */
  const [recadrage, setRecadrage] = useState<string | null>(null);
  const [raccourcisOuverts, setRaccourcis] = useState(false);

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
  /** Ajuster : le zoom revient à la fenêtre ET la vue se recentre — une
   *  planche ajustée tient à l'écran, un décalage n'y aurait plus de sens. */
  const ajuster = useCallback(() => {
    setZoom(null);
    setVue({ x: 0, y: 0 });
  }, []);

  /** Le cran suivant, vers le haut ou vers le bas. */
  const zoomer = useCallback((vers: 1 | -1) => {
    setZoom((actuel) => {
      const z = actuel ?? 0.5;
      return vers > 0
        ? (ZOOMS.find((v) => v > z + 0.001) ?? ZOOMS[ZOOMS.length - 1]!)
        : ([...ZOOMS].reverse().find((v) => v < z - 0.001) ?? ZOOMS[0]!);
    });
  }, []);

  /**
   * OUVRIR UN AUTRE DOCUMENT.
   *
   * L'historique repart à zéro : les étapes du projet précédent n'ont rien à
   * dire de celui-ci, et un Ctrl+Z qui ramènerait l'autre projet serait la
   * pire des surprises.
   */
  const ouvrir = useCallback((autre: Projet) => {
    setHistoire(creer(autre));
    setSelection([]);
    setPlanche(0);
    setVue({ x: 0, y: 0 });
  }, []);

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
      vue,
      outil,
      recadrage,
      exportOuvert,
      raccourcisOuverts,
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
      setVue,
      ajuster,
      zoomer,
      ouvrir,
      setOutil,
      setRecadrage,
      setExport,
      setRaccourcis,
    }),
    [
      projet,
      plancheCourante,
      indexPlanche,
      selection,
      tiroir,
      zoom,
      vue,
      outil,
      recadrage,
      exportOuvert,
      raccourcisOuverts,
      sauvegarde,
      histoire,
      ajuster,
      zoomer,
      ouvrir,
      modifier,
      sceller,
      annuler,
      refaire,
      poserPhotoA,
    ],
  );
}

export type PosteDeTravail = ReturnType<typeof usePosteDeTravail>;
