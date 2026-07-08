// lib/useArchive.js
//
// Charge l'archive d'aventure (une fois) pour l'état « Terminé » : un fichier
// STATIQUE du site (public/replays/<slug>/archive.json, contrat
// docs/live-archive-schema.md) — aucune dépendance à l'infra vivante.

"use client";

import { useEffect, useState } from "react";

export function useArchive(path) {
  const [archive, setArchive] = useState(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(path);
        if (!res.ok) return;
        const data = await res.json();
        // Refus poli d'une version de schéma inconnue (contrat).
        if (cancelled || data?.schemaVersion !== 1) return;
        setArchive(data);
      } catch {
        // silencieux : la page affichera l'état de chargement
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  return archive;
}
