// services/tracking-cache/src/cli.ts
//
// CLI de contrôle, exécutée DANS le conteneur via `docker compose exec`
// (cf. le script `track` à la racine). Ne nécessite PAS le token : elle ne fait
// que piloter le chrono + la fenêtre de collecte dans le volume.
//
//   node dist/cli.js start|stop|reset|status

import { loadComputeParams, loadDataDir } from "./config";
import { Store } from "./store";
import { reset, start, status, stop, type StatusReport } from "./control";

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h${String(m).padStart(2, "0")}min${String(sec).padStart(2, "0")}s`;
}

function printStatus(r: StatusReport): void {
  const state = r.running ? "🟢 EN COURS" : r.startTime ? "⏸️  ARRÊTÉ" : "⚪ INACTIF";
  console.log(`État        : ${state}`);
  console.log(`Début       : ${r.startTime ?? "—"}`);
  console.log(`Fin         : ${r.stopTime ?? "—"}`);
  console.log(`Fenêtre     : ${r.windowStart ?? "—"}`);
  console.log(`Durée       : ${fmtDuration(r.elapsedSeconds)}`);
  console.log(`Points      : ${r.points}`);
  console.log(`Distance    : ${(r.distanceMeters / 1000).toFixed(2)} km`);
  console.log(`D+ / D-     : ${r.dplus} m / ${r.dminus} m`);
  console.log(`Dernier fix : ${r.lastFixTime ?? "—"}`);
  console.log(`Maj fichier : ${r.updatedAt ?? "—"}`);
  if (r.corrections) {
    const c = r.corrections;
    console.log(
      `Coefficients: distance ×${c.distance} · D+ ×${c.dPlus} · D− ×${c.dMinus}` +
        `   (ceux de l'image qui tourne — si ce n'est pas ce que tu attends, l'image n'est pas à jour)`,
    );
  }
}

function main(): void {
  const cmd = (process.argv[2] || "").toLowerCase();
  const store = new Store(loadDataDir());

  switch (cmd) {
    case "start": {
      const t = start(store);
      console.log(`🚀 Tracking démarré à ${t.startTime}. La collecte commence depuis maintenant.`);
      break;
    }
    case "stop": {
      const t = stop(store);
      console.log(`🛑 Tracking arrêté à ${t.stopTime}. La donnée reste figée (consultation / replay).`);
      break;
    }
    case "reset": {
      reset(store);
      console.log("♻️  Tracking réinitialisé : chrono à zéro, cache et sortie vidés.");
      break;
    }
    case "status": {
      printStatus(status(store, loadComputeParams()));
      break;
    }
    default: {
      console.error("Usage : node dist/cli.js <start|stop|reset|status>");
      process.exit(1);
    }
  }
}

main();
