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
import ItineraireLine from "./ItineraireLine";
import MapStyleSwitch from "./MapStyleSwitch";
import ProfileCard from "./ProfileCard";

const LiveMap = dynamic(() => import("./LiveMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-brand-primary/10" />,
});

export default function LiveAvant() {
  const { aventure } = liveConfig;
  const reference = useReferenceTrack(aventure.trace);
  const [mapStyle, setMapStyle] = useState("relief");
  const [hoverPoint, setHoverPoint] = useState(null);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3.5">
      {/* Hero */}
      <div>
        <h1 className="m-0 font-heading text-4xl font-bold leading-[1.1] text-brand-slate-dark md:text-5xl">
          {aventure.nom}
        </h1>
        {/* Intention : la voix éditoriale du site (Lora italique terracotta,
            même gabarit que les exergues des autres pages). */}
        <p className="mt-3.5 font-lora text-xl italic leading-relaxed text-brand-deep md:text-[22px]">
          {aventure.intention}
        </p>
        <div
          className="mt-4 h-[3px] w-16 rounded-full bg-brand-accent"
          aria-hidden="true"
        />
      </div>

      <Countdown dateDebut={aventure.dateDebut} />

      {/* Itinéraire prévisionnel — les stats de la trace (calculées du GPX)
          vivent sur la ligne du label depuis le retrait de la ligne du hero. */}
      <div>
        <div className="mb-[9px] flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
          <ItineraireLine reference={reference} />
          <MapStyleSwitch value={mapStyle} onChange={setMapStyle} variant="header" />
        </div>
        <div className="relative h-[280px] overflow-hidden border border-brand-text/10 sm:h-[380px]">
          <LiveMap
            referenceCoords={reference?.coords}
            doneCoords={[]}
            mapStyle={mapStyle}
            markerMode="depart"
            hoverPoint={hoverPoint}
          />
        </div>
      </div>

      {/* Profil altimétrique : doneKm=0 → ligne brune seule, pas de marqueur.
          Le survol pose son point jumeau sur la carte (hoverPoint). */}
      {reference?.profile && (
        <ProfileCard
          profile={reference.profile}
          totalKm={reference.totalKm}
          doneKm={0}
          elevationMin={reference.elevMinM}
          elevationMax={reference.elevMaxM}
          waypoints={aventure.waypoints ?? []}
          onHoverPoint={setHoverPoint}
        />
      )}

      <EmailCaptureCard title="Être prévenu·e du départ" />
    </div>
  );
}
