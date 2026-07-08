// components/live/EmailCaptureCard.jsx
//
// La carte ambre de capture email des états Avant/Terminé (design 2b/2c),
// autour du composant EmailCapture EXISTANT (chantier 1) : même flux
// (gateway → Listmonk, double opt-in, honeypot), même micro-promesse. Seul
// l'habillage vient du design — le bouton garde le style de la charte.

"use client";

import EmailCapture from "../EmailCapture";

export default function EmailCaptureCard({ title }) {
  return (
    <section className="rounded-[18px] border border-brand-accent/40 bg-brand-accent/14 p-[18px]">
      <h2 className="m-0 mb-1 font-heading text-[15px] font-bold text-brand-text">{title}</h2>
      <EmailCapture
        title={null}
        description={null}
        source="live"
        placeholder="ton@email.fr"
        buttonLabel="OK"
      />
    </section>
  );
}
