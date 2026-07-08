// Configuration du service : live-journal.config.json (non secret, versionné)
// surchargé par l'environnement. Les secrets Telegram ne viennent QUE de l'env.
// Pattern identique à services/tracking-cache/src/config.ts.

import fs from "node:fs";
import path from "node:path";

export type TelegramMode = "webhook" | "polling";

export interface MessageConfig {
  maxMessageLength: number;
  maxPrenomLength: number;
  maxEmailLength: number;
  ratePerMinute: number;
  ratePerHour: number;
}

export interface MediaConfig {
  photoMaxWidth: number;
  photoQuality: number;
  /** Limite dure de téléchargement — 20 Mo = plafond de getFile (API Bot standard). */
  maxDownloadBytes: number;
}

export interface OgConfig {
  enabled: boolean;
  intervalMinutes: number;
}

export interface SelfCheckConfig {
  enabled: boolean;
  intervalMinutes: number;
  diskMinMb: number;
}

export interface SimulationConfig {
  enabled: boolean;
  gpxPath: string;
  scenarioPath: string;
}

export interface Config {
  port: number;
  dataDir: string;
  /** Préfixe public du service derrière Caddy (URLs écrites dans journal.json). */
  publicPrefix: string;
  allowedOrigins: string[];
  message: MessageConfig;
  media: MediaConfig;
  videoEnabled: boolean;
  /** Cartes de partage (PR4). */
  og: OgConfig;
  /** Auto-surveillance via le bot (PR5) — active hors aventure uniquement. */
  selfCheck: SelfCheckConfig;
  /** Le site public (live-config.json, .track.json) et les artefacts tracking. */
  siteBase: string;
  trackingBase: string;
  telegram: {
    mode: TelegramMode;
    apiBase: string;
    botToken: string;
    webhookSecret: string;
    valentinChatId: string;
  };
  simulation: SimulationConfig;
}

interface FileConfig {
  port?: number;
  og?: Partial<OgConfig>;
  selfCheck?: Partial<SelfCheckConfig>;
  siteBase?: string;
  trackingBase?: string;
  publicPrefix?: string;
  allowedOrigins?: string[];
  message?: Partial<MessageConfig>;
  media?: Partial<MediaConfig>;
  videoEnabled?: boolean;
}

function readFileConfig(): FileConfig {
  const configPath =
    process.env.LIVE_JOURNAL_CONFIG_PATH ||
    path.resolve(__dirname, "..", "live-journal.config.json");
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as FileConfig;
  return raw;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) {
    console.error(`Config invalide : ${name}=${v} n'est pas un entier.`);
    process.exit(2);
  }
  return n;
}

export function loadConfig(): Config {
  const file = readFileConfig();

  const simulationEnabled = envBool("LIVE_JOURNAL_SIMULATION", false);
  const mode = (process.env.TELEGRAM_MODE || "webhook") as TelegramMode;
  if (mode !== "webhook" && mode !== "polling") {
    console.error(`Config invalide : TELEGRAM_MODE=${mode} (attendu : webhook | polling).`);
    process.exit(2);
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  // En simulation, le scénario émet depuis le chat fictif "0" : il doit passer
  // le filtre « seul Valentin alimente le journal ».
  const valentinChatId = process.env.VALENTIN_CHAT_ID || (simulationEnabled ? "0" : "");

  // Hors simulation, les secrets sont OBLIGATOIRES (le conteneur refuse de
  // démarrer plutôt que de tourner sourd — même règle que tracking-cache).
  if (!simulationEnabled) {
    const missing: string[] = [];
    if (!botToken) missing.push("TELEGRAM_BOT_TOKEN");
    if (!valentinChatId) missing.push("VALENTIN_CHAT_ID");
    if (mode === "webhook" && !webhookSecret) missing.push("TELEGRAM_WEBHOOK_SECRET");
    if (missing.length > 0) {
      console.error(
        `Secrets manquants dans l'environnement : ${missing.join(", ")}. ` +
          `Cf. infra/.env.example et docs/secrets.md.`,
      );
      process.exit(2);
    }
  }

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : (file.allowedOrigins ?? []);

  return {
    port: envInt("PORT", file.port ?? 3000),
    dataDir: process.env.DATA_DIR || "/data",
    publicPrefix: process.env.PUBLIC_PREFIX || file.publicPrefix || "/journal",
    allowedOrigins,
    message: {
      maxMessageLength: envInt("MESSAGE_MAX_LENGTH", file.message?.maxMessageLength ?? 1000),
      maxPrenomLength: envInt("PRENOM_MAX_LENGTH", file.message?.maxPrenomLength ?? 50),
      maxEmailLength: envInt("EMAIL_MAX_LENGTH", file.message?.maxEmailLength ?? 254),
      ratePerMinute: envInt("MESSAGE_RATE_PER_MINUTE", file.message?.ratePerMinute ?? 5),
      ratePerHour: envInt("MESSAGE_RATE_PER_HOUR", file.message?.ratePerHour ?? 30),
    },
    media: {
      photoMaxWidth: envInt("PHOTO_MAX_WIDTH", file.media?.photoMaxWidth ?? 1600),
      photoQuality: envInt("PHOTO_QUALITY", file.media?.photoQuality ?? 80),
      maxDownloadBytes: envInt("MAX_DOWNLOAD_BYTES", file.media?.maxDownloadBytes ?? 20 * 1024 * 1024),
    },
    videoEnabled: envBool("VIDEO_ENABLED", file.videoEnabled ?? false),
    og: {
      enabled: envBool("OG_ENABLED", file.og?.enabled ?? true),
      intervalMinutes: envInt("OG_INTERVAL_MINUTES", file.og?.intervalMinutes ?? 3),
    },
    selfCheck: {
      enabled: envBool("SELF_CHECK_ENABLED", file.selfCheck?.enabled ?? true),
      intervalMinutes: envInt("SELF_CHECK_INTERVAL_MINUTES", file.selfCheck?.intervalMinutes ?? 30),
      diskMinMb: envInt("SELF_CHECK_DISK_MIN_MB", file.selfCheck?.diskMinMb ?? 500),
    },
    siteBase: process.env.SITE_BASE || file.siteBase || "https://thelocomotionlab.com",
    trackingBase: process.env.TRACKING_BASE || file.trackingBase || "https://tracking.thelocomotionlab.com",
    telegram: {
      mode,
      apiBase: process.env.TELEGRAM_API_BASE || "https://api.telegram.org",
      botToken,
      webhookSecret,
      valentinChatId,
    },
    simulation: {
      enabled: simulationEnabled,
      gpxPath:
        process.env.SIM_GPX ||
        path.resolve(__dirname, "..", "..", "..", "apps", "site", "public", "tracks", "tour-des-ecrins_temp.gpx"),
      scenarioPath:
        process.env.SIM_SCENARIO || path.resolve(__dirname, "..", "sim", "scenario.default.json"),
    },
  };
}
