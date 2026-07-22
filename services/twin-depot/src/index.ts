// Point d'entrée : configuration + store + serveur HTTP.

import { loadConfig } from "./config";
import { buildServer } from "./server";
import { DepotStore } from "./store";

async function main(): Promise<void> {
  const config = loadConfig();
  const store = new DepotStore(config.dataDir);
  const app = buildServer({ config, store });

  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(
    `twin-depot prêt — ${store.count()} dépôt(s), archives ≤ ${config.maxArchiveMo} Mo`,
  );
}

main().catch((err) => {
  console.error("twin-depot : échec du démarrage", err);
  process.exit(1);
});
