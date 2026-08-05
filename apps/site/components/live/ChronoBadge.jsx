// components/live/ChronoBadge.jsx
//
// Le temps écoulé, posé sur la carte. Il était dans la carte Progression, figé
// à la minute : l'horloge de LiveEnCours ne bat que toutes les 30 s (elle sert
// à faire vieillir la fraîcheur, pas à animer un chrono). Un temps qui ne bouge
// pas sur une page « en direct » donne l'impression que tout est gelé.
//
// Il tient donc son propre battement, à la seconde, et s'arrête net quand le
// chrono s'arrête — là, plus rien à animer.

"use client";

import { useEffect, useState } from "react";

/** « 2 j 08:32:07 » — jours seulement au-delà de 24 h. */
function formatChrono(totalSecondes) {
  const s = Math.max(0, Math.floor(totalSecondes));
  const jours = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const deuxChiffres = (n) => String(n).padStart(2, "0");
  const horloge = `${deuxChiffres(h)}:${deuxChiffres(min)}:${deuxChiffres(sec)}`;
  return jours > 0 ? `${jours} j ${horloge}` : horloge;
}

export default function ChronoBadge({ startTime, stopTime, running }) {
  const debutMs = startTime ? Date.parse(startTime) : NaN;
  const finMs = stopTime ? Date.parse(stopTime) : NaN;

  const calcule = () => {
    if (!Number.isFinite(debutMs)) return 0;
    const fin = running ? Date.now() : Number.isFinite(finMs) ? finMs : Date.now();
    return Math.max(0, (fin - debutMs) / 1000);
  };

  const [secondes, setSecondes] = useState(calcule);

  useEffect(() => {
    setSecondes(calcule());
    // Chrono arrêté = valeur figée : inutile de réveiller le navigateur.
    if (!running || !Number.isFinite(debutMs)) return undefined;
    const id = setInterval(() => setSecondes(calcule()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, debutMs, finMs]);

  if (!Number.isFinite(debutMs)) return null;

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-[5] rounded-full bg-brand-text/75 px-3 py-1.5 backdrop-blur-sm">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">
        {running ? "Depuis" : "Durée"}
      </span>{" "}
      <span className="font-mono text-[13px] font-bold tabular-nums text-white">
        {formatChrono(secondes)}
      </span>
    </div>
  );
}
