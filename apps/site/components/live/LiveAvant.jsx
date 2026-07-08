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
import { dayIndex } from "@/lib/liveTime";
import { useReferenceTrack } from "@/lib/useReferenceTrack";
import Countdown from "./Countdown";
import EmailCaptureCard from "./EmailCaptureCard";
import MapStyleSwitch from "./MapStyleSwitch";
import ProfileCard from "./ProfileCard";

const LiveMap = dynamic(() => import("./LiveMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-brand-primary/10" />,
});

/** Badge « J−44 » : jours calendaires français restants avant le départ. */
function badgeJMoins(dateDebut) {
  const days = Math.max(0, dayIndex(dateDebut, new Date().toISOString()) - 1);
  return `J−${days}`;
}

export default function LiveAvant() {
  const { aventure, live } = liveConfig;
  const reference = useReferenceTrack(live.referenceTrack);
  const [mapStyle, setMapStyle] = useState("topo");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3.5">
      {/* Ligne identité + badge J−x */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-brand-primary">
            <span className="h-[13px] w-[13px] -rotate-[30deg] rounded-full border-[2.2px] border-brand-bg border-r-transparent" />
          </span>
          <span className="font-heading text-xs font-medium text-brand-text">
            The Locomotion Lab
          </span>
        </div>
        <span className="inline-flex items-center rounded-[20px] bg-brand-primary/22 px-[11px] py-[5px] font-heading text-[10.5px] font-bold tracking-[0.1em] text-brand-primary-dark">
          {badgeJMoins(aventure.dateDebut)}
        </span>
      </div>

      {/* Hero */}
      <div>
        <p className="font-heading text-[11px] font-bold uppercase tracking-[0.14em] text-brand-deep-dark">
          Prochain départ
        </p>
        <h1 className="m-0 mt-1.5 font-heading text-[22px] font-bold leading-[1.15] text-brand-text sm:text-[26px]">
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
      </div>

      <Countdown dateDebut={aventure.dateDebut} />

      <EmailCaptureCard title="Être prévenu·e du départ" />

      {/* Itinéraire prévisionnel */}
      <div>
        <div className="mb-[9px] flex items-center justify-between">
          <p className="font-heading text-[11px] font-bold uppercase tracking-[0.14em] text-brand-deep-dark">
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
    </div>
  );
}
