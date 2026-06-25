// packages/ui/src/components/PageShell.tsx
//
// Conteneur de page minimal à la charte : fond de marque + colonne centrée à
// largeur max. Sert de base aux pages des apps (cf. apps/_template).

import type { ReactNode } from "react";

export type PageShellProps = {
  children: ReactNode;
  className?: string;
};

export default function PageShell({ children, className = "" }: PageShellProps) {
  const classes = ["min-h-screen", "bg-brand-bg", "text-brand-text", "font-sans", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-start justify-center gap-6 px-6 py-16">
        {children}
      </div>
    </div>
  );
}
