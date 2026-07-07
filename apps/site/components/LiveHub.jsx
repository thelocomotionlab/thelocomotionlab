// components/LiveHub.jsx
//
// Cœur client de la page /live : bascule entre les deux états du hub.
//   - direct actif  → état « En cours » v2 (design live-v2 — chantier 2, PR2) ;
//   - sinon         → en-tête de page + bloc « Prochain départ » + capture email
//     (état chantier 1, refonte « Avant » prévue en PR3).
// L'état vient de useLiveTimer (live-timer.json, re-sondé toutes les 30 s
// pour basculer sans recharger la page).

"use client";

import EmailCapture from "./EmailCapture";
import LiveEnCours from "./live/LiveEnCours";
import { useLiveTimer } from "@/lib/useLiveTimer";
import { liveConfig } from "@/lib/liveConfig";

export default function LiveHub() {
  const timer = useLiveTimer({ pollMs: 30000 });
  const isLive = timer?.running === true;

  if (isLive) {
    return <LiveEnCours timer={timer} />;
  }

  const { nom, dates, distance, denivele } = liveConfig.nextDeparture;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="max-w-3xl mx-auto text-center mb-10">
        <h1 className="text-3xl font-bold font-heading mb-2 text-brand-primary">
          Live
        </h1>
        <p className="text-lg text-gray-700">
          <em>Le direct des aventures du Lab</em>
        </p>
      </header>

      <div className="bg-white rounded-xl shadow-card p-6 sm:p-8 md:p-10 text-center">
        <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
          Prochain départ
        </p>
        <h2 className="text-2xl md:text-3xl font-bold font-heading text-brand-deep mb-2">
          {nom}
        </h2>
        <p className="text-gray-700 font-medium mb-6">
          {dates} · {distance} · {denivele}
        </p>

        {/* [Brief texte n°7 — 40-60 mots : Écrins, autonomie, dates,
            invitation à laisser son email.] */}
        <p className="max-w-2xl mx-auto text-gray-700 leading-relaxed">
          <span className="font-semibold text-brand-deep">
            [PROVISOIRE — texte n°7]
          </span>{" "}
          Du 20 au 24 août 2026, je m&rsquo;attaque au Tour des Écrins en
          autonomie complète : 194 km, environ 12 000 m de dénivelé positif,
          sans assistance. Le suivi en direct s&rsquo;affichera sur cette page
          dès le départ — laisse ton email pour être prévenu·e du coup
          d&rsquo;envoi.
        </p>

        <div className="mt-8 max-w-2xl mx-auto">
          <h3 className="text-lg font-semibold text-brand-accent mb-3">
            Être prévenu·e du départ
          </h3>
          <EmailCapture
            title={null}
            description={null}
            source="live"
            placeholder="Votre adresse e-mail"
            buttonLabel="M'inscrire"
          />
        </div>
      </div>
    </div>
  );
}
