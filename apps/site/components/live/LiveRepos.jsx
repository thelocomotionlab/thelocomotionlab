// components/live/LiveRepos.jsx
//
// État « repos » de /live : aucune aventure en cours ni à venir (statut:
// "repos" dans liveConfig). Page neutre et sobre — pas de compte à rebours,
// pas de carte — avec une capture email pour être prévenu du prochain direct.

"use client";

import EmailCaptureCard from "./EmailCaptureCard";

export default function LiveRepos() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 py-6 text-center">
      <div>
        <h1 className="m-0 font-heading text-3xl font-bold leading-[1.15] text-brand-slate-dark md:text-4xl">
          Pas de live en ce moment
        </h1>
        <p className="mx-auto mt-3.5 max-w-md font-lora text-lg italic leading-relaxed text-brand-deep">
          Mais de nouvelles aventures arrivent très vite !
        </p>
      </div>

      <EmailCaptureCard title="Être prévenu·e du prochain live" />
    </div>
  );
}
