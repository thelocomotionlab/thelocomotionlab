// components/live/EmailCaptureCard.jsx
//
// Carte de capture email des états Avant/Terminé, harmonisée avec le reste
// du site : carte blanche (grammaire des cartes du live), intitulé en
// Ubuntu Mono comme les autres labels du live, autour du composant
// EmailCapture EXISTANT — même flux (gateway → Listmonk, double opt-in,
// honeypot), même micro-promesse.

"use client";

import EmailCapture from "../EmailCapture";

export default function EmailCaptureCard({ title }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <h2 className="m-0 mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-brand-deep-dark">
        {title}
      </h2>
      <EmailCapture
        title={null}
        description={null}
        source="live"
        placeholder="Votre adresse e-mail"
        buttonLabel="M'inscrire"
      />
    </section>
  );
}
