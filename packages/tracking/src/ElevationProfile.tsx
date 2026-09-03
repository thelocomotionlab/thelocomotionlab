// packages/tracking/src/ElevationProfile.tsx
//
// Profil altimétrique du labo : SVG inline calculé côté client, zéro lib de
// chart (design 2a/2d du direct, recette 2026-07-24). Porté du ProfileCard du
// site pour servir les trois cartes de contenu — direct, replays, traces GPX —
// depuis un seul endroit. Le composant est NU : ni cadre ni titre ; c'est le
// parent qui décide de l'habillage (carte du direct, bandeau collé sous une
// carte…).
//
// Aire couverte ambre / restante brune, ligne complète brune + portion
// couverte ambre foncé, marqueur terracotta à `doneKm` (rien si 0).
// SURVOL : un point fuchsia glisse sur la ligne, un encart affiche km /
// altitude / D+ / D− accumulés à ce point, et le parent reçoit [lng, lat]
// (onHoverPoint) pour poser le point jumeau sur la carte.
// Les repères (waypoints) : un pointillé vertical, et l'icône choisie en haut
// de ce pointillé. Les icônes sont posées en HTML au-dessus du SVG, pas
// dedans : le graphe est en `preserveAspectRatio="none"` (il s'étire en
// largeur), ce qui déformerait n'importe quelle icône dessinée à l'intérieur.

"use client";

import { useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { brandColors } from "@locomotionlab/ui";

import { traceColors } from "./mapStyles";

const W = 1000;
const H = 180;
const TOP = 12;
const BOT = 24;
const BASE_Y = H - BOT; // 156

/** Un point du profil, au format du .track.json (km cumulés, altitude…). */
export type ProfileGraphPoint = {
  km: number;
  alt: number;
  lat?: number;
  lng?: number;
  /** D+ / D− cumulés à ce point, quand la trace les porte. */
  dp?: number;
  dm?: number;
};

/** Un repère du parcours, déjà résolu (position 0..1 et icône choisie). */
export type ProfileWaypoint = {
  cle: string;
  frac: number;
  nom?: string | null;
  Icone: LucideIcon;
};

export type ElevationProfileProps = {
  profile: ProfileGraphPoint[] | null | undefined;
  totalKm: number | null | undefined;
  /** Kilomètres parcourus : aire couverte + marqueur. 0 = itinéraire seul. */
  doneKm?: number;
  /** Bornes de l'axe des altitudes ; sinon dérivées du profil lui-même. */
  elevationMin?: number;
  elevationMax?: number;
  waypoints?: ProfileWaypoint[];
  onHoverPoint?: (lngLat: [number, number] | null) => void;
};

type HoverState = ProfileGraphPoint & { x: number; y: number; frac: number };

/** Sous-échantillonne le profil à ~200 points : le path SVG reste léger. */
function decimate<T>(profile: T[], target = 200): T[] {
  if (profile.length <= target) return profile;
  const step = profile.length / target;
  const out: T[] = [];
  for (let i = 0; i < target; i++) out.push(profile[Math.floor(i * step)]);
  out.push(profile[profile.length - 1]);
  return out;
}

export default function ElevationProfile({
  profile,
  totalKm,
  doneKm = 0,
  elevationMin,
  elevationMax,
  waypoints = [],
  onHoverPoint,
}: ElevationProfileProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const total = typeof totalKm === "number" ? totalKm : Number(totalKm);

  const geometry = useMemo(() => {
    if (!profile || profile.length < 2 || !(total > 0)) return null;
    const pts = decimate(profile);
    // Bornes altimétriques : celles passées en props (calculées du GPX par
    // build:track), sinon dérivées du profil lui-même (vieux .track.json).
    let emin = elevationMin;
    let emax = elevationMax;
    if (!Number.isFinite(emin) || !Number.isFinite(emax)) {
      emin = Infinity;
      emax = -Infinity;
      for (const p of pts) {
        if (p.alt < emin) emin = p.alt;
        if (p.alt > emax) emax = p.alt;
      }
    }
    const lo = emin as number;
    const hi = emax as number;
    const x = (km: number) => (km / total) * W;
    const y = (alt: number) => TOP + (1 - (alt - lo) / Math.max(1, hi - lo)) * (H - TOP - BOT);

    const all = pts.map((p) => `${x(p.km).toFixed(1)} ${y(p.alt).toFixed(1)}`);
    const covered = pts.filter((p) => p.km <= doneKm);
    const cov = covered.map((p) => `${x(p.km).toFixed(1)} ${y(p.alt).toFixed(1)}`);

    const line = `M ${all.join(" L ")}`;
    const remainArea = `M ${x(pts[0].km).toFixed(1)} ${BASE_Y} L ${all.join(" L ")} L ${W} ${BASE_Y} Z`;
    const coverLine = cov.length > 1 ? `M ${cov.join(" L ")}` : null;
    const coverArea =
      cov.length > 1
        ? `M ${x(covered[0].km).toFixed(1)} ${BASE_Y} L ${cov.join(" L ")} L ${x(
            covered[covered.length - 1].km,
          ).toFixed(1)} ${BASE_Y} Z`
        : null;

    // Altitude au point courant (interpolation grossière suffisante à l'écran).
    const markKm = Math.min(doneKm, total);
    let markAlt = pts[0].alt;
    for (const p of pts) {
      if (p.km > markKm) break;
      markAlt = p.alt;
    }

    // Grille légère d'arrière-plan : pas « ronds » choisis pour ~4 lignes
    // horizontales (altitude) et ~5 verticales (km). L'aire du profil la
    // recouvre (masque blanc opaque sous l'aire translucide).
    const niceStep = (raw: number, steps: number[]) =>
      steps.find((s) => raw <= s) ?? steps[steps.length - 1];
    const altStep = niceStep((hi - lo) / 4, [50, 100, 200, 250, 500, 1000, 2000]);
    const kmStep = niceStep(total / 6, [1, 2, 5, 10, 20, 25, 50, 100]);
    const gridY: number[] = [];
    for (let a = Math.ceil(lo / altStep) * altStep; a < hi; a += altStep) {
      gridY.push(y(a));
    }
    const gridX: number[] = [];
    for (let k = kmStep; k < total; k += kmStep) gridX.push(x(k));

    return {
      line,
      remainArea,
      coverLine,
      coverArea,
      markX: x(markKm),
      markY: y(markAlt),
      pts,
      gridX,
      gridY,
      emin: lo,
      emax: hi,
    };
  }, [profile, total, doneKm, elevationMin, elevationMax]);

  if (!geometry) return null;
  const showMarker = doneKm > 0;

  // Survol (souris ou glissé tactile) : point du profil le plus proche de la
  // position horizontale du curseur (profil décimé ~200 pts : balayage OK).
  const handleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const km = frac * total;
    let best = geometry.pts[0];
    for (const p of geometry.pts) {
      if (Math.abs(p.km - km) < Math.abs(best.km - km)) best = p;
    }
    const x = (best.km / total) * W;
    const y =
      TOP +
      (1 - (best.alt - geometry.emin) / Math.max(1, geometry.emax - geometry.emin)) *
        (H - TOP - BOT);
    setHover({ ...best, x, y, frac });
    onHoverPoint?.(
      Number.isFinite(best.lat) && Number.isFinite(best.lng)
        ? [best.lng as number, best.lat as number]
        : null,
    );
  };
  const handleLeave = () => {
    setHover(null);
    onHoverPoint?.(null);
  };

  return (
    // pt-[22px] : la bande où se posent les icônes des repères, au-dessus du
    // graphe. Le padding est vertical — le calcul du survol n'utilise que
    // `rect.left` et `rect.width`, il n'est pas affecté.
    <div
      ref={frameRef}
      className="relative cursor-crosshair touch-pan-y pt-[22px]"
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-[110px] w-full overflow-visible"
        aria-hidden="true"
      >
        {/* Grille d'arrière-plan (très légère), recouverte par l'aire. */}
        {geometry.gridY.map((gy) => (
          <line
            key={`gy-${gy}`}
            x1="0"
            y1={gy}
            x2={W}
            y2={gy}
            stroke="rgba(51,51,51,0.08)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {geometry.gridX.map((gx) => (
          <line
            key={`gx-${gx}`}
            x1={gx}
            y1={TOP}
            x2={gx}
            y2={BASE_Y}
            stroke="rgba(51,51,51,0.08)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* Masque blanc opaque sous l'aire translucide : la grille disparaît
            dans l'aire du profil sans changer sa couleur perçue. */}
        <path d={geometry.remainArea} fill="#ffffff" />
        <path d={geometry.remainArea} fill="rgba(154,96,68,0.10)" />
        {geometry.coverArea && <path d={geometry.coverArea} fill="rgba(239,177,89,0.32)" />}
        <path
          d={geometry.line}
          fill="none"
          stroke={brandColors.deepDark}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {geometry.coverLine && (
          <path
            d={geometry.coverLine}
            fill="none"
            stroke={brandColors.accentDark}
            strokeWidth="2.8"
            strokeLinejoin="round"
          />
        )}
        {/* Pointillé du repère : il monte jusqu'au bord haut du graphe, où
            l'icône vient s'y poser (rendue en HTML, juste après le SVG). */}
        {waypoints.map((w) => (
          <line
            key={w.cle}
            x1={w.frac * W}
            y1={TOP}
            x2={w.frac * W}
            y2={BASE_Y}
            stroke="rgba(51,51,51,0.28)"
            strokeWidth="1"
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {showMarker && (
          <>
            <line
              x1={geometry.markX}
              y1="0"
              x2={geometry.markX}
              y2={BASE_Y}
              stroke={brandColors.deep}
              strokeWidth="1.6"
            />
            <circle
              cx={geometry.markX}
              cy={geometry.markY}
              r="6"
              fill={brandColors.deep}
              stroke={brandColors.bg}
              strokeWidth="2.5"
            />
          </>
        )}
        {hover && (
          <>
            <line
              x1={hover.x}
              y1={TOP}
              x2={hover.x}
              y2={BASE_Y}
              stroke="rgba(51,51,51,0.28)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={hover.x}
              cy={hover.y}
              r="5.5"
              fill={traceColors.line}
              stroke={traceColors.casing}
              strokeWidth="2.5"
            />
          </>
        )}
      </svg>

      {/* Icônes des repères, en haut de leur pointillé. `clamp` garde les
          icônes des extrémités (départ, arrivée) entièrement dans le cadre
          au lieu de les laisser déborder à moitié. */}
      {waypoints.map((w) => (
        <span
          key={w.cle}
          title={w.nom || undefined}
          className="pointer-events-none absolute top-0 z-[3] flex h-[22px] w-[22px] -translate-x-1/2 items-center justify-center rounded-full border border-brand-text/15 bg-white text-brand-deep-dark shadow-[0_1px_4px_rgba(51,51,51,0.16)]"
          style={{ left: `clamp(11px, ${w.frac * 100}%, calc(100% - 11px))` }}
        >
          <w.Icone size={12} strokeWidth={2.2} aria-hidden="true" />
          {w.nom ? <span className="sr-only">{w.nom}</span> : null}
        </span>
      ))}

      {/* Encart du point survolé : km / alt, et D+ / D− accumulés quand la
          trace les porte (tracks régénérés par build-reference-track). */}
      {hover && (
        <div
          className="pointer-events-none absolute top-0 z-[5] -translate-x-1/2 whitespace-nowrap rounded-[9px] border border-brand-text/10 bg-white/95 px-2.5 py-1.5 text-center font-heading text-[11px] leading-[1.5] text-brand-text shadow-[0_4px_14px_rgba(51,51,51,0.14)]"
          style={{ left: `clamp(64px, ${hover.frac * 100}%, calc(100% - 64px))` }}
        >
          <span className="font-bold">km {hover.km.toFixed(1)}</span>
          <span className="text-brand-text/40"> · </span>
          {Math.round(hover.alt).toLocaleString("fr-FR")} m
          {Number.isFinite(hover.dp) && Number.isFinite(hover.dm) && (
            <div className="text-[10px] text-brand-text/65">
              D+ {(hover.dp as number).toLocaleString("fr-FR")} m · D−{" "}
              {(hover.dm as number).toLocaleString("fr-FR")} m
            </div>
          )}
        </div>
      )}
    </div>
  );
}
