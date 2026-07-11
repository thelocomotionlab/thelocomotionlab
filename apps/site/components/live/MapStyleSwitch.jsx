// components/live/MapStyleSwitch.jsx
//
// Sélecteur Plan / Topo / Satellite. Deux habillages : overlay sur la carte
// (mobile, 2a) et pastille de header (desktop, 2d — fond gris, sans ombre).

"use client";

const OPTIONS = [
  { id: "osm", label: "Plan" },
  { id: "topo", label: "Topo" },
  { id: "sat", label: "Satellite" },
];

export default function MapStyleSwitch({ value, onChange, variant = "overlay" }) {
  const wrapper =
    variant === "header"
      ? "inline-flex gap-[3px] rounded-[11px] bg-brand-text/5 p-1"
      : "inline-flex gap-[3px] rounded-[10px] bg-brand-bg/90 p-[3px] shadow-[0_4px_14px_rgba(51,51,51,0.18)]";

  return (
    <div className={wrapper}>
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`cursor-pointer rounded-lg border-none px-[13px] py-1.5 font-heading text-[11.5px] font-medium ${
            value === option.id
              ? "bg-brand-primary text-brand-bg"
              : "bg-transparent text-brand-text/60"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
