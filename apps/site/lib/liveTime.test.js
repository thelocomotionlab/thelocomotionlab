// J-index et heures : fuseau FORCÉ Europe/Paris, frontière de jour à minuit
// heure française — les cas limites exigés par la décision PR1 §13.5.

import { describe, expect, it } from "vitest";

import {
  dayIndex,
  formatAgo,
  formatClockDuration,
  formatElapsed,
  formatEntryTag,
  parisTimeLabel,
} from "./liveTime";

// Départ de référence : 20 août 2026, 06 h 00 heure française (UTC+2 en été).
const DEPART = "2026-08-20T06:00:00+02:00";

describe("dayIndex — frontière à minuit heure française", () => {
  it("le jour du départ est J1, quelle que soit l'heure", () => {
    expect(dayIndex("2026-08-20T06:00:00+02:00", DEPART)).toBe(1);
    expect(dayIndex("2026-08-20T23:59:59+02:00", DEPART)).toBe(1);
  });

  it("bascule à J2 à minuit français exactement", () => {
    expect(dayIndex("2026-08-20T23:59:59+02:00", DEPART)).toBe(1);
    expect(dayIndex("2026-08-21T00:00:00+02:00", DEPART)).toBe(2);
    expect(dayIndex("2026-08-21T00:00:01+02:00", DEPART)).toBe(2);
  });

  it("la frontière est bien celle de PARIS, pas celle d'UTC", () => {
    // 21 août 00h30 à Paris = 20 août 22h30 UTC : c'est déjà J2.
    expect(dayIndex("2026-08-20T22:30:00Z", DEPART)).toBe(2);
    // 20 août 23h30 UTC+4 = 20 août 21h30 à Paris : encore J1.
    expect(dayIndex("2026-08-20T23:30:00+04:00", DEPART)).toBe(1);
  });

  it("les jours suivants comptent juste (J4 au dernier jour du tour)", () => {
    expect(dayIndex("2026-08-23T07:41:00+02:00", DEPART)).toBe(4);
  });

  it("une entrée antérieure au départ reste plancher J1", () => {
    expect(dayIndex("2026-08-19T18:00:00+02:00", DEPART)).toBe(1);
  });
});

describe("parisTimeLabel / formatEntryTag — le format exact du design", () => {
  it("« J2 · 15 h 04 » (heure de Paris, jamais celle du visiteur)", () => {
    // 13h04 UTC en été = 15h04 à Paris.
    expect(formatEntryTag("2026-08-21T13:04:00Z", DEPART)).toBe("J2 · 15 h 04");
  });

  it("minuit et heures à un chiffre sont zéro-paddés", () => {
    expect(parisTimeLabel("2026-08-21T22:05:00Z")).toBe("00 h 05");
  });
});

describe("durées et anciennetés", () => {
  it("durée « une prise » : 0:42, 1:42", () => {
    expect(formatClockDuration(42)).toBe("0:42");
    expect(formatClockDuration(102)).toBe("1:42");
  });

  it("temps écoulé : « 2 j 08 h 32 », « 08 h 32 » avant 24 h", () => {
    expect(formatElapsed(2 * 86400 + 8 * 3600 + 32 * 60)).toBe("2 j 08 h 32");
    expect(formatElapsed(8 * 3600 + 32 * 60)).toBe("08 h 32");
  });

  it("ancienneté : minutes sous l'heure, heures entières au-delà", () => {
    expect(formatAgo(3)).toBe("il y a 3 min");
    expect(formatAgo(59)).toBe("il y a 59 min");
    expect(formatAgo(60)).toBe("il y a 1 h");
    expect(formatAgo(245)).toBe("il y a 4 h");
  });
});

// Les cas du bandeau « Terminé » (formatDateArrivee / formatDureeHeures) ont
// disparu avec l'état lui-même : plus de page, plus de fonctions, plus de tests.
