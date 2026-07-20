// components/PhilosophieFil.jsx
//
// Le fil de la philosophie (accueil) : les quatre verbes disposés en
// quinconce de part et d'autre d'une courbe élégante qui se dessine au fur
// et à mesure du scroll. La courbe est un <path> SVG reconstruit à la volée
// pour passer exactement par les points d'ancrage mesurés dans le DOM
// (ResizeObserver + document.fonts.ready : le tracé suit les reflows) ;
// le dessin progressif = stroke-dashoffset piloté par un listener scroll
// throttlé rAF. Chaque point s'allume quand le tracé l'atteint (fraction de
// longueur mesurée sur un sous-tracé jetable, pas approximée).
// prefers-reduced-motion : courbe et points affichés d'emblée, figés.

"use client";

import { useEffect, useRef } from "react";

// Ligne d'horizon (fraction de la hauteur du viewport) où se mesure la
// progression : le tracé est complet quand le bas du fil la franchit.
const HORIZON = 0.78;
// Tension verticale des tangentes (0 = segments droits, 1 = très rond).
const TENSION = 0.5;

function segment(a, b) {
  const dy = (b.y - a.y) * TENSION;
  return ` C ${a.x} ${a.y + dy}, ${b.x} ${b.y - dy}, ${b.x} ${b.y}`;
}

export default function PhilosophieFil({ items }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const pathRef = useRef(null);
  const dotRefs = useRef([]);
  const lengthRef = useRef(0);
  const fractionsRef = useRef([]); // fraction du tracé atteignant chaque point
  const reducedRef = useRef(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const svg = svgRef.current;
    const path = pathRef.current;
    if (!wrap || !svg || !path) return undefined;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

    const progress = () => {
      if (reducedRef.current) return 1;
      const rect = wrap.getBoundingClientRect();
      if (!rect.height) return 0;
      const horizon = window.innerHeight * HORIZON;
      return Math.min(1, Math.max(0, (horizon - rect.top) / rect.height));
    };

    const apply = () => {
      const p = progress();
      path.style.strokeDashoffset = `${lengthRef.current * (1 - p)}`;
      dotRefs.current.forEach((el, i) => {
        if (!el) return;
        const on = p >= (fractionsRef.current[i] ?? 1) - 0.015;
        el.style.opacity = on ? "1" : "0";
        el.style.transform = on ? "scale(1)" : "scale(0.4)";
      });
    };

    const buildPath = () => {
      const rect = wrap.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      if (!W || !H) return;
      const cx = W / 2;
      const anchors = dotRefs.current.filter(Boolean).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          x: r.left - rect.left + r.width / 2,
          y: r.top - rect.top + r.height / 2,
        };
      });
      // Le fil entre par le centre (sous le titre) et ressort par le centre :
      // point de raccord pour ce qui viendra en dessous de la section.
      const pts = [{ x: cx, y: 0 }, ...anchors, { x: cx, y: H }];
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 1; i < pts.length; i += 1) d += segment(pts[i - 1], pts[i]);
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      path.setAttribute("d", d);
      const L = path.getTotalLength();
      lengthRef.current = L;
      path.style.strokeDasharray = `${L}`;
      const ns = "http://www.w3.org/2000/svg";
      fractionsRef.current = anchors.map((_, i) => {
        const sub = document.createElementNS(ns, "path");
        let sd = `M ${pts[0].x} ${pts[0].y}`;
        for (let j = 1; j <= i + 1; j += 1) sd += segment(pts[j - 1], pts[j]);
        sub.setAttribute("d", sd);
        return sub.getTotalLength() / L;
      });
      apply();
    };

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        apply();
      });
    };

    const onMq = () => {
      reducedRef.current = mq.matches;
      apply();
    };
    reducedRef.current = mq.matches;

    buildPath();
    // La largeur des blocs (donc l'ancrage des points) dépend des polices.
    document.fonts?.ready?.then(buildPath).catch(() => {});
    const ro = new ResizeObserver(buildPath);
    ro.observe(wrap);
    dotRefs.current.forEach((el) => {
      if (el?.parentElement) ro.observe(el.parentElement);
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    mq.addEventListener("change", onMq);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      mq.removeEventListener("change", onMq);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto mt-9 max-w-[960px] pb-9 pt-7 md:mt-12 md:pb-12 md:pt-9"
    >
      <svg
        ref={svgRef}
        aria-hidden="true"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <path
          ref={pathRef}
          fill="none"
          stroke="var(--color-brand-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          style={{ strokeDasharray: 1, strokeDashoffset: 1 }}
        />
      </svg>

      {items.map((item, i) => {
        const left = i % 2 === 0;
        return (
          <div
            key={item.verb}
            className={`flex py-7 first:pt-0 last:pb-0 md:py-9 ${
              left ? "justify-start pl-1 md:pl-8" : "justify-end pr-1 md:pr-8"
            }`}
          >
            <div
              className={`flex items-center gap-3.5 md:gap-4 ${
                left ? "" : "flex-row-reverse"
              }`}
            >
              <div className={`max-w-[300px] ${left ? "text-right" : "text-left"}`}>
                <h3 className="font-heading text-[26px] font-bold leading-tight text-brand-deep md:text-[30px]">
                  {item.verb}
                </h3>
                <p className="mt-1 font-lora text-[16px] italic leading-snug text-gray-700 md:text-[17.5px]">
                  {item.tagline}
                </p>
              </div>
              <span
                ref={(el) => {
                  dotRefs.current[i] = el;
                }}
                aria-hidden="true"
                className="h-[11px] w-[11px] flex-none rounded-full bg-brand-accent-dark ring-4 ring-brand-bg transition-[opacity,transform] duration-300 ease-out"
                style={{ opacity: 0, transform: "scale(0.4)" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
