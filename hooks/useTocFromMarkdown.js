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

/** Normalise l'ID exactement comme rehype-slug */
function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")                // sépare accents
    .replace(/[\u0300-\u036f]/g, "") // supprime accents
    .replace(/[^a-z0-9\s-]/g, "")    // garde lettres/chiffres/espace/-
    .trim()
    .replace(/\s+/g, "-");           // espaces → tirets
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

    visit(tree, "heading", (node) => {
      if (node.depth < 2 || node.depth > 3) return;

      const text = extractText(node);
      if (!text) return;

      const id = slugify(text);

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
