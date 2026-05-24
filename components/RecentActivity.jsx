import Link from "next/link";
import Image from "next/image";
import { formatRelativeDays } from "@/lib/getRecentActivity";

/**
 * FeedSection
 * - Articles  : affiche uniquement "Publié le ..."
 * - Projets   : affiche une date métier plus propre :
 *   - "Terminé le ..." si status = Terminé
 *   - sinon "Mis à jour ..." basé sur activityAt
 *   - fallback sur updatedAt
 * - Status projet purement informatif (hors <Link>)
 * - CTA "Voir tout" sous le feed (même style que "Entrer dans le labo")
 */

export default function RecentActivity({
  title,
  Icon = null,
  items = [],
  ctaHref = null,
  ctaLabel = "Voir tout",
}) {
  if (!items?.length) return null;

  const count = items.length;

  const gridCols =
    count >= 3
      ? "grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(3,22rem)]"
      : count === 2
      ? "grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(2,22rem)]"
      : "grid-cols-1";

  function renderProjectMeta(item) {
    if (item.status === "Terminé" && item.completedAt) {
      return (
        <p>Terminé le {item.completedAt.toLocaleDateString("fr-FR")}</p>
      );
    }

    if (item.activityAt) {
      return <p>Mis à jour {formatRelativeDays(item.activityAt)}</p>;
    }

    if (item.updatedAt) {
      return <p>Mis à jour {formatRelativeDays(item.updatedAt)}</p>;
    }

    return null;
  }

  return (
    <section className="py-6 md:py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Title */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {Icon ? (
            <Icon size={22} aria-hidden="true" className="text-brand-primary" />
          ) : null}

          <h2 className="text-2xl sm:text-3xl font-bold text-brand-primary text-center">
            {title}
          </h2>
        </div>

        {/* Cards */}
        <div className={`grid gap-6 justify-center justify-items-center ${gridCols}`}>
          {items.map((item) => (
            <div
              key={`${item.type}-${item.slug}`}
              className="relative w-full max-w-[22rem] h-full"
            >
              {/* Card link */}
              <Link
                href={item.href}
                className="
                  group
                  bg-white rounded-2xl shadow-card overflow-hidden
                  hover:shadow-lg transition-shadow
                  h-full flex flex-col
                "
              >
                {/* Cover */}
                {item.cover ? (
                  <div className="relative w-full h-44">
                    <Image
                      src={item.cover}
                      alt={`Illustration : ${item.title}`}
                      fill
                      className="object-cover"
                      sizes="(min-width: 768px) 384px, 100vw"
                    />
                  </div>
                ) : (
                  <div className="w-full h-44 bg-brand-bg" aria-hidden="true" />
                )}

                {/* Content */}
                <div className="p-5 flex flex-col flex-1">
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

                  {/* Meta info (context-aware) */}
                  <div className="mt-auto pt-4 text-xs text-gray-500">
                    {item.type === "Carnet" && item.date ? (
                      <p>Publié le {item.date.toLocaleDateString("fr-FR")}</p>
                    ) : null}

                    {item.type === "Projet" ? renderProjectMeta(item) : null}
                  </div>
                </div>
              </Link>

              {/* Project status (purely informative, not a CTA) */}
              {item.type === "Projet" && item.status ? (
                <span className="absolute bottom-3 right-3 text-xxs uppercase tracking-wide text-gray-500">
                  {item.status}
                </span>
              ) : null}
            </div>
          ))}
        </div>

        {/* CTA under feed (same style as "Entrer dans le labo") */}
        {ctaHref ? (
          <div className="mt-7 flex items-center justify-center">
            <Link
              href={ctaHref}
              className="
                inline-block
                bg-brand-accent text-white font-semibold
                px-6 py-3 rounded-full shadow
                hover:bg-brand-primary-dark transition
              "
            >
              {ctaLabel}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}