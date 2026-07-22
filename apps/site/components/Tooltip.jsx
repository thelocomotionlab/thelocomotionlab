"use client";

import { useEffect, useId, useRef, useState } from "react";

export default function Tooltip({ entry, children }) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();
  const wrapperRef = useRef(null);

  // Ferme au clic en dehors et avec Escape
  useEffect(() => {
    if (!visible) return undefined;

    const handlePointerDown = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setVisible(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === "Escape") setVisible(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [visible]);

  if (!entry) return <span>{children}</span>;

  const link = entry.link || entry.url;

  const source = entry.journal
    ? `${entry.journal}${entry.volume ? `, ${entry.volume}` : ""}${
        entry.pages ? `, ${entry.pages}` : ""
      }`
    : entry.publisher || "";

  const toggle = () => setVisible((v) => !v);

  return (
    <span
      ref={wrapperRef}
      className="relative inline cursor-pointer"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {/* span[role=button] et pas <button> : les citations passent un <a>
          en enfant, et un lien DANS un bouton est du HTML invalide (contenu
          interactif imbriqué). Le handler clavier couvre Enter/Espace. */}
      <span
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        aria-describedby={visible ? tooltipId : undefined}
        aria-expanded={visible}
        className="inline bg-transparent border-0 p-0 m-0 text-inherit cursor-pointer"
      >
        {children}
      </span>
      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          className="
            absolute z-50 bg-white border border-gray-200 shadow-xl rounded-lg
            p-4 w-80 max-w-[min(20rem,calc(100vw-2rem))] top-7 left-1/2 -translate-x-1/2
            text-gray-800 text-sm leading-snug font-serif
          "
          style={{
            lineHeight: "1.4em",
            whiteSpace: "normal",
            display: "inline-block",
          }}
        >
          <span className="mb-1 font-semibold text-gray-900 block">
            {entry.author} ({entry.year})
          </span>
          {entry.title && (
            <span className="italic text-gray-700 mb-1 block">
              {entry.title}
            </span>
          )}
          {source && (
            <span className="text-gray-500 text-xs block">{source}</span>
          )}

          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-brand-slate-dark font-semibold mt-2 hover:underline"
            >
              Voir la référence
            </a>
          )}
        </span>
      )}
    </span>
  );
}
