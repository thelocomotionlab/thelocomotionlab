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
 * <livetracking apiBase="..." referenceGpx="..." ... />
 *
 * en un paragraphe texte :
 * [[LIVE_TRACKING_BLOCK|{"apiBase":"...","referenceGpx":"...",...}]]
 *
 * et si le paragraphe suivant est uniquement en italique,
 * il est converti en :
 * [[MD_CAPTION|...]]
 *
 * Rétrocompatibilité conservée :
 * <livetracking />
 * -> [[LIVE_TRACKING_BLOCK]]
 */
export default function remarkLiveTracking() {
  return (tree) => {
    visit(tree, "html", (node, index, parent) => {
      if (!node.value || !parent || typeof index !== "number") return;

      const raw = node.value.trim();
      const rawLower = raw.toLowerCase();

      if (!rawLower.startsWith("<livetracking")) return;

      let payloadValue = "[[LIVE_TRACKING_BLOCK]]";

      if (!(rawLower === "<livetracking />" || rawLower === "<livetracking>")) {
        const attrRegex = /(\w+)="([^"]*)"/g;
        const attrs = {};
        let match;

        while ((match = attrRegex.exec(raw)) !== null) {
          const key = match[1];
          const value = match[2];
          attrs[key] = value;
        }

        const payload = {
          apiBase: attrs.apiBase || attrs.apibase || "",
          positionsEndpoint:
            attrs.positionsEndpoint || attrs.positionsendpoint || "",
          totalDistanceKm:
            attrs.totalDistanceKm ||
            attrs.totaldistancekm ||
            attrs.totalDistance ||
            attrs.totaldistance ||
            "",
          elevationMin: attrs.elevationMin || attrs.elevationmin || "",
          elevationMax: attrs.elevationMax || attrs.elevationmax || "",
          referenceGpx: attrs.referenceGpx || attrs.referencegpx || "",
          title: attrs.title || "",
          pollIntervalMs: attrs.pollIntervalMs || attrs.pollintervalms || "",
          initialMapStyle:
            attrs.initialMapStyle || attrs.initialmapstyle || "",
          mapHeight: attrs.mapHeight || attrs.mapheight || "",
        };

        payloadValue =
          "[[LIVE_TRACKING_BLOCK|" + JSON.stringify(payload) + "]]";
      }

      parent.children[index] = {
        type: "paragraph",
        children: [{ type: "text", value: payloadValue }],
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