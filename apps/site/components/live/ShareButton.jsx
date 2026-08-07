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
    const url = `${journalApiBase}/journal/story.png?t=${Date.now()}`;
    try {
      // 1) Partage natif avec FICHIER (mobiles) — nécessite le CORS sur
      //    story.png ; on récupère le fichier AVANT de partager.
      let file = null;
      if (navigator.canShare) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const blob = await res.blob();
            const f = new File([blob], "locomotion-live.png", {
              type: blob.type || "image/png",
            });
            if (navigator.canShare({ files: [f] })) file = f;
          }
        } catch {
          // CORS/réseau : on bascule sur l'ouverture directe ci-dessous.
        }
      }

      if (file) {
        try {
          await navigator.share({ files: [file], title: "Le direct — The Locomotion Lab" });
        } catch {
          // Partage annulé par l'utilisateur : ne rien faire.
        }
      } else {
        // 2) Repli universel (desktop, ou partage fichier indisponible) :
        //    ouvrir l'image de partage — l'utilisateur l'enregistre/partage.
        window.open(url, "_blank", "noopener");
      }
    } finally {
      setBusy(false);
    }
  }

  // Le survol ne changeait qu'un fond déjà pâle (12 % → 20 % d'opacité) : à
  // peine perceptible, donc rien ne disait que le bouton était cliquable. Il
  // remplit maintenant la pastille, fonce le liseré et fait glisser l'icône —
  // même grammaire que les autres boutons du site.
  return (
    <button
      type="button"
      onClick={partager}
      disabled={busy}
      className="group inline-flex cursor-pointer items-center gap-2 rounded-full border border-brand-primary/40 bg-brand-primary/12 px-[15px] py-2 font-heading text-[12.5px] font-medium text-brand-primary-dark transition-colors duration-200 hover:border-brand-primary-dark hover:bg-brand-primary/35 hover:text-brand-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary-dark disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"
    >
      <Share2
        size={15}
        strokeWidth={2}
        aria-hidden="true"
        className="transition-transform duration-200 group-hover:-translate-y-px group-hover:scale-110 motion-reduce:transition-none"
      />
      {busy ? "Préparation…" : label}
    </button>
  );
}
