import Link from "next/link";
import Image from "next/image";
import { formatRelativeDays } from "@/lib/getRecentActivity";

export default function RecentActivity({ items = [] }) {
  if (!items?.length) return null;

  return (
    <section className="py-10 md:py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-center gap-3 mb-6">
          <span aria-hidden="true" className="text-2xl">🧪</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-brand-primary text-center">
            Activité récente du Labo
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {items.map((item) => {
            const updatedLabel = item.updatedAt
              ? `Mis à jour ${formatRelativeDays(item.updatedAt)}`
              : "";
            const dateLabel = item.date
              ? `Publié le ${item.date.toLocaleDateString("fr-FR")}`
              : "";

            return (
              <Link
                key={`${item.type}-${item.slug}`}
                href={item.href}
                className="group block bg-white rounded-2xl shadow-card overflow-hidden hover:shadow-lg transition-shadow"
              >
                {item.cover ? (
                  <div className="relative w-full h-48">
                    <Image
                      src={item.cover}
                      alt={item.title}
                      fill
                      className="object-cover"
                      sizes="(min-width: 768px) 33vw, 100vw"
                    />
                  </div>
                ) : (
                  <div className="w-full h-48 bg-brand-bg" aria-hidden="true" />
                )}

                <div className="p-5">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-xxs uppercase tracking-wide px-2 py-1 rounded-full bg-brand-bg text-brand-deep font-semibold">
                      {item.type}
                    </span>
                  </div>

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

                  <div className="mt-4 space-y-1 text-xs text-gray-500">
                    {dateLabel && <p>{dateLabel}</p>}
                    {updatedLabel && <p>{updatedLabel}</p>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/articles"
            className="inline-flex items-center justify-center px-5 py-2 rounded-full bg-white shadow-card hover:shadow-lg transition-shadow text-brand-deep font-semibold"
          >
            Explorer les carnets
          </Link>
          <Link
            href="/projets"
            className="inline-flex items-center justify-center px-5 py-2 rounded-full bg-white shadow-card hover:shadow-lg transition-shadow text-brand-deep font-semibold"
          >
            Voir les projets
          </Link>
        </div>
      </div>
    </section>
  );
}
