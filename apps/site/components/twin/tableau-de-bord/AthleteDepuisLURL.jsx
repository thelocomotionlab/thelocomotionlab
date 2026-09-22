// components/twin/tableau-de-bord/AthleteDepuisLURL.jsx
//
// L'identifiant de l'athlète vient de la query, pas du chemin : une route dynamique
// demanderait au build d'énumérer les athlètes, ce qu'il ne peut pas faire — ils
// arrivent après lui, et ils sont privés.
//
// `useSearchParams` impose une frontière Suspense ; elle est ici, au plus près, pour
// que la page elle-même reste un composant serveur et garde ses métadonnées.

"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import Athlete from "./Athlete";

function DepuisLaQuery() {
  return <Athlete athleteId={useSearchParams().get("id") || ""} />;
}

export default function AthleteDepuisLURL() {
  return (
    <Suspense fallback={null}>
      <DepuisLaQuery />
    </Suspense>
  );
}
