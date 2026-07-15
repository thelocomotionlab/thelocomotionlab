// services/tracking-cache/src/index.ts
//
// Point d'entrée du conteneur : boucle de collecte interne (remplace le timer
// systemd). Toutes les `intervalSeconds`, exécute un tick — mais UNIQUEMENT si
// une session est active (`track start`). Sinon, idle (aucune requête Traccar).

import { loadConfig } from "./config";
import { runTick } from "./pipeline";
import { Store, NEUTRAL_TIMER, EMPTY_CONTROL, emptyLivePositions } from "./store";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

(async () => {
  const config = loadConfig();
  const store = new Store(config.dataDir);

  // Garantit que les fichiers existent dès le démarrage (Caddy les sert).
  const fs = await import("node:fs");
  if (!fs.existsSync(store.timerFile)) store.writeTimer({ ...NEUTRAL_TIMER });
  if (!fs.existsSync(store.controlFile)) store.writeControl({ ...EMPTY_CONTROL });
  if (!fs.existsSync(store.livePositionsFile)) store.writeLivePositions(emptyLivePositions(null));

  log(
    `tracking-cache démarré · api=${config.apiUrl} device=${config.deviceId} ` +
      `interval=${config.intervalSeconds}s dataDir=${config.dataDir}`
  );

  let stopping = false;
  const onSignal = (sig: string) => {
    log(`Signal ${sig} reçu, arrêt.`);
    stopping = true;
  };
  process.on("SIGTERM", () => onSignal("SIGTERM"));
  process.on("SIGINT", () => onSignal("SIGINT"));

  const intervalMs = Math.max(1, config.intervalSeconds) * 1000;

  while (!stopping) {
    try {
      // runTick renvoie null quand la session est inactive (mode idle).
      await runTick(config, store);
    } catch (err) {
      console.error(new Date().toISOString(), "Erreur tick :", (err as Error).message);
    }
    if (stopping) break;
    await sleep(intervalMs);
  }

  log("tracking-cache arrêté proprement.");
  process.exit(0);
})();
