// components/LiveBanner.jsx
//
// Bandeau bleu du direct, juste sous le hero de l'accueil. Il n'existe QUE
// pendant un direct : hors session, le composant ne rend rien du tout — pas de
// bande vide, pas de réservation de hauteur, aucun décalage de mise en page au
// moment où la sonde répond.
//
// Bleu de la charte (`brand-primary`, le bleu d'origine du lab). Sur ce fond
// clair le texte est ENCRE et non blanc : blanc sur #8CB9BD tombe à 2,2:1,
// illisible, alors que `brand-text` y tient 5,8:1. Même source d'état que le
// reste du site (live-timer.json via useLiveTimer) — un seul fetch au montage.

"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SatelliteDish } from "lucide-react";

import { liveConfig } from "@/lib/liveConfig";
import { useLiveTimer } from "@/lib/useLiveTimer";

export default function LiveBanner() {
  const timer = useLiveTimer();
  if (timer?.running !== true) return null;

  return (
    <Link
      href="/live"
      aria-label={`Suivre le direct : ${liveConfig.indicateur.enDirect}`}
      className="group block bg-brand-primary transition-colors hover:bg-brand-primary-light"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-5 py-3 text-center md:px-16">
        {/* Point pulsé : même grammaire que l'indicateur du carrousel Explorer. */}
        <span className="relative h-2 w-2 flex-none" aria-hidden="true">
          <span className="absolute inset-0 rounded-full bg-red-600" />
          <span className="absolute inset-0 animate-[ll-pulse_2.4s_ease-out_infinite] rounded-full bg-red-600" />
        </span>

        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text">
          En direct
        </span>

        <span className="text-[14.5px] text-brand-text/85">
          {liveConfig.indicateur.enDirect}
        </span>

        <span className="inline-flex items-center gap-1 text-[14.5px] font-semibold text-brand-text underline underline-offset-[3px] transition group-hover:text-brand-slate-dark">
          Suivre
          <SatelliteDish
            size={15}
            aria-hidden="true"
            className="transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </Link>
  );
}
