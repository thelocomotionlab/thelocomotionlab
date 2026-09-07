// components/contenu/Prose.jsx
//
// UN SEGMENT DE PROSE D'UNE PAGE DE CONTENU.
//
// Rendu au build, dans un composant serveur : le HTML part complet dans la
// réponse. Les blocs Note et Protocole ne passent pas par ici — ils sont
// découpés en amont (cf. Corps.jsx), pour qu'une balise à cheval sur plusieurs
// paragraphes ne dépende pas du parseur Markdown.

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFootnotes from "remark-footnotes";
import remarkDirective from "remark-directive";
import remarkMath from "remark-math";
import remarkCitations from "@/markdown/remarkCitations";
import remarkSplit from "@/markdown/remarkSplit";
import remarkImageOptions from "@/markdown/remarkImageOptions";
import remarkPlot from "@/markdown/remarkPlot";
import rehypeSlug from "rehype-slug";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";

import PlotLazy from "@/components/PlotLazy";

const PLUGINS_REMARK = [
  remarkGfm,
  remarkImageOptions,
  remarkPlot,
  [remarkFootnotes, { inlineNotes: true }],
  remarkCitations,
  remarkDirective,
  remarkSplit,
  remarkMath,
];

const PLUGINS_REHYPE = [rehypeSlug, rehypeRaw, rehypeKatex];

const LIEN =
  "font-semibold text-brand-deep-dark underline underline-offset-2 decoration-brand-accent-dark/60 hover:decoration-brand-accent-dark";

/**
 * Les deux syntaxes qui doivent disparaître AVANT le parsing : remark-directive
 * lit le `:` de `{{cite:…}}` et de `{{fig:…}}` comme une directive.
 */
function preparer(texte) {
  const avecCitations = texte.replace(/\{\{cite:([\w-]+)\}\}/g, '<citation id="$1"></citation>');

  const numeros = new Map();
  let rang = 0;
  for (const balise of avecCitations.matchAll(/<plot\b[^>]*>/gi)) {
    rang += 1;
    const nom = balise[0].match(/name="([\w-]+)"/);
    if (nom) numeros.set(nom[1], rang);
  }

  return avecCitations.replace(/\{\{fig:([\w-]+)\}\}/g, (entier, nom) => {
    const numero = numeros.get(nom);
    return numero === undefined ? entier : `[fig. ${numero}](#fig-${numero})`;
  });
}

// La mesure du corps. `lecture` est celle d'une page ; `herite` laisse le
// conteneur décider — c'est ce qu'il faut à l'intérieur d'un bloc Note ou
// Protocole, qui pose déjà sa propre échelle.
const MESURES = {
  lecture: "text-lecture leading-lecture font-lecture",
  herite: "leading-relaxed",
};

export default function Prose({ texte, citation, taille = "lecture", className = "" }) {
  if (!texte || texte.trim() === "") return null;

  return (
    <div className={`prose article-body max-w-none font-sans ${MESURES[taille]} ${className}`}>
      <ReactMarkdown
        remarkPlugins={PLUGINS_REMARK}
        rehypePlugins={PLUGINS_REHYPE}
        components={{
          citation,
          p: ({ children }) => {
            const enfants = React.Children.toArray(children);
            const premier = enfants[0];

            // Un plot seul dans son paragraphe devient la figure : un <div>
            // dans un <p> est du HTML que React refuse à l'hydratation.
            if (
              enfants.length === 1 &&
              typeof premier === "string" &&
              premier.startsWith("[[PLOT_BLOCK|")
            ) {
              let props = {};
              try {
                props = JSON.parse(premier.replace("[[PLOT_BLOCK|", "").replace("]]", ""));
              } catch {
                return null;
              }
              const { index, ...reste } = props;
              return (
                <figure id={`fig-${index}`} className="my-8 scroll-mt-24">
                  <PlotLazy {...reste} />
                </figure>
              );
            }

            return <p>{children}</p>;
          },
          a: ({ node, ...props }) => {
            if (props.href && props.href.startsWith("#")) {
              return <a {...props} className={`${LIEN} cursor-pointer`} />;
            }
            return <a {...props} target="_blank" rel="noopener noreferrer" className={LIEN} />;
          },
        }}
      >
        {preparer(texte)}
      </ReactMarkdown>
    </div>
  );
}
