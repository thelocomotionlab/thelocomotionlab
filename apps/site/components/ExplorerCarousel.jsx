// components/ExplorerCarousel.jsx
//
// Carrousel des récits & projets de la section Explorer de l'accueil :
// défilement horizontal natif (scroll-snap, molette/swipe) + flèches sur
// desktop, cartes au style des vignettes du design (blanc, radius 14px,
// ombre portée, hover surélevé). Les items arrivent pré-formatés du
// serveur (chaînes uniquement, pas de Date).

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

function Card({ item }) {
  return (
    <Link
      href={item.href}
      className="block w-[220px] shrink-0 snap-start overflow-hidden rounded-[14px] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.35)] transition-transform duration-200 hover:-translate-y-1.5 md:w-[250px]"
    >
      <span className="relative block h-[115px] w-full md:h-[130px]">
        {item.cover ? (
          <Image
            src={item.cover}
            alt=""
            fill
            className="object-cover"
            sizes="250px"
            loading="lazy"
          />
        ) : (
          <span className="absolute inset-0 bg-brand-bg" aria-hidden="true" />
        )}
      </span>
      <span className="block px-4 pb-4 pt-3.5">
        <span className="mb-1 block truncate text-[11px] font-medium uppercase tracking-[0.1em] text-gray-500">
          {item.kindLabel}
          {item.enCours ? (
            <>
              {" "}
              · <span className="font-bold text-brand-accent-dark">En cours</span>
            </>
          ) : item.meta ? (
            <> · {item.meta}</>
          ) : null}
        </span>
        <span className="block text-[15px] font-semibold leading-[1.3] text-brand-deep">
          {item.title}
        </span>
      </span>
    </Link>
  );
}

function ArrowButton({ direction, onClick, enabled }) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      aria-label={
        direction === "prev" ? "Cartes précédentes" : "Cartes suivantes"
      }
      className={`hidden h-10 w-10 items-center justify-center rounded-full border-[1.5px] border-white/70 text-white transition md:inline-flex ${
        enabled
          ? "cursor-pointer hover:bg-white hover:text-brand-deep-dark"
          : "pointer-events-none opacity-30"
      }`}
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  );
}

// `actions` : contenu de la rangée sous le carrousel (CTA « Voir tout »,
// indicateur live…), rendu à gauche des flèches de navigation.
export default function ExplorerCarousel({ items, actions = null }) {
  const scrollerRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = scrollerRef.current;
    el?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);

  const scrollByCards = (dir) => {
    // Deux cartes par clic : largeur carte (250) + gap (20).
    scrollerRef.current?.scrollBy({ left: dir * 540, behavior: "smooth" });
  };

  return (
    <div>
      <div
        ref={scrollerRef}
        role="region"
        aria-label="Récits et projets récents"
        // Marges négatives : compense le padding qui évite de rogner les
        // ombres portées et le hover surélevé dans la zone scrollable.
        className="no-scrollbar -mx-1 -mb-6 -mt-3 flex snap-x gap-3 overflow-x-auto px-1 pb-6 pt-3 md:gap-5"
      >
        {items.map((item) => (
          <Card key={item.key} item={item} />
        ))}
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-5 md:mt-[34px] md:gap-[22px]">
        {actions}
        {(canPrev || canNext) && (
          <div className="ml-auto hidden gap-3 md:flex">
            <ArrowButton
              direction="prev"
              onClick={() => scrollByCards(-1)}
              enabled={canPrev}
            />
            <ArrowButton
              direction="next"
              onClick={() => scrollByCards(1)}
              enabled={canNext}
            />
          </div>
        )}
      </div>
    </div>
  );
}
