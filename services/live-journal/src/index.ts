// Point d'entrée du conteneur live-journal.
//   Production : webhook Telegram (Caddy → /journal/telegram/webhook) + POST /message.
//   Dev        : TELEGRAM_MODE=polling (getUpdates, pas d'URL publique requise).
//   Simulation : LIVE_JOURNAL_SIMULATION=1 → GPX rejoué + journal scripté, Telegram stubé.

import path from "node:path";

import { loadConfig } from "./config";
import type { IngestDeps } from "./journal/ingest";
import { JournalStore } from "./journal/store";
import { createMediaPipeline } from "./media/pipeline";
import { buildServer } from "./server";
import { createTelegramApi, type TelegramApi } from "./telegram/api";
import { startPolling } from "./telegram/polling";
import { createSimTelegramApi, loadScenario, startScenario } from "./sim/journal";
import { PositionsSimulator } from "./sim/positions";
import { OgDataSource } from "./og/data";
import { OgScheduler } from "./og/scheduler";
import { SelfCheck } from "./selfcheck";

async function main(): Promise<void> {
  const config = loadConfig();
  const log = (msg: string) => console.log(new Date().toISOString(), msg);

  const store = new JournalStore({
    dataDir: config.dataDir,
    publicPrefix: config.publicPrefix,
    videoEnabled: config.videoEnabled,
  });

  const fixturesDir = path.dirname(config.simulation.scenarioPath);
  const telegram: TelegramApi = config.simulation.enabled
    ? createSimTelegramApi(fixturesDir)
    : createTelegramApi(config.telegram.botToken, config.telegram.apiBase);

  const ingest: IngestDeps = {
    store,
    telegram,
    media: createMediaPipeline(config, store),
    config,
  };

  // Simulation : positions + journal scripté (Telegram réel jamais contacté).
  let sim: PositionsSimulator | undefined;
  const cleanups: Array<() => void> = [];
  if (config.simulation.enabled) {
    const scenario = loadScenario(config.simulation.scenarioPath);
    sim = new PositionsSimulator(config.simulation.gpxPath, scenario.positions ?? {});
    sim.start();
    cleanups.push(() => sim?.stop());
    const chatId = Number.parseInt(config.telegram.valentinChatId || "0", 10) || 0;
    cleanups.push(startScenario(scenario, ingest, chatId));
  }

  // Cartes de partage : og.png régénérée périodiquement + story à la demande.
  let og: { source: OgDataSource; scheduler: OgScheduler } | undefined;
  // Le fond de carte (~50 tuiles Esri) est cadré sur l'itinéraire, donc
  // identique de bout en bout : on le garde sur le volume plutôt que de le
  // redemander toutes les 3 minutes pendant cinq jours.
  const ogCacheDir = path.join(config.dataDir, "private", "basemap");
  if (config.og.enabled) {
    const source = new OgDataSource({
      siteBase: config.siteBase,
      trackingBase: config.trackingBase,
      trackingDir: config.trackingDir,
      sim,
    });
    const scheduler = new OgScheduler(
      source,
      store.publicDir,
      config.og.intervalMinutes * 60_000,
      ogCacheDir,
    );
    cleanups.push(scheduler.start());
    og = { source, scheduler };
  }

  // Auto-surveillance (PR5) : prévient Valentin via le bot, HORS aventure.
  let selfCheck: SelfCheck | undefined;
  if (config.selfCheck.enabled && !config.simulation.enabled) {
    selfCheck = new SelfCheck({ config, telegram, og: og?.scheduler, sim });
    cleanups.push(selfCheck.start());
  }

  const app = buildServer({
    config,
    store,
    telegram,
    ingest,
    sim,
    og,
    ogCacheDir,
    selfCheck,
    // Pas de Caddy en local : le service sert lui-même journal.json + médias
    // hors production (simulation ou polling dev).
    serveStatic: config.simulation.enabled || config.telegram.mode === "polling",
  });

  if (!config.simulation.enabled && config.telegram.mode === "polling") {
    cleanups.push(startPolling(telegram, ingest));
  }

  await app.listen({ port: config.port, host: "0.0.0.0" });
  log(
    `live-journal démarré : port ${config.port}, préfixe ${config.publicPrefix}, ` +
      `mode ${config.simulation.enabled ? "SIMULATION" : config.telegram.mode}, ` +
      `vidéo ${config.videoEnabled ? "ON" : "OFF"}, ${store.entryCount()} entrée(s)`,
  );

  const shutdown = (signal: string) => {
    log(`${signal} reçu, arrêt propre…`);
    for (const cleanup of cleanups) cleanup();
    void app.close().then(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Échec du démarrage :", err);
  process.exit(1);
});
