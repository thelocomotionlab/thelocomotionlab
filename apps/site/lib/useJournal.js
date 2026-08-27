// lib/useJournal.js
//
// Sonde du journal de bord (journal.json produit par services/live-journal,
// servi par Caddy sur la base API). Même pattern que les positions : polling
// client + cache-buster. En cas d'erreur réseau on GARDE les dernières données
// valides — le journal ne disparaît pas parce qu'un tunnel coupe la 4G.

"use client";

import { useEffect, useState } from "react";

import { journalApiBase } from "./liveConfig";

// `url` permet de lire le journal FIGÉ d'une archive (public/replays/<slug>/
// journal.json). Avec `pollMs: 0`, une seule lecture.
export function useJournal({ pollMs = 30000, url = null } = {}) {
  const [journal, setJournal] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function probe() {
      try {
        const res = url
          ? await fetch(url)
          : await fetch(`${journalApiBase}/journal/journal.json?cacheBust=${Date.now()}`, {
              cache: "no-store",
            });
        if (!res.ok) return;
        const data = await res.json();
        // Refus poli d'une version de schéma inconnue (contrat d'archive).
        if (cancelled || data?.schemaVersion !== 1 || !Array.isArray(data.entries)) return;
        setJournal(data);
      } catch {
        // silencieux : on garde le dernier état valide
      }
    }

    probe();
    if (pollMs <= 0) return () => { cancelled = true; };
    const id = setInterval(probe, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs, url]);

  return journal; // null tant que rien n'est chargé, puis { entries, count, … }
}
