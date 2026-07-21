// lib/ateliers.mjs
//
// Source unique des ateliers de la page Pratiquer. Les ateliers sont des
// DONNÉES (modèle du handoff design) : chaque atelier définit ses propres
// date/lieu/durée/capacité/prix. Quand l'API de décompte des places
// arrivera (backend VPS), cette liste sera servie par elle — le modèle ne
// change pas, seule la provenance.
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
    registered: 7,
    price: 0,
    // Photos fournies par Valentin plus tard — PhotoSlot rend un
    // placeholder charte tant que `cover` est vide.
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
    registered: 10,
    price: 0,
    cover: "",
    coverAlt: "Équilibre et grimpe sur tronc",
    status: "full",
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
