// components/TrailNotify.jsx
//
// Bouton « Être prévenu·e » du teaser accompagnement trail (page Pratiquer) :
// révèle sur place le formulaire EmailCapture (source `pratiquer-trail`,
// acceptée par la passerelle email) — la bande email de bas de page ayant
// été retirée, l'inscription se fait dans la carte.

"use client";

import { useState } from "react";
import EmailCapture from "@/components/EmailCapture";

export default function TrailNotify() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="mt-3.5 flex w-full flex-none cursor-pointer items-center justify-center rounded-full border-[1.5px] border-brand-primary px-[22px] py-[11px] text-sm font-bold text-brand-slate transition-all duration-300 hover:bg-brand-slate hover:text-white md:mt-0 md:inline-flex md:w-auto md:text-[14.5px]"
      >
        Être prévenu·e
      </button>
    );
  }

  return (
    <div className="mt-3.5 w-full flex-none md:mt-0 md:max-w-[420px]">
      <EmailCapture
        title={null}
        description={null}
        promise="Un email à l'ouverture de l'offre, rien d'autre."
        source="pratiquer-trail"
        placeholder="Ton adresse e-mail"
        buttonLabel="Être prévenu·e"
      />
    </div>
  );
}
