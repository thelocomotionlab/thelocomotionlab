import Link from "next/link";
import Image from "next/image";

/**
 * FeedSection
 * - Articles : cover + title + description + "Publié le ..."
 * - Projets  : cover + status + title + description + dernières notes.
 *              Pour les projets termines on conserve "Terminé le X" ;
 *              les "Mis à jour il y a..." sont volontairement omis pour
 *              aligner sur la page /projets.
 *   Les notes proviennent de notesMap[slug] (extractProjectNotes côté
 *   serveur) afin de matcher l'affichage de la page /projets.
 * - CTA "Voir tout" sous le feed.
 */

function parseFrenchDate(str) {
  if (!str) return null;
  const parts = str.split("/");
  if (parts.length !== 3) return null;
  const [dayStr, monthStr, yearStr] = parts;
  const day = Number(dayStr);
  const month = Number(monthStr);
  let year = Number(yearStr);
  if (!day || !month || !year) return null;
  if (year < 100) year += year < 50 ? 2000 : 1900;
  const d = new Date(year, month - 1, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pickLastNotes(notes, limit = 2) {
  if (!Array.isArray(notes) || notes.length === 0) return [];
  return [...notes]
    .sort((a, b) => {
      const dA = parseFrenchDate(a.date);
      const dB = parseFrenchDate(b.date);
      if (!dA && !dB) return 0;
      if (!dA) return 1;
      if (!dB) return -1;
      return dB - dA;
    })
    .slice(0, limit);
}

export default function RecentActivity({
  title,
  Icon = null,
  items = [],
  notesMap = {},
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
          {items.map((item) => {
            const isProjet = item.type === "Projet";
            const lastNotes = isProjet ? pickLastNotes(notesMap[item.slug]) : [];
            const projetMeta = isProjet ? renderProjectMeta(item) : null;
            const articleMeta =
              item.type === "Carnet" && item.date ? (
                <p>Publié le {item.date.toLocaleDateString("fr-FR")}</p>
              ) : null;
            const meta = articleMeta || projetMeta;

            return (
              <div
                key={`${item.type}-${item.slug}`}
                className="relative w-full max-w-[22rem] h-full"
              >
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
                    {isProjet && item.status ? (
                      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                        {item.status}
                      </p>
                    ) : null}

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

                    {isProjet && lastNotes.length > 0 ? (
                      <div className="mt-auto pt-3 border-t border-gray-200">
                        <p className="text-xs font-semibold text-gray-500 mb-1">
                          Dernières notes :
                        </p>
                        <ul className="space-y-1">
                          {lastNotes.map((note, i) => (
                            <li key={i} className="text-xs text-gray-600">
                              {note.date
                                ? `${note.date} – ${note.title}`
                                : note.title}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {meta ? (
                      <div
                        className={`${
                          isProjet && lastNotes.length > 0 ? "mt-2" : "mt-auto"
                        } pt-4 text-xs text-gray-500`}
                      >
                        {meta}
                      </div>
                    ) : null}
                  </div>
                </Link>
              </div>
            );
          })}
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
