import { useEffect, useState } from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import { visit } from "unist-util-visit";

/** Extraction fiable du texte d'un nœud (compatible emph, strong, code, etc.) */
function extractText(node) {
  let text = "";

  visit(node, (child) => {
    if (child.type === "text") text += child.value;
    if (child.type === "inlineCode") text += child.value;
  });

  return text.trim();
}

/**
 * Slug proche de l'algorithme GitHub (utilisé par rehype-slug via github-slugger).
 * Important : on NE supprime PAS les accents, sinon l'ID ne matche pas celui
 * réellement posé sur les titres (ex: "création-de-la-trace-gpx").
 *
 * - minuscules
 * - retire ponctuation / symboles (mais conserve toutes les lettres Unicode)
 * - espaces → tirets
 */
function baseSlug(text) {
  return String(text)
    .toLowerCase()
    // garde lettres (Unicode), chiffres, espaces et tirets
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Déduplication (GitHub ajoute -1, -2, ...) */
function makeUniqueSlug(slug, seen) {
  const count = seen.get(slug) || 0;
  seen.set(slug, count + 1);
  if (count === 0) return slug;
  return `${slug}-${count}`;
}

/**
 * Analyse un contenu Markdown et renvoie un tableau d'entrées :
 * [{ id, text, level }]
 */
export default function useTocFromMarkdown(markdown = "") {
  const [toc, setToc] = useState([]);

  useEffect(() => {
    if (!markdown) {
      setToc([]);
      return;
    }

    const tree = unified()
      .use(remarkParse)
      .use(remarkFrontmatter, ["yaml"])
      .parse(markdown);

    const headings = [];
    const seen = new Map();

    visit(tree, "heading", (node) => {
      if (node.depth < 2 || node.depth > 3) return;

      const text = extractText(node);
      if (!text) return;

      const id = makeUniqueSlug(baseSlug(text), seen);

      headings.push({
        id,
        text,
        level: node.depth,
      });
    });

    setToc(headings);
  }, [markdown]);

  return toc;
}
