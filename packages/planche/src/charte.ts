// packages/planche/src/charte.ts
//
// CE QUE LA CHARTE IMPOSE À UNE PLANCHE : les formats de publication, les deux
// encres, les corps de référence et la palette des journées.
//
// Toutes les couleurs viennent de `@locomotionlab/ui/tokens`, le miroir JS des
// tokens `@theme` — un canvas ne résout aucune variable CSS, il lui faut des
// valeurs. Rien n'est retapé ici : ce qui n'est pas un token est une OPACITÉ
// posée sur un token, calculée par `rgba()`.

import { brandColors } from "@locomotionlab/ui/tokens";

import type { CleFormat, CleTheme } from "./types.ts";

/** « #EFB159 » → « 239, 177, 89 » — ce que `rgba()` du canvas attend. */
export function rgbDe(hex: string): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/** Une couleur de la charte, à l'opacité voulue. */
export function rgba(hex: string, alpha: number): string {
  return `rgba(${rgbDe(hex)}, ${alpha})`;
}

/* ---------------------------------------------------------------- formats */

export type Format = {
  cle: CleFormat;
  label: string;
  width: number;
  height: number;
  /**
   * La bande qu'Instagram NE RECOUVRE PAS de son interface. Elle n'existe que
   * pour la story — en carrousel (fil) et en carré, rien ne vient par-dessus.
   */
  zoneSure: { top: number; bottom: number } | null;
};

export const FORMATS: Record<CleFormat, Format> = {
  carrousel: {
    cle: "carrousel",
    label: "Carrousel · 1080×1350",
    width: 1080,
    height: 1350,
    zoneSure: null,
  },
  story: {
    cle: "story",
    label: "Story · 1080×1920",
    width: 1080,
    height: 1920,
    zoneSure: { top: 250, bottom: 1600 },
  },
  carre: {
    cle: "carre",
    label: "Carré · 1080×1080",
    width: 1080,
    height: 1080,
    zoneSure: null,
  },
};

/** La largeur de référence : tous les corps de la charte s'y rapportent. */
export const LARGEUR_REFERENCE = 1080;

/** La marge de la charte, en pixels de référence — sur quoi le magnétisme cale. */
export const MARGE = 64;

/* ------------------------------------------------------------------ encres */

export type Theme = {
  cle: CleTheme;
  label: string;
  fond: string;
  encre: string;
  encreDouce: string;
  encreFaible: string;
  filet: string;
  accent: string;
  /** « r, g, b » de l'accent, pour les dégradés d'aire du profil. */
  accentAire: string;
  /** Le voile posé sur les tuiles : un fond topo est clair et très bavard. */
  voileCarte: string;
  /** « r, g, b » du fond, pour les fondus derrière un texte. */
  voileTexte: string;
  profilRestant: string;
};

/**
 * LES DEUX ENCRES.
 *
 * L'ambre `--color-brand-accent` est fait pour un fond sombre ; sur le crème du
 * labo il perd tout contraste. Le thème clair prend donc `accent-ink`, le token
 * que la charte réserve exactement à ce cas — pas une teinte inventée ici.
 */
export const THEMES: Record<CleTheme, Theme> = {
  sombre: {
    cle: "sombre",
    label: "Sombre",
    fond: brandColors.plancheFond,
    encre: brandColors.bg,
    encreDouce: rgba(brandColors.bg, 0.74),
    encreFaible: rgba(brandColors.bg, 0.44),
    filet: rgba(brandColors.bg, 0.15),
    accent: brandColors.accent,
    accentAire: rgbDe(brandColors.accent),
    // Plus dense que le fond de planche : ce voile doit ÉTEINDRE les tuiles,
    // pas les teinter de la couleur du papier.
    voileCarte: "rgba(16, 18, 14, 0.34)",
    voileTexte: "16, 18, 14",
    profilRestant: rgba(brandColors.bg, 0.55),
  },
  clair: {
    cle: "clair",
    label: "Clair",
    fond: brandColors.bg,
    encre: brandColors.plancheEncre,
    encreDouce: rgba(brandColors.plancheEncre, 0.76),
    encreFaible: rgba(brandColors.plancheEncre, 0.46),
    filet: rgba(brandColors.plancheEncre, 0.14),
    accent: brandColors.accentInk,
    accentAire: rgbDe(brandColors.accentInk),
    voileCarte: rgba(brandColors.bg, 0.3),
    voileTexte: rgbDe(brandColors.bg),
    profilRestant: rgba(brandColors.plancheEncre, 0.38),
  },
};

/* ------------------------------------------------------------------- corps */

/**
 * Les corps de référence, en pixels d'une planche de 1080 de large.
 *
 * Ce sont les valeurs relevées sur les aperçus du compte : titre 65, corps 38,
 * filet ambre 10 d'épaisseur. L'en-tête et le pied étaient à 17, illisibles une
 * fois la planche postée ; ils montent à 22.
 */
export const CORPS = {
  entete: 22,
  surtitre: 22,
  titre: 65,
  corps: 38,
  pied: 22,
  filet: 10,
  ficheLabel: 16,
  ficheValeur: 46,
  /** Le côté du carré du logo, dans la bande d'en-tête. */
  logo: 42,
} as const;

/** Les graisses de la charte : la hiérarchie sort de là, pas d'une autre fonte. */
export const GRAISSES = {
  leger: 300,
  courant: 400,
  lecture: 450,
  appuye: 500,
  demi: 600,
  gras: 700,
  lourd: 800,
} as const;

/** Interlettrage des capitales espacées, en em. */
export const LETTRAGE = {
  surtitre: 0.16,
  etiquette: 0.14,
  normal: 0,
} as const;

/**
 * Couleurs proposées pour les journées.
 *
 * Le fuchsia vient en tête : c'est la teinte des traces du labo, choisie parce
 * qu'elle est absente de TOUS les fonds topo. Les suivantes sont celles de la
 * charte.
 *
 * PAS DE CRÈME : l'itinéraire complet est déjà tracé en encre atténuée sous les
 * journées, et une journée de la même teinte se lirait comme « la portion non
 * coloriée ».
 */
export const PALETTE_JOURS = [
  brandColors.trace,
  brandColors.accent,
  brandColors.deep,
  brandColors.primary,
  brandColors.primaryDark,
  brandColors.deepDark,
] as const;

/** La couleur de la journée `jour`, en bouclant sur la palette choisie. */
export function couleurDuJour(couleurs: readonly string[], jour: number): string {
  const palette = couleurs.length > 0 ? couleurs : PALETTE_JOURS;
  return palette[((jour % palette.length) + palette.length) % palette.length]!;
}

/** Le format d'un projet, avec ses dimensions en pixels. */
export function formatDe(cle: CleFormat): Format {
  return FORMATS[cle] ?? FORMATS.carrousel;
}

export function themeDe(cle: CleTheme): Theme {
  return THEMES[cle] ?? THEMES.sombre;
}

/**
 * L'échelle d'un format par rapport à la largeur de référence.
 *
 * Les trois formats font 1080 de large aujourd'hui, donc elle vaut 1 partout :
 * elle existe pour que les corps restent justes le jour où un format s'en
 * écarte, plutôt que de découvrir alors que tout est fixé en dur.
 */
export function echelleDe(cle: CleFormat): number {
  return formatDe(cle).width / LARGEUR_REFERENCE;
}
