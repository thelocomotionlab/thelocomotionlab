// lib/legacyRedirects.mjs
//
// LES REDIRECTIONS DES ANCIENNES URL vers les cinq index du modèle.
//
// Deux générations d'URL s'y accumulent : les toutes premières (/articles,
// /projets) et les piliers qui leur ont succédé (/comprendre, /explorer,
// /pratiquer, /outils, /quete, /a-propos, /contact). Toutes atterrissent en un
// seul saut : une chaîne de 308 coûte un aller-retour et se perd en route.
//
// L'ordre compte — Next retient la PREMIÈRE règle qui correspond, donc les
// slugs déjà migrés passent avant les motifs génériques.
//
// Consommé par redirects() dans next.config.mjs : fonctionne en dev et via
// @cloudflare/next-on-pages. `permanent: true` émet un 308.

/**
 * Les contenus déjà migrés, ancienne URL → nouvelle. Cette table grandit à
 * chaque page reprise ; ce qui n'y figure pas retombe sur son index.
 */
const MIGRES = [
  ["/articles/recit-reunion-2025", "/aventures/reunion-2025/recit"],
  ["/explorer/recit-reunion-2025", "/aventures/reunion-2025/recit"],
  ["/projets/traversee-reunion", "/aventures/reunion-2025"],
  ["/explorer/traversee-reunion", "/aventures/reunion-2025"],
];

/** Les anciennes racines et ce qui les remplace. */
const RACINES = [
  ["/articles", "/blog"],
  ["/projets", "/aventures"],
  ["/comprendre", "/science"],
  ["/explorer", "/aventures"],
  ["/pratiquer", "/services"],
  ["/outils", "/services"],
  ["/quete", "/labo#labo-quete"],
  ["/manifeste", "/labo#labo-quete"],
  ["/a-propos", "/labo#labo-apropos"],
  ["/about", "/labo#labo-apropos"],
  ["/contact", "/labo#labo-contact"],
];

export function buildLegacyRedirects() {
  return [
    ...MIGRES.map(([source, destination]) => ({ source, destination, permanent: true })),

    // Les ateliers gardent leur formulaire d'inscription, le Twin sa cohorte :
    // ce sont des flux, pas des pages d'index, et rien ne les remplace.
    { source: "/outils/twin", destination: "/services", permanent: true },
    { source: "/outils/habillage", destination: "/studio", permanent: true },
    { source: "/outils/carrousel", destination: "/studio", permanent: true },

    ...RACINES.flatMap(([source, destination]) => [
      { source, destination, permanent: true },
      // Un ancien slug sans équivalent connu atterrit sur l'index : mieux vaut
      // le rayon que le 404.
      { source: `${source}/:slug`, destination, permanent: true },
    ]),
  ];
}
