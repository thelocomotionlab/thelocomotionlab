"use client";

// components/Tiroir.tsx
//
// LE TIROIR (320 px) : ce que l'entrée choisie du rail donne à poser.
//
// Chaque tiroir se remplira avec la brique qu'il sert — les modèles avec le
// moteur de rendu (leurs vignettes sont des rendus réels dans le format et le
// thème du projet, pas des images fixes), Données avec le chargement de trace,
// Calques avec la liste des éléments de la planche.

import { TIROIRS } from "./Rail";
import type { CleTiroir } from "@/lib/usePosteDeTravail";

/** Ce que chaque tiroir contiendra, et qui n'est pas encore posé. */
const CONTENU: Record<CleTiroir, string> = {
  modeles:
    "Les onze modèles, rendus dans le format et le thème du projet : Carte, Bandeau, Photo, Texte, Fiche, Étape, Journées, Clôture, Story Silhouette, Story Chiffres, Survol.",
  texte:
    "Poser un titre, un surtitre, un paragraphe, une liste, un chiffre, une fiche — et les trois styles de la charte.",
  medias:
    "La bibliothèque de photos du projet : import (HEIC accepté), date et lieu EXIF, glisser sur la planche.",
  donnees:
    "Charger une trace ou une séance (GPX, .track.json), fusionner, couper en journées, et la liste des variables disponibles.",
  elements:
    "Formes, filet ambre, les 90 icônes, la marque, et les éléments liés aux données : carte, profil, cases de journées.",
  calques:
    "Les éléments de la planche, du fond vers l'avant : glisser, verrouiller, masquer, renommer, dupliquer.",
  projets:
    "Nouveau, ouvrir, dupliquer, versions nommées, et le fichier .llstudio pour changer de navigateur.",
};

export default function Tiroir({ cle }: { cle: CleTiroir }) {
  const entree = TIROIRS.find((t) => t.cle === cle);
  if (!entree) return null;

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-brand-field bg-brand-paper">
      <h2 className="sticky top-0 border-b border-brand-hairline bg-brand-paper px-3.5 py-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
        {entree.label}
      </h2>
      <p className="px-3.5 py-3 text-[13px] leading-relaxed text-brand-soft">{CONTENU[cle]}</p>
      <p className="mx-3.5 rounded-md border border-dashed border-brand-field px-3 py-2.5 text-[12px] text-brand-muted">
        Ce tiroir attend le moteur de rendu par éléments.
      </p>
    </aside>
  );
}
