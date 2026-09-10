"use client";

// components/Tiroir.tsx
//
// LE TIROIR (320 px) : ce que l'entrée choisie du rail donne à poser.
//
// Ce composant n'est qu'un aiguillage — chaque tiroir a le sien, et c'est là
// que vit son contenu. Le sélecteur est aussi ce que la feuille du téléphone
// appelle : les deux écrans montrent le MÊME tiroir, dans un cadre différent.

import TiroirCalques from "./TiroirCalques";
import TiroirElements from "./TiroirElements";
import TiroirDonnees from "./TiroirDonnees";
import TiroirMedias from "./TiroirMedias";
import TiroirTexte from "./TiroirTexte";
import TiroirModeles from "./TiroirModeles";
import TiroirProjets from "./TiroirProjets";
import { TIROIRS } from "./Rail";
import type { CleTiroir, PosteDeTravail } from "@/lib/usePosteDeTravail";

/** Le contenu d'un tiroir, sans son cadre : ce que la feuille du bas réutilise. */
export function ContenuDeTiroir({ cle, poste }: { cle: CleTiroir; poste: PosteDeTravail }) {
  switch (cle) {
    case "modeles":
      return <TiroirModeles poste={poste} />;
    case "texte":
      return <TiroirTexte poste={poste} />;
    case "medias":
      return <TiroirMedias poste={poste} />;
    case "donnees":
      return <TiroirDonnees poste={poste} />;
    case "elements":
      return <TiroirElements poste={poste} />;
    case "calques":
      return <TiroirCalques poste={poste} />;
    case "projets":
      return <TiroirProjets poste={poste} />;
  }
}

export default function Tiroir({ cle, poste }: { cle: CleTiroir; poste: PosteDeTravail }) {
  const entree = TIROIRS.find((t) => t.cle === cle);
  if (!entree) return null;

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-brand-field bg-brand-paper">
      <h2 className="sticky top-0 border-b border-brand-hairline bg-brand-paper px-3.5 py-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
        {entree.label}
      </h2>
      <ContenuDeTiroir cle={cle} poste={poste} />
    </aside>
  );
}
