import { visit } from "unist-util-visit";

function getSingleEmphasisText(node) {
  if (!node || node.type !== "paragraph" || !Array.isArray(node.children)) {
    return null;
  }

  if (node.children.length !== 1) return null;

  const onlyChild = node.children[0];
  if (!onlyChild || onlyChild.type !== "emphasis") return null;
  if (!Array.isArray(onlyChild.children) || onlyChild.children.length !== 1) {
    return null;
  }

  const textNode = onlyChild.children[0];
  if (!textNode || textNode.type !== "text") return null;

  const value = (textNode.value || "").trim();
  return value || null;
}

/**
 * Transforme :
 * <postlivetracking positions="..." stats="..." ... />
 *
 * en un paragraphe texte :
 * [[POST_LIVE_TRACKING_BLOCK|{"positionsUrl":"...","statsUrl":"...",...}]]
 *
 * et si le paragraphe suivant est uniquement en italique,
 * il est converti en :
 * [[MD_CAPTION|...]]
 *
 * que ReactMarkdown saura convertir dans ProjetClient.
 */
export default function remarkPostLiveTracking() {
  return (tree) => {
    visit(tree, "html", (node, index, parent) => {
      if (!node.value || !parent || typeof index !== "number") return;

      const raw = node.value.trim();
      const rawLower = raw.toLowerCase();
      if (!rawLower.startsWith("<postlivetracking")) return;

      // Récupération des attributs
      const attrRegex = /(\w+)="([^"]*)"/g;
      const attrs = {};
      let match;

      while ((match = attrRegex.exec(raw)) !== null) {
        const key = match[1];
        const value = match[2];
        attrs[key] = value;
      }

      const payload = {
        positionsUrl: attrs.positions || "",
        statsUrl: attrs.stats || "",
        totalDistanceKm: attrs.totalDistance || attrs.totaldistance || "",
        distanceFactor: attrs.distanceFactor || attrs.distancefactor || "",
        ascentFactor: attrs.ascentFactor || attrs.ascentfactor || "",
        descentFactor: attrs.descentFactor || attrs.descentfactor || "",
        elevationMax: attrs.elevationMax || attrs.elevationmax || "",
        referenceGpx: attrs.referenceGpx || attrs.referencegpx || "",
        mapHeight: attrs.mapHeight || attrs.mapheight || "",
        title: attrs.title || "",
      };

      parent.children[index] = {
        type: "paragraph",
        children: [
          {
            type: "text",
            value:
              "[[POST_LIVE_TRACKING_BLOCK|" +
              JSON.stringify(payload) +
              "]]",
          },
        ],
      };

      const nextNode = parent.children[index + 1];
      const captionText = getSingleEmphasisText(nextNode);

      if (captionText) {
        parent.children[index + 1] = {
          type: "paragraph",
          children: [{ type: "text", value: `[[MD_CAPTION|${captionText}]]` }],
        };
      }
    });
  };
}