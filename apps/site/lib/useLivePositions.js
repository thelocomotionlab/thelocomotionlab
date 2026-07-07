// lib/useLivePositions.js
//
// Sonde des positions du direct (live-positions.json produit par tracking-cache).
// Dédiée à l'état « En cours » v2 de /live — packages/tracking garde son propre
// hook pour les replays/embeds. Erreur réseau = on garde le dernier état valide
// (la fraîcheur, elle, continue de vieillir naturellement).

"use client";

import { useEffect, useState } from "react";

import { trackingApiBase } from "./liveConfig";

export function useLivePositions({ pollMs = 10000 } = {}) {
  const [positions, setPositions] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function probe() {
      try {
        const res = await fetch(
          `${trackingApiBase}/live-positions.json?cacheBust=${Date.now()}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data || !Array.isArray(data.profile)) return;
        setPositions(data);
      } catch {
        // silencieux : on garde le dernier état valide
      }
    }

    probe();
    const id = setInterval(probe, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs]);

  return positions; // null puis { meta, stats, profile }
}
