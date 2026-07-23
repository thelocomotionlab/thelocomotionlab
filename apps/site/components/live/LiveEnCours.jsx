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

import { liveConfig, liveReglages } from "@/lib/liveConfig";
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
import ShareButton from "./ShareButton";

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

  const running = timer?.running === true;
  const stats = positions?.stats;
  // Pas de pastille tant que la PREMIÈRE réponse des positions n'est pas là :
  // sinon « premier signal » clignote à chaque chargement en pleine course.
  const freshness =
    positions === null
      ? null
      : freshnessState({
          running,
          lastFixTime: stats?.lastFixTime ?? null,
          nowMs,
          zoneBlancheMinutes: liveReglages.zoneBlancheMinutes,
        });

  // Chrono : court tant que ça tourne, FIGÉ à l'heure d'arrêt une fois stoppé.
  const startMs = timer?.startTime ? Date.parse(timer.startTime) : NaN;
  const stopMs = timer?.stopTime ? Date.parse(timer.stopTime) : NaN;
  const endMs = running ? nowMs : Number.isFinite(stopMs) ? stopMs : nowMs;
  const elapsedSeconds = Number.isFinite(startMs)
    ? Math.max(0, (endMs - startMs) / 1000)
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
        running={running}
        mapStyle={mapStyle}
        onMapStyle={setMapStyle}
      />

      {/* Grille : mobile 1 colonne (ordre du design), desktop 2 colonnes de
          MÊME hauteur. Carte + profil gardent leurs dimensions (flex-none) ;
          SEUL le journal s'étire pour aligner sa base sur celle du profil. */}
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_460px] lg:items-stretch lg:gap-5">
        {/* Gauche : carte + profil (tailles inchangées). */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          <div className="relative order-1 h-[380px] max-lg:-mx-4 sm:max-lg:-mx-6 lg:order-none lg:h-[520px] lg:flex-none lg:overflow-hidden lg:border lg:border-brand-text/10">
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

          <div className="order-3 lg:order-none lg:flex-none">
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

        {/* Droite : progression (taille fixe) + journal (remplit le reste). */}
        <div className="contents lg:flex lg:min-h-0 lg:flex-col lg:gap-4">
          <div className="order-2 lg:order-none lg:flex-none">
            <ProgressionCard
              stats={stats}
              totalKm={reference?.totalKm}
              elapsedSeconds={elapsedSeconds}
            />
          </div>
          <div className="order-4 lg:order-none lg:min-h-0 lg:flex-1">
            <JournalCard entries={journal?.entries} dateDebut={aventure.dateDebut} fill />
          </div>
        </div>
      </div>

      {/* Sous la grille, PLEINE LARGEUR : partage + « Laisse un mot ». */}
      <div className="mt-3.5 lg:mt-5">
        <div className="mb-3 flex justify-end">
          <ShareButton />
        </div>
        <MessageCard />
      </div>
    </div>
  );
}
