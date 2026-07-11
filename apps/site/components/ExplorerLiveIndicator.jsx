// components/ExplorerLiveIndicator.jsx
//
// Indicateur live compact : point pulsé + « Prochain départ — Tour des
// Écrins → Live », ou « EN DIRECT » quand un direct est actif. Même source
// d'état que LiveStatusBlock (live-timer.json), un seul fetch au montage.
// `tone` : "dark" (texte blanc, sur photo — accueil) ou "light" (texte
// gris/brun, sur fond crème — pilier Explorer).

"use client";

import Link from "next/link";
import { useLiveTimer } from "@/lib/useLiveTimer";
import { liveConfig } from "@/lib/liveConfig";

const TONES = {
  dark: {
    wrapper: "text-white/85",
    dot: "bg-brand-accent-light",
    dotLive: "bg-red-500",
    strong: "text-white",
    link: "text-brand-accent-light hover:text-white",
  },
  light: {
    wrapper: "text-gray-600",
    dot: "bg-brand-accent-dark",
    dotLive: "bg-red-500",
    strong: "text-brand-text",
    link: "text-brand-primary-dark hover:text-brand-accent-dark",
  },
};

export default function ExplorerLiveIndicator({ tone = "dark" }) {
  const timer = useLiveTimer();
  const isLive = timer?.running === true;
  const t = TONES[tone] ?? TONES.dark;
  const dotColor = isLive ? t.dotLive : t.dot;

  return (
    <span
      className={`inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13.5px] ${t.wrapper}`}
    >
      <span className="relative h-2 w-2 flex-none" aria-hidden="true">
        <span className={`absolute inset-0 rounded-full ${dotColor}`} />
        <span
          className={`absolute inset-0 rounded-full animate-[ll-pulse_2.4s_ease-out_infinite] ${dotColor}`}
        />
      </span>
      {isLive ? (
        <span>
          <strong className={`font-bold uppercase tracking-wide ${t.strong}`}>
            En direct
          </strong>{" "}
          — {liveConfig.embed.title}
        </span>
      ) : (
        <span>
          Prochain départ —{" "}
          <strong className={`font-semibold ${t.strong}`}>
            {liveConfig.nextDeparture.homeLabel}
          </strong>
        </span>
      )}
      <Link
        href="/live"
        className={`underline underline-offset-[3px] transition ${t.link}`}
      >
        → Live
      </Link>
    </span>
  );
}
