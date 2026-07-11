// components/live/Countdown.jsx
//
// Compte à rebours de l'état « Avant » (design 2b) : 4 cases jours/heures/min/
// sec — les secondes en terracotta. Tick 1 s côté client, calé sur la date de
// départ de liveConfig. Rendu SSR neutre (tirets) pour éviter tout écart
// d'hydratation, puis prise de relais client immédiate.

"use client";

import { useEffect, useState } from "react";

function remaining(dateDebutISO, nowMs) {
  const diff = Math.max(0, Date.parse(dateDebutISO) - nowMs);
  const s = Math.floor(diff / 1000);
  return {
    d: Math.floor(s / 86_400),
    h: Math.floor((s % 86_400) / 3_600),
    m: Math.floor((s % 3_600) / 60),
    s: s % 60,
  };
}

const CASES = [
  { key: "d", label: "jours" },
  { key: "h", label: "heures" },
  { key: "m", label: "min" },
  { key: "s", label: "sec" },
];

export default function Countdown({ dateDebut }) {
  const [values, setValues] = useState(null); // null au SSR

  useEffect(() => {
    const tick = () => setValues(remaining(dateDebut, Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dateDebut]);

  return (
    <div className="flex gap-2">
      {CASES.map(({ key, label }) => (
        <div
          key={key}
          className="flex-1 rounded-[14px] border border-brand-text/10 bg-white px-1 py-3 text-center"
        >
          <div
            className={`font-heading text-[28px] font-bold leading-none ${
              key === "s" ? "text-brand-deep" : "text-brand-text"
            }`}
          >
            {values ? values[key] : "–"}
          </div>
          <div className="mt-[5px] font-mono text-[9.5px] uppercase tracking-[0.14em] text-brand-text/55">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}
