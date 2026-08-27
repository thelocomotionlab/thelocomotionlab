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

import { liveConfig, journalApiBase, liveReglages, trackingApiBase } from "@/lib/liveConfig";

export const dynamic = "force-static";

/**
 * CE QUE LE BUILD A RETENU, dit à voix haute.
 *
 * `liveConfig` écrit ses valeurs sous la forme `process.env.X || "littéral"` :
 * une variable d'environnement NON VIDE l'emporte donc toujours sur le fichier
 * — et elle vit dans `.env.production` ou dans les variables de build de
 * Cloudflare, deux endroits que `.gitignore` ou le tableau de bord tiennent
 * hors de vue. Rien dans le dépôt ne peut révéler l'écart.
 *
 * Deux fois de suite une valeur du dépôt a été détournée en silence : `statut`
 * resté à « avant » par `.env.production` alors que le fichier disait « repos »,
 * et `SITE_BASE` pointé sur le staging côté live-journal (les cartes de partage
 * ont composé douze jours avec l'aventure précédente). Le défaut commun n'était
 * pas la surcharge — elle est voulue — mais le fait qu'elle ne se voie nulle
 * part. Cette route est le bon endroit pour le dire : elle PUBLIE cette config,
 * elle est prérendue au build, et elle ne s'exécute jamais dans un navigateur.
 */
function annoncerConfigLive() {
  const ligne = (cle, valeur, variable) =>
    `[live] ${cle.padEnd(8)} = ${String(valeur).padEnd(38)} ← ${
      process.env[variable] ? `${variable} (environnement)` : "lib/liveConfig.js"
    }`;
  console.log(
    [
      ligne("statut", liveConfig.aventure.statut, "NEXT_PUBLIC_LIVE_STATUT"),
      ligne("tracking", trackingApiBase, "NEXT_PUBLIC_TRACKING_PROXY"),
      ligne("journal", journalApiBase, "NEXT_PUBLIC_JOURNAL_API"),
    ].join("\n"),
  );
}

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
  annoncerConfigLive();
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
