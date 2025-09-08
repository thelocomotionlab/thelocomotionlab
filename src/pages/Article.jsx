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
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">{article.title}</h1>
      <p className="text-sm text-gray-500 mb-6">{article.date}</p>
      <div className="prose prose-lg">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
