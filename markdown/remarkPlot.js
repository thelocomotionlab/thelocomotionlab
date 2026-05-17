import { visit } from "unist-util-visit";

/**
 * Transforme :
 * <plot src="/data/plots/xxx.json" height="420" />
 *
 * en un paragraphe texte :
 * [[PLOT_BLOCK|{"src":"/data/plots/xxx.json","height":420,"index":1}]]
 *
 * Numérotation automatique : chaque <plot> du document reçoit un index
 * incrémental (1, 2, 3…). Si une légende en italique suit immédiatement
 * le plot, on y injecte " — **fig. N**" pour permettre la référence depuis
 * le texte via [fig. 1](#fig-1).
 *
 * Le composant Plot (client) charge le JSON et le passe à Plotly.
 * Le format du JSON suit l'API Plotly :
 *   { "data": [...traces...], "layout": {...}, "config": {...} }
 */
function findNextItalicCaption(parent, startIndex) {
  for (let i = startIndex + 1; i < parent.children.length; i++) {
    const node = parent.children[i];
    if (!node) continue;
    if (
      node.type === "paragraph" &&
      Array.isArray(node.children) &&
      node.children.length === 1 &&
      node.children[0]?.type === "emphasis"
    ) {
      return node.children[0];
    }
    // Tolère les nœuds vides/whitespace, sinon on s'arrête
    if (node.type === "html" && /^\s*$/.test(node.value || "")) continue;
    break;
  }
  return null;
}

export default function remarkPlot() {
  return (tree) => {
    let plotCount = 0;

    visit(tree, "html", (node, index, parent) => {
      if (!node.value || !parent || typeof index !== "number") return;

      const raw = node.value.trim();
      if (!raw.toLowerCase().startsWith("<plot")) return;

      plotCount += 1;
      const figNum = plotCount;

      const attrRegex = /(\w+)="([^"]*)"/g;
      const attrs = {};
      let match;
      while ((match = attrRegex.exec(raw)) !== null) {
        attrs[match[1]] = match[2];
      }

      const payload = {
        src: attrs.src || "",
        height: attrs.height ? Number(attrs.height) : undefined,
        index: figNum,
      };

      parent.children[index] = {
        type: "paragraph",
        children: [
          {
            type: "text",
            value: "[[PLOT_BLOCK|" + JSON.stringify(payload) + "]]",
          },
        ],
      };

      // Injection du tag " — **fig. N**" dans la légende italique suivante
      const emphasis = findNextItalicCaption(parent, index);
      if (emphasis) {
        emphasis.children.push(
          { type: "text", value: " — " },
          {
            type: "strong",
            children: [{ type: "text", value: `fig. ${figNum}` }],
          }
        );
      }
    });
  };
}
