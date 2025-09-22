import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import articles from "../content/articles.json";

export default function Article() {
  const { slug } = useParams();
  const article = articles.find(a => a.slug === slug);

  const [content, setContent] = useState("");

// Prépare une “carte” de tous les .md disponibles comme texte brut.
// => pas besoin de plugin Markdown côté build.
const mdFiles = import.meta.glob('../content/articles/*.md', { as: 'raw', eager: false });

useEffect(() => {
  fetch(`/articles/${slug}.md`)
    .then(res => res.ok ? res.text() : Promise.reject())
    .then(raw => {
      // Retirer le front-matter YAML
      const cleaned = raw.replace(/^---[\s\S]*?---\n?/, "");
      setContent(cleaned);
    })
    .catch(() => setContent("# Erreur\nLe contenu n'a pas pu être chargé."));
}, [slug]);


  if (!article) return <p>Article non trouvé</p>;

  return (
    <article className="p-6 md:p-8 max-w-3xl mx-auto px-4 py-10 bg-white rounded-xl shadow-card">
      {article.cover && (
        <img
          src={article.cover}
          alt={article.title}
          className="w-full h-64 object-cover rounded-lg mb-6"
        />
      )}
      <h1 className="text-3xl md:text-4xl font-primal mb-1">{article.title}</h1>
      <p className="text-sm text-gray-500 mb-6">
        {new Date(article.date).toLocaleDateString("fr-FR")}
      </p>
      <div className="prose prose-lg max-w-none font-lora text-gray-800 leading-relaxed">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </article>
   );
 }

