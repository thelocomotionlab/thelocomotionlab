// Limite de débit par IP, en mémoire (pattern services/email-gateway).
// Service mono-instance → pas besoin de partage d'état. L'horloge est injectable
// pour des tests déterministes.

interface IpWindows {
  minuteStart: number;
  minuteCount: number;
  hourStart: number;
  hourCount: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const MAX_TRACKED_IPS = 10_000;

export class IpRateLimiter {
  private readonly hits = new Map<string, IpWindows>();

  constructor(
    private readonly perMinute: number,
    private readonly perHour: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** true = requête autorisée (et comptée). */
  allow(ip: string): boolean {
    const now = this.now();
    if (this.hits.size > MAX_TRACKED_IPS) this.hits.clear(); // borne mémoire grossière

    let entry = this.hits.get(ip);
    if (!entry) {
      entry = { minuteStart: now, minuteCount: 0, hourStart: now, hourCount: 0 };
      this.hits.set(ip, entry);
    }
    if (now - entry.minuteStart > MINUTE_MS) {
      entry.minuteStart = now;
      entry.minuteCount = 0;
    }
    if (now - entry.hourStart > HOUR_MS) {
      entry.hourStart = now;
      entry.hourCount = 0;
    }
    entry.minuteCount += 1;
    entry.hourCount += 1;
    return entry.minuteCount <= this.perMinute && entry.hourCount <= this.perHour;
  }
}
