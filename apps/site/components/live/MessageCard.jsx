// components/live/MessageCard.jsx
//
// « Laisse un mot à Valentin » (design 2a, variante compacte 2d) : message
// privé transmis directement au Telegram de Valentin par le service
// live-journal — rien n'est public, rien n'est stocké. Quatre états, textes
// VALIDÉS (PR1 §13) : repos / « Envoi… » / « Remis. Il le lira ce soir au
// bivouac. » / « Le message n'est pas parti — réessaie dans un instant. »
// Honeypot `website` : champ invisible pour un humain.

"use client";

import { brandColors } from "@locomotionlab/ui";
import { Send } from "lucide-react";

import { useState } from "react";

import { journalApiBase } from "@/lib/liveConfig";

const CONFIRMATION = "Remis. Il le lira ce soir au bivouac.";
const ERREUR = "Le message n'est pas parti — réessaie dans un instant.";

export default function MessageCard() {
  const [message, setMessage] = useState("");
  const [prenom, setPrenom] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error

  async function submit(event) {
    event.preventDefault();
    if (status === "sending" || message.trim().length === 0) return;
    setStatus("sending");
    try {
      const res = await fetch(`${journalApiBase}/journal/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          prenom: prenom.trim(),
          website,
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        setStatus("sent");
        setMessage("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  // Champs + anneau de focus ocre, comme les formulaires du site. Le rayon
  // (pilule pour les champs d'une ligne, arrondi pour le textarea) est posé
  // par chaque champ.
  const fieldClass =
    "border border-brand-text/15 bg-white px-[15px] py-[11px] font-heading text-[13px] text-brand-text outline-none transition placeholder:text-brand-text/40 focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/40";
  // CTA identique aux autres formulaires (ocre, pilule, semi-gras).
  const buttonClass =
    "flex flex-none cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-brand-accent font-heading font-semibold text-white transition hover:bg-brand-accent-dark disabled:opacity-70";

  return (
    <section className="rounded-[18px] border border-brand-primary/30 bg-brand-primary/12 px-[18px] py-5 lg:px-5 lg:py-4">
      <h2 className="m-0 font-heading text-base font-bold text-brand-text lg:text-[14.5px]">
        Laisse un mot à Valentin
      </h2>

      {status === "sent" ? (
        <p className="mt-3 font-heading text-sm font-bold text-brand-text" role="status">
          {CONFIRMATION}
        </p>
      ) : (
        <form onSubmit={submit}>
          {/* 2a : formulaire complet (mobile et tablette) */}
          <div className="lg:hidden">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ton message…"
              maxLength={1000}
              required
              className={`mt-3 min-h-[84px] w-full resize-y rounded-[20px] ${fieldClass} text-sm`}
            />
            <input
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              placeholder="Prénom"
              maxLength={50}
              className={`mt-2 w-full rounded-full ${fieldClass}`}
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className={`mt-3 w-full px-4 py-[13px] text-sm ${buttonClass}`}
            >
              {status === "sending" ? "Envoi…" : <>Envoyer <Send size={15} aria-hidden="true" /></>}
            </button>
          </div>

          {/* 2d : variante desktop (pleine largeur sous carte + journal) —
              message + prénom + envoyer, même état, même envoi. */}
          <div className="mt-2.5 hidden gap-2 lg:flex">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ton message…"
              maxLength={1000}
              required
              className={`min-w-0 flex-1 rounded-full ${fieldClass}`}
            />
            <input
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              placeholder="Prénom"
              maxLength={50}
              className={`w-[180px] flex-none rounded-full ${fieldClass}`}
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className={`px-5 py-[11px] text-[13px] ${buttonClass}`}
            >
              {status === "sending" ? "Envoi…" : <>Envoyer <Send size={15} aria-hidden="true" /></>}
            </button>
          </div>

          {/* Honeypot — hors écran, hors tabulation, ignoré des humains. */}
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute -left-[9999px] h-px w-px opacity-0"
          />

          {status === "error" && (
            <p className="mt-2 font-heading text-xs font-medium text-brand-deep" role="status">
              {ERREUR}
            </p>
          )}
        </form>
      )}

      <p className="mt-[11px] flex items-start gap-[7px] font-heading text-[11px] leading-normal text-brand-text/65 lg:mt-2 lg:text-[10.5px]">
        <svg width="12" height="14" viewBox="0 0 12 14" className="mt-px flex-none lg:hidden" aria-hidden="true">
          <rect x="1" y="6" width="10" height="7" rx="2" fill="none" stroke={brandColors.primaryDark} strokeWidth="1.3" />
          <path d="M3.5 6 V4 a2.5 2.5 0 0 1 5 0 V6" fill="none" stroke={brandColors.primaryDark} strokeWidth="1.3" />
        </svg>
        <span>Message privé — remis à Valentin le soir au bivouac. Rien n&rsquo;est publié.</span>
      </p>
    </section>
  );
}
