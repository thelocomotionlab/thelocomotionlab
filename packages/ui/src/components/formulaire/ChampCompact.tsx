// packages/ui/src/components/formulaire/ChampCompact.tsx
//
// UN CHAMP COURT : un nombre, une heure, un nom — l'étiquette au-dessus, l'unité à droite,
// une ligne d'aide dessous.
//
// `Field` est le champ d'un formulaire de page ; celui-ci est celui d'un outil, où une
// colonne en aligne dix. `masquerEtiquette` le range dans une cellule de tableau : son
// étiquette reste lue par un lecteur d'écran, elle n'est simplement plus imprimée.

import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

export type ChampCompactProps = {
  label: ReactNode;
  unite?: ReactNode;
  aide?: ReactNode;
  erreur?: string;
  masquerEtiquette?: boolean;
  /** Une cellule de tableau : étroit, chiffres alignés à droite. */
  enTableau?: boolean;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className">;

export default function ChampCompact({
  label,
  unite,
  aide,
  erreur,
  masquerEtiquette = false,
  enTableau = false,
  className = "",
  id,
  type = "text",
  ...reste
}: ChampCompactProps) {
  const automatique = useId();
  const identifiant = id || `champ-${automatique}`;
  const aideId = aide || erreur ? `${identifiant}-aide` : undefined;
  return (
    <div className={`flex flex-col gap-1 text-sm ${className}`}>
      <label htmlFor={identifiant} className={masquerEtiquette ? "sr-only" : "text-brand-soft"}>
        {label}
      </label>
      <span className="flex items-center gap-2">
        <input
          id={identifiant}
          type={type}
          aria-invalid={Boolean(erreur) || undefined}
          aria-describedby={aideId}
          className={`rounded-md border bg-brand-paper py-1 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:text-brand-faint ${
            erreur ? "border-brand-deep" : "border-brand-hairline"
          } ${enTableau ? "w-16 px-2 text-right tabular-nums" : "w-full px-3 py-1.5"}`}
          {...reste}
        />
        {unite ? <span className="whitespace-nowrap text-xs text-brand-muted">{unite}</span> : null}
      </span>
      {erreur ? (
        <span id={aideId} className="text-xs leading-relaxed text-brand-deep-dark">
          {erreur}
        </span>
      ) : aide ? (
        <span id={aideId} className="text-xs leading-relaxed text-brand-muted">
          {aide}
        </span>
      ) : null}
    </div>
  );
}
