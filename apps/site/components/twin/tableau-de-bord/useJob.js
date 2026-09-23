// components/twin/tableau-de-bord/useJob.js
//
// Le suivi d'un job, lu sous le jeton du tableau de bord (cf. components/twin/useJob.js).

"use client";

import useJobGenerique from "@/components/twin/useJob";

import { lireLeJob } from "./api";

export { INTERVALLE_MS } from "@/components/twin/useJob";

export default function useJob(jobId, quandFini) {
  return useJobGenerique(jobId, quandFini, lireLeJob);
}
