// src/markdown/remarkSplit.js
import { visit } from "unist-util-visit";

/**
 * Syntaxe Markdown attendue :
 *
 * :::split
 * Markdown pour la colonne de gauche
 *
 * ---
 *
 * Markdown pour la colonne de droite
 * :::
 *
 * - 'split' = conteneur
 * - '---' = séparation gauche/droite (thématic break)
 * - Sortie : <div class="md-split"><div class="md-split-col left">…</div><div class="md-split-col right">…</div></div>
 */
export default function remarkSplit() {
  return (tree) => {
    visit(tree, (node) => node.type === "containerDirective" && node.name === "split", (node) => {
      // On cherche le premier "thematicBreak" pour séparer gauche/droite
      const cut = node.children.findIndex((c) => c.type === "thematicBreak");
      const leftChildren = cut === -1 ? node.children : node.children.slice(0, cut);
      const rightChildren = cut === -1 ? [] : node.children.slice(cut + 1);

      // Prépare le wrapper principal
      node.type = "containerDirective";
      node.data = {
        hName: "div",
        hProperties: { className: ["md-split"] },
      };

      // Crée 2 colonnes (enfants HAST)
      const leftDiv = {
        type: "containerDirective",
        data: { hName: "div", hProperties: { className: ["md-split-col", "left"] } },
        children: leftChildren,
      };
      const rightDiv = {
        type: "containerDirective",
        data: { hName: "div", hProperties: { className: ["md-split-col", "right"] } },
        children: rightChildren,
      };

      node.children = [leftDiv, rightDiv];
    });
  };
}
