// Point d'entrée : configuration + store + serveur HTTP.

import { loadConfig } from "./config";
import { buildServer } from "./server";
import { InscriptionStore } from "./store";

async function main(): Promise<void> {
  const config = loadConfig();
  const store = new InscriptionStore(config.dataDir);
  const app = buildServer({ config, store });

  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(
    `atelier-api prêt — ${config.ateliers.length} atelier(s), ${store.count()} inscription(s)`,
  );
}

main().catch((err) => {
  console.error("atelier-api : échec du démarrage", err);
  process.exit(1);
});
