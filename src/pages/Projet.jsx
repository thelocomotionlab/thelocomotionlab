import { useParams, Link, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import projects from "../content/projects.json";
import MapEmbed from "../components/MapEmbed";
import remarkSplit from "../markdown/remarkSplit";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeRaw from "rehype-raw"; // ✅ ajouté pour autoriser le HTML inline
import useTocFromMarkdown from "../hooks/useTocFromMarkdown";
import { Helmet } from "react-helmet";
import LiveTracking from "../components/LiveTracking"; 
import Citation from "../components/Citation";


export default function Projet() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const highlight = params.get("highlight");
  const project = projects.find((p) => p.slug === slug);
  const [content, setContent] = useState("");
  const toc = useTocFromMarkdown(content);

  useEffect(() => {
    fetch(`/projets/${slug}.md`)
      .then((res) => (res.ok ? res.text() : Promise.reject()))
      .then((txt) => setContent(txt))
      .catch(() => setContent("# Erreur\nLe contenu n'a pas pu être chargé."));
  }, [slug]);

  // 🔍 Scroll automatique vers le mot clé si présent
  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => {
      const regex = new RegExp(highlight, "i");
      const paragraphs = document.querySelectorAll(
        "article p, article h2, article h3, article li"
      );
      for (const p of paragraphs) {
        if (regex.test(p.textContent)) {
          p.scrollIntoView({ behavior: "smooth", block: "center" });
          break;
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [highlight, content]);

  if (!project) return <p className="p-6">Projet non trouvé</p>;

  return (
    <>
      <Helmet>
        <title>{project.title} – Projets du Locomotion Lab</title>
        <meta
          name="description"
          content={
            project.description ||
            `Un projet expérimental du Locomotion Lab : ${project.title.toLowerCase()}, autour du mouvement, de la respiration et de la performance.`
          }
        />
        <link
          rel="canonical"
          href={`https://thelocomotionlab.com/projets/${project.slug}`}
        />
        <meta
          property="og:title"
          content={`${project.title} – Projets du Locomotion Lab`}
        />
        <meta
          property="og:description"
          content={
            project.description ||
            "Projet expérimental du Locomotion Lab autour du mouvement et de la respiration."
          }
        />
        <meta
          property="og:image"
          content={`https://thelocomotionlab.com${project.cover}`}
        />
        <meta
          property="og:url"
          content={`https://thelocomotionlab.com/projets/${project.slug}`}
        />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content={`${project.title} – Projets du Locomotion Lab`}
        />
        <meta
          name="twitter:description"
          content={
            project.description ||
            "Projet expérimental du Locomotion Lab autour du mouvement et de la respiration."
          }
        />
        <meta
          name="twitter:image"
          content={`https://thelocomotionlab.com${project.cover}`}
        />
      </Helmet>

      <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {project.cover && (
          <img
            src={project.cover}
            alt={project.title}
            className="w-full h-auto rounded-xl shadow-md mb-6"
          />
        )}

        {/* Effet "carte" identique aux articles */}
        <div className="bg-white rounded-xl shadow-card p-6 md:p-10">
          <h1 className="text-2xl text-brand-primary md:text-5xl font-sans font-bold mb-3 text-center">
            {project.title}
          </h1>
          <p className="text-sm text-gray-500 mb-8 text-center">
            {project.status}
          </p>

          {/* Sommaire dynamique */}
          {toc.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-10">
              <h2 className="text-lg font-semibold text-brand-deep mb-3">
                Sommaire
              </h2>
              <ul className="space-y-1">
                {toc.map((item) => (
                  <li
                    key={item.id}
                    className={`text-sm ${
                      item.level === 3
                        ? "ml-6 list-disc list-inside text-brand-primary"
                        : "ml-0 font-medium text-gray-700"
                    }`}
                  >
                    <a
                      href={`#${item.id}`}
                      className={`hover:underline ${
                        item.level === 2
                          ? "text-brand-accent"
                          : "text-gray-600"
                      }`}
                    >
                      {item.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Contenu principal */}
          <div
            className="
              prose prose-lg max-w-none
              font-lora text-gray-800 leading-relaxed
              text-left md:text-justify
              prose-img:shadow-md prose-img:mx-auto prose-img:my-6
              prose-blockquote:italic prose-blockquote:text-gray-600
              prose-blockquote:border-l-4 prose-blockquote:border-brand-primary prose-blockquote:pl-4
            "
            style={{ hyphens: "auto" }}
          >
            <ReactMarkdown
              remarkPlugins={[
                remarkFrontmatter,
                remarkGfm,
                remarkDirective,
                remarkSplit,
              ]}
              rehypePlugins={[
                rehypeSlug,
                rehypeAutolinkHeadings,
                rehypeRaw, // ✅ permet de lire <livetracking> comme HTML
              ]}
              components={{
                // 🛰️ Composant LiveTracking depuis le markdown
                livetracking: () => <LiveTracking />,

                // Liens : GPX → carte
                a: ({ href, children, ...props }) => {
                  if (href && href.endsWith(".gpx")) {
                    return <MapEmbed gpx={href} />;
                  }
                  return (
                    <a
                      href={href}
                      {...props}
                      className="text-brand-deep hover:underline cursor-pointer"
                      target={
                        href?.startsWith("http") ? "_blank" : undefined
                      }
                      rel={
                        href?.startsWith("http")
                          ? "noopener noreferrer"
                          : undefined
                      }
                    >
                      {children}
                    </a>
                  );
                },

                // Bloc code map → MapEmbed
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
                          JSON invalide pour la carte : {e.message}
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
                citation: Citation
              }}
            >
              {content}
            </ReactMarkdown>
          </div>

          {/* Bouton retour */}
          <div className="mt-12 text-center">
            <Link
              to="/projets"
              className="inline-block bg-brand-accent text-white font-semibold px-6 py-3 rounded-full shadow hover:bg-brand-primary/90 transition"
            >
              Retour aux projets
            </Link>
          </div>
        </div>
      </article>
    </>
  );
}
