import { visit } from "unist-util-visit";

/**
 * Transforme :
 * <plot src="/data/plots/xxx.json" height="420" />
 *
 * en un paragraphe texte :
 * [[PLOT_BLOCK|{"src":"/data/plots/xxx.json","height":420}]]
 *
 * Le composant Plot (client) charge le JSON et le passe à Plotly.
 * Le format du JSON suit l'API Plotly :
 *   { "data": [...traces...], "layout": {...}, "config": {...} }
 */
export default function remarkPlot() {
  return (tree) => {
    visit(tree, "html", (node, index, parent) => {
      if (!node.value || !parent || typeof index !== "number") return;

      const raw = node.value.trim();
      if (!raw.toLowerCase().startsWith("<plot")) return;

      const attrRegex = /(\w+)="([^"]*)"/g;
      const attrs = {};
      let match;
      while ((match = attrRegex.exec(raw)) !== null) {
        attrs[match[1]] = match[2];
      }

      const payload = {
        src: attrs.src || "",
        height: attrs.height ? Number(attrs.height) : undefined,
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
    });
  };
}
