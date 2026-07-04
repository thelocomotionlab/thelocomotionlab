// components/LiveStatusBlock.jsx
//
// Bloc live compact en tête de /explorer : badge « EN DIRECT » quand un
// direct est actif, sinon rappel du prochain départ — dans les deux cas,
// lien vers /live. Même source d'état que la page /live (live-timer.json),
// un seul fetch au montage.

"use client";

import Link from "next/link";
import { useLiveTimer } from "@/lib/useLiveTimer";
import { liveConfig } from "@/lib/liveConfig";

export default function LiveStatusBlock() {
  const timer = useLiveTimer();
  const isLive = timer?.running === true;

  if (isLive) {
    return (
      <div className="max-w-3xl mx-auto mb-10">
        <Link
          href="/live"
          className="flex items-center justify-center gap-3 bg-brand-primary text-white rounded-xl shadow-card px-4 py-3 hover:opacity-90 transition"
        >
          <span
            className="pulse-fast w-2.5 h-2.5 rounded-full bg-red-500 shrink-0"
            aria-hidden="true"
          />
          <span className="text-sm font-bold uppercase tracking-wide">
            En direct
          </span>
          <span className="text-sm sm:text-base">
            {liveConfig.embed.title} —{" "}
            <span className="underline underline-offset-2 font-semibold">
              Suivre le direct
            </span>
          </span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto mb-10">
      <Link
        href="/live"
        className="flex items-center justify-center gap-2 bg-white text-gray-700 rounded-xl shadow-card px-4 py-3 hover:shadow-lg transition"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Prochain départ
        </span>
        <span className="text-sm sm:text-base font-medium text-brand-deep">
          {liveConfig.nextDeparture.shortLabel}
        </span>
        <span className="text-sm text-brand-accent font-semibold hover:underline">
          → Live
        </span>
      </Link>
    </div>
  );
}
