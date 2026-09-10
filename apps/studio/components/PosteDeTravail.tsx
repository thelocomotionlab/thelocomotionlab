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

import { useCallback, useEffect, useMemo } from "react";

import BandeDesPlanches from "./BandeDesPlanches";
import BarreHaute from "./BarreHaute";
import Inspecteur from "./Inspecteur";
import PlanDeTravail from "./PlanDeTravail";
import Rail from "./Rail";
import Tiroir from "./Tiroir";
import { deplacer } from "@locomotionlab/planche";

import { enregistrerIcones } from "@/lib/icones";
import { avecDoublons, sansSelection, surSelection } from "@/lib/projet";
import { usePosteDeTravail } from "@/lib/usePosteDeTravail";

export default function PosteDeTravail() {
  const poste = usePosteDeTravail();
  const { annuler, refaire } = poste;

  // Le vocabulaire d'icônes est déclaré par l'APP : le paquet de rendu ne fait
  // que découper, mesurer et poser, et n'a pas à consommer React pour autant.
  useEffect(enregistrerIcones, []);

  // Le service worker : jamais en développement, où garder les chunks de Next
  // en cache pendant qu'on édite produit des erreurs incompréhensibles.
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  const { selection, setSelection, modifier, indexPlanche } = poste;
  const planche = poste.plancheCourante?.type === "image" ? poste.plancheCourante : null;
  const elementsVisibles = useMemo(
    () => (planche?.elements ?? []).filter((e) => !e.masque),
    [planche],
  );

  const supprimerSelection = useCallback(() => {
    modifier((p) => sansSelection(p, indexPlanche, selection), { libelle: "supprimer" });
    setSelection([]);
  }, [modifier, indexPlanche, selection, setSelection]);

  const dupliquerSelection = useCallback(() => {
    let nouveaux: string[] = [];
    modifier(
      (p) => {
        const r = avecDoublons(p, indexPlanche, selection);
        nouveaux = r.nouveaux;
        return r.projet;
      },
      { libelle: "dupliquer" },
    );
    // On sélectionne les COPIES : c'est elles qu'on vient de poser, et qu'on va
    // déplacer dans la foulée.
    queueMicrotask(() => nouveaux.length > 0 && setSelection(nouveaux));
  }, [modifier, indexPlanche, selection, setSelection]);

  const pousserDe = useCallback(
    (dx: number, dy: number) => {
      modifier(
        (p) =>
          surSelection(p, indexPlanche, selection, (e) =>
            e.verrouille ? e : deplacer(e, dx, dy, p.format),
          ),
        { libelle: "déplacer", fusion: `fleches:${selection.join(",")}` },
      );
    },
    [modifier, indexPlanche, selection],
  );

  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      // Dans un champ de saisie, le clavier appartient au champ : le détourner
      // ferait perdre une frappe au lieu d'annuler un mot ou d'effacer une
      // lettre.
      if (cible?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible?.tagName ?? "")) return;
      const commande = e.metaKey || e.ctrlKey;
      const touche = e.key.toLowerCase();

      if (commande && touche === "z") {
        e.preventDefault();
        if (e.shiftKey) refaire();
        else annuler();
        return;
      }
      if (commande && touche === "a") {
        e.preventDefault();
        setSelection(elementsVisibles.map((x) => x.id));
        return;
      }
      if (commande && touche === "d") {
        e.preventDefault();
        dupliquerSelection();
        return;
      }
      if (e.key === "Escape") {
        setSelection([]);
        return;
      }
      if (selection.length === 0) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        supprimerSelection();
        return;
      }
      // Les flèches déplacent d'un pixel de planche, dix avec Maj — le réglage
      // fin que la souris ne donne pas.
      const pas: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const direction = pas[e.key];
      if (direction) {
        e.preventDefault();
        pousserDe(direction[0] * (e.shiftKey ? 10 : 1), direction[1] * (e.shiftKey ? 10 : 1));
      }
    };
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
  }, [
    annuler,
    refaire,
    selection,
    setSelection,
    elementsVisibles,
    dupliquerSelection,
    supprimerSelection,
    pousserDe,
  ]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <BarreHaute poste={poste} />

      <div className="flex min-h-0 flex-1">
        <Rail actif={poste.tiroir} onChange={poste.setTiroir} />
        {poste.tiroir !== null && <Tiroir cle={poste.tiroir} poste={poste} />}
<PlanDeTravail poste={poste} />
        <Inspecteur poste={poste} />
      </div>

      <BandeDesPlanches poste={poste} />
    </div>
  );
}
