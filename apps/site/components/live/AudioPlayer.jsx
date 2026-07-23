// components/live/AudioPlayer.jsx
//
// Le lecteur « vacation radio » (design 2a/2e) : lecture/pause, temps
// écoulé/durée, 26 barres pseudo-onde animées — PAS de scrubbing (une prise).
// Pas de scrubbing ≠ pas de robustesse : sur coupure réseau (error/stalled),
// on mémorise la position, on recharge la source et on REPREND où on était.
// preload="none" : rien n'est téléchargé avant le premier play (budget).

"use client";

import { brandColors } from "@locomotionlab/ui";

import { useEffect, useRef, useState } from "react";

import { formatClockDuration } from "@/lib/liveTime";

const BAR_COUNT = 26;

/** Pseudo-onde déterministe du design : |sin(seed*7.3 + i*1.7)|*0.75 + 0.25. */
function barHeights(seed, maxH) {
  return Array.from({ length: BAR_COUNT }, (_, i) =>
    Math.round((Math.abs(Math.sin(seed * 7.3 + i * 1.7)) * 0.75 + 0.25) * maxH),
  );
}

function seedFrom(id) {
  let seed = 0;
  for (const char of String(id)) seed = (seed + char.charCodeAt(0)) % 97;
  return seed;
}

export default function AudioPlayer({ src, duration, seedId }) {
  const audioRef = useRef(null);
  const resumeAtRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(duration ?? 0);

  const bars = barHeights(seedFrom(seedId), 26);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setElapsed(audio.currentTime);
    const onEnded = () => {
      setPlaying(false);
      setElapsed(0);
    };
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setTotalSeconds(audio.duration);
      }
    };
    // Reprise robuste : la coupure réseau ne rend pas la vacation muette.
    const onError = () => {
      if (!playing && resumeAtRef.current === null) return;
      resumeAtRef.current = audio.currentTime || resumeAtRef.current || 0;
      setTimeout(() => audio.load(), 1500);
    };
    const onCanPlay = () => {
      if (resumeAtRef.current !== null) {
        audio.currentTime = resumeAtRef.current;
        resumeAtRef.current = null;
        audio.play().catch(() => setPlaying(false));
      }
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("error", onError);
    audio.addEventListener("stalled", onError);
    audio.addEventListener("canplay", onCanPlay);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("stalled", onError);
      audio.removeEventListener("canplay", onCanPlay);
    };
  }, [playing]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  return (
    <div className="mt-2.5 flex items-center gap-3 rounded-[14px] border border-brand-primary/30 bg-brand-primary/13 px-3.5 py-[11px] lg:gap-[11px] lg:rounded-xl lg:px-3 lg:py-[9px]">
      <audio ref={audioRef} src={src} preload="none" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Mettre en pause" : "Écouter la vacation"}
        className="flex h-10 w-10 flex-none cursor-pointer items-center justify-center rounded-full border-none bg-brand-deep text-brand-bg shadow-[0_4px_12px_rgba(182,115,82,0.35)] lg:h-[34px] lg:w-[34px] lg:shadow-none"
      >
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="1.5" y="1" width="3.2" height="10" rx="1" fill={brandColors.bg} />
            <rect x="7.3" y="1" width="3.2" height="10" rx="1" fill={brandColors.bg} />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 13 13" className="ml-0.5" aria-hidden="true">
            <path d="M2 1.5 L11.5 6.5 L2 11.5 Z" fill={brandColors.bg} />
          </svg>
        )}
      </button>

      <div
        className="flex h-[30px] min-w-0 flex-1 items-center gap-[2.5px] overflow-hidden lg:h-6"
        aria-hidden="true"
      >
        {bars.map((height, i) => (
          <span
            key={i}
            className={`min-w-0.5 flex-1 origin-center rounded-[3px] ${
              playing ? "bg-brand-deep" : "bg-brand-deep-dark/45"
            }`}
            style={{
              height: `${height}px`,
              maxHeight: "100%",
              ...(playing
                ? { animation: `ll-eq 0.9s ease-in-out ${(i * 0.055).toFixed(2)}s infinite alternate` }
                : {}),
            }}
          />
        ))}
      </div>

      <span className="flex-none whitespace-nowrap font-mono text-[11.5px] tabular-nums text-brand-text/65 lg:text-[11px]">
        {playing || elapsed > 0 ? `${formatClockDuration(elapsed)} / ` : ""}
        {formatClockDuration(totalSeconds)}
      </span>
    </div>
  );
}
