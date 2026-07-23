// components/live/Countdown.jsx
//
// Compte à rebours de l'état « Avant » — redessiné (recette 2026-07-24) :
// une SEULE carte, kicker « Départ dans », chiffres en grand (tabular-nums :
// aucun tremblement au tick), unités discrètes en mono, secondes en
// terracotta (le battement de la page). Les jours disparaissent à J-0, un
// zéro de tête cale min/sec. À échéance : « Le départ est imminent… »
// Tick 1 s côté client, calé sur la date de départ de liveConfig. Rendu SSR
// neutre (tirets) pour éviter tout écart d'hydratation.

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

const pad = (n) => String(n).padStart(2, "0");

export default function Countdown({ dateDebut }) {
  const [values, setValues] = useState(null); // null au SSR

  useEffect(() => {
    const tick = () => setValues(remaining(dateDebut, Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dateDebut]);

  const imminent = values && values.d === 0 && values.h === 0 && values.m === 0 && values.s === 0;
  const units = values
    ? [
        ...(values.d > 0 ? [{ v: String(values.d), label: values.d > 1 ? "jours" : "jour" }] : []),
        { v: values.d > 0 ? pad(values.h) : String(values.h), label: values.h > 1 ? "heures" : "heure" },
        { v: pad(values.m), label: "min" },
        { v: pad(values.s), label: "sec", accent: true },
      ]
    : [
        { v: "–", label: "jours" },
        { v: "–", label: "heures" },
        { v: "–", label: "min" },
        { v: "–", label: "sec", accent: true },
      ];

  return (
    <div className="rounded-[18px] border border-brand-text/10 bg-white px-4 py-4 text-center sm:py-[18px]">
      <p className="m-0 font-mono text-[10.5px] font-bold uppercase tracking-[0.22em] text-brand-deep-dark">
        Départ dans
      </p>
      {imminent ? (
        <p className="m-0 mt-2.5 font-lora text-lg italic text-brand-text">
          Le départ est imminent…
        </p>
      ) : (
        <div className="mt-2.5 flex items-baseline justify-center">
          {units.map((u, i) => (
            <span key={u.label} className="flex items-baseline">
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className="mx-2 select-none font-heading text-[20px] font-light text-brand-text/20 sm:mx-3"
                >
                  ·
                </span>
              )}
              <span className="flex items-baseline gap-[5px]">
                <span
                  className={`font-heading text-[32px] font-bold leading-none tabular-nums sm:text-[38px] ${
                    u.accent ? "text-brand-deep" : "text-brand-text"
                  }`}
                >
                  {u.v}
                </span>
                <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-brand-text/45">
                  {u.label}
                </span>
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
