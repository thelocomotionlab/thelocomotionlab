// Rendu : arbre satori (layout façon flexbox) → SVG (texte vectorisé avec les
// fontes Ubuntu committées, licence UFL dans assets/fonts/) → PNG via resvg.
// Déterministe, zéro dépendance système.

import fs from "node:fs";
import path from "node:path";

import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

const FONTS_DIR = path.resolve(__dirname, "..", "..", "assets", "fonts");

type SatoriFont = { name: string; data: Buffer; weight: 400 | 500 | 700; style: "normal" };

let fontsCache: SatoriFont[] | null = null;

function loadFonts(): SatoriFont[] {
  if (fontsCache) return fontsCache;
  fontsCache = [
    { name: "Ubuntu", data: fs.readFileSync(path.join(FONTS_DIR, "Ubuntu-Regular.ttf")), weight: 400, style: "normal" },
    { name: "Ubuntu", data: fs.readFileSync(path.join(FONTS_DIR, "Ubuntu-Medium.ttf")), weight: 500, style: "normal" },
    { name: "Ubuntu", data: fs.readFileSync(path.join(FONTS_DIR, "Ubuntu-Bold.ttf")), weight: 700, style: "normal" },
  ];
  return fontsCache;
}

/** Nœud satori : élément HTML-like en objet pur (pas de JSX dans ce service). */
export function h(
  type: string,
  props: Record<string, unknown> = {},
  ...children: unknown[]
): Record<string, unknown> {
  const flat = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  // Satori refuse `children: []` (compté comme « plusieurs enfants ») :
  // un nœud sans enfant n'a PAS de clé children.
  if (flat.length === 0) return { type, props };
  return { type, props: { ...props, children: flat.length === 1 ? flat[0] : flat } };
}

export async function renderPng(
  node: Record<string, unknown>,
  width: number,
  height: number,
): Promise<Buffer> {
  const svg = await satori(node as never, { width, height, fonts: loadFonts() });
  const png = new Resvg(svg, { fitTo: { mode: "original" } }).render().asPng();
  return Buffer.from(png);
}
