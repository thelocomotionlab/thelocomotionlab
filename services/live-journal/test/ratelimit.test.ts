// Limiteur par IP : fenêtres minute et heure, horloge injectée (déterministe).

import { describe, expect, it } from "vitest";

import { IpRateLimiter } from "../src/ratelimit";

describe("IpRateLimiter", () => {
  it("bloque au-delà du quota minute, libère à la fenêtre suivante", () => {
    let now = 0;
    const limiter = new IpRateLimiter(3, 100, () => now);
    expect(limiter.allow("ip")).toBe(true);
    expect(limiter.allow("ip")).toBe(true);
    expect(limiter.allow("ip")).toBe(true);
    expect(limiter.allow("ip")).toBe(false);

    now = 61_000; // fenêtre minute expirée
    expect(limiter.allow("ip")).toBe(true);
  });

  it("le quota horaire tient même quand les minutes se renouvellent", () => {
    let now = 0;
    const limiter = new IpRateLimiter(100, 5, () => now);
    for (let i = 0; i < 5; i++) {
      expect(limiter.allow("ip")).toBe(true);
      now += 61_000;
    }
    expect(limiter.allow("ip")).toBe(false);

    now += 3_600_001; // fenêtre heure expirée
    expect(limiter.allow("ip")).toBe(true);
  });

  it("les IP sont comptées indépendamment", () => {
    const limiter = new IpRateLimiter(1, 10, () => 0);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
    expect(limiter.allow("b")).toBe(true);
  });
});
