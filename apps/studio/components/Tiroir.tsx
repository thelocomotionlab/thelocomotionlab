"use client";

// components/Tiroir.tsx
//
// LE TIROIR (320 px) : ce que l'entrée choisie du rail donne à poser.
//
// Chaque tiroir se remplira avec la brique qu'il sert — les modèles avec le
// moteur de rendu (leurs vignettes sont des rendus réels dans le format et le
// thème du projet, pas des images fixes), Données avec le chargement de trace,
// Calques avec la liste des éléments de la planche.

import TiroirCalques from "./TiroirCalques";
import TiroirElements from "./TiroirElements";
import TiroirDonnees from "./TiroirDonnees";
import TiroirMedias from "./TiroirMedias";
import TiroirTexte from "./TiroirTexte";
import TiroirModeles from "./TiroirModeles";
import { TIROIRS } from "./Rail";
import type { CleTiroir, PosteDeTravail } from "@/lib/usePosteDeTravail";

/** Ce que chaque tiroir contiendra, et qui n'est pas encore posé. */
const CONTENU: Partial<Record<CleTiroir, string>> = {
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

export default function Tiroir({ cle, poste }: { cle: CleTiroir; poste: PosteDeTravail }) {
  const entree = TIROIRS.find((t) => t.cle === cle);
  if (!entree) return null;
  const aVenir = CONTENU[cle];

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-brand-field bg-brand-paper">
      <h2 className="sticky top-0 border-b border-brand-hairline bg-brand-paper px-3.5 py-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
        {entree.label}
      </h2>
      {cle === "modeles" ? (
        <TiroirModeles poste={poste} />
      ) : cle === "donnees" ? (
        <TiroirDonnees poste={poste} />
      ) : cle === "texte" ? (
        <TiroirTexte poste={poste} />
      ) : cle === "elements" ? (
        <TiroirElements poste={poste} />
      ) : cle === "medias" ? (
        <TiroirMedias poste={poste} />
      ) : cle === "calques" ? (
        <TiroirCalques poste={poste} />
      ) : (
        <>
          <p className="px-3.5 py-3 text-[13px] leading-relaxed text-brand-soft">{aVenir}</p>
          <p className="mx-3.5 rounded-md border border-dashed border-brand-field px-3 py-2.5 text-[12px] text-brand-muted">
            Ce tiroir attend sa brique.
          </p>
        </>
      )}
    </aside>
  );
}
