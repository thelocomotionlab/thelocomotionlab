// packages/tracking/src/MapStylePills.tsx
//
// Le sélecteur Relief / Topo / Satellite, posé en surcouche d'une carte —
// le même que celui du direct (apps/site/components/live/MapStyleSwitch,
// variante « overlay »), pour que replays et cartes GPX se pilotent comme le
// live. Trois pastilles texte lisibles, plutôt que trois icônes à deviner.

import { MAP_STYLE_OPTIONS, type MapStyleName } from "./mapStyles";

type Props = {
  value: MapStyleName;
  onChange: (id: MapStyleName) => void;
  className?: string;
};

export default function MapStylePills({ value, onChange, className = "" }: Props) {
  return (
    <div
      role="group"
      aria-label="Fond de carte"
      className={`inline-flex gap-[3px] rounded-[10px] bg-brand-bg/90 p-[3px] shadow-[0_4px_14px_rgba(51,51,51,0.18)] ${className}`}
    >
      {MAP_STYLE_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          className={`cursor-pointer rounded-lg border-none px-[11px] py-1 font-heading text-[11.5px] font-medium transition ${
            value === option.id ? "bg-brand-primary text-brand-bg" : "bg-transparent text-brand-text/60 hover:text-brand-text"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
