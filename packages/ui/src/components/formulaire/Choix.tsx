// packages/ui/src/components/formulaire/Choix.tsx
//
// UN CHOIX DANS UNE LISTE : une course de la bibliothèque, un fuseau, un kilomètre.

import { useId } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";

export type OptionDeChoix = { valeur: string; libelle: ReactNode; desactivee?: boolean };

export type ChoixProps = {
  label: ReactNode;
  options: OptionDeChoix[];
  valeur: string;
  surChange: (valeur: string) => void;
  /** Une première option vide, qui dit ce qu'on attend. */
  invite?: string;
  aide?: ReactNode;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "className">;

export default function Choix({ label, options, valeur, surChange, invite, aide, id, ...reste }: ChoixProps) {
  const automatique = useId();
  const identifiant = id || `choix-${automatique}`;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={identifiant} className="text-brand-soft">
        {label}
      </label>
      <select
        id={identifiant}
        value={valeur}
        onChange={(evenement) => surChange(evenement.target.value)}
        className="rounded-md border border-brand-hairline bg-brand-paper px-3 py-1.5 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:text-brand-faint"
        {...reste}
      >
        {invite !== undefined ? <option value="">{invite}</option> : null}
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur} disabled={option.desactivee}>
            {option.libelle}
          </option>
        ))}
      </select>
      {aide ? <span className="text-xs leading-relaxed text-brand-muted">{aide}</span> : null}
    </div>
  );
}
