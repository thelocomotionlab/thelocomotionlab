// packages/ui/src/components/Button.tsx
//
// Bouton atomique du design system.
// Variantes :
//   - primary  : pleine couleur accent (CTA principal)
//   - secondary: contour, fond transparent
//   - ghost    : sans fond, juste hover
// Tailles : sm | md | lg
// Pour les liens, passer `as="a"` (ou un composant Link) côté appelant.

import { forwardRef } from "react";
import type { ComponentPropsWithoutRef, ElementType, Ref, ReactNode } from "react";

// Contraste (WCAG AA) : les CTA pleins sont terracotta foncé avec texte
// blanc (deep-dark, 5,1:1) — jamais blanc sur l'orange accent (1,9:1).
// L'orange reste pour les contours/fonds décoratifs. Hover dans la même
// famille (deep).
const VARIANTS = {
  primary: "bg-brand-deep-dark text-white shadow hover:bg-brand-deep",
  secondary:
    "bg-transparent border border-brand-accent-dark text-brand-accent-ink hover:bg-brand-accent hover:text-brand-text",
  ghost: "bg-transparent text-brand-deep hover:bg-brand-accent/10",
} as const;

const SIZES = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2 text-base",
  lg: "px-6 py-3 text-base",
} as const;

type ButtonOwnProps = {
  as?: ElementType;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  rounded?: "full" | "lg" | "md";
  loading?: boolean;
  children?: ReactNode;
};

export type ButtonProps = ButtonOwnProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof ButtonOwnProps>;

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    as: Component = "button",
    variant = "primary",
    size = "md",
    rounded = "full",
    className = "",
    loading = false,
    disabled,
    children,
    ...rest
  },
  ref
) {
  const radius =
    rounded === "full" ? "rounded-full" : rounded === "lg" ? "rounded-lg" : "rounded-md";

  const base =
    "inline-flex items-center justify-center gap-2 font-semibold transition cursor-pointer disabled:cursor-not-allowed";

  const stateClasses = loading
    ? "opacity-70 cursor-wait"
    : disabled
      ? "opacity-50"
      : "";

  const classes = [base, VARIANTS[variant], SIZES[size], radius, stateClasses, className]
    .filter(Boolean)
    .join(" ");

  return (
    <Component
      ref={ref as Ref<HTMLButtonElement>}
      className={classes}
      disabled={Component === "button" ? disabled || loading : undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {children}
    </Component>
  );
});

export default Button;
