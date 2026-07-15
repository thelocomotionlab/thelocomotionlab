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
  /** --color-brand-deep */
  deep: "#B67352",
  /** --color-brand-deep-dark */
  deepDark: "#9A6044",
} as const;
