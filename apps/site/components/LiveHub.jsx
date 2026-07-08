// components/LiveHub.jsx
//
// Cœur client de la page /live : la bascule des TROIS états (chantier 2, PR3).
//   - aventure.statut === "termine" → état « Terminé » (archive.json seul) ;
//   - live-timer.running            → état « En cours » (design 2a/2d, PR2) ;
//   - sinon                         → état « Avant » (design 2b).
// Le statut vient de liveConfig (surchargeable au build : NEXT_PUBLIC_LIVE_STATUT) ;
// le direct reste déclenché par le terrain (track start → live-timer.json).

"use client";

import LiveAvant from "./live/LiveAvant";
import LiveEnCours from "./live/LiveEnCours";
import LiveTermine from "./live/LiveTermine";
import { useLiveTimer } from "@/lib/useLiveTimer";
import { liveConfig } from "@/lib/liveConfig";

export default function LiveHub() {
  const termine = liveConfig.aventure.statut === "termine";
  // Aventure terminée : une seule sonde de politesse (pollMs 0 = fetch unique),
  // l'infra vivante peut être éteinte.
  const timer = useLiveTimer({ pollMs: termine ? 0 : 30000 });

  if (termine) return <LiveTermine />;
  if (timer?.running === true) return <LiveEnCours timer={timer} />;
  return <LiveAvant />;
}
