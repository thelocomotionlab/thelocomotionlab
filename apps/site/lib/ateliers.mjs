// lib/ateliers.mjs
//
// Catalogue des ateliers de la page Pratiquer : le CONTENU (titres, dates,
// lieux, prix, photos) rendu au build. Les COMPTEURS vivants (inscrits,
// complet) viennent du service atelier-api quand NEXT_PUBLIC_ATELIER_API est
// configurée (AteliersGrid) ; les valeurs `registered`/`status` d'ici ne sont
// que l'état affiché sans API / avant la réponse de l'API.
// ⚠ Les `id` et capacités restent en phase avec
// services/atelier-api/atelier-api.config.json (la source du décompte).
//
// Modèle : { id, slug, title, date (ISO), heureDebut, heureFin, lieu,
//            capacity, registered, price (centimes, 0 = gratuit), cover,
//            coverAlt, status: "open" | "full" | "past",
//            rendezVous? (point de RDV précis, affiché sur la confirmation
//            d'inscription — sinon texte générique) }

const ATELIERS = [
/*  {
    id: "atelier-test-2026-XX-XX",
    slug: "atelier-test",
    title: "Atelier test",
    date: "2026-09-12",
    heureDebut: "18h",
    heureFin: "19h30",
    lieu: "Parc la Poya, Fontaine",
    capacity: 8,
    registered: 0,
    price: 0,
    // Photo : déposer le fichier dans public/images/pratiquer/ puis mettre
    // son chemin ici (ex. "/images/pratiquer/eveil-primal.webp"). Tant que
    // `cover` est vide, PhotoSlot rend un placeholder charte.
    cover: "/images/pratiquer/atelier-test.webp",
    coverAlt: "Atelier en extérieur — quadrupédie en groupe",
    status: "open",
  },*/
/*  {
    id: "sol-suspension-2026-10-04",
    slug: "sol-suspension",
    title: "Sol & suspension — ramper, se suspendre",
    date: "2026-10-04",
    heureDebut: "10h",
    heureFin: "12h",
    lieu: "Forêt de Prémol, Vercors",
    capacity: 10,
    registered: 0,
    price: 0,
    cover: "",
    coverAlt: "Équilibre et grimpe sur tronc",
    status: "open",
  },*/
];

/** « 2026-09-12 » → « Samedi 12 septembre 2026 » (déterministe au build). */
function formatDateLabel(iso) {
  const label = new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Prix en centimes → « GRATUIT » ou « 15 € » / « 12,50 € ». */
function priceLabel(centimes) {
  if (!centimes) return "GRATUIT";
  const euros = centimes / 100;
  return `${Number.isInteger(euros) ? euros : euros.toFixed(2).replace(".", ",")} €`;
}

/**
 * Ateliers à afficher sur /pratiquer (les « past » sont retirés à la main
 * en passant leur statut — pas de comparaison à l'horloge : le site est
 * statique, un tri au build mentirait entre deux déploiements).
 */
export function listAteliers() {
  return ATELIERS.filter((a) => a.status !== "past").map((a) => ({
    ...a,
    dateLabel: `${formatDateLabel(a.date)} · ${a.heureDebut} – ${a.heureFin}`,
    priceLabel: priceLabel(a.price),
  }));
}

/**
 * Slug servi quand le catalogue est VIDE (aucun atelier programmé, ou tous
 * commentés ici). La page d'inscription y répond par un 404.
 */
export const SLUG_AUCUN_ATELIER = "aucun-atelier";

/**
 * Paramètres statiques de /pratiquer/inscription/[slug].
 *
 * ⚠️ NE DOIT JAMAIS RENVOYER UN TABLEAU VIDE. Sans chemin à prérendre, Next
 * garde la route dynamique et lui émet une fonction Node ; or
 * `@cloudflare/next-on-pages` refuse toute route non statique qui n'est pas en
 * runtime edge, et le déploiement casse sur un message qui accuse la route
 * (« not configured to run with the Edge Runtime ») sans jamais mentionner la
 * vraie cause — un catalogue vide. Le slug bouchon coûte un 404 statique et
 * évite ce piège, qui s'était refermé le 5 août 2026.
 */
export function atelierSlugParams() {
  const slugs = listAteliers().map((a) => ({ slug: a.slug }));
  return slugs.length > 0 ? slugs : [{ slug: SLUG_AUCUN_ATELIER }];
}
