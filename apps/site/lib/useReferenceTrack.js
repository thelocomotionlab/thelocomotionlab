// lib/useReferenceTrack.js
//
// Charge la trace de référence LÉGÈRE (une fois) : le .track.json précalculé
// par scripts/build-reference-track.mjs depuis le GPX prévisionnel (2,3 Mo brut
// → ~46 Ko : budget « premier chargement < 1,5 Mo hors tuiles »). Fournit la
// polyligne pour la carte et la série distance/altitude pour le profil.

"use client";

import { useEffect, useState } from "react";

export function useReferenceTrack(url) {
  const [track, setTrack] = useState(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        // Refus poli d'une version inconnue ; sans trace de référence, la
        // carte vit avec la seule trace vécue.
        if (cancelled || data?.schemaVersion !== 1 || !Array.isArray(data.coords)) return;
        setTrack(data); // { coords, profile, totalKm }
      } catch {
        // silencieux
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return track;
}
