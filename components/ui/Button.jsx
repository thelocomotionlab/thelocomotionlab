// components/ui/Button.jsx
//
// Bouton atomique du design system.
// Variantes :
//   - primary  : pleine couleur accent (CTA principal)
//   - secondary: contour, fond transparent
//   - ghost    : sans fond, juste hover
// Tailles : sm | md | lg
// Pour les liens, passer `as="a"` ou utiliser <Link asChild> côté appelant.

import { forwardRef } from "react";

const VARIANTS = {
  primary:
    "bg-brand-accent text-white shadow hover:bg-brand-primary-dark",
  secondary:
    "bg-transparent border border-brand-accent text-brand-accent hover:bg-brand-accent hover:text-white",
  ghost:
    "bg-transparent text-brand-deep hover:bg-brand-accent/10",
};

const SIZES = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2 text-base",
  lg: "px-6 py-3 text-base",
};

const Button = forwardRef(function Button(
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
      ref={ref}
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
