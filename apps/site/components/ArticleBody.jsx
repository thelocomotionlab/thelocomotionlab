// components/ArticleBody.jsx
//
// Server Component : tout le rendu markdown se fait au build.
// → HTML complet présent dans la réponse SSR (crucial pour le SEO).
// → react-markdown + remark/rehype plugins disparaissent du bundle client.
// Seul le <Tooltip> autour des numéros de citation reste interactif côté client.
// Utilisé par /comprendre/[slug] (articles) ET /explorer/[slug] (récits) :
// le bouton de retour est piloté par les props backHref / backLabel.

import Link from "next/link";
import Image from "next/image";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFootnotes from "remark-footnotes";
import remarkDirective from "remark-directive";
import remarkMath from "remark-math";
import remarkCitations from "@/markdown/remarkCitations";
import remarkSplit from "@/markdown/remarkSplit";
import remarkImageOptions from "@/markdown/remarkImageOptions";
import remarkPaquetage, { parsePaquetageBlock } from "@/markdown/remarkPaquetage";

import rehypeSlug from "rehype-slug";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";

import { getUsedCitations } from "@/lib/getUsedCitations";
import { createCitation } from "./Citation";
import CitationReferences from "./CitationReferences";
import BlocsRelations from "./BlocsRelations";
import ImagesPleinEcran from "./ImagesPleinEcran";
import Paquetage from "./Paquetage";
import TwinCohorteTeaser from "./TwinCohorteTeaser";

export default function ArticleBody({
  article,
  initialContent,
  relations = null,
  backHref = "/comprendre",
  backLabel = "Retour à Comprendre",
}) {
  if (!article) return <p className="p-6">Article non trouvé</p>;

  const raw = initialContent || "";
  const usedCitations = getUsedCitations(raw);
  const Citation = createCitation(usedCitations);

  // Conversion {{cite:ID}} → <citation id="ID"></citation> AVANT le parsing
  // markdown : sinon `remark-directive` interprète le `:ID` comme une
  // directive texte et casse la citation.
  const markdown = raw.replace(
    /\{\{cite:([\w-]+)\}\}/g,
    '<citation id="$1"></citation>'
  );

  return (
    <article className="max-w-4xl mx-auto sm:px-6 lg:px-8 pt-0 pb-10 sm:py-10">
      {article.cover && (
        <div className="sm:-mx-6 lg:-mx-8 mb-6 overflow-hidden rounded-none sm:rounded-2xl shadow-md">
          <Image
            src={article.cover}
            alt={`Illustration de l'article : ${article.title}`}
            width={1600}
            height={900}
            priority
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1024px"
            className="block w-full h-auto"
          />
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-card p-4 sm:p-6 md:p-10">
        {/* Titre à la convention des pages (bleu profond), auteur et date
            juste dessous, liseré ocre en séparateur — le tout FERRÉ À GAUCHE,
            comme PageHeader. Titre, méta et liseré étaient centrés : c'était
            la seule grammaire d'en-tête différente du site, précisément sur
            les pages d'atterrissage depuis Google et les réseaux (audit des
            titres, 08/2026). */}
        <h1 className="text-3xl text-brand-slate-dark md:text-5xl font-heading font-bold mb-3">
          {article.title}
        </h1>
        {(article.date || article.author) && (
          <div className="text-sm text-gray-500 mb-5">
            {article.author && (
              <p>
                Par{" "}
                <Link
                  href="/a-propos"
                  className="font-bold text-brand-deep hover:text-brand-accent hover:underline"
                >
                  {article.author}
                </Link>
              </p>
            )}
            {article.date && (
              <p>
                Le{" "}
                <time dateTime={new Date(article.date).toISOString()}>
                  {new Date(article.date).toLocaleDateString("fr-FR")}
                </time>
              </p>
            )}
          </div>
        )}
        <div
          className="mb-8 h-[3px] w-16 rounded-full bg-brand-accent"
          aria-hidden="true"
        />

        {/* NB : le plugin typography n'est pas chargé (cf. tailwind.config.mjs) —
            les styles .prose (titres, listes, blockquotes…) vivent dans globals.css. */}
        <div
          className="
            prose max-w-none
            font-lora text-gray-800 leading-relaxed
            text-left md:text-justify
            article-body
          "
        >
          <ReactMarkdown
            remarkPlugins={[
              remarkGfm,
              remarkImageOptions,
              remarkPaquetage,
              [remarkFootnotes, { inlineNotes: true }],
              remarkCitations,
              remarkDirective,
              remarkSplit,
              remarkMath,
            ]}
            rehypePlugins={[rehypeSlug, rehypeRaw, rehypeKatex]}
            components={{
              citation: Citation,
              // Un paragraphe qui n'est qu'un bloc <paquetage> devient le
              // composant ; tout autre paragraphe reste un <p> ordinaire.
              p: ({ children }) => {
                const enfants = React.Children.toArray(children);
                const bloc = enfants.length === 1 ? parsePaquetageBlock(enfants[0]) : null;
                return bloc ? <Paquetage {...bloc} /> : <p>{children}</p>;
              },
              a: ({ node, ...props }) => {
                // Lien identifiable sans survol (WCAG 1.4.1) : souligné en
                // permanence + couleur de la charte lisible sur blanc.
                const linkClasses =
                  "font-semibold text-brand-deep-dark underline underline-offset-2 decoration-brand-accent-dark/60 hover:decoration-brand-accent-dark";
                if (props.href && props.href.startsWith("#")) {
                  return (
                    <a {...props} className={`${linkClasses} cursor-pointer`} />
                  );
                }
                return (
                  <a
                    {...props}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClasses}
                  />
                );
              },
            }}
          >
            {markdown}
          </ReactMarkdown>
        </div>

        <CitationReferences ids={usedCitations} />

        {/* L'appel à la cohorte se place APRÈS le texte et AVANT les autres
            parutions : qui vient de lire un récit de trail en entier est la
            personne à qui la question se pose vraiment. */}
        <TwinCohorteTeaser className="mt-12" />

        <BlocsRelations relations={relations} />

        {/* Les images du markdown s'ouvrent en taille réelle au clic. */}
        <ImagesPleinEcran targetSelector=".article-body" />

        <div className="mt-12 text-center">
          <Link
            href={backHref}
            className="inline-block bg-brand-accent text-white font-semibold px-6 py-3 rounded-full shadow hover:bg-brand-accent-dark transition"
          >
            {backLabel}
          </Link>
        </div>
      </div>
    </article>
  );
}
