"use client";

// components/Controles.tsx
//
// LES PETITS CONTRÔLES DE L'INSPECTEUR, une fois pour toutes.
//
// Neuf types d'élément portent chacun leurs réglages, et sans ces briques
// chaque panneau réinventait son champ nombre, sa case à cocher et son
// sélecteur — trois hauteurs de ligne différentes dans une colonne de 296 px.

const CHAMP =
  "rounded border border-brand-field bg-brand-bg px-1.5 py-1 text-[13px] text-brand-text";

export function Nombre({
  libelle,
  valeur,
  onChange,
  suffixe = "",
  pas = 1,
  decimales = 0,
}: {
  libelle: string;
  valeur: number;
  onChange: (n: number) => void;
  suffixe?: string;
  pas?: number;
  decimales?: number;
}) {
  const arrondi = 10 ** decimales;
  return (
    <label className="flex items-center justify-between gap-2 py-0.5 text-[12px]">
      <span className="text-brand-muted">{libelle}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          step={pas}
          value={Math.round((valeur || 0) * arrondi) / arrondi}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`tabulaire w-20 text-right ${CHAMP}`}
        />
        {suffixe && <span className="w-4 text-brand-muted">{suffixe}</span>}
      </span>
    </label>
  );
}

/** Un réglage de 0 à 1 : opacité, voile, fondu. Le chiffre s'affiche en %. */
export function Curseur({
  libelle,
  valeur,
  onChange,
  max = 1,
}: {
  libelle: string;
  valeur: number;
  onChange: (n: number) => void;
  max?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-2 py-0.5 text-[12px]">
      <span className="shrink-0 text-brand-muted">{libelle}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <input
          type="range"
          min={0}
          max={max}
          step={max / 100}
          value={valeur || 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="min-w-0 flex-1 accent-brand-primary-dark"
        />
        <span className="tabulaire w-9 shrink-0 text-right text-[11px] text-brand-soft">
          {Math.round(((valeur || 0) / max) * 100)}%
        </span>
      </span>
    </label>
  );
}

export function Case({
  libelle,
  coche,
  onChange,
}: {
  libelle: string;
  coche: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 py-0.5 text-[12px] text-brand-soft">
      <input
        type="checkbox"
        checked={coche}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-brand-primary-dark"
      />
      {libelle}
    </label>
  );
}

export function Choix<T extends string>({
  libelle,
  valeur,
  options,
  onChange,
}: {
  libelle: string;
  valeur: T;
  options: readonly { cle: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 py-0.5 text-[12px]">
      <span className="shrink-0 text-brand-muted">{libelle}</span>
      <select
        value={valeur}
        onChange={(e) => onChange(e.target.value as T)}
        className={`min-w-0 flex-1 ${CHAMP}`}
      >
        {options.map((o) => (
          <option key={o.cle} value={o.cle}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Mot({
  libelle,
  valeur,
  onChange,
  onBlur,
  placeholder = "",
}: {
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-2 py-0.5 text-[12px]">
      <span className="shrink-0 text-brand-muted">{libelle}</span>
      <input
        type="text"
        value={valeur}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={`min-w-0 flex-1 ${CHAMP}`}
      />
    </label>
  );
}

/**
 * UNE COULEUR, ET LE DROIT DE NE PAS EN CHOISIR.
 *
 * Vide veut dire « celle du thème » partout dans le modèle, et c'est la valeur
 * qui compte : une planche recolorée à la main cesse de suivre le thème quand on
 * la bascule en sombre. Le bouton rend donc ce vide, qu'un sélecteur de couleur
 * natif ne sait pas exprimer.
 */
export function Couleur({
  libelle,
  valeur,
  onChange,
  defaut = "#000000",
}: {
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  defaut?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-[12px]">
      <span className="text-brand-muted">{libelle}</span>
      <span className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange("")}
          aria-pressed={!valeur}
          title="Reprendre la couleur du thème"
          className={`h-6 rounded border px-1.5 text-[11px] transition-colors motion-reduce:transition-none ${
            valeur
              ? "border-brand-field text-brand-muted hover:bg-brand-primary/12"
              : "border-brand-primary-dark text-brand-text"
          }`}
        >
          Thème
        </button>
        <input
          type="color"
          value={valeur || defaut}
          onChange={(e) => onChange(e.target.value)}
          aria-label={libelle}
          className="h-6 w-8 cursor-pointer rounded border border-brand-field bg-brand-bg"
        />
      </span>
    </div>
  );
}

/** Un bouton d'action de panneau — ajouter une ligne, retirer une étiquette. */
export function Bouton({
  children,
  onClick,
  titre,
}: {
  children: React.ReactNode;
  onClick: () => void;
  titre?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      className="inline-flex h-7 items-center gap-1 rounded-md border border-brand-field px-2 text-[12px] transition-colors hover:bg-brand-primary/12 motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}
