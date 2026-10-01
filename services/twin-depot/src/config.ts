// Configuration du service : twin-depot.config.json (non secret, versionné)
// surchargé par l'environnement. Le jeton admin, le SMTP et le destinataire
// des notifications ne viennent QUE de l'env. Pattern identique à
// services/atelier-api/src/config.ts.

import fs from "node:fs";
import path from "node:path";

import { cleDArchive } from "./chiffre";

export interface Config {
  port: number;
  dataDir: string;
  /** Origines autorisées à POSTer un dépôt (CORS). */
  allowedOrigins: string[];
  /** Jeton du listing/téléchargement/purge admin. Vide → routes admin désactivées (404). */
  adminToken: string;
  ratePerMinute: number;
  ratePerHour: number;
  /** Taille maximale de l'archive, en Mo — en phase avec MAX_ARCHIVE_MO du
   *  site (lib/twinCohorte.mjs) et la borne request_body de depot.caddy. */
  maxArchiveMo: number;
  /** Marques de montre acceptées — en phase avec lib/twinCohorte.mjs. */
  montres: string[];
  /** Destinataire de la notification « nouveau dépôt ». Vide → pas d'email. */
  notifyEmail: string;
  /** Clé de chiffrement des archives au repos (TWIN_DEPOT_ARCHIVE_KEY). null → le service
   *  refuse les dépôts plutôt que d'écrire une archive en clair. */
  archiveKey: Buffer | null;
  /** Versions du texte de consentement que le site peut envoyer ; la première est celle
   *  d'un formulaire qui n'en envoie pas. En phase avec apps/site/lib/twinCohorte.mjs. */
  consentementVersions: string[];
  /** Durée de conservation annoncée au déposant, en jours — en phase avec
   *  cohorte.conservation_jours du moteur, qui décide de la purge. */
  conservationJours: number;
}

interface FileConfig {
  allowedOrigins?: string[];
  ratePerMinute?: number;
  ratePerHour?: number;
  maxArchiveMo?: number;
  montres?: string[];
  consentementVersions?: string[];
  conservationJours?: number;
}

export function loadConfig(root = process.cwd()): Config {
  const file = path.join(root, "twin-depot.config.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as FileConfig;

  const montres = raw.montres ?? [];
  if (!montres.length) {
    throw new Error("twin-depot.config.json : aucune montre définie");
  }
  const maxArchiveMo = raw.maxArchiveMo ?? 2048;
  if (!Number.isInteger(maxArchiveMo) || maxArchiveMo < 1) {
    throw new Error(`twin-depot.config.json : maxArchiveMo invalide (${maxArchiveMo})`);
  }

  const envOrigins = (process.env.TWIN_DEPOT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    port: Number(process.env.PORT || 3000),
    dataDir: process.env.DATA_DIR || path.join(root, "data"),
    allowedOrigins: envOrigins.length ? envOrigins : (raw.allowedOrigins ?? []),
    adminToken: process.env.TWIN_DEPOT_ADMIN_TOKEN ?? "",
    ratePerMinute: raw.ratePerMinute ?? 4,
    ratePerHour: raw.ratePerHour ?? 12,
    maxArchiveMo,
    montres,
    notifyEmail: process.env.TWIN_DEPOT_NOTIFY_EMAIL ?? "",
    archiveKey: cleDArchive(process.env.TWIN_DEPOT_ARCHIVE_KEY),
    consentementVersions: raw.consentementVersions?.length
      ? raw.consentementVersions
      : ["2026-07"],
    conservationJours: raw.conservationJours ?? 183,
  };
}
