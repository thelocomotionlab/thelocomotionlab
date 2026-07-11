// components/ExplorerCarousel.jsx
//
// Carrousel des récits & projets (accueil, /live) : sur desktop, défilement
// horizontal natif (scroll-snap, molette) + flèches ; sur mobile, liste
// verticale compacte (vignette 78×62 + texte, 3 entrées max) conforme au
// design d'origine de l'accueil. Les items arrivent pré-formatés du serveur
// (lib/carouselItems.js). `tone` adapte flèches et ombres au fond : "dark"
// (photo sombre, défaut) ou "light" (fond crème).

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Nombre d'entrées de la liste compacte mobile (comme le design d'origine).
const MOBILE_MAX_ITEMS = 3;

function Card({ item, index, tone }) {
  const shadow =
    tone === "dark"
      ? "shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
      : "shadow-card";

  return (
    <Link
      href={item.href}
      className={`group flex w-full items-center gap-3 overflow-hidden rounded-[10px] bg-white transition-transform duration-200 md:block md:w-[250px] md:shrink-0 md:snap-start md:rounded-[14px] md:hover:-translate-y-1.5 ${shadow} ${
        index >= MOBILE_MAX_ITEMS ? "hidden md:block" : ""
      }`}
    >
      <span className="relative block h-[62px] w-[78px] flex-none md:h-[130px] md:w-full">
        {item.cover ? (
          <Image
            src={item.cover}
            alt=""
            fill
            className="object-cover"
            sizes="(min-width: 768px) 250px, 78px"
            loading="lazy"
          />
        ) : (
          <span className="absolute inset-0 bg-brand-bg" aria-hidden="true" />
        )}
      </span>
      <span className="block min-w-0 flex-1 py-2 pr-3 md:px-4 md:pb-4 md:pt-3.5">
        <span className="block truncate text-[11px] font-medium uppercase tracking-[0.1em] text-gray-500 md:mb-1">
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

function ArrowButton({ direction, onClick, enabled, tone }) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const toneClass =
    tone === "dark"
      ? "border-white/70 text-white hover:bg-white hover:text-brand-deep-dark"
      : "border-brand-primary-dark/50 text-brand-primary-dark hover:bg-brand-primary-dark hover:text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      aria-label={
        direction === "prev" ? "Cartes précédentes" : "Cartes suivantes"
      }
      className={`hidden h-10 w-10 items-center justify-center rounded-full border-[1.5px] transition md:inline-flex ${toneClass} ${
        enabled ? "cursor-pointer" : "pointer-events-none opacity-30"
      }`}
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  );
}

// `actions` : contenu de la rangée sous le carrousel (CTA « Voir tout »,
// indicateur live…), rendu à gauche des flèches de navigation.
export default function ExplorerCarousel({ items, actions = null, tone = "dark" }) {
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
        // Desktop : marges négatives compensant le padding qui évite de
        // rogner les ombres portées et le hover surélevé dans la zone
        // scrollable. Mobile : simple pile verticale.
        className="flex flex-col gap-3 md:no-scrollbar md:-mx-1 md:-mb-6 md:-mt-3 md:snap-x md:flex-row md:gap-5 md:overflow-x-auto md:px-1 md:pb-6 md:pt-3"
      >
        {items.map((item, i) => (
          <Card key={item.key} item={item} index={i} tone={tone} />
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
              tone={tone}
            />
            <ArrowButton
              direction="next"
              onClick={() => scrollByCards(1)}
              enabled={canNext}
              tone={tone}
            />
          </div>
        )}
      </div>
    </div>
  );
}
