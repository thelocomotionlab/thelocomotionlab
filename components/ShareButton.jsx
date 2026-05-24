// components/ShareButton.jsx
"use client";

import { useState, useRef } from "react";
import { Share2 } from "lucide-react";
import { usePathname } from "next/navigation";

export default function ShareButton() {
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState(null); // { x, y } une fois déplacé
  const pathname = usePathname();

  const buttonRef = useRef(null);
  const longPressTimeoutRef = useRef(null);
  const dragStartRef = useRef({
    x: 0,
    y: 0,
    touchX: 0,
    touchY: 0,
  });
  const isDraggingRef = useRef(false);
  const justDraggedRef = useRef(false);

  // 💡 Masquer sur certaines pages
  if (["/contact", "/mentions-legales"].includes(pathname)) return null;

  async function handleShare() {
    // Si on vient de drag, on ignore le "click"
    if (isDraggingRef.current || justDraggedRef.current) return;

    const url =
      typeof window !== "undefined" ? window.location.href : "";

    const shareData = {
      title:
        typeof document !== "undefined"
          ? document.title
          : "Locomotion Lab",
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

  /* ---------------------------
   *  Gestion du drag mobile
   * --------------------------- */

  function handleTouchStart(e) {
    if (!buttonRef.current) return;
    justDraggedRef.current = false;

    const touch = e.touches[0];

    // On lance un timer de long press (2s)
    longPressTimeoutRef.current = window.setTimeout(() => {
      // Activation du mode drag
      isDraggingRef.current = true;

      const rect = buttonRef.current.getBoundingClientRect();
      dragStartRef.current = {
        x: rect.left,
        y: rect.top,
        touchX: touch.clientX,
        touchY: touch.clientY,
      };

      // On initialise la position avec la position actuelle
      setPosition({ x: rect.left, y: rect.top });
    }, 2000);
  }

  function handleTouchMove(e) {
    const touch = e.touches[0];

    // Si on se met à vraiment bouger AVANT la fin du long press, on annule
    if (!isDraggingRef.current && longPressTimeoutRef.current) {
      const dx =
        touch.clientX - dragStartRef.current.touchX;
      const dy =
        touch.clientY - dragStartRef.current.touchY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 10) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
      return;
    }

    if (!isDraggingRef.current) return;

    e.preventDefault(); // évite le scroll pendant le drag

    const dx = touch.clientX - dragStartRef.current.touchX;
    const dy = touch.clientY - dragStartRef.current.touchY;

    const nextX = dragStartRef.current.x + dx;
    const nextY = dragStartRef.current.y + dy;

    setPosition({ x: nextX, y: nextY });
  }

  function handleTouchEnd() {
    clearTimeout(longPressTimeoutRef.current);
    longPressTimeoutRef.current = null;

    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      justDraggedRef.current = true;
      // On bloque le "click" juste après un drag
      window.setTimeout(() => {
        justDraggedRef.current = false;
      }, 200);
    }
  }

  /* ---------------------------
   *  Classes + style position
   * --------------------------- */

  const baseClasses = `
    fixed z-50
    flex items-center justify-center sm:justify-between gap-0 sm:gap-2
    rounded-full shadow-md border border-gray-300
    bg-white/80 backdrop-blur-md text-gray-800 text-sm font-medium
    sm:px-4 sm:py-2 transition-all duration-300 ease-out opacity-0 animate-fade-in
    sm:hover:bg-brand-accent/90 sm:hover:text-white active:scale-95
    w-[2.75rem] h-[2.75rem] sm:w-auto sm:h-auto sm:rounded-full
    cursor-pointer
  `;

  const positionClasses = position
    ? "" // top/left via style
    : "bottom-5 right-5 sm:bottom-6 sm:right-6";

  const style = {
    animationDelay: "0.3s",
    ...(position
      ? {
          top: position.y,
          left: position.x,
          right: "auto",
          bottom: "auto",
        }
      : {}),
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleShare}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className={`${baseClasses} ${positionClasses}`}
        style={style}
        aria-label={copied ? "Lien copié dans le presse-papiers" : "Partager cette page"}
      >
        <Share2 className="w-5 h-5 sm:w-5 sm:h-5 text-gray-700 sm:text-gray-800 translate-x-[-0.1em]" aria-hidden="true" />
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
