// components/live/WaypointPin.jsx
//
// LA PASTILLE D'UN REPÈRE sur une carte : le bivouac, le refuge, le ravito.
//
// Portée dans l'élément qu'un marqueur maplibre positionne, par createPortal —
// d'où les styles en ligne plutôt que des classes : le nœud vit hors de l'arbre
// React du composant qui la rend, et maplibre lui pose ses propres styles.
//
// Partagée par la carte du direct (LiveMap) et par celle d'une trace
// d'aventure (MapEmbed) : un bivouac se reconnaît au même signe partout.

"use client";

import { brandColors } from "@locomotionlab/ui";

export default function WaypointPin({ Icone, nom }) {
  return (
    // `role="img"` + `aria-label` : sur un <span> sans rôle, aria-label n'est
    // pas un nom accessible valide et la plupart des lecteurs d'écran
    // l'ignorent. Sans nom, le repère est purement décoratif.
    <span
      title={nom || undefined}
      role={nom ? "img" : undefined}
      aria-label={nom || undefined}
      aria-hidden={nom ? undefined : "true"}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 26,
        height: 26,
        borderRadius: "50%",
        background: brandColors.bg,
        border: `2px solid ${brandColors.deep}`,
        color: brandColors.deepDark,
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      <Icone size={14} strokeWidth={2.2} aria-hidden="true" />
    </span>
  );
}
