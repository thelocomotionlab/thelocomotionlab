// lib/useLiveTimer.js
//
// Sonde d'état du direct : lit {apiBase}/live-timer.json (forme
// { running, startTime, stopTime }, produite par services/tracking-cache),
// avec LA MÊME résolution d'URL que LiveTrackingLazy — c'est la source
// d'état du live-tracking existant, pas un second mécanisme. Volontairement
// plus léger que useTrackingData (pas de poll des positions) : suffisant
// pour savoir si un direct est en cours.

"use client";

import { useEffect, useState } from "react";

// Inlined au build par Next (préfixe NEXT_PUBLIC_). Non défini → fallback.
const TRACKING_PROXY = process.env.NEXT_PUBLIC_TRACKING_PROXY;
const API_BASE = TRACKING_PROXY || "https://tracking.thelocomotionlab.com";

const OFFLINE = { running: false };

/**
 * @param {{ pollMs?: number }} options — pollMs > 0 pour re-sonder à
 *   intervalle régulier (page /live), 0 pour un fetch unique (bloc /explorer).
 * @returns {null | { running: boolean }} null tant que la première réponse
 *   n'est pas arrivée ; en cas d'erreur réseau → { running: false }.
 */
export function useLiveTimer({ pollMs = 0 } = {}) {
  const [timer, setTimer] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const probe = async () => {
      try {
        // Cache-bust : le fichier est réécrit sur place par tracking-cache.
        const res = await fetch(`${API_BASE}/live-timer.json?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) {
          setTimer(
            data && typeof data.running === "boolean" ? data : OFFLINE
          );
        }
      } catch {
        if (!cancelled) setTimer(OFFLINE);
      }
    };

    probe();
    if (pollMs > 0) {
      const id = setInterval(probe, pollMs);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [pollMs]);

  return timer;
}
