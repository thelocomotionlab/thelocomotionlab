// app/live-config.json/route.js
//
// Publie les paramètres PUBLICS de l'aventure, générés AU BUILD depuis
// lib/liveConfig.js. Le service live-journal (VPS) lit ce fichier pour composer
// les cartes de partage : sa FORME est un contrat stable (aventure.distanceKm,
// aventure.deniveleM, live.referenceTrack, live.waypoints) — on la conserve même
// si la config source, elle, est plus simple. distanceKm/deniveleM sont calculés
// depuis le .track.json (lecture disque au build ; route force-static).

import fs from "node:fs";
import path from "node:path";

import { liveConfig, liveReglages } from "@/lib/liveConfig";

export const dynamic = "force-static";

function statsDeLaTrace(trace) {
  try {
    const fichier = path.join(process.cwd(), "public", trace.replace(/^\//, ""));
    const t = JSON.parse(fs.readFileSync(fichier, "utf8"));
    if (t?.schemaVersion === 1 && Number.isFinite(t.totalKm)) {
      return {
        distanceKm: Math.round(t.totalKm),
        deniveleM: Number.isFinite(t.dPlusM) ? t.dPlusM : null,
      };
    }
  } catch {
    // trace absente ou illisible → champs nuls (l'OG retombe sur ses défauts)
  }
  return { distanceKm: null, deniveleM: null };
}

export function GET() {
  const { aventure } = liveConfig;
  const stats = statsDeLaTrace(aventure.trace);
  return Response.json({
    schemaVersion: 1,
    aventure: {
      nom: aventure.nom,
      dates: aventure.dates,
      dateDebut: aventure.dateDebut,
      distanceKm: stats.distanceKm,
      deniveleM: stats.deniveleM,
      statut: aventure.statut,
    },
    live: {
      referenceTrack: aventure.trace,
      waypoints: aventure.waypoints ?? [],
      zoneBlancheMinutes: liveReglages.zoneBlancheMinutes,
    },
  });
}
