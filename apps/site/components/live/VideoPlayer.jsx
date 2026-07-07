// components/live/VideoPlayer.jsx
//
// Variante vidéo du journal — DERRIÈRE DRAPEAU : le service ne publie des
// entrées `video` que si VIDEO_ENABLED est actif (décision après le test 24 h).
// Lecteur natif (contrôles système, playsInline pour iOS), rien n'est
// préchargé.

"use client";

export default function VideoPlayer({ src, width, height }) {
  return (
    <video
      src={src}
      controls
      preload="none"
      playsInline
      className="mt-2.5 w-full rounded-xl border border-brand-text/10 bg-brand-text/5 lg:rounded-[11px]"
      style={width && height ? { aspectRatio: `${width} / ${height}` } : undefined}
    />
  );
}
