// app/science/page.jsx
//
// L'INDEX DE SCIENCE : des documents vivants, sourcés, datés, révisés.
//
// La barre de thèmes est dérivée du contenu et masquée tant qu'il n'y a pas
// deux thèmes portant chacun deux articles : elle n'a rien à filtrer avant.
// Sous la liste, la bibliographie du labo et le journal des révisions se
// comptent eux aussi depuis les articles.

import Link from "next/link";

import {
  themes,
  barreDeThemesVisible,
  entrees,
  journalDesRevisions,
  bibliographieDuLabo,
} from "@/lib/science";
import { dateLisible } from "@/lib/lisible";
import { minutesDeLecture } from "@/lib/lisible";
import EnTeteDIndex from "@/components/contenu/EnTeteDIndex";

export const metadata = {
  title: "Science",
  description: "Des documents vivants : sourcés, datés, révisés.",
};

export default function SciencePage() {
  const liste = entrees();
  const themesDuLabo = themes();
  const revisions = journalDesRevisions();
  const references = bibliographieDuLabo();

  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-12 md:px-8">
      <EnTeteDIndex
        titre="Science"
        accroche="Des documents vivants : sourcés, datés, révisés."
        teinte="science"
      />

      {barreDeThemesVisible(themesDuLabo) ? (
        <nav
          aria-label="Thèmes"
          className="mt-10 flex flex-wrap items-baseline gap-x-7 gap-y-3"
        >
          {themesDuLabo.map((theme) => (
            <span
              key={theme.nom}
              className="inline-flex items-baseline gap-2 border-b-2 border-brand-wash-line py-1.5 font-heading text-xs font-medium uppercase tracking-etiquette text-brand-slate-dark"
            >
              {theme.libelle}
              <span className="font-mono text-meta tracking-normal text-brand-muted tabular-nums">
                {theme.compte}
              </span>
            </span>
          ))}
        </nav>
      ) : null}

      <div className="mt-10 border-t-[1.5px] border-brand-slate-dark">
        {liste.map((article) => (
          <Link
            key={article.slug}
            href={article.url}
            className="grid items-center gap-x-8 border-b border-brand-hairline py-7 text-brand-text no-underline md:grid-cols-[minmax(0,1fr)_7rem]"
          >
            <span className="min-w-0">
              <span className="block font-mono text-xs font-bold uppercase tracking-etiquette text-brand-slate-dark tabular-nums">
                {article.revise ? "Révisé le " : "Publié le "}
                {dateLisible(article.date)}
              </span>
              <span className="mt-2.5 block font-heading text-2xl font-bold leading-tight tracking-tight text-brand-slate-dark">
                {article.titre}
              </span>
              <span className="mt-2.5 block max-w-[52ch] font-lora leading-snug text-brand-soft [text-wrap:pretty]">
                {article.chapeau}
              </span>
            </span>
            <span className="flex flex-row items-center gap-3 md:flex-col md:items-end">
              <span className="font-mono text-meta font-semibold uppercase tracking-lien text-brand-muted tabular-nums">
                {minutesDeLecture(article.corps, article.lecture)} min
              </span>
              <span className="inline-block rounded-full border-[1.5px] border-brand-slate-dark px-4 py-1.5 font-heading text-sm font-semibold text-brand-slate-dark">
                Lire
              </span>
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-16 grid items-start gap-16 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section>
          <div className="flex items-baseline gap-3.5 border-b-[1.5px] border-brand-slate-dark pb-3">
            <h2 className="m-0 font-heading text-2xl font-bold text-brand-slate-dark">
              Bibliographie du labo
            </h2>
            <span className="font-mono text-meta font-semibold uppercase tracking-etiquette text-brand-muted">
              {references.length} référence{references.length > 1 ? "s" : ""}
            </span>
          </div>
          <ol className="mt-3.5 list-decimal space-y-2.5 pl-6 font-lora text-tableau leading-snug text-brand-soft">
            {references.map((reference) => (
              <li key={reference.cle}>
                {reference.auteur ? `${reference.auteur} ` : null}
                {reference.annee ? `(${reference.annee}). ` : null}
                {reference.titre ? <em className="not-italic">{reference.titre}. </em> : null}
                {reference.journal ? `${reference.journal}. ` : null}
                {reference.lien ? (
                  <a
                    href={reference.lien}
                    className="font-mono text-xs text-brand-slate no-underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    lire
                  </a>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <section>
          <div className="flex items-baseline gap-3.5 border-b-[1.5px] border-brand-slate-dark pb-3">
            <h2 className="m-0 font-heading text-2xl font-bold text-brand-slate-dark">
              Journal des révisions
            </h2>
          </div>
          <ol className="m-0 mt-4 list-none border-l border-brand-wash-line p-0 pl-6">
            {revisions.map((evenement) => (
              <li key={`${evenement.date}-${evenement.titre}-${evenement.quoi}`} className="relative pb-5">
                <span
                  className={`absolute -left-[1.7rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-brand-slate-dark ${
                    evenement.genre === "publication" ? "bg-brand-slate-dark" : "bg-brand-bg"
                  }`}
                  aria-hidden="true"
                />
                <div className="font-mono text-xs text-brand-muted tabular-nums">
                  {dateLisible(evenement.date)}
                </div>
                <div className="mt-0.5 font-lora leading-snug">
                  <b className="font-heading font-semibold">{evenement.titre}</b> — {evenement.quoi}
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex gap-4 font-mono text-meta text-brand-muted">
            <span className="inline-flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full bg-brand-slate-dark" aria-hidden="true" />
              publication
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i
                className="h-2.5 w-2.5 rounded-full border-2 border-brand-slate-dark"
                aria-hidden="true"
              />
              révision
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
