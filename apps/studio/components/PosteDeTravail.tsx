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
import DialogueExport from "./DialogueExport";
import BarreHaute from "./BarreHaute";
import Inspecteur from "./Inspecteur";
import PlanDeTravail from "./PlanDeTravail";
import Rail from "./Rail";
import Tiroir from "./Tiroir";
import { avecApparence, contientUnGroupe, deplacer } from "@locomotionlab/planche";

import { enregistrerIcones } from "@/lib/icones";
import {
  avecAjouts,
  avecDoublons,
  avecNoeud,
  avecOrdre,
  sansSelection,
  surSelection,
} from "@/lib/projet";
import * as papiers from "@/lib/pressePapiers";
import { useGrandEcran } from "@/lib/useEcran";
import { usePosteDeTravail } from "@/lib/usePosteDeTravail";
import FicheRaccourcis from "./FicheRaccourcis";
import BoiteAOutils from "./BoiteAOutils";
import PosteMobile from "./PosteMobile";
import Survol from "./Survol";

export default function PosteDeTravail() {
  const poste = usePosteDeTravail();
  const { annuler, refaire } = poste;
  const grandEcran = useGrandEcran();

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

  const choisis = useMemo(
    () => (planche?.elements ?? []).filter((e) => selection.includes(e.id)),
    [planche, selection],
  );

  const collerSelection = useCallback(() => {
    const neufs = papiers.aColler();
    if (neufs.length === 0) return;
    modifier((p) => avecAjouts(p, indexPlanche, neufs), { libelle: "coller" });
    queueMicrotask(() => setSelection(neufs.map((e) => e.id)));
  }, [modifier, indexPlanche, setSelection]);

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
      if (commande && touche === "e") {
        e.preventDefault();
        poste.setExport(true);
        return;
      }
      if (commande && touche === "d") {
        e.preventDefault();
        dupliquerSelection();
        return;
      }
      // LE ZOOM. Ctrl+0 revient à « ajuster » — l'état sans nombre, celui qui
      // suit la fenêtre quand on replie un tiroir.
      if (commande && (touche === "0" || e.key === "0")) {
        e.preventDefault();
        poste.ajuster();
        return;
      }
      if (commande && (e.key === "+" || e.key === "=" || e.key === "-")) {
        e.preventDefault();
        poste.zoomer(e.key === "-" ? -1 : 1);
        return;
      }
      // LES PLANCHES. PgUp / PgDn passent de l'une à l'autre sans quitter le
      // plan de travail — la bande du bas est là pour la vue d'ensemble, pas
      // pour la navigation au clavier.
      if (e.key === "PageUp" || e.key === "PageDown") {
        e.preventDefault();
        const vers = e.key === "PageUp" ? -1 : 1;
        const n = poste.projet.planches.length;
        if (n > 0) {
          poste.setPlanche(Math.max(0, Math.min(n - 1, indexPlanche + vers)));
          setSelection([]);
        }
        return;
      }
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        poste.setRaccourcis(!poste.raccourcisOuverts);
        return;
      }
      // LES OUTILS, sans modificateur : une seule lettre, comme partout.
      if (!commande && !e.altKey && "vtrl".includes(touche) && touche.length === 1) {
        e.preventDefault();
        poste.setOutil(touche.toUpperCase() as "V" | "T" | "R" | "L");
        return;
      }
      // ENTRÉE VALIDE UN RECADRAGE, et ne fait rien d'autre nulle part.
      if (e.key === "Enter" && poste.recadrage) {
        e.preventDefault();
        poste.setRecadrage(null);
        return;
      }
      if (e.key === "Escape") {
        // Échap sort d'abord de ce dans quoi on est entré — le recadrage, puis
        // l'outil —, et ne lâche la sélection qu'en dernier.
        if (poste.recadrage) poste.setRecadrage(null);
        else if (poste.outil !== "V") poste.setOutil("V");
        else if (poste.raccourcisOuverts) poste.setRaccourcis(false);
        else setSelection([]);
        return;
      }
      if (commande && touche === "v") {
        e.preventDefault();
        if (e.shiftKey) {
          const apparence = papiers.apparenceCopiee();
          if (apparence) {
            modifier((p) => surSelection(p, indexPlanche, selection, (x) => avecApparence(x, apparence)), {
              libelle: "coller le style",
            });
          }
        } else collerSelection();
        return;
      }
      if (selection.length === 0) return;

      if (commande && touche === "c") {
        e.preventDefault();
        if (e.shiftKey) {
          if (choisis[0]) papiers.copierApparence(choisis[0]);
        } else papiers.copier(choisis);
        return;
      }
      if (commande && touche === "g") {
        e.preventDefault();
        const noue = planche ? contientUnGroupe(planche.elements, selection) : false;
        const quoi = e.shiftKey || noue ? "degrouper" : "grouper";
        modifier((p) => avecNoeud(p, indexPlanche, selection, quoi), {
          libelle: quoi === "grouper" ? "grouper" : "dégrouper",
        });
        return;
      }
      if (commande && (e.key === "]" || e.key === "[")) {
        e.preventDefault();
        const vers = e.key === "]" ? "devant" : "derriere";
        modifier((p) => selection.reduce((acc, id) => avecOrdre(acc, indexPlanche, id, vers), p), {
          libelle: vers === "devant" ? "passer devant" : "passer derrière",
        });
        return;
      }
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
    collerSelection,
    pousserDe,
    modifier,
    indexPlanche,
    planche,
    choisis,
    poste,
  ]);

  // Un seul arbre à la fois : deux canvas de 1080 × 1350 tourneraient pour
  // rien. Le clavier reste branché des deux côtés — un téléphone peut avoir un
  // clavier, et une fenêtre étroite sur ordinateur en a toujours un.
  if (!grandEcran) return <PosteMobile poste={poste} />;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <BarreHaute poste={poste} />

      <div className="flex min-h-0 flex-1">
        <Rail actif={poste.tiroir} onChange={poste.setTiroir} />
        {poste.tiroir !== null && <Tiroir cle={poste.tiroir} poste={poste} />}
        {poste.plancheCourante?.type === "survol" ? (
          <Survol poste={poste} planche={poste.plancheCourante} />
        ) : (
          <div className="relative flex min-w-0 flex-1">
            <PlanDeTravail poste={poste} />
            <BoiteAOutils actif={poste.outil} onChange={poste.setOutil} />
          </div>
        )}
        <Inspecteur poste={poste} />
      </div>

      <BandeDesPlanches poste={poste} />

      {poste.raccourcisOuverts && <FicheRaccourcis onFermer={() => poste.setRaccourcis(false)} />}

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
