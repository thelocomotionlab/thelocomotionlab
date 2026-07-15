import { visit } from "unist-util-visit";

/**
 * Transforme :
 * <livetracking apiBase="..." referenceGpx="..." ... />
 *
 * en un paragraphe texte :
 * [[LIVE_TRACKING_BLOCK|{"apiBase":"...","referenceGpx":"...",...}]]
 *
 * Un éventuel paragraphe-légende en italique qui suit la directive reste un
 * paragraphe markdown normal : c'est le chemin « légende » de ProjetBody qui
 * le style. (L'ancien marqueur [[MD_CAPTION|…]] n'avait plus aucun
 * consommateur et se serait affiché littéralement.)
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
    });
  };
}