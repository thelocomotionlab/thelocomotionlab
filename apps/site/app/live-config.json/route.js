// app/live-config.json/route.js
//
// Publie les paramètres PUBLICS de l'aventure courante, générés AU BUILD depuis
// lib/liveConfig.js — LA source unique reste liveConfig (décision PR4 §2) : le
// service live-journal lit ce fichier pour composer les cartes de partage sans
// dupliquer la config dans l'environnement du VPS. Statique (aucun secret,
// aucune donnée personnelle).
//
// Les stats (distanceKm, deniveleM) sont CALCULÉES depuis le .track.json de la
// trace de référence (généré par build:track) — lecture disque AU BUILD, la
// route est force-static. Repli : les valeurs saisies de liveConfig.

import fs from "node:fs";
import path from "node:path";

import { liveConfig } from "@/lib/liveConfig";

export const dynamic = "force-static";

function statsDeLaTrace(referenceTrack) {
  try {
    const fichier = path.join(process.cwd(), "public", referenceTrack.replace(/^\//, ""));
    const t = JSON.parse(fs.readFileSync(fichier, "utf8"));
    if (t?.schemaVersion === 1 && Number.isFinite(t.totalKm)) {
      return {
        distanceKm: Math.round(t.totalKm),
        deniveleM: Number.isFinite(t.dPlusM) ? t.dPlusM : null,
      };
    }
  } catch {
    // trace absente ou illisible → replis de liveConfig
  }
  return null;
}

export function GET() {
  const { aventure, live } = liveConfig;
  const stats = statsDeLaTrace(live.referenceTrack);
  return Response.json({
    schemaVersion: 1,
    aventure: {
      slug: aventure.slug,
      nom: aventure.nom,
      dates: aventure.dates,
      dateDebut: aventure.dateDebut,
      distanceKm: stats?.distanceKm ?? aventure.distanceKm,
      deniveleM: stats?.deniveleM ?? aventure.deniveleM,
      statut: aventure.statut,
    },
    live: {
      referenceTrack: live.referenceTrack,
      waypoints: live.waypoints ?? [],
      zoneBlancheMinutes: live.zoneBlancheMinutes,
    },
  });
}
