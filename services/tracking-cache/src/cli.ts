// services/tracking-cache/src/cli.ts
//
// CLI de contrôle, exécutée DANS le conteneur via `docker compose exec`
// (cf. le script `track` à la racine). Ne nécessite PAS le token : elle ne fait
// que piloter le chrono + la fenêtre de collecte dans le volume.
//
//   node dist/cli.js start|stop|reset|status|gpx [--brut]

import { loadComputeParams, loadDataDir } from "./config";
import { dansLaFenetre } from "./fenetre";
import { versGpx, type PointGpx } from "./gpx";
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

/**
 * La trace de l'aventure, en GPX, sur la sortie standard.
 *
 * Par défaut la série FILTRÉE (celle qu'a montrée /live) ; `--brut` rend le
 * relevé Traccar intact. Dans les deux cas on applique la fenêtre de collecte,
 * pour que le fichier couvre l'aventure et rien d'autre.
 */
function exporterGpx(store: Store, brut: boolean): void {
  const depuis = store.readControl().windowStartIso;

  let points: PointGpx[];
  if (brut) {
    points = store
      .readRawCache()
      .filter((p) => dansLaFenetre(p.fixTime, depuis))
      .map((p) => ({ lat: p.latitude as number, lon: p.longitude as number, ele: p.altitude, time: p.fixTime }));
  } else {
    const live = store.readLivePositions();
    points = (live?.profile ?? [])
      .filter((p) => dansLaFenetre(p.fixTime, depuis))
      .map((p) => ({ lat: p.latitude as number, lon: p.longitude as number, ele: p.alt, time: p.fixTime }));
  }

  if (points.length === 0) {
    console.error(
      "Aucune position à exporter." +
        (depuis ? ` (fenêtre de collecte ouverte le ${depuis})` : " (aucune session enregistrée)"),
    );
    process.exit(3);
  }

  // Le nom porte la date de départ : c'est ce qui distingue deux aventures
  // dans une bibliothèque de traces.
  const jour = (points.find((p) => p.time)?.time ?? "").slice(0, 10);
  const nom = `Locomotion Lab${jour ? ` — ${jour}` : ""}${brut ? " (brut)" : ""}`;
  process.stdout.write(versGpx(points, { nom }));
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
    case "gpx": {
      exporterGpx(store, process.argv.includes("--brut"));
      break;
    }
    default: {
      console.error("Usage : node dist/cli.js <start|stop|reset|status|gpx [--brut]>");
      process.exit(1);
    }
  }
}

main();
