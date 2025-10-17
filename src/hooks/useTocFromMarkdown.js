import { useEffect, useState } from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import { visit } from "unist-util-visit";

/**
 * Analyse un contenu Markdown et renvoie un tableau d'entrées :
 * [{ id, text, level }]
 */
export default function useTocFromMarkdown(markdown = "") {
  const [toc, setToc] = useState([]);

  useEffect(() => {
    const tree = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]).parse(markdown);

    const headings = [];
    visit(tree, "heading", (node) => {
      if (node.depth >= 2 && node.depth <= 3) {
        const text = node.children.map((c) => c.value || "").join("");
        // crée un id "propre"
        const id = text
          .toLowerCase()
          .replace(/[^a-z0-9àâäéèêëîïôöùûüç\s-]/gi, "")
          .trim()
          .replace(/\s+/g, "-");
        headings.push({ id, text, level: node.depth });
      }
    });
    setToc(headings);
  }, [markdown]);

  return toc;
}
