// app/articles/[slug]/ArticleClient.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

import bibliography from "../../../content/bibliography.json";
import Tooltip from "../../../components/Tooltip";

export default function ArticleClient({ article, initialContent }) {
  const [usedCitations, setUsedCitations] = useState([]);

  // ✅ Correctif déterministe :
  // On transforme {{cite:xxx}} en balises <citation id="xxx"></citation>
  // avant le rendu markdown (rehypeRaw les interprète ensuite).
  const markdown = useMemo(() => {
    if (!initialContent) return "";
    return initialContent.replace(
      /\{\{cite:([\w-]+)\}\}/g,
      '<citation id="$1"></citation>'
    );
  }, [initialContent]);

  // Scanner le markdown ORIGINAL (avant remplacement) pour l'ordre d'apparition
  useEffect(() => {
    if (!initialContent) {
      setUsedCitations([]);
      return;
    }

    const regex = /\{\{cite:([\w-]+)\}\}/g;
    const ids = [];
    let match;

    while ((match = regex.exec(initialContent)) !== null) {
      const id = match[1];
      if (!ids.includes(id) && bibliography[id]) {
        ids.push(id);
      }
    }

    setUsedCitations(ids);
  }, [initialContent]);

  if (!article) return <p className="p-6">Article non trouvé</p>;

  const scrollToRef = (id) => {
    const el = document.getElementById(`ref-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const Citation = (props) => {
    const id = props?.id;
    const ref = bibliography?.[id];

    if (!id || !ref) return <sup>[?]</sup>;

    const index = usedCitations.indexOf(id) + 1;

    const formatted = `${ref.author} (${ref.year}). ${ref.title}. ${
      ref.journal || ref.publisher || ""
    }`;

    // bibliography.json utilise "link" (dans ton repo), mais on tolère "url" si tu ajoutes plus tard
    const link = ref.link || ref.url;

    return (
      <span style={{ display: "inline" }}>
        <Tooltip text={formatted} link={link}>
          <sup
            onClick={() => scrollToRef(id)}
            className="text-brand-accent font-semibold hover:underline cursor-pointer text-xs"
          >
            {index > 0 ? `${index}` : "?"}
          </sup>
        </Tooltip>
      </span>
    );
  };

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {article.cover && (
        <img
          src={article.cover}
          alt={article.title}
          className="w-full h-auto rounded-xl shadow-md mb-6"
        />
      )}

      <div className="bg-white rounded-xl shadow-card p-6 md:p-10">
        <h1 className="text-2xl text-brand-primary md:text-5xl font-sans font-bold mb-3 text-center">
          {article.title}
        </h1>
        {article.date && (
          <p className="text-sm text-gray-500 mb-8 text-center">
            {new Date(article.date).toLocaleDateString("fr-FR")}
          </p>
        )}

        <div
          className="
            prose prose-lg max-w-none
            prose-p:text-[1.5rem]
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
              remarkCitations, // (peut rester, mais le pré-remplacement suffit déjà)
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
                      className="text-brand-deep hover:underline cursor-pointer"
                    />
                  );
                }
                return (
                  <a
                    {...props}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-deep hover:underline"
                  />
                );
              },
            }}
          >
            {markdown}
          </ReactMarkdown>
        </div>

        {/* Section Références */}
        {usedCitations.length > 0 && (
          <section className="mt-12">
            <h2 className="text-2xl font-bold text-brand-accent mb-4">
              Références
            </h2>
            <ol className="list-decimal list-inside space-y-2 text-gray-700 font-lora">
              {usedCitations.map((id) => {
                const ref = bibliography[id];
                if (!ref) return null;

                const link = ref.link || ref.url;

                return (
                  <li key={id} id={`ref-${id}`} className="scroll-mt-24">
                    <span className="text-gray-700">
                      {ref.author} ({ref.year}). <em>{ref.title}</em>.{" "}
                      {ref.journal || ref.publisher || ""}
                    </span>
                    {link && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-primary hover:underline ml-1"
                      >
                        Lire
                      </a>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <div className="mt-12 text-center">
          <Link
            href="/articles"
            className="inline-block bg-brand-accent text-white font-semibold px-6 py-3 rounded-full shadow hover:bg-brand-primary/90 transition"
          >
            Retour aux carnets
          </Link>
        </div>
      </div>
    </article>
  );
}
