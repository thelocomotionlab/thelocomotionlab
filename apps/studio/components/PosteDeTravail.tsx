"use client";

// components/PosteDeTravail.tsx
//
// LE POSTE DE TRAVAIL : la coque qui tient les cinq zones du studio.
//
// Un seul poste, un seul document. Les deux ateliers de la v1 (Carrousel et
// Habillage photo) partageaient déjà photo, trace et chiffres, avec deux moteurs
// de rendu et deux modèles de données ; les stories « Silhouette » et
// « Chiffres » sont deux modèles parmi les autres, pas un second outil.
//
// LA PAGE NE DÉFILE PAS, sur téléphone comme sur écran : un poste de travail
// tient dans l'écran, et c'est le panneau qui défile.

import { useEffect } from "react";

import BandeDesPlanches from "./BandeDesPlanches";
import BarreHaute from "./BarreHaute";
import Inspecteur from "./Inspecteur";
import PlanDeTravail from "./PlanDeTravail";
import Rail from "./Rail";
import Tiroir from "./Tiroir";
import { usePosteDeTravail } from "@/lib/usePosteDeTravail";

export default function PosteDeTravail() {
  const poste = usePosteDeTravail();
  const { annuler, refaire } = poste;

  // Le service worker : jamais en développement, où garder les chunks de Next
  // en cache pendant qu'on édite produit des erreurs incompréhensibles.
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const cible = e.target as HTMLElement | null;
      // Dans un champ de saisie, Ctrl+Z appartient au champ : le détourner
      // ferait perdre une frappe au lieu d'annuler un mot.
      if (cible?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible?.tagName ?? "")) return;
      e.preventDefault();
      if (e.shiftKey) refaire();
      else annuler();
    };
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
  }, [annuler, refaire]);

  const planche = poste.plancheCourante?.type === "image" ? poste.plancheCourante : null;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <BarreHaute poste={poste} />

      <div className="flex min-h-0 flex-1">
        <Rail actif={poste.tiroir} onChange={poste.setTiroir} />
        {poste.tiroir !== null && <Tiroir cle={poste.tiroir} />}
        <PlanDeTravail projet={poste.projet} zoom={poste.zoom} />
        <Inspecteur projet={poste.projet} planche={planche} selection={poste.selection} />
      </div>

      <BandeDesPlanches poste={poste} />
    </div>
  );
}
