// Auto-surveillance : silence pendant l'aventure, notification à la bascule
// ok→KO, anti-spam 6 h, message de rétablissement — horloge, disque, réseau
// et Telegram injectés (aucun réseau réel).

import { beforeEach, describe, expect, it } from "vitest";

import { SelfCheck } from "../src/selfcheck";
import { makeConfig, makeStore, makeTelegram, type RecordingTelegram } from "./helpers";
import type { Config } from "../src/config";

let config: Config;
let telegram: RecordingTelegram;
let nowMs: number;
let running: boolean;
let freeMb: number;

function fetcher(): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const s = String(url);
    if (s.includes("live-timer.json")) return { ok: true, json: async () => ({ running }) } as Response;
    if (s.includes("live-config.json")) return { ok: true, json: async () => ({ schemaVersion: 1 }) } as Response;
    return { ok: false, status: 404, json: async () => null } as Response;
  }) as typeof fetch;
}

function makeSelfCheck(): SelfCheck {
  return new SelfCheck({
    config,
    telegram,
    fetcher: fetcher(),
    freeBytes: () => freeMb * 1_048_576,
    now: () => nowMs,
  });
}

beforeEach(() => {
  config = makeConfig();
  makeStore(config); // crée l'arborescence du volume (la sonde d'écriture en a besoin)
  telegram = makeTelegram();
  nowMs = Date.parse("2026-08-19T10:00:00Z"); // J-1
  running = false;
  freeMb = 5_000;
});

describe("SelfCheck", () => {
  it("tout va bien : aucun problème, aucune notification", async () => {
    const check = makeSelfCheck();
    await check.tick();
    expect(check.lastResult?.ok).toBe(true);
    expect(telegram.sent).toHaveLength(0);
  });

  it("disque bas → notification unique à la bascule, pas de spam au tick suivant", async () => {
    const check = makeSelfCheck();
    freeMb = 100;
    await check.tick();
    expect(check.lastResult?.problems.join(" ")).toContain("disque");
    expect(telegram.sent).toHaveLength(1);
    expect(telegram.sent[0].text).toContain("⚠️ Auto-surveillance");

    nowMs += 30 * 60_000; // tick suivant, toujours KO, < 6 h
    await check.tick();
    expect(telegram.sent).toHaveLength(1); // pas de re-notification
  });

  it("toujours KO après 6 h → rappel ; rétabli → message ✅", async () => {
    const check = makeSelfCheck();
    freeMb = 100;
    await check.tick();
    nowMs += 7 * 3_600_000;
    await check.tick();
    expect(telegram.sent).toHaveLength(2); // rappel après 6 h

    freeMb = 5_000;
    await check.tick();
    expect(telegram.sent).toHaveLength(3);
    expect(telegram.sent[2].text).toContain("✅");
  });

  it("PENDANT l'aventure : silence absolu, même en cas de problème", async () => {
    const check = makeSelfCheck();
    running = true;
    freeMb = 10;
    await check.tick();
    expect(telegram.sent).toHaveLength(0);
    expect(check.lastResult).toBeNull(); // même pas de mesure : personne n'agit
  });

  it("webhook sans URL → problème actionnable (relancer set-webhook.sh)", async () => {
    telegram.getWebhookInfo = async () => ({ url: "" });
    const check = makeSelfCheck();
    await check.tick();
    expect(check.lastResult?.problems.join(" ")).toContain("set-webhook.sh");
  });

  it("erreur webhook récente et updates en attente → signalés", async () => {
    telegram.getWebhookInfo = async () => ({
      url: "https://api.test/journal/telegram/webhook",
      last_error_date: Math.floor(nowMs / 1000) - 60,
      last_error_message: "Connection refused",
      pending_update_count: 120,
    });
    const check = makeSelfCheck();
    await check.tick();
    const problems = check.lastResult?.problems.join(" | ") ?? "";
    expect(problems).toContain("Connection refused");
    expect(problems).toContain("120 updates");
  });

  it("Telegram lui-même KO à la notification : on n'explose pas (logs)", async () => {
    const check = makeSelfCheck();
    freeMb = 100;
    telegram.failNextSend = true;
    await expect(check.tick()).resolves.toBeUndefined();
  });
});
