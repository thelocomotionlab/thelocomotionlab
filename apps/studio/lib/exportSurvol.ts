"use client";

// lib/exportSurvol.ts
//
// LA BOUCLE D'EXPORT D'UN SURVOL.
//
// Elle fait, pour chaque image : poser la caméra, ATTENDRE que les tuiles
// soient arrivées, composer la scène et le HUD dans une toile aux dimensions
// de sortie, et rendre la main à l'encodeur. Rien n'est chronométré.
//
// LA SCÈNE EST AGRANDIE LE TEMPS DE L'EXPORT. À l'écran, elle vit en pixels
// d'écran — inutile de faire tourner WebGL en 1080 × 1920 pour l'afficher en
// 400 px de large. À l'export il faut la pleine résolution : on redimensionne
// son conteneur, on tourne, et on le remet comme il était. Sans ça, la vidéo
// serait un agrandissement flou de l'aperçu.

import type maplibregl from "maplibre-gl";
import {
  contexteDuHud,
  dessinerAvecCadre,
  formatDe,
  planDeSurvol,
  prisesDuPlan,
  type PlancheSurvol,
  type Projet,
} from "@locomotionlab/planche";
import { decouperTrace } from "@locomotionlab/trace";

import { imagesEnCache } from "./images";
import { policeDuLabo } from "./police";
import { attendreCalme, cadrer, poserLaTrace, poserLePoint } from "./scene";
import { encoder, recetteDisponible, type Avancement } from "./video";
import { logoDuLabo } from "./export";

export type ResultatSurvol = { blob: Blob; nom: string; codec: string } | null;

/** Le débit : 12 Mbit/s en 1080, moins quand l'image est plus petite. */
function debitDe(largeur: number, hauteur: number): number {
  return Math.round(12_000_000 * Math.min(1, (largeur * hauteur) / (1080 * 1920)));
}

export async function exporterSurvol(
  projet: Projet,
  planche: PlancheSurvol,
  carte: maplibregl.Map,
  conteneur: HTMLElement,
  options: {
    surAvancement?: (a: Avancement) => void;
    annule?: () => boolean;
    nom: string;
  },
): Promise<ResultatSurvol> {
  const seance = projet.donnees.seance;
  if (!seance) return null;

  const format = formatDe(projet.format);
  const plan = planDeSurvol(seance, planche.montage);
  const prises = prisesDuPlan(seance, plan.images, planche.camera, plan.imagesParSeconde);
  if (plan.images.length === 0) return null;

  const coords = projet.donnees.trace?.coords ?? [];
  const toile = document.createElement("canvas");
  toile.width = format.width;
  toile.height = format.height;
  const ctx = toile.getContext("2d");
  if (!ctx) return null;

  // Le HUD est rendu dans SA propre toile, comme à l'écran : même moteur, même
  // charte, donc rien à re-vérifier.
  const habillage = document.createElement("canvas");
  habillage.width = format.width;
  habillage.height = format.height;
  const ctxHud = habillage.getContext("2d");
  if (!ctxHud) return null;

  const logo = await logoDuLabo();
  const segments = decouperTrace(projet.donnees.trace, projet.donnees.coupures);
  const rendu = { police: policeDuLabo(), logo, segments, images: imagesEnCache() };

  // On agrandit la scène, en gardant de quoi la remettre.
  const avant = { largeur: conteneur.style.width, hauteur: conteneur.style.height };
  conteneur.style.width = `${format.width}px`;
  conteneur.style.height = `${format.height}px`;
  carte.resize();

  const dessiner = async (i: number) => {
    const prise = prises[i];
    const index = plan.images[i] ?? 0;
    if (!prise) return;
    poserLaTrace(carte, coords, Math.round((plan.avancement[i] ?? 0) * (coords.length - 1)));
    poserLePoint(carte, prise.lng, prise.lat);
    cadrer(carte, prise);
    await attendreCalme(carte);
    // `redraw` force un dessin dans le tampon préservé : sans lui, la capture
    // peut prendre l'image d'avant.
    carte.redraw();

    ctx.clearRect(0, 0, format.width, format.height);
    ctx.drawImage(carte.getCanvas(), 0, 0, format.width, format.height);

    ctxHud.clearRect(0, 0, format.width, format.height);
    const { contexte, elements } = contexteDuHud(
      projet,
      planche,
      seance.points[index] ?? null,
      rendu,
    );
    for (const e of elements) dessinerAvecCadre(ctxHud, e, contexte);
    ctx.drawImage(habillage, 0, 0);
  };

  const encodage = {
    largeur: format.width,
    hauteur: format.height,
    imagesParSeconde: plan.imagesParSeconde,
    debit: debitDe(format.width, format.height),
  };

  try {
    const recette = await recetteDisponible(encodage);
    if (!recette) {
      throw new Error(
        "Ce navigateur ne sait pas encoder de vidéo. Chrome, Edge, Safari 16.4 ou Firefox récent le savent.",
      );
    }
    const sortie = await encoder(
      toile,
      plan.images.length,
      encodage,
      recette,
      dessiner,
      options.surAvancement,
      options.annule,
    );
    if (!sortie) return null;
    return {
      blob: sortie.blob,
      nom: `${options.nom}-survol.${sortie.extension}`,
      codec: sortie.codec,
    };
  } finally {
    conteneur.style.width = avant.largeur;
    conteneur.style.height = avant.hauteur;
    carte.resize();
  }
}
