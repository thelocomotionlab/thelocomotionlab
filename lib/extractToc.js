// lib/extractToc.js
//
// Extraction du sommaire (h2/h3) à partir d'un markdown brut.
// Fonction serveur (pas de hook) — équivalent à l'ancien hooks/useTocFromMarkdown.js.
// Les slugs suivent l'algorithme GitHub utilisé par rehype-slug (github-slugger)
// pour rester cohérent avec les IDs réellement posés sur les titres lors du rendu.

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import { visit } from "unist-util-visit";

function extractText(node) {
  let text = "";
  visit(node, (child) => {
    if (child.type === "text") text += child.value;
    if (child.type === "inlineCode") text += child.value;
  });
  return text.trim();
}

function baseSlug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function makeUniqueSlug(slug, seen) {
  const count = seen.get(slug) || 0;
  seen.set(slug, count + 1);
  if (count === 0) return slug;
  return `${slug}-${count}`;
}

export function extractToc(markdown = "") {
  if (!markdown) return [];

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
    headings.push({ id, text, level: node.depth });
  });

  return headings;
}
