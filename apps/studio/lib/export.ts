// lib/export.ts
//
// SORTIR LES IMAGES.
//
// LE RENDU D'EXPORT EST LE MÊME QUE CELUI DE L'ÉCRAN, à la lettre : le canvas
// de travail est déjà aux dimensions de sortie, et l'export ne fait que le
// redessiner hors écran. Aucun second chemin de rendu, donc aucune surprise —
// c'est la propriété que toute la refonte protège.
//
// L'ÉCHELLE 2× n'est pas une interpolation : la planche est REDESSINÉE deux
// fois plus grande, textes et traces compris. Un agrandissement d'image aurait
// donné des lettres floues à l'impression.
//
// LES TÉLÉCHARGEMENTS PARTENT UN PAR UN, espacés. Safari annule tout ce qui
// arrive dans la même salve, et un carrousel de douze planches n'en sortirait
// que la première.

import {
  besoinsDeFond,
  contexteDeRendu,
  dessinerPlanche,
  formatDe,
  type PlancheImage,
  type Projet,
} from "@locomotionlab/planche";
import { decouperTrace } from "@locomotionlab/trace";

import { imagesEnCache } from "./images";
import { policeDuLabo } from "./police";
import { completerLesFonds, fondsEnCache } from "./tuiles";

export type Reglages = {
  /** `jpeg` pour publier, `png` quand il faut de la transparence ou du net. */
  type: "image/jpeg" | "image/png";
  qualite: number;
  /** 1 pour les réseaux, 2 pour l'impression. */
  echelle: number;
  /** Les index de planches à sortir. */
  planches: number[];
};

export const PAR_DEFAUT: Reglages = {
  type: "image/jpeg",
  qualite: 0.92,
  echelle: 1,
  planches: [],
};

/** « ecrins-2026-03.jpg » — un nom qui se range tout seul dans un dossier. */
export function nomDeFichier(projet: Projet, index: number, type: string): string {
  const base =
    (projet.nom || "planche")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "planche";
  return `${base}-${String(index + 1).padStart(2, "0")}.${type === "image/png" ? "png" : "jpg"}`;
}

/** Dessine une planche hors écran, à l'échelle demandée. */
export async function rendreHorsEcran(
  projet: Projet,
  planche: PlancheImage,
  echelle: number,
): Promise<HTMLCanvasElement> {
  const format = formatDe(projet.format);
  const toile = document.createElement("canvas");
  toile.width = Math.round(format.width * echelle);
  toile.height = Math.round(format.height * echelle);
  const ctx = toile.getContext("2d");
  if (!ctx) throw new Error("canvas indisponible");

  const c = contexteDeRendu(projet, planche, {
    police: policeDuLabo(),
    segments: decouperTrace(projet.donnees.trace, projet.donnees.coupures),
    fonds: fondsEnCache(),
    images: imagesEnCache(),
    logo: await logoDuLabo(),
  });

  // Les tuiles AVANT de dessiner : à l'écran, une carte qui se complète après
  // coup est acceptable ; dans un fichier qu'on publie, non.
  await completerLesFonds(besoinsDeFond(planche, c));

  ctx.scale(echelle, echelle);
  dessinerPlanche(ctx, planche, { ...c, fonds: fondsEnCache() });
  return toile;
}

let logo: Promise<HTMLImageElement | null> | null = null;

function logoDuLabo(): Promise<HTMLImageElement | null> {
  logo ??= new Promise((resolve) => {
    const img = new Image();
    img.src = "/images/assets/logo-mark-512.png";
    img.decode().then(
      () => resolve(img),
      () => resolve(null),
    );
  });
  return logo;
}

export function versBlob(toile: HTMLCanvasElement, r: Reglages): Promise<Blob | null> {
  return new Promise((resolve) => toile.toBlob(resolve, r.type, r.qualite));
}

export type Sortie = { nom: string; blob: Blob };

/** Rend les planches demandées, en annonçant l'avancement. */
export async function rendre(
  projet: Projet,
  r: Reglages,
  avancement?: (fait: number, total: number) => void,
): Promise<Sortie[]> {
  const index = r.planches.length > 0 ? r.planches : projet.planches.map((_, i) => i);
  const out: Sortie[] = [];
  for (const [fait, i] of index.entries()) {
    const planche = projet.planches[i];
    if (!planche || planche.type !== "image") continue;
    const toile = await rendreHorsEcran(projet, planche, r.echelle);
    const blob = await versBlob(toile, r);
    if (blob) out.push({ nom: nomDeFichier(projet, i, r.type), blob });
    avancement?.(fait + 1, index.length);
  }
  return out;
}

/**
 * Un fichier vers le disque.
 *
 * La révocation est DIFFÉRÉE : Safari annule le téléchargement si l'URL meurt
 * trop tôt après le clic.
 */
export function telecharger(blob: Blob, nom: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Les sorties, une par une et espacées — cf. l'en-tête sur Safari. */
export async function telechargerToutes(sorties: readonly Sortie[]): Promise<void> {
  for (const [i, s] of sorties.entries()) {
    telecharger(s.blob, s.nom);
    if (i < sorties.length - 1) await attendre(350);
  }
}

/**
 * LE PARTAGE SYSTÈME, sur téléphone.
 *
 * C'est le vrai chemin d'une publication : la feuille d'Instagram s'ouvre, on
 * choisit, c'est fini. Sur un ordinateur il n'existe pas, et le téléchargement
 * reprend la main.
 */
export function partageDisponible(sorties: readonly Sortie[]): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: sorties.map((s) => new File([s.blob], s.nom)) });
  } catch {
    return false;
  }
}

export async function partager(sorties: readonly Sortie[], titre: string): Promise<boolean> {
  try {
    await navigator.share({
      title: titre,
      files: sorties.map((s) => new File([s.blob], s.nom, { type: s.blob.type })),
    });
    return true;
  } catch {
    // Un partage refusé n'est pas une panne : l'utilisateur a fermé la feuille.
    return false;
  }
}
