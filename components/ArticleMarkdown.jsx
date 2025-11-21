// components/ArticleMarkdown.jsx
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFootnotes from "remark-footnotes";
import remarkMath from "remark-math";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";

import rehypeSlug from "rehype-slug";
import rehypeRaw from "rehype-raw";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeKatex from "rehype-katex";

import remarkSplit from "@/markdown/remarkSplit";
import remarkLiveTracking from "@/markdown/remarkLiveTracking";
import remarkCitations from "@/markdown/remarkCitations";

import Citation, {
  CitationProvider,
  useCitationRegistry,
} from "@/components/Citation";
import MapEmbed from "@/components/MapEmbed";
import LiveTracking from "@/components/LiveTracking";
import bibliography from "@/content/bibliography.json";

const articleProseClasses = `
  prose prose-lg max-w-none
  font-lora text-gray-800 leading-relaxed
  text-left md:text-justify
  prose-img:rounded-lg prose-img:shadow-md prose-img:mx-auto prose-img:my-6
  prose-blockquote:italic prose-blockquote:text-gray-600
  prose-blockquote:border-l-4 prose-blockquote:border-brand-primary prose-blockquote:pl-4
`;

function ReferencesSection() {
  const ctx = useCitationRegistry();
  const usedIds = ctx?.usedIds || [];

  if (!usedIds.length) return null;

  return (
    <section className="mt-12">
      <h2 className="text-2xl font-bold text-brand-accent mb-4">Références</h2>
      <ol className="list-decimal list-inside space-y-2 text-gray-700 font-lora">
        {usedIds.map((id) => {
          const ref = bibliography[id];
          if (!ref) return null;

          return (
            <li key={id} id={`ref-${id}`} className="scroll-mt-24">
              <span className="text-gray-700">
                {ref.author} ({ref.year}). <em>{ref.title}</em>.{" "}
                {ref.journal || ref.publisher || ""}
              </span>
              {(ref.url || ref.link) && (
                <a
                  href={ref.url || ref.link}
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
  );
}

export default function ArticleMarkdown({ content }) {
  return (
    <CitationProvider>
      <div className={articleProseClasses} style={{ hyphens: "auto" }}>
        <ReactMarkdown
          remarkPlugins={[
            remarkFrontmatter,
            remarkGfm,
            [remarkFootnotes, { inlineNotes: true }],
            remarkCitations,
            remarkMath,
            remarkDirective,
            remarkSplit,
            remarkLiveTracking,
          ]}
          rehypePlugins={[
            rehypeSlug,
            rehypeAutolinkHeadings,
            rehypeRaw,
            rehypeKatex,
          ]}
          components={{
            citation: Citation,

            p: ({ node, children, ...props }) => {
              const arr = Array.isArray(children) ? children : [children];
              const textContent = arr
                .map((c) => (typeof c === "string" ? c : ""))
                .join("");

              if (textContent.includes("[[LIVE_TRACKING_BLOCK]]")) {
                return (
                  <figure className="lt-figure my-8">
                    <LiveTracking />
                  </figure>
                );
              }

              return <p {...props}>{children}</p>;
            },

            a: ({ href, children, ...props }) => {
              if (href && href.endsWith(".gpx")) {
                return <MapEmbed gpx={href} />;
              }
              const isExternal = href?.startsWith("http");
              return (
                <a
                  href={href}
                  {...props}
                  target={isExternal ? "_blank" : undefined}
                  rel={isExternal ? "noopener noreferrer" : undefined}
                  className="text-brand-deep hover:underline cursor-pointer"
                >
                  {children}
                </a>
              );
            },

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
          }}
        >
          {content}
        </ReactMarkdown>
      </div>

      {/* Section Références en bas de l’article */}
      <ReferencesSection />
    </CitationProvider>
  );
}
