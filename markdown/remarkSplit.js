import { visit } from "unist-util-visit";

/**
 * :::split
 * contenu colonne gauche
 *
 * ---
 *
 * contenu colonne droite
 * :::
 */
export default function remarkSplit() {
  return (tree) => {
    visit(
      tree,
      (node) => node.type === "containerDirective" && node.name === "split",
      (node) => {
        const cut = node.children.findIndex(
          (c) => c.type === "thematicBreak"
        );
        const leftChildren =
          cut === -1 ? node.children : node.children.slice(0, cut);
        const rightChildren =
          cut === -1 ? [] : node.children.slice(cut + 1);

        node.type = "containerDirective";
        node.data = {
          hName: "div",
          hProperties: { className: ["md-split"] },
        };

        const leftDiv = {
          type: "containerDirective",
          data: {
            hName: "div",
            hProperties: { className: ["md-split-col", "left"] },
          },
          children: leftChildren,
        };

        const rightDiv = {
          type: "containerDirective",
          data: {
            hName: "div",
            hProperties: { className: ["md-split-col", "right"] },
          },
          children: rightChildren,
        };

        node.children = [leftDiv, rightDiv];
      }
    );
  };
}
