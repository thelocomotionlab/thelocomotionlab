// components/TwinCohorteTeaser.jsx
//
// L'appel à la cohorte de calibration du Locomotion Twin, posé à trois endroits
// du site : bas de l'accueil, fin des récits et projets d'Explorer, et bas de
// la page /live.
//
// UN SEUL FICHIER pour les trois. La formulation d'un appel se retouche souvent
// (et vieillit d'un coup, le jour où l'outil sort de calibration) : elle ne doit
// pas être à réécrire en trois endroits, avec le risque que le troisième soit
// oublié. Pour retirer l'appel du site entier, il suffira de retirer les trois
// balises.
//
// Le gabarit est celui des teasers déjà en place (cadre pointillé du teaser
// « Accompagnement trail 2027 » sur Pratiquer, et des états vides) : l'appel se
// lit comme une annonce du labo, pas comme un encart publicitaire greffé.

import Link from "next/link";
import { Gauge } from "lucide-react";

/** @param {{ className?: string }} props espacements propres à chaque page. */
export default function TwinCohorteTeaser({ className = "" }) {
  return (
    <aside
      aria-labelledby="twin-cohorte-titre"
      className={`rounded-2xl border-[1.5px] border-dashed border-brand-wash-line p-[22px] md:flex md:items-center md:justify-between md:gap-8 md:px-8 md:py-7 ${className}`}
    >
      <div className="md:min-w-0">
        <p className="mb-2 flex items-center gap-2 font-heading text-[11px] font-bold tracking-[0.18em] text-brand-primary md:text-xs">
          <Gauge size={14} strokeWidth={2} aria-hidden="true" />
          EN CALIBRATION
        </p>
        <h2
          id="twin-cohorte-titre"
          className="mb-1.5 text-[17.5px] font-bold leading-[1.35] text-brand-slate-dark md:text-xl"
        >
          Le Locomotion Twin cherche des données
        </h2>
        <p className="max-w-[560px] text-[14.5px] leading-[1.65] text-gray-600 md:text-[15px]">
          Je développe au labo un outil qui prédit un plan de course de trail et
          d&rsquo;ultra. Pour le calibrer, il me faut des archives
          d&rsquo;entraînement réelles. Prête la tienne pour faire avancer la
          science, et reçois ton plan de course gratuit en échange.
        </p>
      </div>
      <div className="mt-4 flex-none md:mt-0">
        <Link
          href="/outils/twin/cohorte"
          className="inline-block whitespace-nowrap rounded-full bg-brand-accent px-5 py-2.5 font-heading text-[14px] font-semibold text-white shadow-cta transition hover:bg-brand-accent-dark"
        >
          Rejoindre la cohorte
        </Link>
      </div>
    </aside>
  );
}
