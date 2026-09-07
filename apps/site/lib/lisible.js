// lib/lisible.js
//
// Les mises en forme que plusieurs gabarits partagent : une date en français,
// une durée de lecture estimée depuis le texte.

/** `2026-05-17` → `17/05/2026`. */
export function dateLisible(date) {
  if (!date) return "";
  const [annee, mois, jour] = date.split("-");
  return `${jour}/${mois}/${annee}`;
}

/** `2026-05-17` → `17 mai 2026`. */
export function dateEnToutesLettres(date) {
  if (!date) return "";
  const MOIS = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  const [annee, mois, jour] = date.split("-");
  return `${Number(jour)} ${MOIS[Number(mois) - 1]} ${annee}`;
}

/**
 * Minutes de lecture, arrondies au supérieur, à 220 mots par minute. Le champ
 * `lecture` du frontmatter l'emporte quand il est écrit : le calcul n'est là
 * que pour ne pas laisser un trou sur une page qui n'en déclare pas.
 */
export function minutesDeLecture(texte, declare) {
  if (declare) return declare;
  const mots = (texte ?? "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(mots / 220));
}
