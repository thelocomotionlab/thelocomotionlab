import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFootnotes from "remark-footnotes";
import articles from "../content/articles.json";

export default function Article() {
  const { slug } = useParams();
  const article = articles.find((a) => a.slug === slug);

  const [content, setContent] = useState("");

  // (facultatif chez toi)
  const mdFiles = import.meta.glob("../content/articles/*.md", { as: "raw", eager: false });

  useEffect(() => {
    fetch(`/articles/${slug}.md`)
      .then((res) => (res.ok ? res.text() : Promise.reject()))
      .then((raw) => {
        const cleaned = raw.replace(/^---[\s\S]*?---\n?/, "");
        setContent(cleaned);
      })
      .catch(() => setContent("# Erreur\nLe contenu n'a pas pu être chargé."));
  }, [slug]);

  if (!article) return <p className="p-6">Article non trouvé</p>;

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
        <h1 className="text-4xl md:text-5xl font-lora font-bold mb-3">{article.title}</h1>
        <p className="text-sm text-gray-500 mb-8">
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
            remarkPlugins={[remarkGfm,
              // active la syntaxe [^1] et ^[note inline]
              [remarkFootnotes, { inlineNotes: true }],]}
            components={{
              a: ({ node, ...props }) => (
              <a
                {...props}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-primary hover:underline"
              />
            ),
          }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </article>
  );
}
