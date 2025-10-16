// src/pages/Projet.jsx
import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import projects from "../content/projects.json";
import MapEmbed from "../components/MapEmbed";
import remarkSplit from "../markdown/remarkSplit";

export default function Projet() {
  const { slug } = useParams();
  const project = projects.find((p) => p.slug === slug);

  const [content, setContent] = useState("");

  useEffect(() => {
    fetch(`/projets/${slug}.md`)
      .then((res) => (res.ok ? res.text() : Promise.reject()))
      .then((txt) => setContent(txt))
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
          // 1) Markdown standard + extensions
          remarkPlugins={[remarkGfm, remarkDirective, remarkSplit]}
          // 2) Rendus custom pour certains éléments
          components={{
            // Liens : si .gpx -> carte MapEmbed ; sinon lien normal stylé
            a: ({ href, children, ...props }) => {
              if (href && href.endsWith(".gpx")) {
                return <MapEmbed gpx={href} />;
              }
              return (
                <a
                  href={href}
                  {...props}
                  className="text-brand-deep hover:underline cursor-pointer"
                  target={href?.startsWith("http") ? "_blank" : undefined}
                  rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
                >
                  {children}
                </a>
              );
            },

            // Bloc de code : ```map { ...json... }``` -> MapEmbed
            code: ({ node, inline, className, children, ...props }) => {
              const text = String(children || "").trim();
              const isMapBlock =
                !inline &&
                (/\blanguage-map\b/.test(className || "") ||
                  (text.startsWith("{") && text.endsWith("}")));

              if (isMapBlock) {
                try {
                  const cfg = JSON.parse(text);
                  return <MapEmbed {...cfg} />;
                } catch (e) {
                  return (
                    <pre className="bg-gray-100 p-4 rounded border border-gray-200 text-sm overflow-x-auto">
                      ⚠️ JSON invalide pour la carte : {e.message}
                      {"\n\n"}
                      {text}
                    </pre>
                  );
                }
              }
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
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
