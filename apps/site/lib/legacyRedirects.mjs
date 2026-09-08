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
 * Les contenus de l'ancien site, ancienne URL → nouvelle. Chaque page publiée
 * avait DEUX adresses au fil du temps (`/articles|/projets`, puis
 * `/comprendre|/explorer`) : les deux sont reprises, parce que les deux ont pu
 * être indexées ou partagées.
 *
 * Une redirection précise vaut mieux qu'un renvoi vers l'index : Google traite
 * un rayon entier comme une réponse hors sujet, et n'y transfère rien.
 */
const CONTENUS = [
  // Récits et projets (anciennement sous /explorer).
  ["recit-reunion-2025", "/aventures/recit/reunion-2025"],
  ["immersion-primale-entre-vercors-et-drome", "/aventures/recit/vercors-2026"],
  ["traversee-reunion", "/aventures/reunion-2025"],
  // Les slugs de la génération intermédiaire, quand les projets étaient
  // devenus des carnets.
  ["reunion-2025", "/aventures/reunion-2025"],
  ["carnet-2025", "/aventures/reunion-2025"],
  ["carnet-2026", "/blog"],
  // Le récit des Écrins est encore un brouillon : la campagne le remplace.
  ["mon-tour-des-ecrins-en-80-heures", "/aventures/tour-des-ecrins"],
  // Le journal de la saison est devenu le carnet de bord tout entier.
  ["saison-trail-2026", "/blog"],
  ["coach-tarzan-movement", "/services/ateliers"],
  // Articles (anciennement sous /comprendre).
  ["la-genese", "/science/l-an-2020"],
  ["developpe-ta-respiration-fonctionnelle", "/science"],
  ["initiation-exposition-au-froid", "/science"],
];

/** Les préfixes qu'ont porté ces contenus, dans l'ordre des générations. */
const PREFIXES = ["/articles", "/projets", "/comprendre", "/explorer"];

/** Les anciennes racines et ce qui les remplace. */
const RACINES = [
  ["/articles", "/blog"],
  ["/projets", "/aventures"],
  ["/comprendre", "/science"],
  ["/explorer", "/aventures"],
  ["/pratiquer", "/services/ateliers"],
  ["/outils", "/services"],
  ["/quete", "/labo#labo-quete"],
  ["/manifeste", "/labo#labo-quete"],
  ["/a-propos", "/labo#labo-apropos"],
  ["/about", "/labo#labo-apropos"],
  ["/contact", "/labo#labo-contact"],
];

export function buildLegacyRedirects() {
  return [
    ...CONTENUS.flatMap(([slug, destination]) =>
      PREFIXES.map((prefixe) => ({
        source: `${prefixe}/${slug}`,
        destination,
        permanent: true,
      })),
    ),

    // Le formulaire d'inscription a suivi la page des ateliers sous /services.
    {
      source: "/pratiquer/inscription/:slug",
      destination: "/services/ateliers/inscription/:slug",
      permanent: true,
    },

    // L'appel à la cohorte a suivi la page du Twin : il vit sous /services/twin,
    // pas sous /outils, qui n'est plus une racine du site.
    {
      source: "/outils/twin/cohorte",
      destination: "/services/twin/cohorte",
      permanent: true,
    },
    { source: "/outils/twin", destination: "/services/twin", permanent: true },
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
