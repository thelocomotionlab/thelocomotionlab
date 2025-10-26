import { useState } from "react";
import { Share2 } from "lucide-react";
import { useLocation } from "react-router-dom";

export default function ShareButton() {
  const [copied, setCopied] = useState(false);
  const location = useLocation();

  // 💡 Masquer sur certaines pages si besoin
  if (["/contact", "/mentions-legales"].includes(location.pathname)) return null;

  async function handleShare() {
    const shareData = {
      title: document.title || "Locomotion Lab",
      text: "Des news du labo :",
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.warn("Partage annulé :", err);
    }
  }

  return (
    <button
      onClick={handleShare}
      className={`fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50
      flex items-center justify-center sm:justify-between gap-0 sm:gap-2
      rounded-full shadow-md border border-gray-300
      bg-white/80 backdrop-blur-md text-gray-800 text-sm font-medium
      sm:px-4 sm:py-2 transition-all duration-300 ease-out opacity-0 animate-fade-in
      sm:hover:bg-[#EFB159]/90 sm:hover:text-white active:scale-95 
      w-[2.75rem] h-[2.75rem] sm:w-auto sm:h-auto sm:rounded-full`}
      style={{
        animationDelay: "0.3s",
      }}
      aria-label="Partager cette page"
    >
      <Share2
        className="w-5 h-5 sm:w-5 sm:h-5 text-gray-700 sm:text-gray-800 "
        style={{
          width: "1.5rem",
          height: "1.5rem",
        }}
      />
      <span className="hidden sm:inline sm:ml-1">
        {copied ? "Lien copié" : "Partager"}
      </span>
    </button>
  );
}
