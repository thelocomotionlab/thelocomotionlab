// lib/liveTime.js
//
// Temps du live : J-index et heures du journal en fuseau FORCÉ Europe/Paris
// (jamais celui du visiteur), frontière de jour à MINUIT HEURE FRANÇAISE.
// Fonctions pures, testées unitairement (liveTime.test.js), réutilisées à
// l'identique pour le direct ET pour l'archive (PR3). Décision PR1 §13.5.

const PARIS_TZ = "Europe/Paris";

const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: PARIS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: PARIS_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Numéro de jour calendaire FRANÇAIS (entier ; ne sert qu'à faire des différences). */
function parisDayNumber(date) {
  const parts = Object.fromEntries(
    dayFormatter.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86_400_000;
}

/**
 * J-index d'un instant par rapport au départ : J1 = jour calendaire français du
 * départ, J2 dès minuit (heure française) suivant, etc. Plancher à 1 (une entrée
 * antérieure au départ reste « J1 »).
 */
export function dayIndex(tsISO, dateDebutISO) {
  const diff = parisDayNumber(new Date(tsISO)) - parisDayNumber(new Date(dateDebutISO));
  return Math.max(1, diff + 1);
}

/** Heure française « 15 h 04 ». */
export function parisTimeLabel(tsISO) {
  const parts = Object.fromEntries(
    timeFormatter.formatToParts(new Date(tsISO)).map((p) => [p.type, p.value]),
  );
  return `${parts.hour} h ${parts.minute}`;
}

/** Tag d'entrée du journal, format exact du design : « J2 · 15 h 04 ». */
export function formatEntryTag(tsISO, dateDebutISO) {
  return `J${dayIndex(tsISO, dateDebutISO)} · ${parisTimeLabel(tsISO)}`;
}

/** Durée d'un média « une prise » : 42 s → « 0:42 », 102 s → « 1:42 ». */
export function formatClockDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const min = Math.floor(s / 60);
  const rest = String(s % 60).padStart(2, "0");
  return `${min}:${rest}`;
}

/** Temps écoulé depuis le départ : « 2 j 08 h 32 » (ou « 08 h 32 » avant J2). */
export function formatElapsed(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const days = Math.floor(s / 86_400);
  const hours = String(Math.floor((s % 86_400) / 3_600)).padStart(2, "0");
  const minutes = String(Math.floor((s % 3_600) / 60)).padStart(2, "0");
  return days > 0 ? `${days} j ${hours} h ${minutes}` : `${hours} h ${minutes}`;
}

/**
 * Ancienneté d'un signal : « il y a 3 min » sous l'heure, « il y a 4 h » au-delà
 * (heures entières, plancher 1 — information de terrain, pas un chronomètre).
 */
export function formatAgo(minutes) {
  const min = Math.max(0, Math.floor(minutes || 0));
  if (min < 60) return `il y a ${min} min`;
  return `il y a ${Math.floor(min / 60)} h`;
}
