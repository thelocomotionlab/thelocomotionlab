// components/Paquetage.jsx
//
// LE PAQUETAGE D'UNE AVENTURE, posé dans un article, un récit ou un projet :
//
//   <paquetage src="/paquetages/tour-des-ecrins.csv" titre="Tour des Écrins, 2026" />
//
// Composant SERVEUR : le CSV (export LighterPack, déposé tel quel dans
// public/paquetages/) est lu au build, agrégé par lib/paquetage.js, et rendu en
// HTML statique. Le déroulé des catégories est un <details> natif — zéro
// JavaScript, clavier et lecteurs d'écran d'office.
//
// Ce qu'on montre, et rien de plus : la masse totale, une barre où chaque
// catégorie s'additionne (la charge est cumulative, comme la chasse d'eau de
// Millet), puis les catégories à dérouler avec leurs articles. Pas de prix.
// Le fichier lui-même se télécharge en pied : c'est la « liste partagée ».
//
// Un fichier absent fait ÉCHOUER le build en nommant la balise fautive, plutôt
// que d'afficher un cadre vide sans que personne ne s'en aperçoive.

import fs from "node:fs";
import path from "node:path";

import { agregerPaquetage, grammes, kilos } from "@/lib/paquetage";

// Les teintes des catégories, dans l'ordre d'attribution (la plus lourde
// d'abord). Toutes de la charte, aucune valeur en dur.
const TEINTES = [
  "var(--color-brand-primary-dark)",
  "var(--color-brand-deep)",
  "var(--color-brand-accent)",
  "var(--color-brand-slate)",
  "var(--color-brand-deep-light)",
  "var(--color-brand-primary)",
  "var(--color-brand-deep-dark)",
  "var(--color-brand-accent-dark)",
];

function lireFichier(src) {
  if (!src || !src.startsWith("/")) {
    throw new Error(`<paquetage> : l'attribut src doit être un chemin absolu sous public/ (reçu « ${src || "rien"} »).`);
  }
  const fichier = path.join(process.cwd(), "public", src.replace(/^\//, ""));
  if (!fs.existsSync(fichier)) {
    throw new Error(`<paquetage src="${src}"> : fichier introuvable (${path.relative(process.cwd(), fichier)}).`);
  }
  return fs.readFileSync(fichier, "utf8");
}

function nombreArticles(n) {
  return `${n} article${n > 1 ? "s" : ""}`;
}

function Article({ article }) {
  const plusieurs = article.quantite !== 1;
  return (
    <li className="ll-paquetage-article">
      <span className="min-w-0">
        {article.url ? (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand-deep-dark underline underline-offset-2 decoration-brand-accent-dark/60 hover:decoration-brand-accent-dark"
          >
            {article.nom}
          </a>
        ) : (
          <span className="font-semibold text-brand-text">{article.nom}</span>
        )}
        {article.description && (
          <span className="mt-0.5 block text-[12.5px] leading-snug text-gray-500">{article.description}</span>
        )}
      </span>
      <span className="ll-paquetage-num text-gray-500">{plusieurs ? `× ${article.quantite}` : ""}</span>
      <span className="ll-paquetage-num text-gray-500">{plusieurs ? grammes(article.masseUnitaire) : ""}</span>
      <span className="ll-paquetage-num font-medium text-brand-text">{grammes(article.masse)}</span>
    </li>
  );
}

export default function Paquetage({ src, titre = "" }) {
  const paquetage = agregerPaquetage(lireFichier(src));
  const { total, categories } = paquetage;
  const teinte = (i) => TEINTES[i % TEINTES.length];
  const nomFichier = path.basename(src);

  return (
    <section
      className="ll-paquetage not-prose my-8 rounded-[18px] border border-brand-hairline bg-white px-5 py-5 shadow-[0_6px_20px_rgba(51,51,51,0.06)] sm:px-6"
      aria-label={titre ? `Paquetage : ${titre}` : "Paquetage"}
    >
      {/* En-tête : le surtitre, le titre, et LA masse. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="font-heading text-[11px] font-bold uppercase tracking-[0.18em] text-brand-deep-dark">
            Paquetage
          </div>
          {titre && (
            <div className="mt-0.5 font-heading text-[19px] font-bold leading-tight text-brand-slate-dark">
              {titre}
            </div>
          )}
        </div>
        <div className="border-l-2 border-brand-hairline pl-3">
          <div className="font-heading text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-500">Total</div>
          <div className="font-heading text-[26px] font-bold leading-[1.15] text-brand-deep tabular-nums">
            {kilos(total)}
          </div>
        </div>
      </div>

      {/* La barre de charge : chaque catégorie ajoute sa part au même total. */}
      <div
        className="mt-4 flex h-[22px] overflow-hidden rounded-[7px] bg-brand-grid"
        role="img"
        aria-label={`Répartition de la masse : ${categories.map((c) => `${c.nom} ${grammes(c.masse)}`).join(", ")}`}
      >
        {categories.map((c, i) => (
          <span
            key={c.nom}
            className="ll-paquetage-seg block h-full"
            style={{ width: `${total > 0 ? (c.masse / total) * 100 : 0}%`, background: teinte(i) }}
            title={`${c.nom} · ${grammes(c.masse)}`}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
        {categories.map((c, i) => (
          <li key={c.nom} className="flex items-center gap-1.5 text-[12.5px] text-gray-500">
            <i className="inline-block h-[9px] w-[9px] rounded-[2px]" style={{ background: teinte(i) }} aria-hidden="true" />
            {c.nom}
            <b className="font-medium text-brand-text tabular-nums">{grammes(c.masse)}</b>
          </li>
        ))}
      </ul>

      {/* Les catégories, à dérouler. */}
      <div className="mt-4">
        {categories.map((c) => (
          <details key={c.nom} className="ll-paquetage-categorie">
            <summary>
              <span className="font-heading text-[15px] font-bold text-brand-text">{c.nom}</span>
              <span className="text-[12.5px] text-gray-500">{nombreArticles(c.articles.length)}</span>
              <span className="ll-paquetage-num font-heading font-bold text-brand-slate-dark">{grammes(c.masse)}</span>
            </summary>
            <ul>
              {c.articles.map((a, i) => (
                <Article key={`${a.nom}-${i}`} article={a} />
              ))}
            </ul>
          </details>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px] text-gray-500">
        <span>{nombreArticles(paquetage.nombreArticles)} · masses pesées</span>
        <a
          href={src}
          download={nomFichier}
          className="font-heading text-[11px] font-bold uppercase tracking-[0.08em] text-brand-accent-ink hover:text-brand-deep-dark"
        >
          Télécharger la liste (.csv)
        </a>
      </div>
    </section>
  );
}
