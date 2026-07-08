// components/live/JournalCard.jsx
//
// Le journal de bord (design 2a/2d) : timeline d'entrées — la priorité n°1 du
// chantier. Entrées les plus récentes en haut ; tag « J2 · 15 h 04 » calculé
// en Europe/Paris (lib/liveTime) ; photos réelles en lazy-load ; vocaux via le
// lecteur « une prise » ; types inconnus ignorés en silence (tolérance aux
// évolutions du service).

"use client";

import { journalApiBase } from "@/lib/liveConfig";
import { formatClockDuration, formatEntryTag } from "@/lib/liveTime";
import AudioPlayer from "./AudioPlayer";
import VideoPlayer from "./VideoPlayer";

const KNOWN_TYPES = new Set(["text", "photo", "audio", "video"]);

/** Pastille de timeline : départ sauge, dernières nouvelles terracotta, entre-deux ambre. */
function dotColor(indexFromTop, total) {
  if (indexFromTop >= total - 1) return "#8CB9BD"; // la toute première entrée (le départ)
  if (indexFromTop <= 1) return "#B67352"; // les plus fraîches
  return "#EFB159";
}

function kindLabel(entry) {
  if (entry.type === "audio") return "Vacation audio";
  if (entry.type === "video") {
    return entry.media?.duration ? `Vidéo · ${Math.round(entry.media.duration)} s` : "Vidéo";
  }
  return null;
}

export default function JournalCard({
  entries,
  dateDebut,
  // Surcharges du mode archive (état Terminé) : médias servis par le site
  // lui-même, titre « Journal complet », compteur « 23 entrées · J1 → J4 »,
  // pied de carte (bouton « Dérouler »), pas de plafond de hauteur.
  mediaBase = journalApiBase,
  title = "Journal de bord",
  counterLabel = null,
  footer = null,
  scrollable = true,
}) {
  const visible = (entries ?? []).filter((e) => KNOWN_TYPES.has(e.type));
  const newestFirst = [...visible].reverse();

  return (
    <section
      className={`rounded-[18px] border border-brand-text/10 bg-white px-[18px] pb-2 pt-[18px] shadow-[0_6px_20px_rgba(51,51,51,0.06)] lg:px-5 lg:shadow-none ${
        scrollable ? "lg:max-h-[430px] lg:overflow-y-auto" : ""
      }`}
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="font-heading text-[11px] font-bold uppercase tracking-[0.14em] text-brand-deep-dark">
          {title}
        </p>
        <p className="font-heading text-[11px] text-brand-text/55">
          {counterLabel ?? `${visible.length} entrée${visible.length > 1 ? "s" : ""}`}
        </p>
      </div>

      {newestFirst.length === 0 && (
        <p className="pb-4 font-lora text-sm italic leading-[1.55] text-brand-text/60">
          Les premières nouvelles arriveront du terrain, ici même.
        </p>
      )}

      {newestFirst.map((entry, index) => (
        <article
          key={entry.id}
          className="relative border-l-[1.5px] border-brand-text/10 pb-5 pl-5 lg:pb-[18px]"
        >
          <span
            className="absolute -left-[6px] top-0.5 h-2.5 w-2.5 rounded-full shadow-[0_0_0_3px_#FFFFFF]"
            style={{ background: dotColor(index, newestFirst.length) }}
          />
          <div className="flex items-center gap-2">
            <span className="font-heading text-[10.5px] font-bold uppercase tracking-[0.06em] text-brand-deep">
              {formatEntryTag(entry.ts, dateDebut)}
            </span>
            {kindLabel(entry) && (
              <span className="rounded-[10px] bg-brand-primary/16 px-[7px] py-0.5 font-heading text-[9px] font-medium uppercase tracking-[0.08em] text-brand-primary-dark">
                {kindLabel(entry)}
              </span>
            )}
          </div>

          {entry.text && (
            <p className="mt-1.5 font-lora text-sm italic leading-[1.55] text-brand-text/90 lg:mt-[5px] lg:text-[13.5px]">
              {entry.type === "audio" ? <>«&nbsp;{entry.text}&nbsp;»</> : entry.text}
            </p>
          )}

          {entry.type === "photo" && entry.media?.url && (
            /* Pas de next/image : le site est un export statique (CF Pages,
               pas d'optimiseur) et les photos sont DÉJÀ optimisées côté
               service (WebP ≤ 1600 px, EXIF retiré) + lazy-load natif. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${mediaBase}${entry.media.url}`}
              alt={entry.text || "Photo du terrain"}
              loading="lazy"
              decoding="async"
              width={entry.media.width}
              height={entry.media.height}
              className="mt-2.5 w-full rounded-xl border border-brand-text/10 object-cover lg:mt-[9px] lg:rounded-[11px]"
              style={
                entry.media.width && entry.media.height
                  ? { aspectRatio: `${entry.media.width} / ${entry.media.height}`, height: "auto" }
                  : undefined
              }
            />
          )}

          {entry.type === "audio" && entry.media?.url && (
            <AudioPlayer
              src={`${mediaBase}${entry.media.url}`}
              duration={entry.media.duration}
              seedId={entry.id}
            />
          )}

          {entry.type === "video" && entry.media?.url && (
            <VideoPlayer
              src={`${mediaBase}${entry.media.url}`}
              width={entry.media.width}
              height={entry.media.height}
            />
          )}

          {entry.editedAt && (
            <p className="mt-1 font-heading text-[10px] text-brand-text/40">corrigé</p>
          )}

          {entry.type === "video" && entry.media?.duration ? (
            <span className="sr-only">Durée : {formatClockDuration(entry.media.duration)}</span>
          ) : null}
        </article>
      ))}

      {footer}
    </section>
  );
}
