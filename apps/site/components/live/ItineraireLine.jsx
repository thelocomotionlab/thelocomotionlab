// components/live/ItineraireLine.jsx
//
// La ligne « ITINÉRAIRE — 16 km · 435 m D+ · 439 m D− », partagée par les états
// Avant et En cours. Elle décrit le PARCOURS PRÉVU (lu du .track.json), jamais
// ce qui a été fait : les chiffres vécus vivent dans la carte Progression.
//
// Partagée pour de bon, et pas recopiée : les deux pages affichaient la même
// information dans deux typographies différentes (Lora italique d'un côté,
// libellé + chiffres de l'autre), ce qui se voyait en passant de l'une à l'autre.

const M = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

const valeur = (v) => (Number.isFinite(v) ? M.format(Math.round(v)) : "—");

export default function ItineraireLine({ reference, className = "" }) {
  return (
    <p
      className={`m-0 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 font-heading text-[11px] font-bold uppercase tracking-[0.16em] text-brand-deep-dark ${className}`}
    >
      Itinéraire
      {reference && (
        <span className="font-heading text-[11.5px] font-medium normal-case tracking-normal text-brand-text/60">
          {valeur(reference.totalKm)} km · {valeur(reference.dPlusM)} m D+ ·{" "}
          {valeur(reference.dMinusM)} m D−
        </span>
      )}
    </p>
  );
}
