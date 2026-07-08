// app/live-config.json/route.js
//
// Publie les paramètres PUBLICS de l'aventure courante, générés AU BUILD depuis
// lib/liveConfig.js — LA source unique reste liveConfig (décision PR4 §2) : le
// service live-journal lit ce fichier pour composer les cartes de partage sans
// dupliquer la config dans l'environnement du VPS. Statique (aucun secret,
// aucune donnée personnelle).

import { liveConfig } from "@/lib/liveConfig";

export const dynamic = "force-static";

export function GET() {
  const { aventure, live } = liveConfig;
  return Response.json({
    schemaVersion: 1,
    aventure: {
      slug: aventure.slug,
      nom: aventure.nom,
      dates: aventure.dates,
      dateDebut: aventure.dateDebut,
      distanceKm: aventure.distanceKm,
      deniveleM: aventure.deniveleM,
      statut: aventure.statut,
    },
    live: {
      referenceTrack: live.referenceTrack,
      waypoints: live.waypoints ?? [],
      elevationMin: live.elevationMin,
      elevationMax: live.elevationMax,
      zoneBlancheMinutes: live.zoneBlancheMinutes,
    },
  });
}
