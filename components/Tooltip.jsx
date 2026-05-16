"use client";

import { useId, useState } from "react";

export default function Tooltip({ entry, children }) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();

  if (!entry) return <span>{children}</span>;

  const link = entry.link || entry.url;

  const source = entry.journal
    ? `${entry.journal}${entry.volume ? `, ${entry.volume}` : ""}${
        entry.pages ? `, ${entry.pages}` : ""
      }`
    : entry.publisher || "";

  return (
    <span
      className="relative cursor-pointer"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClick={() => setVisible((v) => !v)}
      aria-describedby={visible ? tooltipId : undefined}
    >
      {children}
      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          className="
            absolute z-50 bg-white border border-gray-200 shadow-xl rounded-lg
            p-4 w-80 max-w-xs top-7 left-1/2 -translate-x-1/2
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
              className="block text-brand-primary font-semibold mt-2 hover:underline"
            >
              Voir la référence
            </a>
          )}
        </span>
      )}
    </span>
  );
}
