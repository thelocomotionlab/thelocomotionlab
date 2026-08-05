// components/LiveHub.jsx
//
// Cœur client de la page /live : la bascule des états.
//   - aventure.statut === "repos" → « Pas de direct en ce moment » (aucune
//     aventure à venir) ;
//   - le tracker a démarré (startTime) → « En cours » : vivant si le tracker
//     tourne (`./track start`), FIGÉ sur les dernières données dès
//     `./track stop` — c'est l'état de fin, et il le reste ;
//   - sinon (jamais démarré, ou `./track reset`) → « Avant ».
//
// Il n'y a PLUS d'état « Terminé » : une aventure finie reste affichée figée,
// puis devient un replay dans une page projet (balise <postlivetracking>,
// docs/live-tracking.md §11) quand Valentin le décide. Deux façons de raconter
// la même sortie, c'était une de trop.

"use client";

import LiveAvant from "./live/LiveAvant";
import LiveEnCours from "./live/LiveEnCours";
import LiveRepos from "./live/LiveRepos";
import { useLiveTimer } from "@/lib/useLiveTimer";
import { liveConfig } from "@/lib/liveConfig";

export default function LiveHub() {
  const { statut } = liveConfig.aventure;
  // Config figée : une seule sonde de politesse (pollMs 0 = fetch unique).
  const timer = useLiveTimer({ pollMs: statut === "repos" ? 0 : 30000 });

  if (statut === "repos") return <LiveRepos />;
  // startTime présent = une session a été lancée (et pas encore `reset`) :
  // « En cours » vivant si le tracker tourne, figé sinon.
  if (timer && (timer.running === true || timer.startTime)) return <LiveEnCours timer={timer} />;
  return <LiveAvant />;
}
