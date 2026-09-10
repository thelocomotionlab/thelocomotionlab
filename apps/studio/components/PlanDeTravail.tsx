"use client";

// components/PlanDeTravail.tsx
//
// LE PLAN DE TRAVAIL : la planche, posée sur un fond neutre.
//
// L'APERÇU EST L'IMAGE FINALE. Le canvas est dimensionné en PIXELS DE SORTIE
// (1080 × 1350, 1080 × 1920, 1080 × 1080) et seulement réduit en CSS. Ce qu'on
// voit est ce qu'on exporte, au pixel près — c'est ce qui rend la manipulation
// directe honnête : une poignée déplacera vraiment le pixel qu'elle montre.
//
// LES REPÈRES D'ATELIER SONT SUR UN SECOND CANVAS, par-dessus. Marges de la
// charte et zone sûre d'Instagram ne partent pas sur le réseau : les dessiner
// dans le même canvas que la planche les enverrait à l'export.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MARGE,
  besoinsDeFond,
  contexteDeRendu,
  dessinerPlanche,
  formatDe,
  themeDe,
  type Projet,
  type SourceImage,
} from "@locomotionlab/planche";
import { decouperTrace } from "@locomotionlab/trace";

import { policeChargee, policeDuLabo } from "@/lib/police";
import { completerLesFonds, fondsEnCache } from "@/lib/tuiles";

/** L'air laissé autour de la planche quand elle s'ajuste à la fenêtre. */
const RESPIRATION = 48;

export default function PlanDeTravail({
  projet,
  indexPlanche,
  zoom,
}: {
  projet: Projet;
  indexPlanche: number;
  zoom: number | null;
}) {
  const cadre = useRef<HTMLDivElement | null>(null);
  const planche = useRef<HTMLCanvasElement | null>(null);
  const reperes = useRef<HTMLCanvasElement | null>(null);
  const [ajuste, setAjuste] = useState(0.3);
  const [prete, setPrete] = useState(false);
  const [logo, setLogo] = useState<SourceImage | null>(null);
  // Incrémenté quand une mosaïque arrive : le rendu se rejoue avec le terrain.
  const [fondsVenus, setFondsVenus] = useState(0);

  const format = formatDe(projet.format);
  const theme = themeDe(projet.theme);

  // La fonte d'abord : sans elle, la première planche se mesure sur la police
  // de secours, les lignes se coupent ailleurs, et tout se décale à l'arrivée
  // d'Ubuntu.
  useEffect(() => {
    let vivant = true;
    policeChargee().then(() => vivant && setPrete(true));
    const img = new Image();
    img.src = "/images/assets/logo-mark-512.png";
    img.decode().then(
      () => vivant && setLogo(img),
      () => {},
    );
    return () => {
      vivant = false;
    };
  }, []);

  // « Ajuster » se recalcule à chaque changement de taille du plan de travail :
  // replier le tiroir doit agrandir la planche, pas laisser un blanc.
  const mesurer = useCallback(() => {
    const el = cadre.current;
    if (!el) return;
    setAjuste(
      Math.max(
        0.05,
        Math.min(
          (el.clientWidth - RESPIRATION * 2) / format.width,
          (el.clientHeight - RESPIRATION * 2) / format.height,
        ),
      ),
    );
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
  const courante = projet.planches[indexPlanche] ?? null;

  useEffect(() => {
    const ctx = planche.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, format.width, format.height);
    if (!courante || courante.type !== "image") {
      ctx.fillStyle = theme.fond;
      ctx.fillRect(0, 0, format.width, format.height);
      return;
    }
    const c = contexteDeRendu(projet, courante, {
      police: policeDuLabo(),
      logo,
      segments: decouperTrace(projet.donnees.trace, projet.donnees.coupures),
      fonds: fondsEnCache(),
    });
    dessinerPlanche(ctx, courante, c);

    // La planche est déjà à l'écran, sur son aplat : les tuiles la complètent
    // quand elles arrivent. L'inverse — attendre le réseau pour dessiner —
    // rendrait le studio inutilisable au bivouac.
    let vivant = true;
    completerLesFonds(besoinsDeFond(courante, c)).then((venu) => {
      if (venu && vivant) setFondsVenus((n) => n + 1);
    });
    return () => {
      vivant = false;
    };
  }, [projet, courante, format, theme, logo, prete, fondsVenus]);

  useEffect(() => {
    const ctx = reperes.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, format.width, format.height);
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
  }, [format, theme]);

  return (
    <div
      ref={cadre}
      className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-brand-text/5"
    >
      <div
        className="relative shadow-card"
        style={{ width: format.width * echelle, height: format.height * echelle }}
      >
        <canvas
          ref={planche}
          width={format.width}
          height={format.height}
          aria-label={`Planche ${format.label}`}
          className="block h-full w-full"
        />
        <canvas
          ref={reperes}
          width={format.width}
          height={format.height}
          aria-hidden
          className="pointer-events-none absolute inset-0 block h-full w-full"
        />
      </div>

      <p className="tabulaire pointer-events-none absolute bottom-2 right-3 text-[11px] text-brand-muted">
        {format.width} × {format.height} · {Math.round(echelle * 100)} %
      </p>
    </div>
  );
}
