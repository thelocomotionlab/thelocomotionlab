// packages/tracking/src/fonds.ts
//
// LES TROIS FONDS DE CARTE DU LABO — leurs tuiles, leur attribution, leur zoom
// maximal. Rien d'autre : ce module ne dépend d'AUCUN moteur de carte.
//
// C'est ce qui lui permet d'être lu des deux côtés. `mapStyles.ts` en fait des
// styles maplibre pour le direct et les replays ; le studio en fait une mosaïque
// dessinée sur un canvas 2D. Deux rendus, un seul jeu d'adresses — sans quoi
// « Relief » finirait par ne pas désigner la même chose selon l'écran.

/** Identifiants canoniques des fonds. */
export type NomDeFond = "relief" | "topo" | "sat";

export type Fond = {
  cle: NomDeFond;
  label: string;
  /** Les gabarits d'URL, `{z}` `{x}` `{y}`. Plusieurs = sous-domaines. */
  tuiles: string[];
  attribution: string;
  zoomMax: number;
};

export const FONDS: Record<NomDeFond, Fond> = {
  relief: {
    cle: "relief",
    label: "Relief",
    tuiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles © Esri — Esri, HERE, Garmin, FAO, NOAA, USGS",
    zoomMax: 19,
  },
  topo: {
    cle: "topo",
    label: "Topo",
    tuiles: [
      "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
      "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
      "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
    ],
    attribution: "© OpenTopoMap",
    zoomMax: 17,
  },
  sat: {
    cle: "sat",
    label: "Satellite",
    tuiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles © Esri",
    zoomMax: 19,
  },
};

/**
 * L'adresse d'une tuile.
 *
 * Le sous-domaine est choisi par la tuile elle-même, pas au hasard : deux rendus
 * de la même carte demandent alors les mêmes URL, et le cache du navigateur
 * sert la seconde fois. Un tirage aléatoire ferait retélécharger la mosaïque à
 * chaque image d'un export vidéo.
 */
export function urlDeTuile(fond: Fond, z: number, x: number, y: number): string {
  const gabarit = fond.tuiles[Math.abs(x + y) % fond.tuiles.length]!;
  return gabarit
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}
