// Configuration du service : atelier-api.config.json (non secret, versionné)
// surchargé par l'environnement. Le jeton admin et le SMTP ne viennent QUE de
// l'env. Pattern identique à services/live-journal/src/config.ts.

import fs from "node:fs";
import path from "node:path";

export type AtelierStatus = "open" | "full" | "past";

export interface AtelierDef {
  id: string;
  capacity: number;
  /** open = inscriptions ouvertes · full = complet forcé (liste d'attente
   *  seulement) · past = terminé (plus aucune inscription). */
  status: AtelierStatus;
  /** Intitulé/date/lieu portés sur la fiche PDF — en phase avec le
   *  catalogue du site (apps/site/lib/ateliers.mjs). */
  title: string;
  dateLabel: string;
  lieu: string;
}

/** Constantes de la fiche PDF (versionnées — rien de secret). */
export interface FicheConfig {
  responsable: { nom: string; email: string };
  assurance: { assureur: string; numero: string };
  image: { supports: string; duree: string };
  atelier: { duree: string; contexte: string; encadrant: string };
}

export interface Config {
  port: number;
  dataDir: string;
  /** Origines autorisées à POSTer une inscription (CORS). */
  allowedOrigins: string[];
  /** Jeton du listing/purge admin. Vide → routes admin désactivées (404). */
  adminToken: string;
  ratePerMinute: number;
  ratePerHour: number;
  ateliers: AtelierDef[];
  fiche: FicheConfig;
  /** Base URL du moteur de rendu de la fiche (twin-engine, réseau interne).
   *  Chaîne vide → rendu PDF désactivé (l'inscription reste fonctionnelle). */
  twinEngineUrl: string;
}

interface FileConfig {
  allowedOrigins?: string[];
  ratePerMinute?: number;
  ratePerHour?: number;
  ateliers?: AtelierDef[];
  fiche?: FicheConfig;
}

export function loadConfig(root = process.cwd()): Config {
  const file = path.join(root, "atelier-api.config.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as FileConfig;

  const ateliers = raw.ateliers ?? [];
  if (!ateliers.length) {
    throw new Error("atelier-api.config.json : aucun atelier défini");
  }
  for (const a of ateliers) {
    if (!a.id || !Number.isInteger(a.capacity) || a.capacity < 1) {
      throw new Error(`atelier-api.config.json : atelier invalide (${JSON.stringify(a)})`);
    }
  }
  if (!raw.fiche) {
    throw new Error("atelier-api.config.json : section fiche manquante");
  }

  const envOrigins = (process.env.ATELIER_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    port: Number(process.env.PORT || 3000),
    dataDir: process.env.DATA_DIR || path.join(root, "data"),
    allowedOrigins: envOrigins.length ? envOrigins : (raw.allowedOrigins ?? []),
    adminToken: process.env.ATELIER_ADMIN_TOKEN ?? "",
    ratePerMinute: raw.ratePerMinute ?? 5,
    ratePerHour: raw.ratePerHour ?? 30,
    ateliers,
    fiche: raw.fiche,
    twinEngineUrl:
      process.env.TWIN_ENGINE_URL !== undefined
        ? process.env.TWIN_ENGINE_URL
        : "http://twin-engine:8000",
  };
}
