// app/explorer/page.jsx
//
// Pilier « Explorer » : le terrain. Fusionne les récits (public/articles,
// type: "recit") et les projets (public/projets), publiés uniquement, triés
// par activityAt ?? date (décroissant), présentés en deux sections
// « Projets » / « Récits » (composant client ExplorerSections, avec filtre).
// Les projets gardent leur statut et leurs dernières notes.
import PageHeader from "@/components/PageHeader";
import ExplorerSections from "@/components/ExplorerSections";
import { listArticleEntries, listProjetEntries } from "@/lib/contentRoutes.mjs";
import { extractProjectNotes } from "@/lib/extractProjectNotes";

export const metadata = {
  title: "Explorer – Récits et projets de terrain",
  description:
    "Le terrain du Locomotion Lab : récits d'aventures et projets au long cours — traversées en autonomie, saisons de trail, expérimentations.",
  alternates: {
    canonical: "https://thelocomotionlab.com/explorer",
  },
  openGraph: {
    title: "Explorer – The Locomotion Lab",
    description:
      "Le terrain du Locomotion Lab : récits d'aventures et projets au long cours — traversées en autonomie, saisons de trail, expérimentations.",
    url: "https://thelocomotionlab.com/explorer",
    type: "website",
    images: [
      {
        url: "https://thelocomotionlab.com/images/assets/og-image.jpg",
      },
    ],
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Explorer – The Locomotion Lab",
    description:
      "Récits d'aventures et projets de terrain du Locomotion Lab.",
    images: ["https://thelocomotionlab.com/images/assets/og-image.jpg"],
  },
};

function safeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getExplorerItems() {
  const recits = listArticleEntries().filter(
    (e) => e.kind === "recit" && e.published
  );
  const projets = listProjetEntries().filter((e) => e.published);

  const shape = (e) => {
    const date = safeDate(e.data.date);
    const activityAt = safeDate(e.data.activityAt);
    return {
      slug: e.slug,
      kind: e.kind, // "recit" | "projet"
      href: `/explorer/${e.slug}`,
      title: e.data.title || e.slug,
      description: e.data.description || "",
      cover: e.data.cover || "",
      status: e.data.status || "",
      completedAt: safeDate(e.data.completedAt),
      date,
      activityAt,
      // Tri du pilier : dernière activité si le frontmatter en a une,
      // sinon date de publication.
      sortDate: activityAt ?? date,
    };
  };

  return [...recits, ...projets]
    .map(shape)
    .sort((a, b) => (b.sortDate?.getTime() ?? 0) - (a.sortDate?.getTime() ?? 0));
}

function statusLine(item) {
  if (!item.status) return null;
  if (item.status === "Terminé" && item.completedAt) {
    return `${item.status} le ${item.completedAt.toLocaleDateString("fr-FR")}`;
  }
  return item.status;
}

/**
 * Parse une date au format français "JJ/MM/AAAA" et renvoie un timestamp
 * pour trier les notes de projet (les plus récentes d'abord).
 */
function frenchDateKey(str) {
  if (!str) return 0;
  const parts = str.split("/");
  if (parts.length !== 3) return 0;
  const [day, month, year] = parts.map(Number);
  if (!day || !month || !year) return 0;
  const d = new Date(year < 100 ? year + 2000 : year, month - 1, day);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export default function ExplorerPage() {
  const items = getExplorerItems();

  // Items sérialisables pour le composant client : méta, date et notes
  // pré-formatées en chaînes.
  const shapeForClient = (item) => ({
    slug: item.slug,
    href: item.href,
    title: item.title,
    description: item.description,
    cover: item.cover,
    kind: item.kind === "projet" ? "Projet" : "Récit",
    detail: item.kind === "projet" ? statusLine(item) : null,
    dateLabel:
      item.kind === "recit" && item.date
        ? `Publié le ${item.date.toLocaleDateString("fr-FR")}`
        : null,
    notes:
      item.kind === "projet"
        ? [...extractProjectNotes(item.slug)]
            .sort((a, b) => frenchDateKey(b.date) - frenchDateKey(a.date))
            .slice(0, 2)
        : [],
  });

  const projets = items.filter((i) => i.kind === "projet").map(shapeForClient);
  const recits = items.filter((i) => i.kind === "recit").map(shapeForClient);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      {/* lg:px-6 : cale l'en-tête et les titres de sections sur le bord
          gauche des grilles de cartes (colonnes de 22rem). */}
      <div className="lg:px-6">
        <PageHeader
          title="Explorer"
          tagline="Être son propre laboratoire."
        />

        {/* L'indicateur live compact vit dans la rangée de filtres
            d'ExplorerSections (même source d'état que la page /live). */}
        <ExplorerSections projets={projets} recits={recits} />
      </div>
    </div>
  );
}
