// components/live/ChronoBadge.jsx
//
// Le temps écoulé, sur la ligne d'en-tête de la carte — à droite de
// l'itinéraire. Il était posé EN SURIMPRESSION sur la carte : ça masquait le
// terrain et ça ne ressemblait à rien d'autre sur la page.
//
// Il tient son propre battement, à la seconde. L'horloge de LiveEnCours, elle,
// ne bat que toutes les 30 s (elle sert à faire vieillir la fraîcheur) : un
// chrono branché dessus restait figé, ce qui sur une page « en direct » donne
// l'impression que tout est gelé.

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

export default function ChronoBadge({ startTime, stopTime, running, className = "" }) {
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
    <p className={`m-0 flex items-baseline gap-2 ${className}`}>
      <span className="font-heading text-[11px] font-bold uppercase tracking-[0.16em] text-brand-deep-dark">
        {running ? "Depuis" : "Durée"}
      </span>
      {/* Chiffres en chasse fixe : sans ça, la ligne tressaute à chaque seconde. */}
      <span className="font-mono text-[13px] font-bold tabular-nums text-brand-text">
        {formatChrono(secondes)}
      </span>
    </p>
  );
}
