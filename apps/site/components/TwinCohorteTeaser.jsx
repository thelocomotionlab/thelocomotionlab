// components/TwinCohorteTeaser.jsx
//
// L'appel à la cohorte de calibration du Locomotion Twin, posé en fin des
// récits et des projets d'Explorer, et en bas de la page /live.
//
// Il a aussi été essayé en bas de l'ACCUEIL, en bande bleue pleine largeur
// puis sous cette forme : retiré dans les deux cas, il n'y rendait pas bien.
// Ne pas l'y remettre sans repenser le bloc.
//
// UN SEUL FICHIER pour les deux. La formulation d'un appel se retouche souvent
// (et vieillit d'un coup, le jour où l'outil sort de calibration) : elle ne doit
// pas être à réécrire en trois endroits, avec le risque que le troisième soit
// oublié. Le texte vit dans les constantes ci-dessous.
//
// La forme : un panneau à lavis bleu et grille de labo, qui reprend la
// grammaire du registre des articles de l'accueil (filet bleu épais en tête,
// ombre douce, bouton terracotta).

import Link from "next/link";
import { Gauge } from "lucide-react";

const TITRE_ID = "twin-cohorte-titre";
const HREF = "/outils/twin/cohorte";
const KICKER = "EN CALIBRATION";
const TITRE = "Le Locomotion Twin cherche des données";
const CTA = "Rejoindre la cohorte";

/** Le corps de l'appel, écrit une fois. */
function Texte({ className = "" }) {
  return (
    <p className={className}>
      Je développe au labo un outil qui prédit un plan de course de trail et
      d&rsquo;ultra. Pour le calibrer, il me faut des archives
      d&rsquo;entraînement réelles. Prête la tienne pour faire avancer la
      science, et reçois ton plan de course gratuit en échange.
    </p>
  );
}

function Kicker({ className }) {
  return (
    <p className={`flex items-center gap-2 font-heading font-bold tracking-[0.18em] ${className}`}>
      <Gauge size={14} strokeWidth={2} aria-hidden="true" />
      {KICKER}
    </p>
  );
}

/** @param {{ className?: string }} props espacements propres à chaque page. */
export default function TwinCohorteTeaser({ className = "" }) {
  return (
    <aside
      aria-labelledby={TITRE_ID}
      className={`overflow-hidden rounded-2xl border border-brand-wash-line border-t-[3px] border-t-brand-primary-dark bg-brand-wash/45 bg-lab-grid-blue p-[22px] shadow-card [background-size:28px_28px] md:flex md:items-center md:justify-between md:gap-8 md:px-8 md:py-7 ${className}`}
    >
      <div className="md:min-w-0">
        <Kicker className="mb-2 text-[11px] text-brand-slate-dark md:text-xs" />
        <h2
          id={TITRE_ID}
          className="mb-1.5 text-[17.5px] font-bold leading-[1.35] text-brand-slate-dark md:text-xl"
        >
          {TITRE}
        </h2>
        <Texte className="max-w-[560px] text-[14.5px] leading-[1.65] text-brand-text/75 md:text-[15px]" />
      </div>
      <div className="mt-5 flex-none md:mt-0">
        <Link
          href={HREF}
          className="inline-block whitespace-nowrap rounded-full bg-brand-accent px-5 py-2.5 font-heading text-[14px] font-semibold text-white shadow-cta transition-colors hover:bg-brand-accent-dark"
        >
          {CTA}
        </Link>
      </div>
    </aside>
  );
}
