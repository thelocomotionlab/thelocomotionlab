// components/LiveHub.jsx
//
// Cœur client de la page /live : la bascule des états.
//   - aventure.statut === "termine"  → « Terminé » (archive.json seul) ;
//   - le tracker a démarré (startTime) → « En cours », qu'il tourne encore
//     (`./track start`) OU qu'il soit à l'arrêt (`./track stop`, page FIGÉE) ;
//   - sinon (jamais démarré, ou `./track reset`) → « Avant ».
// Autrement dit : `./track stop` fige le « pendant » (il ne revient PAS à
// « avant ») ; pour passer à « Terminé », voir la note en bas de liveConfig.js.

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
  // startTime présent = une session a été lancée (et pas encore `reset`) :
  // « En cours » vivant si running, figé sinon.
  if (timer && (timer.running === true || timer.startTime)) return <LiveEnCours timer={timer} />;
  return <LiveAvant />;
}
