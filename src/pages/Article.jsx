import { useParams, Link, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFootnotes from "remark-footnotes";
import articles from "../content/articles.json";
import { Helmet } from "react-helmet";

export default function Article() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const highlight = params.get("highlight");
  const article = articles.find((a) => a.slug === slug);
  const [content, setContent] = useState("");

  useEffect(() => {
    fetch(`/articles/${slug}.md`)
      .then((res) => (res.ok ? res.text() : Promise.reject()))
      .then((raw) => {
        const cleaned = raw.replace(/^---[\s\S]*?---\n?/, "");
        setContent(cleaned);
      })
      .catch(() => setContent("# Erreur\nLe contenu n'a pas pu être chargé."));
  }, [slug]);

  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => {
      const regex = new RegExp(highlight, "i");
      const paragraphs = document.querySelectorAll("article p, article h2, article h3, article li");
      for (const p of paragraphs) {
        if (regex.test(p.textContent)) {
          p.scrollIntoView({ behavior: "smooth", block: "center" });
          break;
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [highlight, content]);

  if (!article) return <p className="p-6">Article non trouvé</p>;

  return (
    <>
      <Helmet>
        <title>{article.title} – Carnets du Locomotion Lab</title>
        <meta
          name="description"
          content={
            article.description ||
            `Un article du Locomotion Lab sur ${article.title.toLowerCase()}, explorant le mouvement, la conscience et la performance.`
          }
        />
        <link
          rel="canonical"
          href={`https://thelocomotionlab.com/articles/${article.slug}`}
        />
        <meta property="og:title" content={`${article.title} – Carnets du Locomotion Lab`} />
        <meta property="og:description" content={article.description || "Article du Locomotion Lab sur le mouvement et la conscience corporelle."} />
        <meta property="og:image" content={`https://thelocomotionlab.com${article.cover}`} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={`https://thelocomotionlab.com/articles/${article.slug}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${article.title} – Carnets du Locomotion Lab`} />
        <meta name="twitter:description" content={article.description || "Article du Locomotion Lab sur le mouvement et la conscience corporelle."} />
        <meta name="twitter:image" content={`https://thelocomotionlab.com${article.cover}`} />
      </Helmet>

      <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {article.cover && (
          <img src={article.cover} alt={article.title} className="w-full h-auto rounded-xl shadow-md mb-6" />
        )}
        <div className="bg-white rounded-xl shadow-card p-6 md:p-10">
          <h1 className="text-2xl text-brand-primary md:text-5xl font-sans font-bold mb-3 text-center">
            {article.title}
          </h1>
          <p className="text-sm text-gray-500 mb-8 text-center">
            {new Date(article.date).toLocaleDateString("fr-FR")}
          </p>

          <div
            className="prose prose-lg max-w-none font-lora text-gray-800 leading-relaxed text-left md:text-justify prose-img:rounded-lg prose-img:shadow-md prose-img:mx-auto prose-img:my-6 prose-blockquote:italic prose-blockquote:text-gray-600 prose-blockquote:border-l-4 prose-blockquote:border-brand-primary prose-blockquote:pl-4"
            style={{ hyphens: "auto" }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm, [remarkFootnotes, { inlineNotes: true }]]}>
              {content}
            </ReactMarkdown>
          </div>

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
    </>
  );
}
