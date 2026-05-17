// components/Plot.jsx
//
// Composant client qui rend un graphique Plotly à partir d'une spec JSON.
// La spec suit l'API Plotly native : { data, layout, config }.
// Charge plotly.js-dist-min en dynamique (~1MB gz), et MathJax v2 si la spec
// utilise des labels LaTeX ($...$).
//
// Conventions communes :
//   - style "matplotlib-like" appliqué par défaut (axes, grille, marges)
//   - les valeurs de spec.layout / spec.config priment sur les défauts
//   - le label de citation se met dans un <em> à la ligne suivante (cf. ProjetBody)

"use client";

import { useEffect, useRef, useState } from "react";

const MATHJAX_SCRIPT_ID = "plotly-mathjax-v2";
const MATHJAX_SRC =
  "https://cdn.jsdelivr.net/npm/mathjax@2.7.9/MathJax.js?config=TeX-AMS-MML_SVG";

function specUsesTex(spec) {
  if (!spec) return false;
  const json = JSON.stringify(spec);
  return json.includes("$") || json.includes("\\(");
}

function ensureMathJax() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.MathJax && window.MathJax.Hub) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.getElementById(MATHJAX_SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      return;
    }
    window.MathJax = {
      tex2jax: {
        inlineMath: [
          ["$", "$"],
          ["\\(", "\\)"],
        ],
      },
      showProcessingMessages: false,
      messageStyle: "none",
      SVG: { font: "TeX" },
    };
    const s = document.createElement("script");
    s.id = MATHJAX_SCRIPT_ID;
    s.src = MATHJAX_SRC;
    s.async = true;
    s.addEventListener("load", () => resolve(true), { once: true });
    s.addEventListener("error", () => resolve(false), { once: true });
    document.head.appendChild(s);
  });
}

const DEFAULT_LAYOUT = {
  autosize: true,
  paper_bgcolor: "white",
  plot_bgcolor: "white",
  font: { family: "Lora, Georgia, serif", size: 14, color: "#1f2937" },
  hoverlabel: {
    bgcolor: "white",
    bordercolor: "#8CB9BD",
    font: { family: "Lora, Georgia, serif", size: 13, color: "#1f2937" },
  },
};

const AXIS_DEFAULTS = {
  showgrid: true,
  gridcolor: "#e5e7eb",
  zeroline: false,
  showline: true,
  linecolor: "#1f2937",
  linewidth: 1,
  ticks: "outside",
  tickcolor: "#1f2937",
  mirror: true,
  titlefont: { size: 15 },
  automargin: true,
};

// Marges adaptatives selon la présence des titres. Plotly réserve toujours
// l'espace de la marge même quand le texte est vide → on rétrécit la marge
// correspondante. `automargin: true` sur les axes garantit en plus que les
// graduations longues (dates, labels rotated) ne sont jamais tronquées.
function computeMargin(userLayout) {
  const hasTitle = !!userLayout?.title?.text?.trim?.();
  const hasXTitle = !!userLayout?.xaxis?.title?.text?.trim?.();
  const hasYTitle = !!userLayout?.yaxis?.title?.text?.trim?.();
  return {
    l: hasYTitle ? 70 : 45,
    r: 30,
    t: hasTitle ? 60 : 20,
    b: hasXTitle ? 60 : 40,
  };
}

function mergeLayout(userLayout) {
  const layout = { ...DEFAULT_LAYOUT, ...(userLayout || {}) };
  layout.margin = { ...computeMargin(userLayout), ...(userLayout?.margin || {}) };
  if (userLayout?.font) {
    layout.font = { ...DEFAULT_LAYOUT.font, ...userLayout.font };
  }
  layout.xaxis = { ...AXIS_DEFAULTS, ...(userLayout?.xaxis || {}) };
  layout.yaxis = { ...AXIS_DEFAULTS, ...(userLayout?.yaxis || {}) };
  return layout;
}

const DEFAULT_CONFIG = {
  displaylogo: false,
  responsive: true,
  toImageButtonOptions: { format: "png", scale: 2 },
  modeBarButtonsToRemove: ["lasso2d", "select2d"],
};

export default function Plot({ src, height = 420 }) {
  const containerRef = useRef(null);
  const [spec, setSpec] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!src) return undefined;
    let cancelled = false;
    setError(null);
    fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((j) => {
        if (!cancelled) setSpec(j);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e.message || e));
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    if (!spec || !containerRef.current) return undefined;
    let cancelled = false;
    const el = containerRef.current;

    const layout = mergeLayout(spec.layout);
    const config = { ...DEFAULT_CONFIG, ...(spec.config || {}) };

    const needsTex = specUsesTex(spec);

    Promise.all([
      import("plotly.js-dist-min"),
      needsTex ? ensureMathJax() : Promise.resolve(false),
    ]).then(([PlotlyMod]) => {
      if (cancelled || !el) return;
      const Plotly = PlotlyMod.default || PlotlyMod;
      Plotly.newPlot(el, spec.data || [], layout, config);
    });

    return () => {
      cancelled = true;
      if (typeof window !== "undefined" && window.Plotly && el) {
        try {
          window.Plotly.purge(el);
        } catch {
          /* noop */
        }
      }
    };
  }, [spec]);

  if (error) {
    return (
      <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
        Erreur de chargement du graphique : {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height }}
      className="plotly-block"
    />
  );
}
