// packages/ui/src/components/contenu/Paquetage.tsx
//
// LA SECTION PAQUETAGE : la masse au départ, sa répartition, la liste.
//
// La section ne déclare qu'une `ref` ; le jeu de données arrive déjà agrégé
// (c'est l'app qui lit le CSV). Le composant rend les masses, la barre de
// proportion et l'export.

import type { ReactNode } from "react";

export type CategorieDePaquetage = {
  nom: string;
  masse: number;
  articles: readonly { nom: string; masse: number }[];
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
        <div className="flex flex-wrap gap-6 font-mono text-xs text-brand-soft">
          {categories.map((categorie) => (
            <span key={categorie.nom}>
              <b className="block font-heading text-base text-brand-text">{masse(categorie.masse)}</b>
              {categorie.nom}
            </span>
          ))}
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

      <div className="mt-2 flex flex-wrap gap-5 font-mono text-meta text-brand-muted">
        {categories.map((categorie, index) => (
          <span key={categorie.nom} className="inline-flex items-center gap-1.5">
            <i className={`h-2.5 w-2.5 rounded-xs ${teinte(index)}`} aria-hidden="true" />
            {categorie.nom}
          </span>
        ))}
      </div>

      <div className="mt-5 grid gap-x-8 text-sm md:grid-cols-2">
        {categories.flatMap((categorie) =>
          categorie.articles.map((article) => (
            <div
              key={`${categorie.nom}-${article.nom}`}
              className="flex justify-between gap-3 border-t border-brand-grid py-1.5"
            >
              <span className="font-lora">{article.nom}</span>
              <span className="font-mono text-brand-muted tabular-nums">{masse(article.masse)}</span>
            </div>
          )),
        )}
      </div>

      <div className="mt-3 flex justify-between gap-4 font-mono text-meta text-brand-muted">
        <span>
          {nombreArticles} article{nombreArticles > 1 ? "s" : ""}
          {provenance ? <> · {provenance}</> : null}
        </span>
        {csvUrl ? (
          <a
            href={csvUrl}
            className="uppercase tracking-lien text-brand-accent-ink no-underline"
          >
            Télécharger la liste (.csv)
          </a>
        ) : null}
      </div>
    </div>
  );
}
