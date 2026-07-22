// components/ShareButton.jsx
//
// Bouton de partage flottant : Web Share API si disponible, sinon copie du
// lien dans le presse-papiers (toast de confirmation sur mobile).
// NB : l'ancien drag par appui long (2 s) a été retiré — geste non
// découvrable, et son preventDefault() dans onTouchMove était inopérant
// (écouteurs touch passifs de React) → le scroll partait pendant le drag.
"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { usePathname } from "next/navigation";

export default function ShareButton() {
  const [copied, setCopied] = useState(false);
  const pathname = usePathname();

  // 💡 Masquer sur certaines pages
  if (["/contact", "/mentions-legales"].includes(pathname)) return null;

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";

    const shareData = {
      title:
        typeof document !== "undefined" ? document.title : "Locomotion Lab",
      text: "Des news du labo :",
      url,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard && url) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.warn("Partage annulé :", err);
    }
  }

  const baseClasses = `
    fixed z-50 bottom-5 right-5 sm:bottom-6 sm:right-6
    flex items-center justify-center sm:justify-between gap-0 sm:gap-2
    rounded-full shadow-md border border-gray-300
    bg-white/80 backdrop-blur-md text-gray-800 text-sm font-medium
    sm:px-4 sm:py-2 transition-all duration-300 ease-out opacity-0 animate-fade-in
    sm:hover:bg-brand-accent/90 active:scale-95
    w-[2.75rem] h-[2.75rem] sm:w-auto sm:h-auto sm:rounded-full
    cursor-pointer
  `;

  return (
    <>
      <button
        onClick={handleShare}
        className={baseClasses}
        style={{ animationDelay: "0.3s" }}
        aria-label={
          copied ? "Lien copié dans le presse-papiers" : "Partager cette page"
        }
      >
        <Share2
          className="w-5 h-5 sm:w-5 sm:h-5 text-gray-700 sm:text-gray-800 translate-x-[-0.1em]"
          aria-hidden="true"
        />
        <span className="hidden sm:inline sm:ml-1 sm:translate-x-[-0.25em]">
          {copied ? "Lien copié" : "Partager"}
        </span>
      </button>

      {/* Toast mobile : feedback visible quand l'icône seule est affichée */}
      {copied && (
        <div
          role="status"
          aria-live="polite"
          className="sm:hidden fixed bottom-20 right-5 z-50 bg-brand-deep text-white text-sm px-3 py-2 rounded-full shadow-md animate-fade-in"
        >
          Lien copié
        </div>
      )}
    </>
  );
}
