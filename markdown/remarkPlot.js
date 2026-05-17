import { visit } from "unist-util-visit";

/**
 * Pipeline en trois passes :
 *
 * 1) Indexation : on parcourt l'arbre, on numérote chaque <plot> dans l'ordre
 *    d'apparition (1, 2, 3…) et on construit une map name → numéro.
 *
 * 2) Transformation : chaque <plot src="..." height="..." name="..." />
 *    devient un paragraphe texte [[PLOT_BLOCK|{...,"index":N}]]. Si une
 *    légende italique suit immédiatement le plot, on y injecte
 *    " — **fig. N**".
 *
 * 3) Références : toute occurrence {{fig:nom}} dans le texte est remplacée
 *    par un lien markdown [fig. N](#fig-N). Référence inconnue → laissée
 *    en l'état avec un warning console (côté SSR).
 *
 * Côté ProjetBody, le numéro est posé en `id="fig-N"` sur la <figure>,
 * ce qui permet l'ancre.
 */

const PLOT_TAG_RE = /^<plot\b/i;
const ATTR_RE = /(\w+)="([^"]*)"/g;
const FIG_REF_RE = /\{\{fig:([\w-]+)\}\}/g;

function parseAttrs(raw) {
  ATTR_RE.lastIndex = 0;
  const attrs = {};
  let match;
  while ((match = ATTR_RE.exec(raw)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

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
    if (node.type === "html" && /^\s*$/.test(node.value || "")) continue;
    break;
  }
  return null;
}

export default function remarkPlot() {
  return (tree) => {
    // ─── Passe 1 : indexation ─────────────────────────────────────
    const nameToIndex = new Map();
    let plotCount = 0;
    const plotNodes = [];

    visit(tree, "html", (node, index, parent) => {
      if (!node.value || !parent || typeof index !== "number") return;
      const raw = node.value.trim();
      if (!PLOT_TAG_RE.test(raw)) return;
      plotCount += 1;
      const attrs = parseAttrs(raw);
      if (attrs.name) nameToIndex.set(attrs.name, plotCount);
      plotNodes.push({ node, index, parent, attrs, figNum: plotCount });
    });

    // ─── Passe 2 : transformation des <plot> ──────────────────────
    for (const { node, index, parent, attrs, figNum } of plotNodes) {
      const payload = {
        src: attrs.src || "",
        height: attrs.height ? Number(attrs.height) : undefined,
        index: figNum,
      };

      // On reprend le pointeur car d'autres remplacements ont pu se faire
      // au-dessus, mais comme on a stocké le parent et qu'on ne fait que
      // remplacer un nœud par un autre (1:1), l'index reste valide.
      parent.children[index] = {
        type: "paragraph",
        children: [
          {
            type: "text",
            value: "[[PLOT_BLOCK|" + JSON.stringify(payload) + "]]",
          },
        ],
      };

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
      // Mark unused destructure
      void node;
    }

    // ─── Passe 3 : résolution des {{fig:nom}} ─────────────────────
    if (nameToIndex.size === 0) return;

    visit(tree, "text", (textNode, idx, parent) => {
      if (!parent || typeof idx !== "number") return;
      if (!textNode.value || !textNode.value.includes("{{fig:")) return;

      FIG_REF_RE.lastIndex = 0;
      const parts = [];
      let cursor = 0;
      let m;

      while ((m = FIG_REF_RE.exec(textNode.value)) !== null) {
        const [matched, name] = m;
        if (m.index > cursor) {
          parts.push({
            type: "text",
            value: textNode.value.slice(cursor, m.index),
          });
        }
        const num = nameToIndex.get(name);
        if (num !== undefined) {
          parts.push({
            type: "link",
            url: `#fig-${num}`,
            children: [{ type: "text", value: `fig. ${num}` }],
          });
        } else {
          if (typeof console !== "undefined") {
            console.warn(`[remarkPlot] Référence figure inconnue : ${name}`);
          }
          parts.push({ type: "text", value: matched });
        }
        cursor = m.index + matched.length;
      }

      if (parts.length === 0) return;
      if (cursor < textNode.value.length) {
        parts.push({ type: "text", value: textNode.value.slice(cursor) });
      }

      parent.children.splice(idx, 1, ...parts);
      return idx + parts.length;
    });
  };
}
