"use client";

// components/PlanDeTravail.tsx
//
// LE PLAN DE TRAVAIL : la planche, posée sur un fond neutre.
//
// L'APERÇU EST L'IMAGE FINALE. Le canvas est dimensionné en PIXELS DE SORTIE
// (1080 × 1350, 1080 × 1920, 1080 × 1080) et seulement réduit en CSS. Ce qu'on
// voit est ce qu'on exporte, au pixel près — c'est ce qui rend la manipulation
// directe honnête : une poignée déplace vraiment le pixel qu'elle montre.
//
// La zone sûre de la story est tracée en pointillé : c'est la bande qu'Instagram
// ne recouvre pas de son interface, et la contrainte qu'on découvre autrement
// sur une vraie publication.

import { useCallback, useEffect, useRef, useState } from "react";
import { MARGE, formatDe, themeDe, type Projet } from "@locomotionlab/planche";

/** L'air laissé autour de la planche quand elle s'ajuste à la fenêtre. */
const RESPIRATION = 48;

export default function PlanDeTravail({
  projet,
  zoom,
}: {
  projet: Projet;
  zoom: number | null;
}) {
  const cadre = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [ajuste, setAjuste] = useState(0.3);

  const format = formatDe(projet.format);
  const theme = themeDe(projet.theme);

  // « Ajuster » se recalcule à chaque changement de taille du plan de travail :
  // replier le tiroir doit agrandir la planche, pas laisser un blanc.
  const mesurer = useCallback(() => {
    const el = cadre.current;
    if (!el) return;
    const dispo = Math.min(
      (el.clientWidth - RESPIRATION * 2) / format.width,
      (el.clientHeight - RESPIRATION * 2) / format.height,
    );
    setAjuste(Math.max(0.05, dispo));
  }, [format.width, format.height]);

  useEffect(() => {
    mesurer();
    const el = cadre.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mesurer]);

  const echelle = zoom ?? ajuste;

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;

    ctx.clearRect(0, 0, format.width, format.height);
    ctx.fillStyle = projet.theme === "sombre" ? theme.fond : theme.fond;
    ctx.fillRect(0, 0, format.width, format.height);

    // Les marges de la charte et la zone sûre, en repères d'atelier : elles ne
    // sont PAS dessinées à l'export, seulement ici, sous la composition.
    ctx.save();
    ctx.strokeStyle = theme.filet;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 12]);
    ctx.strokeRect(MARGE, MARGE, format.width - MARGE * 2, format.height - MARGE * 2);
    if (format.zoneSure) {
      ctx.beginPath();
      ctx.moveTo(0, format.zoneSure.top);
      ctx.lineTo(format.width, format.zoneSure.top);
      ctx.moveTo(0, format.zoneSure.bottom);
      ctx.lineTo(format.width, format.zoneSure.bottom);
      ctx.stroke();
    }
    ctx.restore();
  }, [format, theme, projet.theme]);

  return (
    <div
      ref={cadre}
      className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-brand-text/5"
    >
      <div
        className="shadow-card"
        style={{
          width: format.width * echelle,
          height: format.height * echelle,
        }}
      >
        <canvas
          ref={canvas}
          width={format.width}
          height={format.height}
          aria-label={`Planche ${format.label}`}
          className="block h-full w-full"
        />
      </div>

      <p className="tabulaire pointer-events-none absolute bottom-2 right-3 text-[11px] text-brand-muted">
        {format.width} × {format.height} · {Math.round(echelle * 100)} %
      </p>
    </div>
  );
}
