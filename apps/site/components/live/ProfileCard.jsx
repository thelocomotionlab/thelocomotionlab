// components/live/ProfileCard.jsx
//
// Profil altimétrique (design 2a/2d) : SVG inline calculé côté client — zéro
// lib de chart (mini-spec 2g). Aire couverte ambre / restante brune, ligne
// complète brune + portion couverte ambre foncé, marqueur terracotta.
// SURVOL (recette 2026-07-24) : un point fuchsia glisse sur la ligne, un
// encart affiche km / altitude / D+ / D− accumulés à ce point, et le parent
// reçoit lat/lng (onHoverPoint) pour poser le point jumeau sur la carte —
// reprise de la philosophie des anciens live-trackings.
// Les repères (waypoints) viennent de liveConfig, déjà résolus par le parent
// (lib/liveWaypoints) : un pointillé vertical, et l'ICÔNE choisie dans la
// config en haut de ce pointillé. Les noms en toutes lettres sous le profil
// ont été retirés — ils se chevauchaient dès que deux repères étaient proches,
// et l'icône dit la même chose sans occuper de largeur. Le nom reste lisible
// au survol (title) et pour les lecteurs d'écran.
//
// Les icônes sont posées en HTML au-dessus du SVG, pas dedans : le graphe est
// en `preserveAspectRatio="none"` (il s'étire en largeur), ce qui déformerait
// n'importe quelle icône dessinée à l'intérieur.

"use client";

import { brandColors } from "@locomotionlab/ui";

import { useMemo, useRef, useState } from "react";

import { traceColors } from "@/lib/liveTraceColors";

const W = 1000;
const H = 180;
const TOP = 12;
const BOT = 24;
const BASE_Y = H - BOT; // 156

/** Sous-échantillonne le profil à ~200 points : le path SVG reste léger. */
function decimate(profile, target = 200) {
  if (profile.length <= target) return profile;
  const step = profile.length / target;
  const out = [];
  for (let i = 0; i < target; i++) out.push(profile[Math.floor(i * step)]);
  out.push(profile[profile.length - 1]);
  return out;
}

export default function ProfileCard({
  profile,
  totalKm,
  doneKm,
  elevationMin,
  elevationMax,
  waypoints = [],
  onHoverPoint,
}) {
  const frameRef = useRef(null);
  const [hover, setHover] = useState(null); // { km, alt, dp?, dm?, x, y, frac }

  const geometry = useMemo(() => {
    if (!profile || profile.length < 2 || !(totalKm > 0)) return null;
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
    const x = (km) => (km / totalKm) * W;
    const y = (alt) => TOP + (1 - (alt - emin) / Math.max(1, emax - emin)) * (H - TOP - BOT);

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
    const markKm = Math.min(doneKm, totalKm);
    let markAlt = pts[0].alt;
    for (const p of pts) {
      if (p.km > markKm) break;
      markAlt = p.alt;
    }

    // Grille légère d'arrière-plan : pas « ronds » choisis pour ~4 lignes
    // horizontales (altitude) et ~5 verticales (km). L'aire du profil la
    // recouvre (masque blanc opaque sous l'aire translucide).
    const niceStep = (raw, steps) => steps.find((s) => raw <= s) ?? steps[steps.length - 1];
    const altStep = niceStep((emax - emin) / 4, [50, 100, 200, 250, 500, 1000, 2000]);
    const kmStep = niceStep(totalKm / 6, [1, 2, 5, 10, 20, 25, 50, 100]);
    const gridY = [];
    for (let a = Math.ceil(emin / altStep) * altStep; a < emax; a += altStep) {
      gridY.push(y(a));
    }
    const gridX = [];
    for (let k = kmStep; k < totalKm; k += kmStep) gridX.push(x(k));

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
      emin,
      emax,
    };
  }, [profile, totalKm, doneKm, elevationMin, elevationMax]);

  if (!geometry) return null;
  const showMarker = doneKm > 0;

  // Survol (souris ou glissé tactile) : point du profil le plus proche de la
  // position horizontale du curseur (profil décimé ~200 pts : balayage OK).
  const handleMove = (e) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const km = frac * totalKm;
    let best = geometry.pts[0];
    for (const p of geometry.pts) {
      if (Math.abs(p.km - km) < Math.abs(best.km - km)) best = p;
    }
    const x = (best.km / totalKm) * W;
    const y =
      TOP +
      (1 - (best.alt - geometry.emin) / Math.max(1, geometry.emax - geometry.emin)) *
        (H - TOP - BOT);
    setHover({ ...best, x, y, frac });
    onHoverPoint?.(
      Number.isFinite(best.lat) && Number.isFinite(best.lng) ? [best.lng, best.lat] : null,
    );
  };
  const handleLeave = () => {
    setHover(null);
    onHoverPoint?.(null);
  };

  return (
    <section className="rounded-[18px] border border-brand-text/10 bg-white px-4 pb-2.5 pt-4 shadow-[0_6px_20px_rgba(51,51,51,0.06)] lg:px-[22px] lg:shadow-none">
      <div className="mb-2">
        <p className="font-heading text-[11px] font-bold uppercase tracking-[0.18em] text-brand-deep-dark">
          Profil altimétrique
        </p>
      </div>

      {/* pt-[22px] : la bande où se posent les icônes des repères, au-dessus du
          graphe. Le padding est vertical — le calcul du survol n'utilise que
          `rect.left` et `rect.width`, il n'est pas affecté. */}
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
          <path d={geometry.line} fill="none" stroke={brandColors.deepDark} strokeWidth="1.6" strokeLinejoin="round" />
          {geometry.coverLine && (
            <path d={geometry.coverLine} fill="none" stroke={brandColors.accentDark} strokeWidth="2.8" strokeLinejoin="round" />
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
              <line x1={geometry.markX} y1="0" x2={geometry.markX} y2={BASE_Y} stroke={brandColors.deep} strokeWidth="1.6" />
              <circle cx={geometry.markX} cy={geometry.markY} r="6" fill={brandColors.deep} stroke={brandColors.bg} strokeWidth="2.5" />
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
            icônes des extrémités (départ, arrivée) entièrement dans la carte
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
            {hover.alt.toLocaleString("fr-FR")} m
            {Number.isFinite(hover.dp) && (
              <div className="text-[10px] text-brand-text/65">
                D+ {hover.dp.toLocaleString("fr-FR")} m · D− {hover.dm.toLocaleString("fr-FR")} m
              </div>
            )}
          </div>
        )}
      </div>

    </section>
  );
}
