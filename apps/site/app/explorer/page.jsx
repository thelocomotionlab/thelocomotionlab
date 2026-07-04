// app/explorer/page.jsx
//
// Pilier « Explorer » : le terrain. Fusionne les récits (public/articles,
// type: "recit") et les projets (public/projets), publiés uniquement, triés
// par activityAt ?? date (décroissant). Étiquette discrète « Récit » /
// « Projet » sur chaque carte ; les projets gardent leur statut et leurs
// dernières notes comme sur l'ancien index /projets.
import Link from "next/link";
import Image from "next/image";
import { listArticleEntries, listProjetEntries } from "@/lib/contentRoutes.mjs";
import { extractProjectNotes } from "@/lib/extractProjectNotes";

export const metadata = {
  // [PROVISOIRE] Descriptions meta à affiner avec les textes définitifs (PR5).
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

          {item.description ? (
            <p className="text-sm text-gray-700 italic line-clamp-3">
              {item.description}
            </p>
          ) : (
            <p className="text-sm text-gray-500">&nbsp;</p>
          )}

          {item.kind === "projet" && lastNotes.length > 0 ? (
            <div className="mt-auto pt-3 border-t border-gray-200">
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
            <div className="mt-auto pt-4 text-xs text-gray-500">
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
      {/* Header */}
      <header className="max-w-3xl mx-auto text-center mb-10">
        <h1 className="text-3xl font-bold font-heading mb-2 text-brand-primary">
          Explorer
        </h1>
        <p className="text-lg text-gray-700">
          <em>Le terrain comme banc d&rsquo;essai</em>
        </p>
        {/* [Brief texte n°5 — 60-80 mots : le terrain comme banc d'essai
            de la quête (robustesse physiologique).] */}
        <p className="mt-4 text-base text-gray-700 leading-relaxed">
          <span className="font-semibold text-brand-deep">
            [PROVISOIRE — texte n°5]
          </span>{" "}
          Explorer, c&rsquo;est le terrain : récits d&rsquo;aventures et
          projets au long cours qui servent de banc d&rsquo;essai à la quête
          du Lab. Traversées en autonomie, saisons de trail, formations —
          chaque expérience met à l&rsquo;épreuve ce que la science annonce,
          et en rapporte des données, des sensations et des leçons. C&rsquo;est
          ici que la robustesse se construit et se vérifie, une aventure à la
          fois.
        </p>
      </header>

      {/* Emplacement réservé : bloc Live compact (badge EN DIRECT /
          « Prochain départ ») — implémenté en PR3, même source d'état que
          la page /live. */}

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
