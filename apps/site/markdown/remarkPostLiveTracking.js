import { visit } from "unist-util-visit";

/**
 * Transforme :
 * <postlivetracking positions="..." stats="..." ... />
 *
 * en un paragraphe texte :
 * [[POST_LIVE_TRACKING_BLOCK|{"positionsUrl":"...","statsUrl":"...",...}]]
 *
 * Un éventuel paragraphe-légende en italique qui suit la directive reste un
 * paragraphe markdown normal : c'est le chemin « légende » de ProjetBody qui
 * le style. (L'ancien marqueur [[MD_CAPTION|…]] n'avait plus aucun
 * consommateur et se serait affiché littéralement.)
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
        elevationMin: attrs.elevationMin || attrs.elevationmin || "",
        elevationMax: attrs.elevationMax || attrs.elevationmax || "",
        referenceGpx: attrs.referenceGpx || attrs.referencegpx || "",
        mapHeight: attrs.mapHeight || attrs.mapheight || "",
        title: attrs.title || "",
        // Fond de départ : relief | topo | sat (« osm » et « satellite »
        // restent compris). Absent → relief.
        initialMapStyle: attrs.initialMapStyle || attrs.initialmapstyle || "",
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