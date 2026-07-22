// components/AteliersGrid.jsx
//
// Grille des cartes ateliers + décompte des places VIVANT.
// Le contenu (titres, dates, lieux…) vient du catalogue statique
// lib/ateliers.mjs (rendu au build, bon pour le SEO) ; les compteurs
// viennent du service atelier-api quand NEXT_PUBLIC_ATELIER_API est
// configurée : GET {API}/places au montage, puis mise à jour à chaque
// inscription (réponse du POST remontée par AtelierCard via onPlaces).
// API absente ou injoignable → les compteurs du build restent affichés et
// AtelierCard bascule sur son repli email : la page ne casse jamais.

"use client";

import { useCallback, useEffect, useState } from "react";
import AtelierCard from "@/components/AtelierCard";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "";

export default function AteliersGrid({ ateliers }) {
  // { [atelierId]: { capacity, registered, remaining, full, status } }
  const [places, setPlaces] = useState({});

  useEffect(() => {
    if (!API_BASE) return undefined;
    const ctrl = new AbortController();
    fetch(`${API_BASE}/places`, { signal: ctrl.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.places) setPlaces(data.places);
      })
      .catch(() => {}); // API injoignable → compteurs du build
    return () => ctrl.abort();
  }, []);

  const handlePlaces = useCallback((atelierId, patch) => {
    setPlaces((prev) => ({
      ...prev,
      [atelierId]: { ...prev[atelierId], ...patch },
    }));
  }, []);

  const merged = ateliers
    .map((atelier) => {
      const live = places[atelier.id];
      if (!live) return atelier;
      const registered = live.registered ?? atelier.registered;
      const capacity = live.capacity ?? atelier.capacity;
      const status =
        live.status === "past"
          ? "past"
          : live.full || registered >= capacity
            ? "full"
            : "open";
      return { ...atelier, registered, capacity, status };
    })
    // Fermé côté API entre deux builds → la carte disparaît.
    .filter((atelier) => atelier.status !== "past");

  return (
    // Gabarit du pilier Comprendre : colonnes de 22rem, cartes compactes.
    <div className="grid grid-cols-1 justify-center justify-items-center gap-[18px] sm:grid-cols-2 md:gap-6 lg:justify-start lg:[grid-template-columns:repeat(3,22rem)]">
      {merged.map((atelier) => (
        <AtelierCard key={atelier.id} atelier={atelier} onPlaces={handlePlaces} />
      ))}
    </div>
  );
}
