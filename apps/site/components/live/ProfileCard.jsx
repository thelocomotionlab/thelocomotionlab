// components/live/ProfileCard.jsx
//
// Profil altimétrique (design 2a/2d) : SVG inline calculé côté client — zéro
// lib de chart (mini-spec 2g). Aire couverte ambre / restante brune, ligne
// complète brune + portion couverte ambre foncé, marqueur terracotta.
// Les repères de cols (waypoints) viennent de liveConfig — placeholder propre
// (aucun repère) tant que Valentin n'a pas fourni la liste (brief §10.3).

"use client";

import { brandColors } from "@locomotionlab/ui";

import { useMemo } from "react";

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

export default function ProfileCard({ profile, totalKm, doneKm, elevationMin, elevationMax, waypoints = [] }) {
  const geometry = useMemo(() => {
    if (!profile || profile.length < 2 || !(totalKm > 0)) return null;
    const pts = decimate(profile);
    const x = (km) => (km / totalKm) * W;
    const y = (alt) =>
      TOP + (1 - (alt - elevationMin) / Math.max(1, elevationMax - elevationMin)) * (H - TOP - BOT);

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
    return { line, remainArea, coverLine, coverArea, markX: x(markKm), markY: y(markAlt) };
  }, [profile, totalKm, doneKm, elevationMin, elevationMax]);

  if (!geometry) return null;
  const showMarker = doneKm > 0;

  return (
    <section className="rounded-[18px] border border-brand-text/10 bg-white px-4 pb-2.5 pt-4 shadow-[0_6px_20px_rgba(51,51,51,0.06)] lg:px-[22px] lg:shadow-none">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-brand-deep-dark">
          Profil altimétrique
        </p>
        <p className="font-heading text-[10.5px] text-brand-text/55 lg:text-[11px]">
          <span className="max-lg:hidden">0 → {Math.round(totalKm)} km · </span>
          {elevationMin.toLocaleString("fr-FR")} → {elevationMax.toLocaleString("fr-FR")} m
        </p>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-[110px] w-full overflow-visible"
        aria-hidden="true"
      >
        <path d={geometry.remainArea} fill="rgba(154,96,68,0.10)" />
        {geometry.coverArea && <path d={geometry.coverArea} fill="rgba(239,177,89,0.32)" />}
        <path d={geometry.line} fill="none" stroke={brandColors.deepDark} strokeWidth="1.6" strokeLinejoin="round" />
        {geometry.coverLine && (
          <path d={geometry.coverLine} fill="none" stroke={brandColors.accentDark} strokeWidth="2.8" strokeLinejoin="round" />
        )}
        {waypoints.map((w) => (
          <line
            key={w.nom}
            x1={(w.km / totalKm) * W}
            y1={TOP}
            x2={(w.km / totalKm) * W}
            y2={BASE_Y}
            stroke="rgba(51,51,51,0.15)"
            strokeWidth="1"
            strokeDasharray="2 3"
          />
        ))}
        {showMarker && (
          <>
            <line x1={geometry.markX} y1="0" x2={geometry.markX} y2={BASE_Y} stroke={brandColors.deep} strokeWidth="1.6" />
            <circle cx={geometry.markX} cy={geometry.markY} r="6" fill={brandColors.deep} stroke={brandColors.bg} strokeWidth="2.5" />
          </>
        )}
      </svg>

      {waypoints.length > 0 && (
        <div className="relative mt-0.5 h-[15px] lg:h-4">
          {waypoints.map((w) => (
            <span
              key={w.nom}
              className="absolute top-0 -translate-x-1/2 whitespace-nowrap font-heading text-[9px] text-brand-text/55 lg:text-[10px]"
              style={{ left: `${(w.km / totalKm) * 100}%` }}
            >
              {w.nom}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
