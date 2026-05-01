"use client";

import React, { useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkMath from "remark-math";
import remarkSplit from "../../../markdown/remarkSplit";
import remarkImageOptions from "../../../markdown/remarkImageOptions";
import remarkLiveTracking from "../../../markdown/remarkLiveTracking";
import remarkPostLiveTracking from "../../../markdown/remarkPostLiveTracking";

import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";

import useTocFromMarkdown from "../../../hooks/useTocFromMarkdown";
import Citation from "../../../components/Citation";
import MapEmbed from "../../../components/MapEmbed";
import LiveTracking from "../../../components/LiveTracking";
import PostLiveTracking from "../../../components/PostLiveTracking";

function HighlightEffect({ content = "" }) {
  const searchParams = useSearchParams();
  const highlight = searchParams.get("highlight") || "";

  useEffect(() => {
    if (!highlight) return;

    const timer = setTimeout(() => {
      const safeHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(safeHighlight, "i");

      const elements = document.querySelectorAll(
        "article p, article h2, article h3, article li"
      );

      for (const el of elements) {
        if (regex.test(el.textContent || "")) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          break;
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [highlight, content]);

  return null;
}

export default function ProjetClient({ project, initialContent }) {
  const content = initialContent || "";
  const toc = useTocFromMarkdown(content);

  if (!project) return <p className="p-6">Projet non trouvé</p>;

  // Scroll ancres
  useEffect(() => {
    const handleHashScroll = () => {
      const { hash } = window.location;
      if (!hash) return;

      const id = decodeURIComponent(hash.replace("#", ""));
      const target = document.getElementById(id);

      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        target.style.transition = "background-color 0.8s ease";
        target.style.backgroundColor = "rgba(239,177,89,0.15)";
        setTimeout(() => {
          target.style.backgroundColor = "transparent";
        }, 1000);
      }
    };

    const timer = setTimeout(handleHashScroll, 400);

    window.addEventListener("hashchange", handleHashScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("hashchange", handleHashScroll);
    };
  }, [content]);

  return (
    <article className="max-w-4xl mx-auto sm:px-6 lg:px-8 pt-0 pb-10 sm:py-10">
      <Suspense fallback={null}>
        <HighlightEffect content={content} />
      </Suspense>

      {project.cover && (
        <div
          className="
            w-screen relative left-1/2 -ml-[50vw]
            sm:w-full sm:left-auto sm:ml-0
            mb-6 overflow-hidden
            rounded-none sm:rounded-xl
            shadow-card
          "
        >
          <img
            src={project.cover}
            alt={project.title}
            className="block w-full h-auto"
          />
        </div>
      )}

      <div className="bg-white rounded-xl shadow-card p-4 sm:p-6 md:p-10">
        <h1 className="text-2xl text-brand-primary md:text-5xl font-sans font-bold mb-3 text-center">
          {project.title}
        </h1>

        {project.status && (
          <p className="text-sm text-gray-500 mb-8 text-center">
            {project.status}
          </p>
        )}

        {toc.length > 0 && (
          <div
            id="sommaire"
            className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-10"
          >
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
                      item.level === 2 ? "text-brand-accent" : "text-gray-600"
                    }`}
                  >
                    {item.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div
          className="
            prose prose-lg max-w-none
            font-lora text-gray-800 leading-relaxed
            text-left md:text-justify
            prose-img:shadow-md prose-img:mx-auto
            prose-blockquote:italic prose-blockquote:text-gray-600
            prose-blockquote:border-l-4 prose-blockquote:border-brand-primary prose-blockquote:pl-4
            article-body
          "
        >
          <ReactMarkdown
            remarkPlugins={[
              remarkFrontmatter,
              remarkImageOptions,
              remarkGfm,
              remarkLiveTracking,
              remarkPostLiveTracking,
              remarkDirective,
              remarkSplit,
              remarkMath,
            ]}
            rehypePlugins={[
              rehypeSlug,
              rehypeAutolinkHeadings,
              rehypeRaw,
              rehypeKatex,
            ]}
            components={{
              p: ({ children }) => {
                const childArray = React.Children.toArray(children);

                // 1) Live tracking temps réel
                if (
                  childArray.length === 1 &&
                  typeof childArray[0] === "string" &&
                  childArray[0].startsWith("[[LIVE_TRACKING_BLOCK")
                ) {
                  const text = childArray[0];
                  let props = {};

                  if (text.startsWith("[[LIVE_TRACKING_BLOCK|")) {
                    const jsonPart = text
                      .replace("[[LIVE_TRACKING_BLOCK|", "")
                      .replace("]]", "");

                    try {
                      props = JSON.parse(jsonPart);
                    } catch (e) {
                      console.error("JSON LiveTracking invalide :", e);
                    }
                  }

                  return (
                    <figure className="lt-figure my-8 -mx-4">
                      <LiveTracking {...props} />
                    </figure>
                  );
                }

                // 2) Replay PostLiveTracking
                if (
                  childArray.length === 1 &&
                  typeof childArray[0] === "string" &&
                  childArray[0].startsWith("[[POST_LIVE_TRACKING_BLOCK|")
                ) {
                  const text = childArray[0];
                  const jsonPart = text
                    .replace("[[POST_LIVE_TRACKING_BLOCK|", "")
                    .replace("]]", "");

                  let props = {};
                  try {
                    props = JSON.parse(jsonPart);
                  } catch (e) {
                    console.error("JSON PostLiveTracking invalide :", e);
                  }

                  return (
                    <figure className="lt-figure my-8 -mx-4">
                      <PostLiveTracking {...props} />
                    </figure>
                  );
                }

                // 3) paragraphe qui ne contient QU’UN lien .gpx
                const onlyChild = childArray[0];
                const gpxLinkOnly =
                  childArray.length === 1 &&
                  React.isValidElement(onlyChild) &&
                  typeof onlyChild.props?.href === "string" &&
                  onlyChild.props.href.endsWith(".gpx");

                if (gpxLinkOnly) {
                  return <div className="map-block">{children}</div>;
                }

                // 4) légende markdown : paragraphe ne contenant qu’un <em>
                const emOnly =
                  childArray.length === 1 &&
                  React.isValidElement(onlyChild) &&
                  onlyChild.type === "em";

                if (emOnly) {
                  const text = React.Children.toArray(onlyChild.props?.children)
                    .map((c) => (typeof c === "string" ? c : ""))
                    .join("")
                    .trim();

                  const looksLikeDate =
                    /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text) ||
                    /^\d{4}-\d{2}-\d{2}$/.test(text);

                  if (!looksLikeDate) {
                    return <p className="md-caption">{children}</p>;
                  }
                }

                return <p>{children}</p>;
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
                    className="font-semibold hover:underline cursor-pointer"
                    target={isExternal ? "_blank" : undefined}
                    rel={isExternal ? "noopener noreferrer" : undefined}
                  >
                    {children}
                  </a>
                );
              },

              code: ({ inline, className, children, ...props }) => {
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

              citation: Citation,
            }}
          >
            {content}
          </ReactMarkdown>
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/projets"
            className="inline-block bg-brand-accent text-white font-semibold px-6 py-3 rounded-full shadow hover:bg-brand-primary/90 transition"
          >
            Retour aux projets
          </Link>
        </div>
      </div>
    </article>
  );
}