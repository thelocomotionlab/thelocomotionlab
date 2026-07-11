// components/ExplorerLiveIndicator.jsx
//
// Indicateur live de la section Explorer de l'accueil : point pulsé +
// « Prochain départ — Tour des Écrins → Live », ou « EN DIRECT » quand un
// direct est actif. Même source d'état que LiveStatusBlock (live-timer.json),
// un seul fetch au montage.

"use client";

import Link from "next/link";
import { useLiveTimer } from "@/lib/useLiveTimer";
import { liveConfig } from "@/lib/liveConfig";

export default function ExplorerLiveIndicator() {
  const timer = useLiveTimer();
  const isLive = timer?.running === true;
  const dotColor = isLive ? "bg-red-500" : "bg-brand-accent-light";

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13.5px] text-white/85">
      <span className="relative h-2 w-2 flex-none" aria-hidden="true">
        <span className={`absolute inset-0 rounded-full ${dotColor}`} />
        <span
          className={`absolute inset-0 rounded-full animate-[ll-pulse_2.4s_ease-out_infinite] ${dotColor}`}
        />
      </span>
      {isLive ? (
        <span>
          <strong className="font-bold uppercase tracking-wide text-white">
            En direct
          </strong>{" "}
          — {liveConfig.embed.title}
        </span>
      ) : (
        <span>
          Prochain départ —{" "}
          <strong className="font-semibold text-white">
            {liveConfig.nextDeparture.homeLabel}
          </strong>
        </span>
      )}
      <Link
        href="/live"
        className="text-brand-accent-light underline underline-offset-[3px] transition hover:text-white"
      >
        → Live
      </Link>
    </span>
  );
}
