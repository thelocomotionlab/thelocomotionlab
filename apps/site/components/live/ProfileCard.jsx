// components/live/ProfileCard.jsx
//
// Carte « Profil altimétrique » du direct : le cadre et le titre, autour du
// graphe partagé ElevationProfile (@locomotionlab/tracking) — le même que sous
// les replays et les cartes GPX des récits, avec les repères (waypoints) de
// liveConfig, déjà résolus par le parent (lib/liveWaypoints), et le survol qui
// remonte lat/lng (onHoverPoint) pour poser le point jumeau sur la carte.
//
// Import du module FEUILLE du package, pas de son index : l'index tire maplibre,
// que le premier chargement du direct ne doit pas payer (LiveMap est chargé à
// part, en dynamic).

"use client";

import ElevationProfile from "@locomotionlab/tracking/ElevationProfile";

export default function ProfileCard({
  profile,
  totalKm,
  doneKm,
  elevationMin,
  elevationMax,
  waypoints = [],
  onHoverPoint,
}) {
  if (!profile || profile.length < 2 || !(totalKm > 0)) return null;

  return (
    <section className="rounded-[18px] border border-brand-text/10 bg-white px-4 pb-2.5 pt-4 shadow-[0_6px_20px_rgba(51,51,51,0.06)] lg:px-[22px] lg:shadow-none">
      <div className="mb-2">
        <p className="font-heading text-[11px] font-bold uppercase tracking-[0.18em] text-brand-deep-dark">
          Profil altimétrique
        </p>
      </div>

      <ElevationProfile
        profile={profile}
        totalKm={totalKm}
        doneKm={doneKm}
        elevationMin={elevationMin}
        elevationMax={elevationMax}
        waypoints={waypoints}
        onHoverPoint={onHoverPoint}
      />
    </section>
  );
}
