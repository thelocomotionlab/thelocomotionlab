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
//            coverAlt, status: "open" | "full" | "past" }

const ATELIERS = [
  {
    id: "eveil-primal-2026-09-12",
    slug: "eveil-primal",
    title: "Éveil primal — marche, quadrupédie, jeu",
    date: "2026-09-12",
    heureDebut: "9h30",
    heureFin: "11h30",
    lieu: "Parc Paul Mistral, Grenoble",
    capacity: 10,
    registered: 0,
    price: 0,
    // Photo : déposer le fichier dans public/images/pratiquer/ puis mettre
    // son chemin ici (ex. "/images/pratiquer/eveil-primal.webp"). Tant que
    // `cover` est vide, PhotoSlot rend un placeholder charte.
    cover: "",
    coverAlt: "Atelier en extérieur — quadrupédie en groupe",
    status: "open",
  },
  {
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
  },
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
