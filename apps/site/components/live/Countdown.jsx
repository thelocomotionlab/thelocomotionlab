// components/live/Countdown.jsx
//
// Compte à rebours de l'état « Avant » : kicker « Départ le <jour mois>, dans »,
// puis une rangée d'unités jour/heure/min/sec — grand chiffre NOIR (tabular-nums,
// même échelle que le % de la page « pendant »), petite unité dessous. Les jours
// disparaissent à J-0. À échéance : « Le départ est imminent… ». Tick 1 s côté
// client ; rendu SSR neutre (tirets) pour éviter tout écart d'hydratation.

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

  const quand = new Date(Date.parse(dateDebut)).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });

  const imminent = values && values.d === 0 && values.h === 0 && values.m === 0 && values.s === 0;
  const units = values
    ? [
        ...(values.d > 0 ? [{ key: "d", v: String(values.d), label: values.d > 1 ? "jours" : "jour" }] : []),
        { key: "h", v: values.d > 0 ? pad(values.h) : String(values.h), label: "h" },
        { key: "m", v: pad(values.m), label: "min" },
        { key: "s", v: pad(values.s), label: "sec" },
      ]
    : [
        { key: "d", v: "–", label: "jours" },
        { key: "h", v: "–", label: "h" },
        { key: "m", v: "–", label: "min" },
        { key: "s", v: "–", label: "sec" },
      ];

  return (
    <div className="rounded-[18px] border border-brand-text/10 bg-white px-4 py-4 text-center sm:py-[18px]">
      <p className="m-0 font-mono text-[10.5px] font-bold uppercase tracking-[0.2em] text-brand-deep-dark">
        Départ le {quand}, dans
      </p>
      {imminent ? (
        <p className="m-0 mt-2.5 font-lora text-lg italic text-brand-text">
          Le départ est imminent…
        </p>
      ) : (
        <div className="mt-2 flex items-end justify-center gap-3 sm:gap-6">
          {units.map((u) => (
            <div key={u.key} className="flex min-w-0 flex-col items-center">
              <span className="font-heading text-[34px] font-bold leading-none tabular-nums text-brand-text sm:text-[40px]">
                {u.v}
              </span>
              <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-brand-text/45 sm:text-[9.5px]">
                {u.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
