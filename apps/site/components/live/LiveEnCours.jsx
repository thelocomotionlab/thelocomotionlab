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
import { avancementSurTrace } from "@/lib/progression";
import { useJournal } from "@/lib/useJournal";
import { useLivePositions } from "@/lib/useLivePositions";
import { useReferenceTrack } from "@/lib/useReferenceTrack";
import BatteriePill from "./BatteriePill";
import ChronoBadge from "./ChronoBadge";
import FreshnessPill from "./FreshnessPill";
import ItineraireLine from "./ItineraireLine";
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

  // Avancement LE LONG du parcours (≠ distance parcourue) : c'est lui qui pilote
  // le pourcentage et le curseur du profil, pour qu'un détour ne les fasse pas
  // courir devant. On lui passe le profil BRUT (et pas doneCoords) : il porte les
  // `fixTime`, dont la projection a besoin pour son plafond de vitesse.
  // Recalculé à chaque arrivée de positions (10 s) — ~0,5 ms sur une trace réelle.
  const avancement = useMemo(
    () => avancementSurTrace(reference?.coords, positions?.profile),
    [reference, positions],
  );
  // ⚠️ Conversion d'échelle indispensable : `metresParcourus` est mesuré sur la
  // polyligne SIMPLIFIÉE, alors que `totalKm` vient du GPX complet (plus long).
  // On repasse donc par le pourcentage, seule grandeur commune aux deux.
  const avanceKm =
    avancement && Number.isFinite(reference?.totalKm)
      ? (avancement.pourcent / 100) * reference.totalKm
      : null;

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

  // Le chrono vit sur la carte (ChronoBadge) : il y bat la seconde.
  const jour = dayIndex(new Date(nowMs).toISOString(), aventure.dateDebut);

  return (
    <div className="mx-auto max-w-6xl">
      <LiveHeader
        aventure={aventure}
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
          {/* Ligne d'en-tête de la carte : le parcours prévu à gauche, le temps
              écoulé à droite. Même gabarit que l'état Avant (ItineraireLine),
              pour qu'on ne sente pas la couture en passant de l'un à l'autre. */}
          <div className="order-1 mb-[9px] flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5 lg:order-none lg:mb-0">
            <ItineraireLine reference={reference} />
            <ChronoBadge
              startTime={timer?.startTime}
              stopTime={timer?.stopTime}
              running={running}
            />
          </div>

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
            <BatteriePill percent={stats?.batteryPercent} />
          </div>

          <div className="order-3 lg:order-none lg:flex-none">
            <ProfileCard
              profile={reference?.profile}
              totalKm={reference?.totalKm}
              doneKm={avanceKm ?? (stats?.distance ?? 0) / 1000}
              elevationMin={reference?.elevMinM}
              elevationMax={reference?.elevMaxM}
              waypoints={aventure.waypoints ?? []}
              onHoverPoint={setHoverPoint}
            />
          </div>
        </div>

        {/* Droite : progression + journal. Sur desktop, le contenu est en
            position ABSOLUE (inset-0) : la colonne n'a donc pas de hauteur
            propre → c'est carte+profil (à gauche) qui fixe la hauteur de la
            ligne, et le journal (flex-1) se cale dessus en scrollant. */}
        <div className="contents lg:relative lg:block lg:min-h-0">
          <div className="contents lg:absolute lg:inset-0 lg:flex lg:flex-col lg:gap-4">
            <div className="order-2 lg:order-none lg:flex-none">
              <ProgressionCard
                stats={stats}
                totalKm={reference?.totalKm}
                avanceKm={avanceKm}
              />
            </div>
            <div className="order-4 lg:order-none lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
              <JournalCard entries={journal?.entries} dateDebut={aventure.dateDebut} fill />
            </div>
          </div>
        </div>
      </div>

      {/* Sous la grille, PLEINE LARGEUR : « Laisse un mot », puis le partage
          en dessous à gauche. */}
      <div className="mt-3.5 lg:mt-5">
        <MessageCard />
        <div className="mt-3 flex justify-start">
          <ShareButton />
        </div>
      </div>
    </div>
  );
}
