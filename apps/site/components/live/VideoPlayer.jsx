// components/live/VideoPlayer.jsx
//
// Variante vidéo du journal — DERRIÈRE DRAPEAU : le service ne publie des
// entrées `video` que si VIDEO_ENABLED est actif (décision après le test 24 h).
//
// Dans la colonne du journal, la vignette ne LIT PAS : elle ouvre la
// visionneuse plein écran, où la vidéo se lit avec les contrôles système.
// Un `<video controls>` en ligne avalait le clic (le clic tombait sur ses
// propres boutons), donc la vidéo ne pouvait pas s'agrandir — et une vidéo
// verticale lue dans une colonne de 300 px n'a de toute façon aucun intérêt.
//
// `preload="metadata"` + le fragment `#t=0.1` : c'est ce qui affiche une
// image du film comme vignette. Sans le fragment, iOS laisse un cadre noir.

"use client";

import { Play } from "lucide-react";

export default function VideoPlayer({ src, width, height, onOpen, duration }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={duration ? `Lire la vidéo (${Math.round(duration)} s)` : "Lire la vidéo"}
      className="group relative mt-2.5 block w-full overflow-hidden rounded-xl border border-brand-text/10 bg-brand-text/5 lg:rounded-[11px]"
      style={width && height ? { aspectRatio: `${width} / ${height}` } : undefined}
    >
      <video
        src={`${src}#t=0.1`}
        preload="metadata"
        muted
        playsInline
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none h-full w-full object-cover"
      />
      <span className="absolute inset-0 flex items-center justify-center bg-brand-text/15 transition group-hover:bg-brand-text/5">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/85 text-brand-text shadow-[0_4px_16px_rgba(0,0,0,0.28)] transition group-hover:scale-105 motion-reduce:transition-none">
          <Play size={22} strokeWidth={2} fill="currentColor" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}
