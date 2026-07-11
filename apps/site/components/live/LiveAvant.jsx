// components/live/LiveAvant.jsx
//
// L'état « Avant » de /live (design 2b) : hero « Prochain départ », intention
// en Lora, compte à rebours, capture email, itinéraire prévisionnel et profil
// altimétrique. Toutes les valeurs viennent de liveConfig. Desktop non maquetté
// → une colonne centrée sobre, même grammaire de cartes (décision PR3 §7.1).

"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

import { liveConfig } from "@/lib/liveConfig";
import { useReferenceTrack } from "@/lib/useReferenceTrack";
import Countdown from "./Countdown";
import EmailCaptureCard from "./EmailCaptureCard";
import MapStyleSwitch from "./MapStyleSwitch";
import ProfileCard from "./ProfileCard";

const LiveMap = dynamic(() => import("./LiveMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-brand-primary/10" />,
});

export default function LiveAvant() {
  const { aventure, live } = liveConfig;
  const reference = useReferenceTrack(live.referenceTrack);
  const [mapStyle, setMapStyle] = useState("osm");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3.5">
      {/* Hero */}
      <div>
        <p className="font-mono text-[12px] font-bold uppercase tracking-[0.25em] text-brand-slate">
          / Prochain départ
        </p>
        <h1 className="m-0 mt-1.5 font-heading text-[24px] font-bold leading-[1.15] text-brand-slate-dark sm:text-[28px]">
          {aventure.nom}
        </h1>
        <div className="mt-[7px] flex flex-wrap gap-2.5 font-heading text-[12.5px] text-brand-text/70 sm:text-sm">
          <span>{aventure.dates}</span>
          <span className="text-brand-text/30">·</span>
          <span>
            <strong className="font-bold text-brand-text">{aventure.distanceKm}</strong> km
          </span>
          <span className="text-brand-text/30">·</span>
          <span>
            <strong className="font-bold text-brand-text">
              ~{aventure.deniveleM.toLocaleString("fr-FR")}
            </strong>{" "}
            m D+
          </span>
        </div>
        <p className="mt-3.5 font-lora text-[15px] italic leading-[1.65] text-brand-text/85 sm:text-base">
          {aventure.intention}
        </p>
        <div
          className="mt-4 h-[3px] w-16 rounded-full bg-brand-accent"
          aria-hidden="true"
        />
      </div>

      <Countdown dateDebut={aventure.dateDebut} />

      {/* Itinéraire prévisionnel */}
      <div>
        <div className="mb-[9px] flex items-center justify-between">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-brand-deep-dark">
            Itinéraire prévu
          </p>
          <MapStyleSwitch value={mapStyle} onChange={setMapStyle} variant="header" />
        </div>
        <div className="relative h-[280px] overflow-hidden rounded-[18px] border border-brand-text/10 sm:h-[380px]">
          <LiveMap referenceCoords={reference?.coords} doneCoords={[]} mapStyle={mapStyle} markerMode="depart" />
        </div>
      </div>

      {/* Profil altimétrique : doneKm=0 → ligne brune seule, pas de marqueur */}
      {reference?.profile && (
        <ProfileCard
          profile={reference.profile}
          totalKm={reference.totalKm}
          doneKm={0}
          elevationMin={live.elevationMin}
          elevationMax={live.elevationMax}
          waypoints={live.waypoints ?? []}
        />
      )}

      <EmailCaptureCard title="Être prévenu·e du départ" />
    </div>
  );
}
