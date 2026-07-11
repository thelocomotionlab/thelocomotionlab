// components/live/LiveTermine.jsx
//
// L'état « Terminé » de /live (design 2c) : bandeau de clôture sombre, carte de
// la trace vécue, « Récit à paraître », journal complet consultable (replié),
// capture email du récit. Rendu depuis archive.json SEUL (contrat
// docs/live-archive-schema.md) — aucune dépendance à l'infra vivante.

"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";

import { liveConfig } from "@/lib/liveConfig";
import { dayIndex, formatDateArrivee, formatDureeHeures } from "@/lib/liveTime";
import { useArchive } from "@/lib/useArchive";
import EmailCaptureCard from "./EmailCaptureCard";
import JournalCard from "./JournalCard";

const LiveMap = dynamic(() => import("./LiveMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-brand-primary/10" />,
});

const REPLIE_COUNT = 6;

const TYPE_FR_TO_LIVE = { texte: "text", photo: "photo", audio: "audio", video: "video" };

/** Entrée du contrat d'archive (littéraux français) → forme attendue par JournalCard. */
function archiveEntryToLive(entry, mediaDir, index) {
  const converted = {
    id: entry.id ?? `archive-${index}`,
    ts: entry.time,
    type: TYPE_FR_TO_LIVE[entry.type],
  };
  if (entry.texte) converted.text = entry.texte;
  if (entry.media) {
    converted.media = { url: `${mediaDir}/${entry.media}` };
    if (entry.duree !== undefined) converted.media.duration = entry.duree;
    if (entry.largeur !== undefined) converted.media.width = entry.largeur;
    if (entry.hauteur !== undefined) converted.media.height = entry.hauteur;
  }
  if (entry.edite) converted.editedAt = entry.time;
  return converted;
}

export default function LiveTermine() {
  const { aventure } = liveConfig;
  const archive = useArchive(aventure.archivePath);
  const [deplie, setDeplie] = useState(false);

  // Dossier des médias de l'archive : à côté de archive.json.
  const mediaDir = aventure.archivePath.replace(/\/archive\.json$/, "");

  const entries = useMemo(
    () => (archive?.journal ?? []).map((e, i) => archiveEntryToLive(e, mediaDir, i)),
    [archive, mediaDir],
  );

  const coords = useMemo(
    () =>
      (archive?.positions ?? [])
        .filter((p) => Number.isFinite(p.longitude) && Number.isFinite(p.latitude))
        .map((p) => [p.longitude, p.latitude]),
    [archive],
  );

  if (!archive) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center font-heading text-sm text-brand-text/60">
        Chargement de l&rsquo;archive de l&rsquo;aventure…
      </div>
    );
  }

  const { meta, stats } = archive;
  const jours = dayIndex(stats.lastFixTime, meta.dateDebut);
  const shown = deplie ? entries : entries.slice(-REPLIE_COUNT); // les N plus récentes (JournalCard inverse)
  const journalPeriode = `${entries.length} entrée${entries.length > 1 ? "s" : ""} · J1 → J${jours}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3.5">
      {/* Ligne identité + badge TERMINÉ */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-brand-primary">
            <span className="h-[13px] w-[13px] -rotate-[30deg] rounded-full border-[2.2px] border-brand-bg border-r-transparent" />
          </span>
          <span className="font-heading text-xs font-medium text-brand-text">
            The Locomotion Lab
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-[20px] bg-brand-primary-dark/20 px-[11px] py-[5px] font-mono text-[10.5px] font-bold tracking-[0.1em] text-brand-primary-dark">
          <svg width="10" height="8" viewBox="0 0 10 8" aria-hidden="true">
            <path
              d="M1 4 L3.7 6.8 L9 1"
              fill="none"
              stroke="#6E9CA0"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          TERMINÉ
        </span>
      </div>

      {/* Bandeau de clôture */}
      <section className="rounded-[18px] bg-brand-text px-[18px] py-5 text-brand-bg">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-brand-accent">
          Aventure bouclée
        </p>
        <h1 className="m-0 mt-[7px] font-heading text-[21px] font-bold leading-[1.2] sm:text-2xl">
          {meta.nom}
        </h1>
        <p className="mt-[5px] font-heading text-[12.5px] text-brand-bg/75">
          Arrivée le {formatDateArrivee(stats.lastFixTime)}
        </p>
        <div className="mt-[18px] grid grid-cols-4 gap-2">
          <Stat value={Math.round(stats.distance / 1000).toLocaleString("fr-FR")} label="km" />
          <Stat value={Math.round(stats.dplus).toLocaleString("fr-FR")} label="m D+" />
          <Stat value={formatDureeHeures(stats.durationSeconds)} label="durée" />
          <Stat value={String(jours)} label="jours" />
        </div>
      </section>

      {/* Trace vécue */}
      <div className="relative h-[280px] overflow-hidden rounded-[18px] border border-brand-text/10 sm:h-[380px]">
        <LiveMap referenceCoords={[]} doneCoords={coords} mapStyle="topo" markerMode="arrivee" />
      </div>

      {/* Récit à paraître */}
      <section className="flex items-center gap-[13px] rounded-[18px] border border-dashed border-brand-deep-dark/40 bg-brand-accent/14 px-[18px] py-4">
        <svg width="20" height="20" viewBox="0 0 20 20" className="flex-none" aria-hidden="true">
          <path
            d="M3 3 h10 a2 2 0 0 1 2 2 v12 l-3-2 -4 2 V5"
            fill="none"
            stroke="#9A6044"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        <div>
          <p className="font-heading text-sm font-bold text-brand-text">Récit à paraître</p>
          <p className="mt-0.5 font-heading text-xs text-brand-text/65">
            Le retour d&rsquo;expérience complet, bientôt sur le Lab.
          </p>
        </div>
      </section>

      {/* Journal complet, replié par défaut */}
      <JournalCard
        entries={shown}
        dateDebut={meta.dateDebut}
        mediaBase=""
        title="Journal complet"
        counterLabel={journalPeriode}
        scrollable={false}
        footer={
          !deplie && entries.length > REPLIE_COUNT ? (
            <button
              type="button"
              onClick={() => setDeplie(true)}
              className="mb-3.5 mt-0.5 w-full cursor-pointer rounded-xl border border-brand-text/15 bg-transparent px-3 py-3 font-heading text-[13px] font-medium text-brand-text"
            >
              Dérouler les {entries.length} entrées
            </button>
          ) : null
        }
      />

      <EmailCaptureCard title="Être prévenu·e du récit" />
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <div>
      <div className="font-heading text-[21px] font-bold leading-none">{value}</div>
      <div className="mt-1 font-heading text-[9px] uppercase tracking-[0.1em] text-brand-bg/60">
        {label}
      </div>
    </div>
  );
}
