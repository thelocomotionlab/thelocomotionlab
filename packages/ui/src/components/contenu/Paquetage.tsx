// packages/ui/src/components/contenu/Paquetage.tsx
//
// LA SECTION PAQUETAGE : la masse au départ, sa répartition, la liste.
//
// La section ne déclare qu'une `ref` ; le jeu de données arrive déjà agrégé
// (c'est l'app qui lit le CSV). Le composant rend les masses, la barre de
// proportion et l'export.
//
// Les catégories se déroulent une à une : <details> natif, donc zéro
// JavaScript, clavier et lecteurs d'écran d'office.

import type { ReactNode } from "react";

export type ArticleDePaquetage = {
  nom: string;
  masse: number;
  quantite?: number;
  masseUnitaire?: number;
  url?: string | null;
  description?: string | null;
};

export type CategorieDePaquetage = {
  nom: string;
  masse: number;
  articles: readonly ArticleDePaquetage[];
};

export type DonneesDePaquetage = {
  /** Masse totale, en grammes. */
  total: number;
  nombreArticles: number;
  categories: readonly CategorieDePaquetage[];
};

export type PaquetageProps = {
  paquetage: DonneesDePaquetage;
  /** URL d'export de la liste. */
  csvUrl?: string;
  /** D'où viennent les masses : « masses pesées », « masses estimées »… */
  provenance?: ReactNode;
  /** Formatage des masses, laissé à l'app (kilos, grammes, locale). */
  masse?: (grammes: number) => string;
};

const TEINTES = [
  "bg-brand-primary-dark",
  "bg-brand-deep",
  "bg-brand-accent",
  "bg-brand-slate",
  "bg-brand-deep-light",
  "bg-brand-accent-light",
  "bg-brand-primary",
] as const;

function teinte(index: number): string {
  return TEINTES[index % TEINTES.length]!;
}

const parDefaut = (grammes: number) =>
  grammes >= 1000 ? `${(grammes / 1000).toFixed(2).replace(".", ",")} kg` : `${grammes} g`;

function articles(n: number): string {
  return `${n} article${n > 1 ? "s" : ""}`;
}

function Article({
  article,
  masse,
}: {
  article: ArticleDePaquetage;
  masse: (grammes: number) => string;
}) {
  const quantite = article.quantite ?? 1;
  const plusieurs = quantite > 1;

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2.5 gap-y-0.5 border-t border-dashed border-brand-grid px-0.5 py-1.5 sm:grid-cols-[minmax(0,1fr)_44px_64px_76px]">
      <span className="min-w-0">
        {article.url ? (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand-deep-dark underline decoration-brand-accent-dark/60 underline-offset-2 hover:decoration-brand-accent-dark"
          >
            {article.nom}
          </a>
        ) : (
          <span className="font-semibold text-brand-text">{article.nom}</span>
        )}
        {article.description ? (
          <span className="mt-0.5 block text-meta leading-snug text-brand-muted">
            {article.description}
          </span>
        ) : null}
      </span>
      <span className="hidden text-right text-meta tabular-nums text-brand-muted sm:block">
        {plusieurs ? `× ${quantite}` : ""}
      </span>
      <span className="hidden text-right text-meta tabular-nums text-brand-muted sm:block">
        {plusieurs && article.masseUnitaire !== undefined ? masse(article.masseUnitaire) : ""}
      </span>
      <span className="text-right text-meta font-medium tabular-nums text-brand-text">
        {masse(article.masse)}
      </span>
    </li>
  );
}

export default function Paquetage({
  paquetage,
  csvUrl,
  provenance,
  masse = parDefaut,
}: PaquetageProps) {
  const { total, nombreArticles, categories } = paquetage;
  const part = (valeur: number) => (total > 0 ? (valeur / total) * 100 : 0);

  return (
    <div className="mt-5 rounded-xl border border-brand-hairline bg-brand-paper px-6 py-5 shadow-bloc">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="font-mono text-xxs font-bold uppercase tracking-surtitre text-brand-deep-dark">
            Masse au départ
          </div>
          <div className="font-heading text-4xl font-bold leading-tight text-brand-deep">
            {masse(total)}
          </div>
        </div>
        <div className="font-mono text-meta text-brand-muted">
          {articles(nombreArticles)}
          {provenance ? <> · {provenance}</> : null}
        </div>
      </div>

      <div
        className="mt-4 flex h-5.5 overflow-hidden rounded-lg bg-brand-grid"
        role="img"
        aria-label={`Répartition de la masse : ${categories
          .map((categorie) => `${categorie.nom} ${masse(categorie.masse)}`)
          .join(", ")}`}
      >
        {categories.map((categorie, index) => (
          <span
            key={categorie.nom}
            className={`border-r-2 border-brand-paper last:border-r-0 ${teinte(index)}`}
            style={{ width: `${part(categorie.masse)}%` }}
          />
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-meta text-brand-muted">
        {categories.map((categorie, index) => (
          <span key={categorie.nom} className="inline-flex items-center gap-1.5">
            <i className={`h-2.5 w-2.5 rounded-xs ${teinte(index)}`} aria-hidden="true" />
            {categorie.nom}
            <b className="font-medium tabular-nums text-brand-text">{masse(categorie.masse)}</b>
          </span>
        ))}
      </div>

      <div className="mt-4 text-sm">
        {categories.map((categorie) => (
          <details
            key={categorie.nom}
            className="group border-t border-brand-hairline last-of-type:border-b"
          >
            <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr_auto] items-center gap-3 px-0.5 py-2.5 [&::-webkit-details-marker]:hidden">
              {/* Le triangle du <summary> : un carré vide dont seule la bordure
                  gauche est peinte, pivoté à l'ouverture. */}
              <span
                aria-hidden="true"
                className="h-0 w-0 border-y-[5px] border-l-[7px] border-y-transparent border-l-brand-deep-dark transition-transform duration-150 ease-out group-open:rotate-90"
              />
              <span className="min-w-0">
                <span className="font-heading font-bold text-brand-text">{categorie.nom}</span>
                <span className="ml-2 font-mono text-meta text-brand-muted">
                  {articles(categorie.articles.length)}
                </span>
              </span>
              <span className="text-right font-heading font-bold tabular-nums text-brand-slate-dark">
                {masse(categorie.masse)}
              </span>
            </summary>
            <ul className="m-0 list-none pb-2 pl-5">
              {categorie.articles.map((article, index) => (
                <Article key={`${article.nom}-${index}`} article={article} masse={masse} />
              ))}
            </ul>
          </details>
        ))}
      </div>

      {csvUrl ? (
        <div className="mt-3 text-right font-mono text-meta">
          <a href={csvUrl} className="uppercase tracking-lien text-brand-accent-ink no-underline">
            Télécharger la liste (.csv)
          </a>
        </div>
      ) : null}
    </div>
  );
}
