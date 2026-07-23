// components/live/LiveEnCours.jsx
//
// L'état « En cours » de /live (design live-v2, écrans 2a mobile / 2d desktop).
// Orchestrateur : polling positions (10 s) + journal (30 s) + GPX prévisionnel,
// fraîcheur à trois régimes, et la grille responsive — une colonne mobile dans
// l'ordre du design, deux colonnes 1fr/460px en desktop (les wrappers passent
// de display:contents à flex, les `order-*` ne jouent qu'en mobile).

"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

import { journalApiBase, liveConfig, liveReglages } from "@/lib/liveConfig";
import { freshnessState } from "@/lib/freshness";
import { dayIndex } from "@/lib/liveTime";
import { useJournal } from "@/lib/useJournal";
import { useLivePositions } from "@/lib/useLivePositions";
import { useReferenceTrack } from "@/lib/useReferenceTrack";
import FreshnessPill from "./FreshnessPill";
import JournalCard from "./JournalCard";
import LiveHeader from "./LiveHeader";
import MapStyleSwitch from "./MapStyleSwitch";
import MessageCard from "./MessageCard";
import ProfileCard from "./ProfileCard";
import ProgressionCard from "./ProgressionCard";

// maplibre ne se charge que quand le direct est actif (budget premier chargement).
const LiveMap = dynamic(() => import("./LiveMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-brand-primary/10" />,
});

export default function LiveEnCours({ timer }) {
  const { aventure } = liveConfig;
  const [mapStyle, setMapStyle] = useState("relief");
  const [hoverPoint, setHoverPoint] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const positions = useLivePositions({ pollMs: liveReglages.positionsPollMs });
  const journal = useJournal({ pollMs: liveReglages.journalPollMs });
  const reference = useReferenceTrack(aventure.trace);

  // Horloge 30 s : fait vieillir la fraîcheur et avancer le chrono sans polling.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const doneCoords = useMemo(
    () =>
      (positions?.profile ?? [])
        .filter((p) => Number.isFinite(p.longitude) && Number.isFinite(p.latitude))
        .map((p) => [p.longitude, p.latitude]),
    [positions],
  );

  const stats = positions?.stats;
  // Pas de pastille tant que la PREMIÈRE réponse des positions n'est pas là :
  // sinon « premier signal » clignote à chaque chargement en pleine course.
  const freshness =
    positions === null
      ? null
      : freshnessState({
          running: timer?.running === true,
          lastFixTime: stats?.lastFixTime ?? null,
          nowMs,
          zoneBlancheMinutes: liveReglages.zoneBlancheMinutes,
        });

  const startMs = timer?.startTime ? Date.parse(timer.startTime) : NaN;
  const elapsedSeconds = Number.isFinite(startMs)
    ? Math.max(0, (nowMs - startMs) / 1000)
    : (stats?.durationSeconds ?? 0);

  const jour = dayIndex(new Date(nowMs).toISOString(), aventure.dateDebut);
  // Stats de la trace, calculées du GPX (undefined tant que la trace charge).
  const distanceKm = reference?.totalKm;
  const deniveleM = reference?.dPlusM;

  return (
    <div className="mx-auto max-w-6xl">
      <LiveHeader
        aventure={aventure}
        distanceKm={distanceKm}
        deniveleM={deniveleM}
        jour={jour}
        mapStyle={mapStyle}
        onMapStyle={setMapStyle}
      />

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_460px] lg:items-start lg:gap-5">
        {/* Colonne gauche desktop : carte + profil. */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          <div className="relative order-1 h-[380px] max-lg:-mx-4 sm:max-lg:-mx-6 lg:h-[520px] lg:overflow-hidden lg:border lg:border-brand-text/10">
            <LiveMap
              referenceCoords={reference?.coords}
              doneCoords={doneCoords}
              mapStyle={mapStyle}
              hoverPoint={hoverPoint}
            />
            <div className="absolute right-3 top-3 z-[5] lg:hidden">
              <MapStyleSwitch value={mapStyle} onChange={setMapStyle} />
            </div>
            <FreshnessPill state={freshness} />
          </div>

          <div className="order-3">
            <ProfileCard
              profile={reference?.profile}
              totalKm={reference?.totalKm}
              doneKm={(stats?.distance ?? 0) / 1000}
              elevationMin={reference?.elevMinM}
              elevationMax={reference?.elevMaxM}
              waypoints={aventure.waypoints ?? []}
              onHoverPoint={setHoverPoint}
            />
          </div>
        </div>

        {/* Colonne droite desktop : progression + journal + message. */}
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <div className="order-2">
            <ProgressionCard
              stats={stats}
              totalKm={reference?.totalKm}
              elapsedSeconds={elapsedSeconds}
            />
          </div>
          <div className="order-4">
            <JournalCard entries={journal?.entries} dateDebut={aventure.dateDebut} />
          </div>
          <div className="order-5">
            <MessageCard />
          </div>

          {/* Story de partage (PR4) — lien discret, usage manuel Instagram. */}
          <p className="order-6 text-right">
            <a
              href={`${journalApiBase}/journal/story.png`}
              target="_blank"
              rel="noreferrer"
              className="font-heading text-[11px] text-brand-text/45 underline-offset-2 hover:underline"
            >
              Télécharger la story
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
