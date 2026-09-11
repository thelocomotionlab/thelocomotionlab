"use client";

// lib/scene.ts
//
// LA SCÈNE 3D DU SURVOL : un terrain, une trace drapée dessus, un point.
//
// MapLibre fait le gros œuvre — il draine les tuiles d'altitude, bombe le
// maillage et pose les lignes SUR le relief, ce qu'aucun canvas 2D ne sait
// faire. Ce module ne fait que trois choses : monter la scène, lui donner la
// trace, et lui appliquer une prise de caméra.
//
// LA CAMÉRA N'EST PAS CALCULÉE ICI. Elle vient de `@locomotionlab/planche`,
// pure et testée sans WebGL — parce que c'est elle qui décide si la vidéo
// secoue, et qu'on ne débogue pas un tremblement à l'œil. Ici, on applique.
//
// ET ON N'ANIME RIEN. Pas de `flyTo`, pas de transition : chaque image pose la
// caméra exactement où le plan le dit (`jumpTo`). Une animation ferait dépendre
// le résultat de l'horloge de la machine, et l'export image par image ne
// vaudrait plus l'aperçu.

import maplibregl from "maplibre-gl";
import { FONDS, TERRAIN, type NomDeFond } from "@locomotionlab/tracking/fonds";
import { brandColors } from "@locomotionlab/ui/tokens";
import type { Coord } from "@locomotionlab/trace";
import type { Prise, Scene } from "@locomotionlab/planche";

const SOURCE_TERRAIN = "relief";
const SOURCE_IMAGERIE = "imagerie";
const SOURCE_TRACE = "trace";
const SOURCE_POINT = "point";

/** Le fond de la scène, quand la carte n'en a pas — l'aplat sombre de la charte. */
const APLAT = "#1A1C18";

/** La correspondance entre le fond choisi et le fond de tuiles du dépôt. */
const IMAGERIE: Record<Exclude<Scene["fond"], "aucun">, NomDeFond> = {
  satellite: "sat",
  relief: "relief",
  topo: "topo",
};

export type Scene3D = {
  carte: maplibregl.Map;
  /** Coupe tout : le contexte WebGL n'est pas rendu par le ramasse-miettes. */
  detruire: () => void;
};

function styleDe(scene: Scene): maplibregl.StyleSpecification {
  const sources: maplibregl.StyleSpecification["sources"] = {
    [SOURCE_TERRAIN]: {
      type: "raster-dem",
      tiles: [TERRAIN.tuiles],
      tileSize: TERRAIN.tailleTuile,
      maxzoom: TERRAIN.zoomMax,
      encoding: TERRAIN.encodage,
      attribution: TERRAIN.attribution,
    },
  };
  const layers: maplibregl.LayerSpecification[] = [
    { id: "aplat", type: "background", paint: { "background-color": APLAT } },
  ];

  if (scene.fond !== "aucun") {
    const fond = FONDS[IMAGERIE[scene.fond]];
    sources[SOURCE_IMAGERIE] = {
      type: "raster",
      tiles: fond.tuiles,
      tileSize: 256,
      maxzoom: fond.zoomMax,
      attribution: fond.attribution,
    };
    layers.push({ id: "imagerie", type: "raster", source: SOURCE_IMAGERIE });
  }

  // NI `glyphs` NI `sprite` — pas la clé à `undefined`, mais PAS DE CLÉ.
  // MapLibre valide le style avant de le charger : `glyphs: undefined` y est
  // une chaîne manquante, le style entier est rejeté, et `load` ne se
  // déclenche jamais — donc ni terrain, ni trace, ni point, en silence.
  // Le survol n'affiche aucun toponyme : il n'a besoin d'aucun des deux.
  return { version: 8, sources, layers };
}

/**
 * Monte la scène dans un conteneur.
 *
 * `preserveDrawingBuffer` est ce qui rend l'export possible : sans lui, le
 * navigateur peut vider le tampon dès la fin du dessin, et une capture rendrait
 * une image noire une fois sur deux.
 */
export function monterScene(
  conteneur: HTMLElement,
  scene: Scene,
  exageration: number,
): Scene3D {
  const carte = new maplibregl.Map({
    container: conteneur,
    style: styleDe(scene),
    center: [6, 45],
    zoom: 12,
    pitch: 60,
    attributionControl: false,
    // MapLibre 5 range les attributs WebGL ici ; en 4 ils étaient à plat.
    canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
    // Aucune interaction : la caméra appartient au montage. Une souris qui
    // déplace la vue ferait diverger l'aperçu de ce qu'on exporte.
    interactive: false,
    // UN PIXEL DE SCÈNE = UN PIXEL DE SORTIE. Par défaut MapLibre suit la
    // densité de l'écran : sur un portable rétina, agrandir le conteneur à
    // 1080 × 1920 pour l'export donnerait un canvas de 2160 × 3840 — quatre
    // fois la mémoire, et une image plus fine que l'aperçu qu'on a validé.
    // L'aperçu EST l'image finale, ici comme sur une planche.
    pixelRatio: 1,
    // Le survol ne montre aucun texte de carte : les toponymes viendront d'une
    // couche vecteur, plus tard. Sans glyphes, MapLibre n'a rien à télécharger.
    fadeDuration: 0,
  });

  // « load » et NON « style.load » : ce dernier n'existe pas dans MapLibre 5,
  // et `on()` accepte n'importe quelle chaîne sans que rien ne le signale — le
  // terrain et la trace n'étaient donc jamais posés, en silence.
  // MapLibre ne LÈVE pas ses erreurs, il les émet : sans cet écouteur, une
  // source refusée ou un style invalide passe totalement inaperçu.
  carte.on("error", (e) => {
    console.warn("scène 3D :", e.error?.message ?? e);
  });

  carte.on("load", () => {
    carte.setTerrain({ source: SOURCE_TERRAIN, exaggeration: exageration });
    if (scene.ciel) {
      carte.setSky({
        "sky-color": brandColors.primaryDark,
        "horizon-color": brandColors.bg,
        "fog-color": brandColors.bg,
        "sky-horizon-blend": 0.6,
        "horizon-fog-blend": 0.6,
        "fog-ground-blend": 0.1,
        "atmosphere-blend": 0.8,
      });
    }
    poserLesCouches(carte, scene);
  });

  return {
    carte,
    detruire: () => carte.remove(),
  };
}

/** Les couches de la trace : le restant en sourdine, le parcouru par-dessus, le point. */
function poserLesCouches(carte: maplibregl.Map, scene: Scene): void {
  // La trace arrive par `poserLaTrace` : la source part vide plutôt que de
  // porter un type GeoJSON de plus dans les dépendances du studio.
  carte.addSource(SOURCE_TRACE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  carte.addSource(SOURCE_POINT, {
    type: "geojson",
    data: { type: "Point", coordinates: [0, 0] },
  });

  const parcourue = scene.couleurParcourue || brandColors.accent;
  const restante = scene.couleurRestante || brandColors.bg;

  // L'ombre d'abord : sur une imagerie satellite, une ligne sans ombre se perd
  // dans les rochers clairs.
  carte.addLayer({
    id: "trace-ombre",
    type: "line",
    source: SOURCE_TRACE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#000000", "line-opacity": 0.35, "line-width": scene.epaisseur + 6, "line-blur": 3 },
  });
  carte.addLayer({
    id: "trace-restante",
    type: "line",
    source: SOURCE_TRACE,
    filter: ["==", ["get", "part"], "restante"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": restante, "line-opacity": 0.4, "line-width": 2 },
  });
  carte.addLayer({
    id: "trace-parcourue",
    type: "line",
    source: SOURCE_TRACE,
    filter: ["==", ["get", "part"], "parcourue"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": parcourue, "line-width": scene.epaisseur },
  });
  // Le point : un halo ambre et un cœur terracotta — le marqueur du direct.
  carte.addLayer({
    id: "point-halo",
    type: "circle",
    source: SOURCE_POINT,
    paint: { "circle-radius": 16, "circle-color": brandColors.accent, "circle-opacity": 0.35 },
  });
  carte.addLayer({
    id: "point",
    type: "circle",
    source: SOURCE_POINT,
    paint: {
      "circle-radius": 8,
      "circle-color": brandColors.deep,
      "circle-stroke-width": 3,
      "circle-stroke-color": brandColors.bg,
    },
  });
}

/** Découpe la trace en « ce qui est fait » et « ce qui reste » à l'index donné. */
export function poserLaTrace(carte: maplibregl.Map, coords: readonly Coord[], jusqua: number): void {
  const source = carte.getSource(SOURCE_TRACE) as maplibregl.GeoJSONSource | undefined;
  if (!source) return;
  const coupe = Math.max(1, Math.min(coords.length, jusqua + 1));
  source.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { part: "restante" },
        geometry: { type: "LineString", coordinates: coords.slice(Math.max(0, coupe - 1)) as number[][] },
      },
      {
        type: "Feature",
        properties: { part: "parcourue" },
        geometry: { type: "LineString", coordinates: coords.slice(0, coupe) as number[][] },
      },
    ],
  });
}

export function poserLePoint(carte: maplibregl.Map, lng: number, lat: number): void {
  const source = carte.getSource(SOURCE_POINT) as maplibregl.GeoJSONSource | undefined;
  source?.setData({ type: "Point", coordinates: [lng, lat] });
}

/** Applique une prise. `jumpTo` et non `flyTo` : cf. l'en-tête. */
export function cadrer(carte: maplibregl.Map, p: Prise): void {
  carte.jumpTo({ center: [p.lng, p.lat], bearing: p.cap, pitch: p.pitch, zoom: p.zoom });
}

/**
 * Attend que la scène ait fini de charger et de dessiner.
 *
 * C'est LA condition d'un export honnête : capturer avant que les tuiles
 * soient là donne une image de terrain plat, et rien ne le rattrape ensuite.
 * Le délai de garde évite qu'une tuile manquante bloque l'export pour toujours
 * — mieux vaut une image imparfaite qu'une vidéo qui ne sort jamais.
 */
export function attendreCalme(carte: maplibregl.Map, garde = 4000): Promise<boolean> {
  if (carte.loaded() && carte.areTilesLoaded()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let fini = false;
    const finir = (ok: boolean) => {
      if (fini) return;
      fini = true;
      carte.off("idle", surCalme);
      carte.off("render", surRendu);
      clearTimeout(minuteur);
      resolve(ok);
    };
    const surCalme = () => finir(true);
    // On ne se contente pas d'« idle » : il attend en plus la fin de tout
    // mouvement interne, et sur un GPU logiciel il tarde de plusieurs
    // secondes. Ce qui compte pour une capture, c'est que les TUILES soient
    // là — on regarde donc à chaque dessin, et « idle » n'est que le filet.
    const surRendu = () => {
      if (carte.areTilesLoaded()) finir(true);
    };
    const minuteur = setTimeout(() => finir(false), garde);
    carte.on("idle", surCalme);
    carte.on("render", surRendu);
  });
}
