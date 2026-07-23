// components/live/ShareButton.jsx
//
// « Partager l'aventure » : récupère la carte de partage (story.png, générée
// par live-journal) et ouvre le PARTAGE NATIF du téléphone via l'API Web Share
// (navigator.share avec le fichier image). Le sélecteur système propose alors
// Instagram, WhatsApp, Messages… avec l'image déjà attachée. Repli desktop
// (où l'API fichier n'existe pas) : téléchargement de l'image.

"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";

import { journalApiBase } from "@/lib/liveConfig";

export default function ShareButton({ label = "Partager l'aventure" }) {
  const [busy, setBusy] = useState(false);

  async function partager() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${journalApiBase}/journal/story.png?t=${Date.now()}`);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const file = new File([blob], "locomotion-live.png", {
        type: blob.type || "image/png",
      });

      // Partage natif si le navigateur sait partager un FICHIER (mobiles récents).
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Le direct — The Locomotion Lab" });
      } else {
        // Repli : télécharger l'image (desktop / navigateurs sans partage fichier).
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "locomotion-live.png";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // Partage annulé par l'utilisateur ou échec réseau : silencieux.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={partager}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-full border border-brand-primary/40 bg-brand-primary/12 px-[15px] py-2 font-heading text-[12.5px] font-medium text-brand-primary-dark transition hover:bg-brand-primary/20 disabled:opacity-60"
    >
      <Share2 size={15} strokeWidth={2} aria-hidden="true" />
      {busy ? "Préparation…" : label}
    </button>
  );
}
