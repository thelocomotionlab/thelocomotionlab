import { visit } from "unist-util-visit";

/**
 * Transforme :
 * <livetracking apiBase="..." referenceGpx="..." ... />
 *
 * en un paragraphe texte :
 * [[LIVE_TRACKING_BLOCK|{"apiBase":"...","referenceGpx":"...",...}]]
 *
 * pour que ReactMarkdown puisse rendre <LiveTracking {...props} />.
 *
 * Rétrocompatibilité conservée :
 * <livetracking />
 * -> [[LIVE_TRACKING_BLOCK]]
 */
export default function remarkLiveTracking() {
  return (tree) => {
    visit(tree, "html", (node, index, parent) => {
      if (!node.value || !parent) return;

      const raw = node.value.trim();
      const rawLower = raw.toLowerCase();

      if (!rawLower.startsWith("<livetracking")) return;

      // Cas simple rétrocompatible : <livetracking /> ou <livetracking>
      if (rawLower === "<livetracking />" || rawLower === "<livetracking>") {
        parent.children[index] = {
          type: "paragraph",
          children: [{ type: "text", value: "[[LIVE_TRACKING_BLOCK]]" }],
        };
        return;
      }

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
        apiBase: attrs.apiBase || attrs.apibase || "",
        positionsEndpoint:
          attrs.positionsEndpoint || attrs.positionsendpoint || "",
        statsEndpoint: attrs.statsEndpoint || attrs.statsendpoint || "",
        timerEndpoint: attrs.timerEndpoint || attrs.timerendpoint || "",
        totalDistanceKm:
          attrs.totalDistanceKm ||
          attrs.totaldistancekm ||
          attrs.totalDistance ||
          attrs.totaldistance ||
          "",
        elevationMax: attrs.elevationMax || attrs.elevationmax || "",
        referenceGpx: attrs.referenceGpx || attrs.referencegpx || "",
        title: attrs.title || "",
        pollIntervalMs:
          attrs.pollIntervalMs || attrs.pollintervalms || "",
        initialMapStyle:
          attrs.initialMapStyle || attrs.initialmapstyle || "",
      };

      parent.children[index] = {
        type: "paragraph",
        children: [
          {
            type: "text",
            value:
              "[[LIVE_TRACKING_BLOCK|" + JSON.stringify(payload) + "]]",
          },
        ],
      };
    });
  };
}