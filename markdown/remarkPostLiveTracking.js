// markdown/remarkPostLiveTracking.js
import { visit } from "unist-util-visit";

/**
 * Transforme :
 * <postlivetracking positions="..." stats="..." ... />
 *
 * en un paragraphe texte :
 * [[POST_LIVE_TRACKING_BLOCK|{"positionsUrl":"...","statsUrl":"...",...}]]
 *
 * que ReactMarkdown saura convertir dans ProjetClient.
 */
export default function remarkPostLiveTracking() {
  return (tree) => {
    visit(tree, "html", (node, index, parent) => {
      if (!node.value || !parent) return;

      const rawLower = node.value.trim().toLowerCase();
      if (!rawLower.startsWith("<postlivetracking")) return;

      // Récupération des attributs
      const attrRegex = /(\w+)="([^"]*)"/g;
      const attrs = {};
      let match;
      while ((match = attrRegex.exec(node.value)) !== null) {
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
    });
  };
}
