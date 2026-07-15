// packages/ui/src/index.ts
//
// Barrel public de la charte partagée. Les apps importent depuis
// "@locomotionlab/ui" (composants) ; les polices depuis
// "@locomotionlab/ui/fonts" et les tokens via "@locomotionlab/ui/theme.css".

export { default as Button } from "./components/Button";
export type { ButtonProps } from "./components/Button";

export { default as Field } from "./components/Field";
export type { FieldProps } from "./components/Field";

export { default as PageShell } from "./components/PageShell";
export type { PageShellProps } from "./components/PageShell";

// Couleurs de marque en JS (SVG / maplibre / cssText — miroir de theme.css).
export { brandColors } from "./tokens";
