"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as toGeoJSON from "@tmcw/togeojson";
import { Crosshair, Download } from "lucide-react";
import {
  mapStyles,
  resolveMapStyle,
  ensureTraceLayers,
  traceColors,
  MapStylePills,
} from "@locomotionlab/tracking";

import { profilDeGpx } from "@/lib/gpxStats";
import ItineraireLine from "./live/ItineraireLine";
import ProfileCard from "./live/ProfileCard";

// Carte GPX posée dans un récit. Le fond, la teinte de la trace et le
// sélecteur viennent de @locomotionlab/tracking (mapStyles.ts) : la même
// grammaire que le direct et les replays. Une trace GPX seule est le SUJET de
// sa carte : elle prend le trait plein épais du « vécu », pas les tirets fins
// de l'itinéraire prévu, qui n'existent que par contraste avec lui.
//
// Sous la carte, le profil altimétrique du direct (ProfileCard), nourri par
// lib/gpxStats.profilDeGpx — calculé dans le navigateur depuis le GPX, au
// format du .track.json, sans build:track. Le survol du profil pose un point
// jumeau sur la carte, comme sur le live.
const defaultCenter = [55.5364, -21.1151];

export default function MapEmbed({
  gpx,
  lineWeight = 4.5,
  defaultMinHeight = 350,
}) {
  const mapRef = useRef(null);
  const mapContainer = useRef(null);
  const trackGeoJSONRef = useRef(null);
  const trackBoundsRef = useRef(null);
  // Suit le style applique pour eviter le no-op au montage (qui declenche un
  // warning "Style is not done loading" cote maplibre).
  const appliedStyleRef = useRef(resolveMapStyle(null));

  const [mapStyle, setMapStyle] = useState(resolveMapStyle(null));
  const [dynamicHeight, setDynamicHeight] = useState(defaultMinHeight);
  const [gpxError, setGpxError] = useState(false);
  // Profil et totaux du GPX (lib/gpxStats), pour la ligne de chiffres et le
  // profil altimétrique sous la carte.
  const [reference, setReference] = useState(null);
  const hoverRef = useRef(null);

  const defaultZoom = 9;

  // 🔹 Ajustement automatique de la hauteur
  useEffect(() => {
    function syncHeight() {
      const mapEl = mapContainer.current;
      if (!mapEl) return;

      const parentSplit = mapEl.closest(".md-split");
      if (!parentSplit) {
        setDynamicHeight(defaultMinHeight);
        return;
      }

      const siblingCol = Array.from(parentSplit.children).find(
        (col) => col !== mapEl.parentElement
      );
      if (!siblingCol) {
        setDynamicHeight(defaultMinHeight);
        return;
      }

      const siblingImg = siblingCol.querySelector("img");
      if (siblingImg) {
        const h = siblingImg.getBoundingClientRect().height;
        if (h > 0) setDynamicHeight(h);
      } else {
        const h = siblingCol.getBoundingClientRect().height;
        setDynamicHeight(h > 0 ? h : defaultMinHeight);
      }
    }

    syncHeight();
    window.addEventListener("resize", syncHeight);

    // L'image sœur peut finir de charger après le montage : re-mesurer à son
    // "load". Listener posé UNE seule fois et retiré au démontage — l'ancienne
    // version en rajoutait un à chaque resize sans jamais les retirer.
    const mapEl = mapContainer.current;
    const parentSplit = mapEl?.closest(".md-split");
    const siblingCol = parentSplit
      ? Array.from(parentSplit.children).find((col) => col !== mapEl.parentElement)
      : null;
    const siblingImg = siblingCol?.querySelector("img") || null;
    if (siblingImg) siblingImg.addEventListener("load", syncHeight);

    return () => {
      window.removeEventListener("resize", syncHeight);
      if (siblingImg) siblingImg.removeEventListener("load", syncHeight);
    };
  }, [defaultMinHeight]);

  // --- Création de la carte une seule fois
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: mapStyles[appliedStyleRef.current],
      center: defaultCenter,
      zoom: defaultZoom,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // --- Chargement du GPX
  useEffect(() => {
    if (!mapRef.current || !gpx) return;

    async function loadGPX() {
      try {
        setGpxError(false);
        const map = mapRef.current;
        if (!map) return;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(gpx, { signal: controller.signal });
        clearTimeout(timeoutId);
        // La carte peut avoir ete detruite (StrictMode, navigation) pendant l'await.
        if (!map.style) return;
        if (!res.ok) throw new Error("Erreur de chargement GPX");

        const xml = await res.text();
        if (!map.style) return;
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const geojson = toGeoJSON.gpx(doc);

        trackGeoJSONRef.current = geojson;
        setReference(profilDeGpx(xml));

        const firstLineFeature = geojson.features.find(
          (f) =>
            f?.geometry?.type === "LineString" &&
            Array.isArray(f.geometry.coordinates) &&
            f.geometry.coordinates.length > 0
        );

        if (firstLineFeature) {
          const coords = firstLineFeature.geometry.coordinates;
          trackBoundsRef.current = coords.reduce(
            (b, c) => b.extend(c),
            new maplibregl.LngLatBounds(coords[0], coords[0])
          );
        } else {
          trackBoundsRef.current = null;
        }

        const applyTrack = () => {
          // Les deux sources du design existent toujours ; ici seule
          // « done » est nourrie : une carte GPX n'a pas d'itinéraire prévu.
          ensureTraceLayers(map, { reference: "gpx-reference", done: "gpx-track" });
          map.getSource("gpx-track").setData(geojson);
          if (Number.isFinite(lineWeight)) {
            map.setPaintProperty("gpx-track-line", "line-width", lineWeight);
            map.setPaintProperty("gpx-track-casing", "line-width", lineWeight + 3.5);
          }

          if (trackBoundsRef.current) {
            map.fitBounds(trackBoundsRef.current, {
              padding: 40,
              duration: 1000,
            });
          }
        };

        if (map.isStyleLoaded()) {
          applyTrack();
        } else {
          map.once("load", applyTrack);
        }
      } catch (err) {
        console.error("Erreur GPX:", err);
        setGpxError(true);
      }
    }

    loadGPX();
  }, [gpx, lineWeight]);

  // --- Changement de style sans recréer la carte
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapStyles[mapStyle]) return;
    if (appliedStyleRef.current === mapStyle) return;
    appliedStyleRef.current = mapStyle;

    map.setStyle(mapStyles[mapStyle]);

    // setStyle efface sources et couches : on les repose, puis on renourrit.
    map.once("styledata", () => {
      if (!map.style) return;
      ensureTraceLayers(map, { reference: "gpx-reference", done: "gpx-track" });
      if (trackGeoJSONRef.current) {
        map.getSource("gpx-track").setData(trackGeoJSONRef.current);
        if (Number.isFinite(lineWeight)) {
          map.setPaintProperty("gpx-track-line", "line-width", lineWeight);
          map.setPaintProperty("gpx-track-casing", "line-width", lineWeight + 3.5);
        }
      }
      map.resize();
    });
  }, [mapStyle, lineWeight]);

  // Survol du profil → point jumeau sur la carte (posé/déplacé/retiré).
  const poserSurvol = (lngLat) => {
    const map = mapRef.current;
    if (!map) return;
    if (!lngLat) {
      hoverRef.current?.remove();
      hoverRef.current = null;
      return;
    }
    if (!hoverRef.current) {
      const el = document.createElement("div");
      el.style.cssText = `width:13px;height:13px;border-radius:50%;background:${traceColors.line};border:2.5px solid ${traceColors.casing};box-shadow:0 1px 6px rgba(0,0,0,0.35);pointer-events:none;`;
      hoverRef.current = new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
    } else {
      hoverRef.current.setLngLat(lngLat);
    }
  };

  const resetView = () => {
    if (mapRef.current) {
      if (trackBoundsRef.current) {
        mapRef.current.fitBounds(trackBoundsRef.current, {
          padding: 40,
          duration: 1000,
        });
      } else {
        mapRef.current.flyTo({
          center: defaultCenter,
          zoom: defaultZoom,
          speed: 0.8,
        });
      }
    }
  };

  // --- Rendu principal
  return (
    <div className="w-full">
    <div
      className="ll-map relative w-full overflow-hidden"
      style={{
        height: dynamicHeight,
        transition: "height 0.3s ease",
      }}
    >
      <div
        ref={mapContainer}
        role="application"
        aria-label="Carte interactive du parcours GPX"
        style={{ width: "100%", height: "100%" }}
      />

      {gpxError && (
        <div
          role="alert"
          className="absolute top-3 right-3 z-30 max-w-[260px] bg-white/95 backdrop-blur-sm border border-red-200 text-red-700 text-sm rounded-md shadow-md px-3 py-2"
        >
          Impossible de charger la trace GPX.{" "}
          {gpx && (
            <a
              href={gpx}
              className="underline font-semibold"
              download
            >
              Télécharger le fichier
            </a>
          )}
        </div>
      )}

      {/* Bouton Recentrer */}
      <button
        type="button"
        onClick={resetView}
        aria-label="Recentrer la carte sur le parcours"
        className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-md shadow-md text-sm px-3 py-1 hover:bg-brand-accent/80 hover:text-white text-gray-700 flex items-center gap-1 z-20"
      >
        <Crosshair size={16} aria-hidden="true" />
        <span className="hidden sm:inline">Recentrer</span>
      </button>

      {/* Fond de carte : Relief / Topo / Satellite, comme sur le direct —
          au-dessus du zoom, que la classe ll-map fait descendre. */}
      <div className="absolute right-3 top-3 z-30">
        <MapStylePills value={mapStyle} onChange={setMapStyle} />
      </div>

      {/* Bouton de téléchargement GPX */}
      <a
        href={gpx}
        download
        aria-label="Télécharger la trace GPX"
        className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm rounded-md shadow-md px-3 py-1 hover:bg-brand-accent/80 hover:text-white text-gray-700 z-20 flex items-center gap-1 transition no-underline"
        title="Télécharger la trace GPX"
      >
        <Download size={16} aria-hidden="true" />
        <span className="hidden sm:inline text-sm font-medium">Télécharger</span>
      </a>
    </div>

    {/* Sous la carte : les chiffres de l'itinéraire et son profil, comme sur
        le direct. Rien tant que le GPX n'est pas lu. */}
    {reference && (
      <div className="mt-3 flex flex-col gap-2.5">
        <ItineraireLine reference={reference} className="px-1" />
        <ProfileCard
          profile={reference.profile}
          totalKm={reference.totalKm}
          doneKm={0}
          elevationMin={reference.elevMinM}
          elevationMax={reference.elevMaxM}
          onHoverPoint={poserSurvol}
        />
      </div>
    )}
    </div>
  );
}