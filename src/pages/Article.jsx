import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import articles from "../content/articles.json";

export default function Article() {
  const { slug } = useParams();
  const article = articles.find(a => a.slug === slug);

  const [content, setContent] = useState("");

  useEffect(() => {
    import(`../content/articles/${slug}.md`)
      .then(res => fetch(res.default))
      .then(res => res.text())
      .then(text => setContent(text));
  }, [slug]);

  if (!article) return <p>Article non trouvé</p>;

  return (
    <article className="p-6 md:p-8 max-w-3xl mx-auto bg-white rounded-xl shadow-card">
      <h1 className="text-3xl md:text-4xl font-extrabold mb-3">{article.title}</h1>
      <p className="text-sm text-gray-500 mb-6">{new Date(article.date).toLocaleDateString('fr-FR')}</p>
      <div className="prose prose-lg max-w-none">
       <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </article>
   );
 }
