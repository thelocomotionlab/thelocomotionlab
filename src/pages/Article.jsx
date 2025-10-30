import { useParams, Link } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFootnotes from "remark-footnotes";
import rehypeSlug from "rehype-slug";
import rehypeRaw from "rehype-raw";
import articles from "../content/articles.json";
import bibliography from "../content/bibliography.json";
import remarkCitations from "../markdown/remarkCitations.js";
import Tooltip from "../components/Tooltip";

export default function Article() {
  const { slug } = useParams();
  const article = articles.find((a) => a.slug === slug);
  const [content, setContent] = useState("");
  const usedCitationsRef = useRef([]);
  const [refresh, setRefresh] = useState(false); // ✅ force re-render

  useEffect(() => {
    fetch(`/articles/${slug}.md`)
      .then((res) => (res.ok ? res.text() : Promise.reject()))
      .then((raw) => {
        const cleaned = raw.replace(/^---[\s\S]*?---\n?/, "");
        usedCitationsRef.current = [];
        setContent(cleaned);
        setRefresh((r) => !r); // reset affichage
      })
      .catch(() => setContent("# Erreur\nLe contenu n'a pas pu être chargé."));
  }, [slug]);

  if (!article) return <p className="p-6">Article non trouvé</p>;

  const scrollToRef = (id) => {
    const el = document.getElementById(`ref-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const Citation = ({ id }) => {
    const ref = bibliography[id];
    if (!ref) return <sup>[?]</sup>;

    const usedCitations = usedCitationsRef.current;
    if (!usedCitations.includes(id)) {
      usedCitations.push(id);
      setRefresh((r) => !r); // ✅ force la mise à jour de la section Références
    }

    const index = usedCitations.indexOf(id) + 1;
    const formatted = `${ref.author} (${ref.year}). ${ref.title}. ${
      ref.journal || ref.publisher || ""
    }`;

    return (
      <span style={{ display: "inline" }}>
        <Tooltip text={formatted} link={ref.url}>
          <sup
            onClick={() => scrollToRef(id)}
            className="text-brand-accent font-semibold hover:underline cursor-pointer text-xs"
          >
            [{index}]
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
        <p className="text-sm text-gray-500 mb-8 text-center">
          {new Date(article.date).toLocaleDateString("fr-FR")}
        </p>

        <div
          className="
            prose prose-lg max-w-none
            font-lora text-gray-800 leading-relaxed
            text-left md:text-justify
            prose-img:rounded-lg prose-img:shadow-md prose-img:mx-auto prose-img:my-6
            prose-blockquote:italic prose-blockquote:text-gray-600
            prose-blockquote:border-l-4 prose-blockquote:border-brand-primary prose-blockquote:pl-4
          "
          style={{ hyphens: "auto" }}
        >
          <ReactMarkdown
            remarkPlugins={[
              remarkGfm,
              [remarkFootnotes, { inlineNotes: true }],
              remarkCitations,
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
            {content}
          </ReactMarkdown>
        </div>

        {/* ✅ Section Références visible une fois les citations ajoutées */}
        {usedCitationsRef.current.length > 0 && (
          <section className="mt-12">
            <h2 className="text-2xl font-bold text-brand-accent mb-4">
              Références
            </h2>
            <ol className="list-decimal list-inside space-y-2 text-gray-700 font-lora">
              {usedCitationsRef.current.map((id) => {
                const ref = bibliography[id];
                if (!ref) return null;
                return (
                  <li key={id} id={`ref-${id}`} className="scroll-mt-24">
                    <span className="text-gray-700">
                      {ref.author} ({ref.year}). <em>{ref.title}</em>.{" "}
                      {ref.journal || ref.publisher || ""}
                    </span>
                    {ref.url && (
                      <a
                        href={ref.url}
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

        {/* Bouton retour */}
        <div className="mt-12 text-center">
          <Link
            to="/articles"
            className="inline-block bg-brand-accent text-white font-semibold px-6 py-3 rounded-full shadow hover:bg-brand-primary/90 transition"
          >
            Retour aux carnets
          </Link>
        </div>
      </div>
    </article>
  );
}
