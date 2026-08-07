// components/live/MediaLightbox.jsx
//
// La visionneuse plein écran du journal de bord : on clique une photo (ou une
// vidéo), elle s'ouvre par-dessus la page, en grand, avec sa légende.
//
// Trois décisions qui expliquent le code :
//
//   • PORTAIL vers <body>. La carte du journal est une colonne qui défile, avec
//     ses ombres et ses `overflow` ; une superposition rendue à l'intérieur
//     serait rognée par elle. Le portail sort du flux, un point c'est tout.
//   • NAVIGATION. Une visionneuse qui n'ouvre qu'une image et oblige à
//     refermer pour voir la suivante donne l'impression d'être bloqué.
//     Flèches à l'écran + touches ← → , en boucle.
//   • L'ANIMATION EST EN CSS (`ll-lightbox*` dans globals.css), pas en JS :
//     le bloc `prefers-reduced-motion` de la feuille la neutralise
//     automatiquement, sans condition à écrire ici.

"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { indexSuivant } from "@/lib/journalMedias";

// `z-10` : sans lui, la figure — posée APRÈS dans le DOM — recouvre les
// commandes. Sur mobile l'image occupe toute la largeur, donc les chevrons
// disparaissaient purement et simplement derrière elle.
const BOUTON =
  "z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white/90 backdrop-blur-sm transition hover:bg-black/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70";

export default function MediaLightbox({ medias, index, onIndex, onClose }) {
  const dialogueRef = useRef(null);
  const media = medias?.[index] ?? null;

  // Clavier + verrou de défilement + focus, tant que la visionneuse est là.
  useEffect(() => {
    const precedent = document.activeElement;
    // Le focus va sur le CONTENEUR (motif APG), pas sur le bouton « Fermer » :
    // Chrome traite un focus programmatique comme `:focus-visible` et posait
    // un anneau bien visible sur la croix à chaque ouverture.
    dialogueRef.current?.focus();

    // La barre de défilement disparaît avec `overflow: hidden` : sans
    // compensation, toute la page saute latéralement à l'ouverture.
    const compensation = window.innerWidth - document.documentElement.clientWidth;
    const overflowInitial = document.body.style.overflow;
    const paddingInitial = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (compensation > 0) document.body.style.paddingRight = `${compensation}px`;

    const auClavier = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onIndex(indexSuivant(index, 1, medias.length));
      else if (e.key === "ArrowLeft") onIndex(indexSuivant(index, -1, medias.length));
    };
    window.addEventListener("keydown", auClavier);

    return () => {
      window.removeEventListener("keydown", auClavier);
      document.body.style.overflow = overflowInitial;
      document.body.style.paddingRight = paddingInitial;
      if (precedent instanceof HTMLElement) precedent.focus();
    };
  }, [index, medias, onIndex, onClose]);

  if (!media || typeof document === "undefined") return null;

  const plusieurs = medias.length > 1;
  const aller = (delta) => (e) => {
    e.stopPropagation();
    onIndex(indexSuivant(index, delta, medias.length));
  };

  return createPortal(
    <div
      ref={dialogueRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={
        plusieurs
          ? `${media.type === "video" ? "Vidéo" : "Photo"} du journal, ${index + 1} sur ${medias.length}`
          : `${media.type === "video" ? "Vidéo" : "Photo"} du journal`
      }
      onClick={onClose}
      className="ll-lightbox fixed inset-0 z-[60] flex items-center justify-center bg-[#14160F]/95 px-4 pb-16 pt-16 focus:outline-none"
    >
      <button type="button" onClick={onClose} aria-label="Fermer" className={`absolute right-4 top-4 ${BOUTON}`}>
        <X size={20} strokeWidth={2} aria-hidden="true" />
      </button>

      {plusieurs && (
        <>
          <button type="button" onClick={aller(-1)} aria-label="Média précédent" className={`absolute left-3 top-1/2 -translate-y-1/2 ${BOUTON}`}>
            <ChevronLeft size={22} strokeWidth={2} aria-hidden="true" />
          </button>
          <button type="button" onClick={aller(1)} aria-label="Média suivant" className={`absolute right-3 top-1/2 -translate-y-1/2 ${BOUTON}`}>
            <ChevronRight size={22} strokeWidth={2} aria-hidden="true" />
          </button>
        </>
      )}

      <figure
        key={media.id}
        onClick={(e) => e.stopPropagation()}
        className="ll-lightbox-media m-0 flex max-h-full flex-col items-center gap-3"
      >
        {media.type === "photo" ? (
          /* Pas de next/image : export statique, et les fichiers sont déjà
             optimisés côté service (WebP ≤ 1600 px). */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.src}
            alt={media.legende || "Photo du terrain"}
            className="max-h-[78vh] max-w-full rounded-lg object-contain"
          />
        ) : (
          <video
            src={media.src}
            controls
            autoPlay
            playsInline
            preload="metadata"
            className="max-h-[78vh] max-w-full rounded-lg bg-black object-contain"
          />
        )}
        {media.legende && (
          <figcaption className="max-w-[46rem] text-center font-lora text-sm italic leading-[1.55] text-white/80">
            {media.legende}
          </figcaption>
        )}
      </figure>

      {plusieurs && (
        <p className="absolute bottom-5 left-1/2 -translate-x-1/2 font-heading text-[11px] uppercase tracking-[0.14em] text-white/55">
          {index + 1} / {medias.length}
        </p>
      )}
    </div>,
    document.body,
  );
}
