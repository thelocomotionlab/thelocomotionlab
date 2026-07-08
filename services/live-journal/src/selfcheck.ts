// Auto-surveillance (brief §8) : le service vérifie sa propre chaîne et
// PRÉVIENT VALENTIN VIA LE BOT si quelque chose cloche — UNIQUEMENT hors
// aventure (live-timer.running === false : donc active à J-1, silencieuse
// pendant — personne n'agit depuis un bivouac, on ne génère pas d'anxiété).
// Anti-spam : notification à la bascule ok→KO, rappel au plus toutes les 6 h,
// message de rétablissement au retour à la normale.

import fs from "node:fs";
import path from "node:path";

import type { Config } from "./config";
import type { TelegramApi } from "./telegram/api";
import type { SimSnapshotProvider } from "./server";
import type { OgScheduler } from "./og/scheduler";

const RENOTIFY_MS = 6 * 3_600_000;
const WEBHOOK_ERROR_WINDOW_S = 30 * 60;
const WEBHOOK_PENDING_MAX = 50;

export interface SelfCheckResult {
  ok: boolean;
  problems: string[];
  at: string;
}

export interface SelfCheckDeps {
  config: Config;
  telegram: TelegramApi;
  og?: OgScheduler;
  sim?: SimSnapshotProvider;
  fetcher?: typeof fetch;
  /** Octets libres sur le volume (injectable pour les tests). */
  freeBytes?: (dir: string) => number;
  now?: () => number;
}

function defaultFreeBytes(dir: string): number {
  const stat = fs.statfsSync(dir);
  return stat.bavail * stat.bsize;
}

export class SelfCheck {
  private readonly deps: SelfCheckDeps;
  private readonly fetcher: typeof fetch;
  private timer: NodeJS.Timeout | null = null;

  lastResult: SelfCheckResult | null = null;
  private wasOk = true;
  private lastNotifiedAt = 0;

  constructor(deps: SelfCheckDeps) {
    this.deps = deps;
    this.fetcher = deps.fetcher ?? fetch;
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  private async fetchJson(url: string): Promise<unknown | null> {
    try {
      const res = await this.fetcher(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /** L'aventure est-elle en cours ? (pendant : on se tait, personne n'agit) */
  private async aventureEnCours(): Promise<boolean> {
    if (this.deps.sim) {
      return (this.deps.sim.getTimer() as { running?: boolean }).running === true;
    }
    const timer = await this.fetchJson(
      `${this.deps.config.trackingBase}/live-timer.json?cacheBust=${this.now()}`,
    );
    return (timer as { running?: boolean } | null)?.running === true;
  }

  /** Toutes les vérifications — chaque problème est une phrase actionnable. */
  async run(): Promise<SelfCheckResult> {
    const { config } = this.deps;
    const problems: string[] = [];

    // ① Espace disque du volume.
    try {
      const free = (this.deps.freeBytes ?? defaultFreeBytes)(config.dataDir);
      const freeMb = Math.round(free / 1_048_576);
      if (freeMb < config.selfCheck.diskMinMb) {
        problems.push(`disque : ${freeMb} Mo libres (< ${config.selfCheck.diskMinMb} Mo) — faire du ménage dans ~/backups ?`);
      }
    } catch {
      problems.push("disque : mesure impossible sur DATA_DIR");
    }

    // ② Le volume est-il inscriptible ?
    try {
      const probe = path.join(config.dataDir, "private", "tmp", ".selfcheck");
      fs.writeFileSync(probe, String(this.now()));
      fs.unlinkSync(probe);
    } catch {
      problems.push("volume : écriture impossible (permissions ? montage ?)");
    }

    // ③ La chaîne tracking répond (Caddy + volume live_json).
    if (!this.deps.sim && (await this.fetchJson(`${config.trackingBase}/live-timer.json`)) === null) {
      problems.push(`tracking : ${config.trackingBase}/live-timer.json injoignable`);
    }

    // ④ Le site publie bien la config d'aventure (cartes de partage).
    if ((await this.fetchJson(`${config.siteBase}/live-config.json`)) === null) {
      problems.push(`site : ${config.siteBase}/live-config.json injoignable`);
    }

    // ⑤ Webhook Telegram sain (mode webhook uniquement).
    if (config.telegram.mode === "webhook" && config.telegram.botToken && !this.deps.sim) {
      try {
        const info = await this.deps.telegram.getWebhookInfo();
        if (!info.url) {
          problems.push("webhook : aucune URL enregistrée — relancer scripts/set-webhook.sh");
        } else {
          if (info.last_error_date && this.now() / 1000 - info.last_error_date < WEBHOOK_ERROR_WINDOW_S) {
            problems.push(`webhook : erreur récente Telegram (« ${info.last_error_message ?? "?"} »)`);
          }
          if ((info.pending_update_count ?? 0) > WEBHOOK_PENDING_MAX) {
            problems.push(`webhook : ${info.pending_update_count} updates en attente — le service répond-il ?`);
          }
        }
      } catch (err) {
        problems.push(`webhook : getWebhookInfo en échec (${(err as Error).message})`);
      }
    }

    // ⑥ La carte de partage vit.
    if (config.og.enabled && this.deps.og && this.deps.og.lastGeneratedAt === null) {
      problems.push("og : aucune carte générée depuis le démarrage (logs [og] ?)");
    }

    const result: SelfCheckResult = {
      ok: problems.length === 0,
      problems,
      at: new Date(this.now()).toISOString(),
    };
    this.lastResult = result;
    return result;
  }

  /** Un tour : silence pendant l'aventure, sinon vérifie et notifie les bascules. */
  async tick(): Promise<void> {
    try {
      if (await this.aventureEnCours()) return;

      const result = await this.run();
      if (!result.ok) {
        const isTransition = this.wasOk;
        const canRenotify = this.now() - this.lastNotifiedAt > RENOTIFY_MS;
        if (isTransition || canRenotify) {
          this.lastNotifiedAt = this.now();
          await this.notify(
            `⚠️ Auto-surveillance live-journal :\n${result.problems.map((p) => `• ${p}`).join("\n")}`,
          );
        }
        this.wasOk = false;
      } else if (!this.wasOk) {
        this.wasOk = true;
        await this.notify("✅ Auto-surveillance live-journal : tout est rétabli.");
      }
    } catch (err) {
      console.error(new Date().toISOString(), `[selfcheck] échec : ${(err as Error).message}`);
    }
  }

  private async notify(text: string): Promise<void> {
    try {
      await this.deps.telegram.sendMessage(this.deps.config.telegram.valentinChatId, text);
    } catch (err) {
      // Telegram KO : les logs restent le dernier témoin.
      console.error(new Date().toISOString(), `[selfcheck] notification impossible : ${(err as Error).message}`);
    }
  }

  start(): () => void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.deps.config.selfCheck.intervalMinutes * 60_000);
    return () => {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    };
  }
}
