// components/twin/useJob.js
//
// SUIVRE UN JOB jusqu'à ce qu'il retombe — pour le tableau de bord comme pour la page de
// l'athlète, chacun avec sa propre lecture (le jeton d'un côté, la clé du lien de
// l'autre).
//
// On sonde toutes les deux secondes (récapitulatif §5.7) et l'on montre ce que le job dit
// faire — « lecture de l'archive », « écriture des documents » — et rien d'autre. Aucune
// durée : on ne sait pas combien de temps prend une archive ou un rendu avant de les
// avoir faits.

"use client";

import { useEffect, useRef, useState } from "react";

export const INTERVALLE_MS = 2000;

/**
 * `jobId` vide : rien à suivre. `quandFini(job)` est appelé une fois, au premier état
 * final (`fini` ou `echec`). `lire(jobId)` rend l'état du job — mémorisé par l'appelant,
 * sans quoi chaque rendu relancerait la sonde.
 */
export default function useJob(jobId, quandFini, lire) {
  // L'état garde l'id du job qu'il décrit : un job neuf n'hérite jamais de l'état du
  // précédent, sans qu'il faille le remettre à zéro à la main.
  const [suivi, setSuivi] = useState({ id: "", job: null });
  const rappel = useRef(quandFini);
  useEffect(() => {
    rappel.current = quandFini;
  }, [quandFini]);

  useEffect(() => {
    if (!jobId) return undefined;
    let vivant = true;
    let minuteur = null;

    const sonder = async () => {
      try {
        const vu = await lire(jobId);
        if (!vivant) return;
        setSuivi({ id: jobId, job: vu });
        if (vu.statut === "fini" || vu.statut === "echec") {
          rappel.current?.(vu);
          return;
        }
      } catch (erreur) {
        if (!vivant) return;
        const echec = { statut: "echec", erreur: erreur.message, avancement: "" };
        setSuivi({ id: jobId, job: echec });
        rappel.current?.(echec);
        return;
      }
      minuteur = setTimeout(sonder, INTERVALLE_MS);
    };
    minuteur = setTimeout(sonder, INTERVALLE_MS / 4);

    return () => {
      vivant = false;
      clearTimeout(minuteur);
    };
  }, [jobId, lire]);

  return suivi.id === jobId ? suivi.job : null;
}
