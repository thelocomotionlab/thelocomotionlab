// components/Carrousel.jsx
//
// LE MÉCANISME DE DÉFILEMENT DES RANGÉES DE CARTES.
//
// Une fenêtre qui défile, deux flèches qui apparaissent quand il y a matière
// à défiler, et une rangée d'actions dessous (« Voir tout », un indicateur de
// direct) à gauche des flèches.
//
// Il ne dessine pas les cartes : elles arrivent en enfants, et chaque bloc
// garde les siennes. `scrollerClassName` décide du sens et du gabarit de la
// fenêtre — c'est le seul endroit où l'accueil et le direct diffèrent.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

function Fleche({ direction, onClick, actif, tone }) {
  const Icone = direction === "prev" ? ChevronLeft : ChevronRight;
  const teinte =
    tone === "dark"
      ? "border-white/70 text-white hover:bg-white hover:text-brand-deep-dark"
      : "border-brand-primary-dark/50 text-brand-primary-dark hover:bg-brand-primary-dark hover:text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!actif}
      aria-label={direction === "prev" ? "Cartes précédentes" : "Cartes suivantes"}
      className={`hidden h-10 w-10 items-center justify-center rounded-full border-[1.5px] transition md:inline-flex ${teinte} ${
        actif ? "cursor-pointer" : "pointer-events-none opacity-30"
      }`}
    >
      <Icone size={20} aria-hidden="true" />
    </button>
  );
}

export default function Carrousel({
  children,
  label,
  actions = null,
  tone = "dark",
  scrollerClassName = "",
  /** Distance parcourue par un clic de flèche : deux cartes et leurs écarts. */
  pas = 540,
}) {
  const scroller = useRef(null);
  const [avant, setAvant] = useState(false);
  const [apres, setApres] = useState(false);

  const relever = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setAvant(el.scrollLeft > 4);
    setApres(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    relever();
    const el = scroller.current;
    el?.addEventListener("scroll", relever, { passive: true });
    window.addEventListener("resize", relever);
    return () => {
      el?.removeEventListener("scroll", relever);
      window.removeEventListener("resize", relever);
    };
  }, [relever]);

  const defiler = (sens) => scroller.current?.scrollBy({ left: sens * pas, behavior: "smooth" });

  return (
    <div>
      <div ref={scroller} role="region" aria-label={label} className={scrollerClassName}>
        {children}
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-5 md:mt-[34px] md:gap-[22px]">
        {actions}
        {avant || apres ? (
          <div className="ml-auto hidden gap-3 md:flex">
            <Fleche direction="prev" onClick={() => defiler(-1)} actif={avant} tone={tone} />
            <Fleche direction="next" onClick={() => defiler(1)} actif={apres} tone={tone} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
