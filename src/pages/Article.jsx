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
  const key = `../content/articles/${slug}.md`;
  const loader = mdFiles[key];

  if (!loader) {
    setContent("# Erreur\nArticle introuvable.");
    return;
  }

  loader()
    .then((raw) => {
      // Retire le front-matter YAML pour ne pas l’afficher dans la page
      const cleaned = raw.replace(/^---[\s\S]*?---\n?/, "");
      setContent(cleaned);
    })
    .catch(() => setContent("# Erreur\nLe contenu n'a pas pu être chargé."));
}, [slug]);


  if (!article) return <p>Article non trouvé</p>;

  return (
    <article className="p-6 md:p-8 max-w-3xl mx-auto bg-white rounded-xl shadow-card">
      <h1 className="text-3xl md:text-4xl font-extrabold mb-1 font-heading">{article.title}</h1>
      <p className="text-sm text-gray-500 mb-6">{new Date(article.date).toLocaleDateString('fr-FR')}</p>
      <div className="prose prose-neutral md:prose-lg max-w-none">
       <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </article>
   );
 }
