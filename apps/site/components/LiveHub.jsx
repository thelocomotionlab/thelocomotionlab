// components/LiveHub.jsx
//
// Cœur client de la page /live : la bascule des états.
//   - aventure.statut === "termine" → « Terminé » DÉFINITIF (archive.json,
//     autoporté — l'infra du live peut être éteinte) ;
//   - aventure.statut === "repos"   → « Pas de direct en ce moment » (aucune
//     aventure à venir) ;
//   - le tracker a démarré (startTime) → « En cours » : vivant si le tracker
//     tourne (`./track start`), TERMINÉ (figé sur les dernières données du
//     live) dès `./track stop` — c'est l'état « juste rentré », avant que
//     l'archive définitive soit produite depuis un ordinateur ;
//   - sinon (jamais démarré, ou `./track reset`) → « Avant ».

"use client";

import LiveAvant from "./live/LiveAvant";
import LiveEnCours from "./live/LiveEnCours";
import LiveRepos from "./live/LiveRepos";
import LiveTermine from "./live/LiveTermine";
import { useLiveTimer } from "@/lib/useLiveTimer";
import { liveConfig } from "@/lib/liveConfig";

export default function LiveHub() {
  const { statut } = liveConfig.aventure;
  const fige = statut === "termine" || statut === "repos";
  // Config figée : une seule sonde de politesse (pollMs 0 = fetch unique).
  const timer = useLiveTimer({ pollMs: fige ? 0 : 30000 });

  if (statut === "termine") return <LiveTermine />;
  if (statut === "repos") return <LiveRepos />;
  // startTime présent = une session a été lancée (et pas encore `reset`) :
  // « En cours » vivant si le tracker tourne, TERMINÉ (figé) sinon.
  if (timer && (timer.running === true || timer.startTime)) return <LiveEnCours timer={timer} />;
  return <LiveAvant />;
}
