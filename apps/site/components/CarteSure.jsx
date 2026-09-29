// components/CarteSure.jsx
//
// Monte une carte maplibre sans mettre la page en jeu. Sans WebGL, la carte
// n'est pas montée du tout ; si elle lève quand même en se construisant (un
// contexte refusé malgré la sonde), la garde l'attrape. Dans les deux cas,
// seule la zone de la carte est remplacée par un repli, le reste de la page
// s'affiche.
//
// Les erreurs levées dans un useEffect remontent jusqu'à la garde ; celles
// d'un callback asynchrone (requestAnimationFrame, événement maplibre) non —
// d'où la sonde avant montage, qui couvre le cas le plus courant.

"use client";

import { Component, useSyncExternalStore } from "react";

import { webglDisponible } from "@/lib/webgl";

const sansAbonnement = () => () => {};

class Garde extends Component {
  constructor(props) {
    super(props);
    this.state = { echec: false };
  }

  static getDerivedStateFromError() {
    return { echec: true };
  }

  componentDidCatch(erreur) {
    console.warn("Carte non affichée :", erreur);
  }

  render() {
    return this.state.echec ? this.props.repli("echec") : this.props.children;
  }
}

const MESSAGES = {
  webgl: "Ton navigateur ne peut pas afficher la carte : WebGL y est indisponible ou désactivé.",
  echec: "La carte n'a pas pu s'afficher sur ce navigateur.",
};

function Repli({ raison, gpx, plein }) {
  return (
    <div
      role="note"
      className={`${plein ? "absolute inset-0" : "min-h-40 w-full rounded-lg"} flex flex-col items-center justify-center gap-2 bg-brand-grid/40 px-6 py-8 text-center text-sm text-brand-muted`}
    >
      <p className="m-0">{MESSAGES[raison]}</p>
      {gpx && (
        <a
          href={gpx}
          download
          className="font-semibold text-brand-deep-dark underline underline-offset-2"
        >
          Télécharger la trace GPX
        </a>
      )}
    </div>
  );
}

/**
 * `gpx` : trace proposée en téléchargement à la place de la carte.
 * `plein` : le repli remplit son parent positionné (cartes du direct).
 */
export default function CarteSure({ children, gpx, plein = false }) {
  // null côté serveur et pendant l'hydratation : la carte, chargée en
  // ssr:false, n'y rend de toute façon que son squelette de chargement.
  const webgl = useSyncExternalStore(sansAbonnement, webglDisponible, () => null);
  const repli = (raison) => <Repli raison={raison} gpx={gpx} plein={plein} />;

  if (webgl === false) return repli("webgl");
  return <Garde repli={repli}>{children}</Garde>;
}
