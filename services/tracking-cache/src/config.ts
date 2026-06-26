// services/tracking-cache/src/config.ts
//
// Chargement de la configuration. Règle d'or : le TOKEN Traccar vient
// EXCLUSIVEMENT de l'environnement (TRACCAR_API_TOKEN, injecté par infra/.env),
// JAMAIS d'un fichier versionné. Les autres paramètres (non secrets) viennent de
// tracking.config.json et sont surchargeables par variables d'env.

import fs from "node:fs";
import path from "node:path";
import type { ComputeParams } from "./types";

export type Config = {
  apiUrl: string;
  deviceId: number;
  token: string;
  dataDir: string;
  fetchWindowHours: number;
  maxPointsPerFetch: number;
  intervalSeconds: number;
  compute: ComputeParams;
};

type RawConfig = Partial<{
  apiUrl: string;
  deviceId: number;
  outputDir: string;
  fetchWindowHours: number;
  maxPointsPerFetch: number;
  intervalSeconds: number;
  minDistanceThreshold: number;
  minElevationPlusThreshold: number;
  minElevationMinusThreshold: number;
  samplingCorrection: number;
  elevationPlusCorrection: number;
  elevationMinusCorrection: number;
}>;

function readJsonFile(file: string): RawConfig {
  if (!fs.existsSync(file)) {
    console.error("Config introuvable :", file);
    process.exit(2);
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as RawConfig;
  } catch (e) {
    console.error("Config illisible :", file, (e as Error).message);
    process.exit(2);
  }
}

function num(envVal: string | undefined, fallback: number): number {
  if (envVal === undefined || envVal === "") return fallback;
  const n = Number(envVal);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(): Config {
  const configPath =
    process.env.TRACKING_CONFIG_PATH ||
    path.join(__dirname, "..", "tracking.config.json");
  const raw = readJsonFile(configPath);

  const token = process.env.TRACCAR_API_TOKEN || "";
  if (!token) {
    console.error(
      "TRACCAR_API_TOKEN absent de l'environnement. Renseigne-le dans infra/.env (jamais dans le repo)."
    );
    process.exit(2);
  }

  return {
    apiUrl: process.env.TRACCAR_API_URL || raw.apiUrl || "http://host.docker.internal:8082/api",
    deviceId: num(process.env.DEVICE_ID, raw.deviceId ?? 0),
    token,
    dataDir: process.env.DATA_DIR || raw.outputDir || "/data",
    fetchWindowHours: num(process.env.FETCH_WINDOW_HOURS, raw.fetchWindowHours ?? 48),
    maxPointsPerFetch: num(process.env.MAX_POINTS_PER_FETCH, raw.maxPointsPerFetch ?? 10000),
    intervalSeconds: num(process.env.INTERVAL_SECONDS, raw.intervalSeconds ?? 15),
    compute: {
      samplingCorrection: num(process.env.SAMPLING_CORRECTION, raw.samplingCorrection ?? 1.0),
      elevationPlusCorrection: num(
        process.env.ELEVATION_PLUS_CORRECTION,
        raw.elevationPlusCorrection ?? 1.0
      ),
      elevationMinusCorrection: num(
        process.env.ELEVATION_MINUS_CORRECTION,
        raw.elevationMinusCorrection ?? 1.0
      ),
      minDistanceThreshold: num(process.env.MIN_DISTANCE_THRESHOLD, raw.minDistanceThreshold ?? 5),
      minElevationPlusThreshold: num(
        process.env.MIN_ELEVATION_PLUS_THRESHOLD,
        raw.minElevationPlusThreshold ?? 2
      ),
      minElevationMinusThreshold: num(
        process.env.MIN_ELEVATION_MINUS_THRESHOLD,
        raw.minElevationMinusThreshold ?? 2
      ),
    },
  };
}

/**
 * Config « légère » pour la CLI de contrôle : on a seulement besoin du dataDir
 * (le token n'est PAS requis pour piloter le chrono).
 */
export function loadDataDir(): string {
  return process.env.DATA_DIR || "/data";
}
