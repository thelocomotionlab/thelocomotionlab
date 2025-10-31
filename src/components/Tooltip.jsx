import { useState } from "react";

export default function Tooltip({ text, link, children }) {
  const [visible, setVisible] = useState(false);

  return (
    <span
      className="relative text-brand-accent cursor-pointer"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClick={() => setVisible((v) => !v)} // mobile friendly
    >
      {children}
      {visible && (
        <div
          className="
            absolute z-50 bg-white border border-gray-200 shadow-xl rounded-lg 
            p-4 w-80 max-w-xs top-7 left-1/2 -translate-x-1/2 
            text-gray-800 text-sm leading-snug font-serif
          "
          style={{
            lineHeight: "1.4em",
            whiteSpace: "normal",
          }}
        >
          {/* Format stylisé façon bibliographie */}
          <p className="mb-1 font-semibold text-gray-900">
            {text.split(".")[0]}
          </p>
          <p className="italic text-gray-700 mb-1">
            {text.split(".")[1]?.trim() || ""}
          </p>
          <p className="text-gray-500 text-xs">
            {text.split(".").slice(2).join(".").trim()}
          </p>

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
        </div>
      )}
    </span>
  );
}
