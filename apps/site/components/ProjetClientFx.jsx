// components/ProjetClientFx.jsx
//
// Petit composant client isolé qui ne gère QUE les effets interactifs
// liés au projet : surlignage depuis ?highlight=… et scroll fluide
// vers l'ancre du hash. Tout le reste de la page est rendu côté serveur.

"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

function HighlightEffect() {
  const searchParams = useSearchParams();
  const highlight = searchParams.get("highlight") || "";

  useEffect(() => {
    if (!highlight) return;

    const timer = setTimeout(() => {
      const safeHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(safeHighlight, "i");

      const elements = document.querySelectorAll(
        "article p, article h2, article h3, article li"
      );

      for (const el of elements) {
        if (regex.test(el.textContent || "")) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          break;
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [highlight]);

  return null;
}

function HashScrollEffect() {
  useEffect(() => {
    const handleHashScroll = () => {
      const { hash } = window.location;
      if (!hash) return;

      const id = decodeURIComponent(hash.replace("#", ""));
      const target = document.getElementById(id);

      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        target.style.transition = "background-color 0.8s ease";
        target.style.backgroundColor = "rgba(239,177,89,0.15)";
        setTimeout(() => {
          target.style.backgroundColor = "transparent";
        }, 1000);
      }
    };

    const timer = setTimeout(handleHashScroll, 400);
    window.addEventListener("hashchange", handleHashScroll);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("hashchange", handleHashScroll);
    };
  }, []);

  return null;
}

export default function ProjetClientFx() {
  return (
    <>
      <Suspense fallback={null}>
        <HighlightEffect />
      </Suspense>
      <HashScrollEffect />
    </>
  );
}
