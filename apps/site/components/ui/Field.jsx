// components/ui/Field.jsx
//
// Champ de formulaire atomique : label + input/textarea + message d'erreur.
// Câble automatiquement htmlFor, aria-invalid et aria-describedby.

import { useId } from "react";

export default function Field({
  label,
  id,
  name,
  type = "text",
  as = "input",
  rows = 5,
  error,
  required = false,
  autoComplete,
  hideLabel = false,
  className = "",
  inputClassName = "",
  ...rest
}) {
  const autoId = useId();
  const fieldId = id || `${name || "field"}-${autoId}`;
  const errorId = `${fieldId}-error`;

  const baseInputClasses = `w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent ${
    error ? "border-red-500" : "border-gray-300"
  } ${inputClassName}`;

  const sharedProps = {
    id: fieldId,
    name,
    required,
    "aria-required": required || undefined,
    "aria-invalid": Boolean(error) || undefined,
    "aria-describedby": error ? errorId : undefined,
    autoComplete,
    className: baseInputClasses,
    ...rest,
  };

  return (
    <div className={className}>
      <label
        htmlFor={fieldId}
        className={
          hideLabel
            ? "sr-only"
            : "block text-sm font-medium mb-1"
        }
      >
        {label}
      </label>

      {as === "textarea" ? (
        <textarea rows={rows} {...sharedProps} />
      ) : (
        <input type={type} {...sharedProps} />
      )}

      {error && (
        <p id={errorId} className="text-red-700 text-sm mt-1">
          {error}
        </p>
      )}
    </div>
  );
}
