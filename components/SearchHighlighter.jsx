"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Cherche la première occurrence (insensible à la casse) de la valeur
 * du paramètre d'URL `highlight` dans l'élément `targetSelector`,
 * la surligne avec un <mark class="search-highlight"> et y défile.
 *
 * Conçu pour fonctionner avec le lien généré par la page de recherche
 * (cf. app/recherche/SearchClient.jsx → `?highlight=...`).
 */
export default function SearchHighlighter({
  targetSelector = ".article-body",
}) {
  return (
    <Suspense fallback={null}>
      <Inner targetSelector={targetSelector} />
    </Suspense>
  );
}

function applyHighlight(targetSelector, query) {
  const target = document.querySelector(targetSelector);
  if (!target) return false;

  // Évite de réappliquer si déjà fait
  const existing = target.querySelector("mark.search-highlight");
  if (existing) {
    existing.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  }

  const needle = query.toLowerCase();

  const walker = document.createTreeWalker(
    target,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "MARK") {
          return NodeFilter.FILTER_REJECT;
        }
        return node.nodeValue.toLowerCase().includes(needle)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    }
  );

  const node = walker.nextNode();
  if (!node) return false;

  const idx = node.nodeValue.toLowerCase().indexOf(needle);
  if (idx === -1) return false;

  const matchNode = node.splitText(idx);
  matchNode.splitText(query.length);

  const mark = document.createElement("mark");
  mark.className = "search-highlight";
  mark.textContent = matchNode.nodeValue;
  matchNode.parentNode.replaceChild(mark, matchNode);

  mark.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
}

function Inner({ targetSelector }) {
  const params = useSearchParams();
  const query = (params.get("highlight") || "").trim();

  useEffect(() => {
    if (!query) return;

    // On laisse Next.js terminer son scroll par défaut, puis on
    // applique le surlignage et on défile vers le mot trouvé.
    // Une mini-retry permet de gérer le cas où le DOM n'est pas
    // encore tout à fait monté au moment du useEffect.
    let attempts = 0;
    let timer;

    function attempt() {
      if (applyHighlight(targetSelector, query)) return;
      attempts += 1;
      if (attempts < 10) {
        timer = setTimeout(attempt, 100);
      }
    }

    timer = setTimeout(attempt, 80);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [query, targetSelector]);

  return null;
}
