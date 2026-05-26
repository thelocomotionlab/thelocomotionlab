// app/articles/[slug]/ArticleBody.jsx
//
// Server Component : tout le rendu markdown se fait au build.
// → HTML complet présent dans la réponse SSR (crucial pour le SEO).
// → react-markdown + remark/rehype plugins disparaissent du bundle client.
// Seul le <Tooltip> autour des numéros de citation reste interactif côté client.

import Link from "next/link";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFootnotes from "remark-footnotes";
import remarkDirective from "remark-directive";
import remarkMath from "remark-math";
import remarkCitations from "../../../markdown/remarkCitations";
import remarkSplit from "../../../markdown/remarkSplit";
import remarkImageOptions from "../../../markdown/remarkImageOptions";

import rehypeSlug from "rehype-slug";
import rehypeRaw from "rehype-raw";

import { getUsedCitations } from "../../../lib/getUsedCitations";
import { createCitation } from "../../../components/Citation";
import CitationReferences from "../../../components/CitationReferences";
import ArticleNav from "../../../components/ArticleNav";

export default function ArticleBody({
  article,
  initialContent,
  related = [],
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
    <article className="max-w-5xl mx-auto sm:px-6 lg:px-8 pt-0 pb-10 sm:py-10">
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

      <div className="bg-white rounded-xl shadow-card p-4 sm:p-6 md:p-10">
        <h1 className="text-2xl text-brand-primary md:text-5xl font-sans font-bold mb-3 text-center">
          {article.title}
        </h1>
        {(article.date || article.author) && (
          <div className="text-sm text-gray-500 mb-8 text-center">
            {article.author && (
              <p>
                Par{" "}
                <Link
                  href="/about"
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
          className="
            prose prose-lg max-w-none
            prose-p:text-[1.25rem] sm:prose-p:text-[1.5rem]
            font-lora text-gray-800 leading-relaxed
            text-left md:text-justify
            prose-img:rounded-lg prose-img:shadow-md prose-img:mx-auto prose-img:my-6
            prose-blockquote:italic prose-blockquote:text-gray-600
            prose-blockquote:border-l-4 prose-blockquote:border-brand-primary prose-blockquote:pl-4
            article-body
          "
        >
          <ReactMarkdown
            remarkPlugins={[
              remarkGfm,
              remarkImageOptions,
              [remarkFootnotes, { inlineNotes: true }],
              remarkCitations,
              remarkDirective,
              remarkSplit,
              remarkMath,
            ]}
            rehypePlugins={[rehypeSlug, rehypeRaw]}
            components={{
              citation: Citation,
              a: ({ node, ...props }) => {
                if (props.href && props.href.startsWith("#")) {
                  return (
                    <a
                      {...props}
                      className="font-semibold hover:underline cursor-pointer"
                    />
                  );
                }
                return (
                  <a
                    {...props}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold hover:underline"
                  />
                );
              },
            }}
          >
            {markdown}
          </ReactMarkdown>
        </div>

        <CitationReferences ids={usedCitations} />

        <ArticleNav items={related} kind="article" />

        <div className="mt-12 text-center">
          <Link
            href="/articles"
            className="inline-block bg-brand-accent text-white font-semibold px-6 py-3 rounded-full shadow hover:bg-brand-primary-dark transition"
          >
            Retour aux carnets
          </Link>
        </div>
      </div>
    </article>
  );
}
