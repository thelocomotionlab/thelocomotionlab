// packages/ui/src/components/formulaire/Case.tsx
//
// UNE CASE À COCHER, son libellé à droite et sa ligne d'aide dessous.

import { useId } from "react";
import type { ReactNode } from "react";

export type CaseProps = {
  label: ReactNode;
  checked: boolean;
  surChange: (coche: boolean) => void;
  aide?: ReactNode;
  disabled?: boolean;
  /** Une case qui exclut les autres de son groupe : un bouton radio. */
  radio?: boolean;
  name?: string;
};

export default function Case({ label, checked, surChange, aide, disabled, radio = false, name }: CaseProps) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <input
        id={id}
        name={name}
        type={radio ? "radio" : "checkbox"}
        checked={checked}
        disabled={disabled}
        onChange={(evenement) => surChange(evenement.target.checked)}
        className="mt-0.5 h-4 w-4 accent-brand-accent"
      />
      <label htmlFor={id}>
        <span className="text-brand-text">{label}</span>
        {aide ? <span className="block text-xs leading-relaxed text-brand-muted">{aide}</span> : null}
      </label>
    </div>
  );
}
