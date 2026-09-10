// packages/ui/src/tokens.ts
//
// Les couleurs de marque en CONSTANTES JS, pour les consommateurs qui ne
// peuvent pas résoudre `var(--color-brand-*)` : attributs de présentation
// SVG, styles de couches maplibre (canvas/WebGL), `cssText` de marqueurs DOM.
//
// ⚠ MIROIR de styles/theme.css (la source de vérité des tokens) : toute
// modification de couleur se fait LÀ-BAS d'abord, puis se recopie ici.
// Les valeurs doivent rester STRICTEMENT identiques.
export const brandColors = {
  /** --color-brand-bg */
  bg: "#FEFBF6",
  /** --color-brand-primary */
  primary: "#8CB9BD",
  /** --color-brand-primary-dark */
  primaryDark: "#6E9CA0",
  /** --color-brand-accent */
  accent: "#EFB159",
  /** --color-brand-accent-dark */
  accentDark: "#D89A3D",
  /** --color-brand-accent-ink — l'ambre qui tient en TEXTE sur fond clair. */
  accentInk: "#C08327",
  /** --color-brand-deep */
  deep: "#B67352",
  /** --color-brand-deep-dark */
  deepDark: "#9A6044",
  /** --color-brand-text */
  text: "#333333",
  /** --color-brand-hairline */
  hairline: "#E5DFD3",
  /** --color-brand-paper */
  paper: "#FFFFFF",
  /** --color-brand-planche-fond — le fond d'une planche sombre. */
  plancheFond: "#1A1C18",
  /** --color-brand-planche-encre — l'encre d'une planche claire. */
  plancheEncre: "#22241E",
  /** --color-brand-trace — le fuchsia cartographique, sur tous les fonds. */
  trace: "#D6246E",
} as const;
