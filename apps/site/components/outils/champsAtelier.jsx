// components/outils/champsAtelier.jsx
//
// LES BRIQUES DE FORMULAIRE DE L'ATELIER — et rien d'autre.
//
// Elles vivaient dans `CarrouselAtelier.jsx`, au milieu de l'état et du canvas.
// L'espace de travail à la Canva a multiplié les panneaux : chaque réglage
// existe maintenant à un seul endroit, mais le fichier qui les portait tous
// devenait illisible. Ici, il n'y a QUE des composants sans mémoire — ils
// reçoivent une valeur, ils rendent un `onChange`. Rien à comprendre au reste.
//
// Les classes utilitaires sont exportées avec eux : un panneau qui compose un
// champ à la main (un `<select>`, un `<input>` libre) doit pouvoir porter
// exactement la même allure sans la recopier.

"use client";

import { useState } from "react";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";

import { CLES_ICONES } from "@/lib/carrouselIcones";
import { iconeDuRepere } from "@/lib/liveWaypointIcons";

export const CHAMP =
  "w-full rounded-xl border border-brand-field bg-brand-paper px-3 py-2 font-heading text-[15px] text-brand-text focus:border-brand-primary-dark focus:outline-none";
export const BOUTON_PRINCIPAL =
  "inline-flex items-center justify-center gap-2 rounded-full bg-brand-deep px-5 py-2.5 font-heading text-[14px] font-medium text-brand-bg transition-colors hover:bg-brand-deep-dark disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none";
export const BOUTON_SECOND =
  "inline-flex items-center justify-center gap-2 rounded-full border border-brand-primary/45 bg-brand-primary/12 px-4 py-2 font-heading text-[14px] font-medium text-brand-primary-dark transition-colors hover:border-brand-primary-dark hover:bg-brand-primary/30 hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none";
export const BOUTON_DISCRET =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-brand-field bg-brand-paper px-2.5 py-1.5 font-heading text-[12px] text-brand-text/70 transition-colors hover:border-brand-primary-dark hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-40";
export const LEGENDE =
  "mb-1 block font-heading text-[13px] font-medium text-brand-text/70";
export const CASE =
  "flex items-center gap-2 font-heading text-[14px] text-brand-text/75";
export const AIDE = "font-heading text-[12px] leading-snug text-brand-text/50";

/**
 * Les icônes de la palette, RÉSOLUES UNE FOIS au chargement du module.
 *
 * C'est le motif déjà en place dans `lib/liveWaypoints.js` : le composant est
 * résolu hors du rendu et voyage comme une donnée (`{ cle, Icone }`). Le
 * chercher pendant le rendu en referait un type à chaque passe — React
 * remonterait le sous-arbre, et le lint le refuse.
 */
export const ICONES_PALETTE = CLES_ICONES.map((cle) => ({
  cle,
  Icone: iconeDuRepere(cle),
}));
export const ICONES_PAR_CLE = Object.fromEntries(
  ICONES_PALETTE.map(({ cle, Icone }) => [cle, Icone]),
);

/** Un groupe de réglages dans un panneau. Un titre, un trait, du contenu. */
export function Groupe({ titre, aide, children }) {
  return (
    <section className="border-b border-brand-field/60 px-4 py-4 last:border-b-0">
      <h3 className="mb-2 font-heading text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-text/45">
        {titre}
      </h3>
      {aide && <p className={`${AIDE} mb-3`}>{aide}</p>}
      {children}
    </section>
  );
}

/** L'aperçu d'une puce de liste. Le composant arrive en PROP, jamais résolu ici. */
export function Puce({ cle, Icone, size = 16 }) {
  if (!cle || cle === "point") return <span className="leading-none">•</span>;
  if (cle === "tiret" || cle === "tiret-long")
    return <span className="leading-none">–</span>;
  return Icone ? <Icone size={size} aria-hidden /> : null;
}

/**
 * UN CHAMP DE NOMBRE QU'ON PEUT VIDER.
 *
 * `<input type="number">` rend `""` quand on efface, et `Number("")` vaut 0 :
 * remonter cette valeur au parent à chaque frappe faisait sauter le champ à
 * zéro (ou au défaut) dès qu'on essayait de retaper un nombre. On garde donc
 * une copie LOCALE de ce qui est tapé, et on ne remonte que ce qui est un
 * nombre — le champ peut rester vide le temps de la frappe.
 *
 * Au `blur`, la copie locale est jetée : le champ réaffiche la valeur réelle,
 * donc une saisie abandonnée à vide ne laisse pas un trou.
 */
export function Nombre({
  id,
  valeur,
  defaut,
  onChange,
  min,
  max,
  pas,
  classe = CHAMP,
  ...reste
}) {
  const [brut, setBrut] = useState(null);
  const affiche = brut ?? (valeur ?? defaut ?? "");
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={pas}
      value={affiche}
      onChange={(e) => {
        const texte = e.target.value;
        setBrut(texte);
        const n = Number(texte);
        if (texte !== "" && Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setBrut(null)}
      className={classe}
      {...reste}
    />
  );
}

/** Un réglage numérique en pixels de planche (référence : 1080 de large). */
export function Taille({ id, label, valeur, defaut, onChange, min = 8, max = 400 }) {
  return (
    <div>
      <label className={LEGENDE} htmlFor={id}>
        {label}
      </label>
      <Nombre id={id} valeur={valeur} defaut={defaut} min={min} max={max} onChange={onChange} />
    </div>
  );
}

/** Une couleur, avec le moyen de revenir à celle du thème. */
export function Couleur({ label, valeur, defaut, onChange }) {
  return (
    <div>
      <span className={LEGENDE}>{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={valeur || defaut}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full cursor-pointer rounded-lg border border-brand-field bg-transparent"
          aria-label={label}
        />
        <button
          type="button"
          onClick={() => onChange("")}
          disabled={!valeur}
          className="rounded-full p-1.5 text-brand-text/40 hover:bg-brand-primary/15 hover:text-brand-primary-dark disabled:opacity-25"
          title="Revenir à la couleur du thème"
          aria-label={`${label} — revenir au thème`}
        >
          <RotateCcw size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * UN CURSEUR, et la valeur écrite à côté.
 *
 * `valeur` peut être absente : on affiche alors `defaut` sans l'écrire dans la
 * carte. C'est ce qui permet à une planche de ne RIEN dire et de suivre la
 * charte — jusqu'au jour où on touche le curseur.
 */
export function Curseur({
  id,
  label,
  valeur,
  defaut,
  min,
  max,
  pas = 0.05,
  format = (v) => v.toFixed(2),
  onChange,
}) {
  const v = Number.isFinite(valeur) ? valeur : defaut;
  const touche = Number.isFinite(valeur) && valeur !== defaut;
  return (
    <div>
      <label className={`${LEGENDE} flex items-center justify-between`} htmlFor={id}>
        <span>{label}</span>
        <span className="flex items-center gap-1 tabular-nums font-normal opacity-70">
          {format(v)}
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={!touche}
            className="rounded-full p-0.5 text-brand-text/35 hover:bg-brand-primary/15 hover:text-brand-primary-dark disabled:opacity-0"
            title="Revenir à la valeur de la charte"
            aria-label={`${label} — revenir à la charte`}
          >
            <RotateCcw size={12} aria-hidden />
          </button>
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={pas}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-primary-dark"
      />
    </div>
  );
}

/** Le cas particulier — et fréquent — d'une opacité de 0 à 1. */
export function Opacite({ id, label, valeur, onChange, defaut = 1 }) {
  return (
    <Curseur
      id={id}
      label={label}
      valeur={valeur}
      defaut={defaut}
      min={0}
      max={1}
      pas={0.05}
      format={(v) => `${Math.round(v * 100)} %`}
      onChange={(v) => onChange(v ?? defaut)}
    />
  );
}

/** Une case à cocher, libellé à droite. */
export function Case({ label, coche, onChange, classe = "" }) {
  return (
    <label className={`${CASE} ${classe}`}>
      <input
        type="checkbox"
        checked={Boolean(coche)}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

/** Un choix parmi quelques options, en pastilles — plus rapide qu'un menu. */
export function Choix({ label, valeur, options, onChange }) {
  return (
    <div>
      {label && <span className={LEGENDE}>{label}</span>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={String(o.cle)}
            type="button"
            onClick={() => onChange(o.cle)}
            aria-pressed={valeur === o.cle}
            className={`rounded-full border px-3 py-1.5 font-heading text-[13px] transition-colors motion-reduce:transition-none ${
              valeur === o.cle
                ? "border-brand-primary-dark bg-brand-primary/25 text-brand-text"
                : "border-brand-field bg-brand-paper text-brand-text/65 hover:border-brand-primary/60"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * LE ZOOM DE LA SCÈNE.
 *
 * « Ajuster » (l'état par défaut, `null`) fait tenir la planche dans la place
 * disponible — pratique pour juger la composition, inutile pour vérifier qu'un
 * corps de 22 px se lit. D'où le zoom : il donne la taille RÉELLE des pixels de
 * l'export, et il faut pouvoir y aller sans quitter l'atelier.
 *
 * Le zoom est un facteur sur la largeur du format (1080), pas sur la taille
 * affichée : 100 % = un pixel de planche pour un pixel d'écran, ce qui est la
 * seule référence qui ne bouge pas avec la fenêtre.
 */
export function Zoom({ valeur, onChange, mesurer }) {
  const pas = (delta) => {
    const actuel = valeur ?? mesurer?.() ?? 0.4;
    const suivant = Math.min(3, Math.max(0.1, Math.round((actuel + delta) * 20) / 20));
    onChange(suivant);
  };
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-brand-field bg-brand-paper px-1 py-0.5">
      <button
        type="button"
        onClick={() => pas(-0.1)}
        className="rounded-full p-1.5 text-brand-text/60 hover:bg-brand-primary/15 hover:text-brand-text"
        aria-label="Réduire"
      >
        <Minus size={14} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onChange(null)}
        className="min-w-[64px] rounded-full px-2 py-1 font-heading text-[12px] tabular-nums text-brand-text/70 hover:bg-brand-primary/15 hover:text-brand-text"
        title="Ajuster à la fenêtre"
      >
        {valeur == null ? (
          <span className="inline-flex items-center gap-1">
            <Maximize2 size={12} aria-hidden />
            Ajuster
          </span>
        ) : (
          `${Math.round(valeur * 100)} %`
        )}
      </button>
      <button
        type="button"
        onClick={() => pas(0.1)}
        className="rounded-full p-1.5 text-brand-text/60 hover:bg-brand-primary/15 hover:text-brand-text"
        aria-label="Agrandir"
      >
        <Plus size={14} aria-hidden />
      </button>
    </div>
  );
}
