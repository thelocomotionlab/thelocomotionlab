import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import projects from "../content/projects.json";
import MapEmbed from "../components/MapEmbed";


export default function Projet() {
  const { slug } = useParams();
  const project = projects.find((p) => p.slug === slug);

  const [content, setContent] = useState("");

  useEffect(() => {
    fetch(`/projets/${slug}.md`)
      .then((res) => (res.ok ? res.text() : Promise.reject()))
      .then((raw) => {
        const cleaned = raw.replace(/^---[\s\S]*?---\n?/, "");
        setContent(cleaned);
      })
      .catch(() => setContent("# Erreur\nLe contenu n'a pas pu être chargé."));
  }, [slug]);

  if (!project) return <p className="p-6">Projet non trouvé</p>;

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {project.cover && (
        <img
          src={project.cover}
          alt={project.title}
          className="w-full h-auto object-cover rounded-xl shadow mb-6"
        />
      )}
      <h1 className="text-4xl font-bold mb-3 text-brand-primary">{project.title}</h1>
      <p className="text-sm text-gray-500 mb-8">{project.status}</p>

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
        remarkPlugins={[remarkGfm]}
        components={{
          code: ({ node, inline, className, children, ...props }) => {
            const text = String(children || "").trim();

            // Bloc de code type ```map { ...json... } ```
            const isBlock = !inline && /language-map/.test(className || "") || (!inline && text.startsWith("{") && text.endsWith("}"));

            if (isBlock) {
              try {
                const cfg = JSON.parse(text);
                return <MapEmbed {...cfg} />;
              } catch (e) {
                // Si le JSON est invalide, on affiche le bloc brut pour aider au debug
                return (
                  <pre className="bg-gray-100 p-4 rounded border border-gray-200 text-sm overflow-x-auto">
                    ⚠️ JSON invalide pour la carte : {e.message}
                    {"\n\n"}
                    {text}
                  </pre>
                );
              }
            }

            // rendu normal pour le reste
            return <code className={className} {...props}>{children}</code>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
              
      </div>

      <div className="mt-12 text-center">
        <Link
          to="/projets"
          className="inline-block bg-brand-primary text-white font-semibold px-6 py-3 rounded-lg shadow hover:bg-brand-primary/90 transition"
        >
          Retour aux projets
        </Link>
      </div>
    </article>
  );
}
