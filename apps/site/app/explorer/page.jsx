// app/explorer/page.jsx
//
// Pilier « Explorer » : le terrain. Fusionne les récits (public/articles,
// type: "recit") et les projets (public/projets), publiés uniquement, triés
// par activityAt ?? date (décroissant). Étiquette discrète « Récit » /
// « Projet » sur chaque carte ; les projets gardent leur statut et leurs
// dernières notes comme sur l'ancien index /projets.
import Link from "next/link";
import Image from "next/image";
import LiveStatusBlock from "@/components/LiveStatusBlock";
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
      kindLabel: e.kind === "recit" ? "Récit" : "Projet",
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

function ExplorerCard({ item, notes = [] }) {
  const lastNotes = notes.slice(0, 2);

  return (
    <div className="relative w-full max-w-[22rem] h-full">
      <Link
        href={item.href}
        className="group bg-white rounded-2xl shadow-card overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col"
      >
        {item.cover ? (
          <div className="relative w-full h-44">
            <Image
              src={item.cover}
              alt={`Illustration : ${item.title}`}
              fill
              className="object-cover"
              sizes="(min-width: 768px) 352px, 100vw"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="w-full h-44 bg-brand-bg" aria-hidden="true" />
        )}

        <div className="p-5 flex flex-col flex-1">
          {/* Étiquette discrète Récit / Projet, complétée du statut projet */}
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
            {item.kindLabel}
            {item.kind === "projet" && statusLine(item)
              ? ` · ${statusLine(item)}`
              : ""}
          </p>

          <h3 className="text-lg font-semibold text-brand-deep group-hover:underline mb-2">
            {item.title}
          </h3>

          {/* Description en Lora italique, centrée verticalement entre le
              titre et le bloc du bas (notes ou date). */}
          <div className="flex flex-1 items-center py-1">
            {item.description ? (
              <p className="font-lora text-[15px] italic text-gray-700 line-clamp-3">
                {item.description}
              </p>
            ) : null}
          </div>

          {item.kind === "projet" && lastNotes.length > 0 ? (
            <div className="pt-3 border-t border-gray-200">
              <p className="text-xs font-semibold text-gray-500 mb-1">
                Dernières notes :
              </p>
              <ul className="space-y-1">
                {lastNotes.map((note, i) => (
                  <li key={i} className="text-xs text-gray-600">
                    {note.date ? `${note.date} – ${note.title}` : note.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="pt-4 text-xs text-gray-500">
              {item.kind === "recit" && item.date && (
                <p>Publié le {item.date.toLocaleDateString("fr-FR")}</p>
              )}
            </div>
          )}
        </div>
      </Link>
    </div>
  );
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

  // Notes pré-calculées au build pour les projets, triées par date desc.
  const notesMap = Object.fromEntries(
    items
      .filter((item) => item.kind === "projet")
      .map((item) => [
        item.slug,
        [...extractProjectNotes(item.slug)].sort(
          (a, b) => frenchDateKey(b.date) - frenchDateKey(a.date)
        ),
      ])
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      {/* Header — écho de la section Explorer de l'accueil : kicker mono,
          titre en Lora italique terracotta, tagline Ubuntu, liseré ocre. */}
      <header className="max-w-3xl mx-auto text-center mb-10">
        <p className="mb-3 font-mono text-[13px] font-bold tracking-[0.25em] text-brand-accent-dark">
          / LE TERRAIN
        </p>
        <h1 className="font-lora text-4xl font-semibold italic text-brand-deep md:text-5xl">
          Explorer
          <span className="mt-2 block font-heading text-[20px] font-medium not-italic text-brand-primary-dark md:text-[24px]">
            être son propre laboratoire
          </span>
        </h1>
        <div
          className="mx-auto mt-5 h-[3px] w-16 rounded-full bg-brand-accent"
          aria-hidden="true"
        />
      </header>

      {/* Bloc Live compact : badge EN DIRECT / « Prochain départ »,
          même source d'état que la page /live. */}
      <LiveStatusBlock />

      {/* Grille fusionnée récits + projets */}
      <div className="grid gap-6 justify-center justify-items-center grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(3,22rem)]">
        {items.map((item) => (
          <ExplorerCard
            key={item.slug}
            item={item}
            notes={notesMap[item.slug] || []}
          />
        ))}
      </div>
    </div>
  );
}
