// components/ProjetBody.jsx
//
// Server Component : tout le rendu markdown (titres, texte, légendes, split…)
// est calculé au build. Les blocs vraiment interactifs (MapEmbed, LiveTracking,
// PostLiveTracking, Tooltip via Citation) restent en client components mais
// sont insérés en place par react-markdown au moment du SSR.
// Le TOC est calculé côté serveur via lib/extractToc.

import React from "react";
import Link from "next/link";
import Image from "next/image";
import ReactMarkdown from "react-markdown";

import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkMath from "remark-math";
import remarkSplit from "@/markdown/remarkSplit";
import remarkImageOptions from "@/markdown/remarkImageOptions";
import remarkLiveTracking from "@/markdown/remarkLiveTracking";
import remarkPostLiveTracking from "@/markdown/remarkPostLiveTracking";
import remarkPlot from "@/markdown/remarkPlot";
import remarkCitations from "@/markdown/remarkCitations";

import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";

import { createCitation } from "./Citation";
import CitationReferences from "./CitationReferences";
import { getUsedCitations } from "@/lib/getUsedCitations";
import MapEmbed from "./MapEmbedLazy";
import LiveTracking from "./LiveTrackingLazy";
import PostLiveTracking from "./PostLiveTrackingLazy";
import Plot from "./PlotLazy";

import { extractToc } from "@/lib/extractToc";
import ProjetClientFx from "./ProjetClientFx";
import ArticleNav from "./ArticleNav";

export default function ProjetBody({
  project,
  initialContent,
  related = [],
}) {
  if (!project) return <p className="p-6">Projet non trouvé</p>;

  const raw = initialContent || "";
  const toc = extractToc(raw);
  const usedCitations = getUsedCitations(raw);
  const Citation = createCitation(usedCitations);

  // Conversion {{cite:ID}} → <citation id="ID"></citation> AVANT le parsing
  // markdown : sinon `remark-directive` interprète le `:ID` comme une
  // directive texte et casse la citation.
  let content = raw.replace(
    /\{\{cite:([\w-]+)\}\}/g,
    '<citation id="$1"></citation>'
  );

  // Conversion {{fig:NOM}} → [fig. N](#fig-N), AUSSI avant le parsing
  // markdown pour la même raison (remark-directive bouffe le `:NOM`).
  // On scanne les <plot name="..."> dans l'ordre d'apparition pour
  // attribuer le numéro, puis on substitue chaque référence.
  const figNameToIndex = new Map();
  const plotTags = content.matchAll(/<plot\b[^>]*>/gi);
  let figIdx = 0;
  for (const m of plotTags) {
    figIdx += 1;
    const nameMatch = m[0].match(/name="([\w-]+)"/);
    if (nameMatch) figNameToIndex.set(nameMatch[1], figIdx);
  }
  content = content.replace(/\{\{fig:([\w-]+)\}\}/g, (full, name) => {
    const n = figNameToIndex.get(name);
    if (n === undefined) {
      console.warn(`[ProjetBody] Référence figure inconnue : ${name}`);
      return full;
    }
    return `[fig. ${n}](#fig-${n})`;
  });

  return (
    <article className="max-w-4xl mx-auto sm:px-6 lg:px-8 pt-0 pb-10 sm:py-10">
      <ProjetClientFx />

      {project.cover && (
        <div className="sm:-mx-6 lg:-mx-8 mb-6 overflow-hidden rounded-none sm:rounded-2xl shadow-card">
          <Image
            src={project.cover}
            alt={project.title}
            width={1600}
            height={900}
            priority
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1024px"
            className="block w-full h-auto"
          />
        </div>
      )}

      <div className="bg-white rounded-xl shadow-card p-4 sm:p-6 md:p-10">
        {/* Titre à la convention des pages (bleu profond), centré ; auteur
            et date comme avant, juste dessous ; liseré ocre en séparateur. */}
        <h1 className="text-3xl text-brand-slate-dark md:text-5xl font-heading font-bold mb-3 text-center">
          {project.title}
        </h1>
        {(project.date || project.author) && (
          <div className="text-sm text-gray-500 mb-5 text-center">
            {project.author && (
              <p>
                Par{" "}
                <Link
                  href="/about"
                  className="font-bold text-brand-deep hover:text-brand-accent hover:underline"
                >
                  {project.author}
                </Link>
              </p>
            )}
            {project.date && (
              <p>
                Le{" "}
                <time dateTime={new Date(project.date).toISOString()}>
                  {new Date(project.date).toLocaleDateString("fr-FR")}
                </time>
              </p>
            )}
          </div>
        )}
        <div
          className="mx-auto mb-8 h-[3px] w-16 rounded-full bg-brand-accent"
          aria-hidden="true"
        />

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
              remarkPlot,
              remarkCitations,
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

                // 3) Bloc Plot (Plotly)
                if (
                  childArray.length === 1 &&
                  typeof childArray[0] === "string" &&
                  childArray[0].startsWith("[[PLOT_BLOCK|")
                ) {
                  const text = childArray[0];
                  const jsonPart = text
                    .replace("[[PLOT_BLOCK|", "")
                    .replace("]]", "");

                  let parsed = {};
                  try {
                    parsed = JSON.parse(jsonPart);
                  } catch (e) {
                    console.error("JSON Plot invalide :", e);
                  }
                  const { index: figIndex, ...plotProps } = parsed;

                  return (
                    <figure
                      id={figIndex ? `fig-${figIndex}` : undefined}
                      className="plot-figure"
                    >
                      <Plot {...plotProps} />
                    </figure>
                  );
                }

                // 4) paragraphe qui ne contient QU’UN lien .gpx
                const onlyChild = childArray[0];
                const gpxLinkOnly =
                  childArray.length === 1 &&
                  React.isValidElement(onlyChild) &&
                  typeof onlyChild.props?.href === "string" &&
                  onlyChild.props.href.endsWith(".gpx");

                if (gpxLinkOnly) {
                  return <div className="map-block">{children}</div>;
                }

                // 5) légende markdown : paragraphe ne contenant qu’un <em>
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

        <CitationReferences ids={usedCitations} />

        <ArticleNav items={related} kind="projet" />

        <div className="mt-12 text-center">
          <Link
            href="/explorer"
            className="inline-block bg-brand-accent text-white font-semibold px-6 py-3 rounded-full shadow hover:bg-brand-primary-dark transition"
          >
            Retour à Explorer
          </Link>
        </div>
      </div>
    </article>
  );
}
