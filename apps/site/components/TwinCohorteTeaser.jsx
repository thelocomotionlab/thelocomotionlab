// components/TwinCohorteTeaser.jsx
//
// L'appel à la cohorte de calibration du Locomotion Twin, posé à trois endroits
// du site : bas de l'accueil, fin des récits et projets d'Explorer, et bas de
// la page /live.
//
// UN SEUL FICHIER pour les trois. La formulation d'un appel se retouche souvent
// (et vieillit d'un coup, le jour où l'outil sort de calibration) : elle ne doit
// pas être à réécrire en trois endroits, avec le risque que le troisième soit
// oublié. Le texte vit dans les constantes ci-dessous, les deux variantes ne
// font que l'habiller.
//
// DEUX VARIANTES, parce que les contextes n'ont rien à voir :
//   • « bande » — accueil. Section pleine largeur bleu ardoise, sur le modèle
//     exact de la bande « Recevoir les nouveautés du labo » juste en dessous :
//     même largeur utile, même disposition titre à gauche / action à droite.
//     Pas de cadre : une bande pleine largeur n'a pas de bord à dessiner.
//   • « carte » — Explorer et /live. Panneau posé DANS une colonne de lecture,
//     il lui faut donc un contour. Il reprend la grammaire du registre des
//     articles de l'accueil : lavis bleu + grille de labo, filet bleu épais en
//     tête, ombre douce.
//
// Bleu ardoise (#4E767A) et non bleu clair : 5,0:1 avec le blanc, conforme AA
// pour du texte courant.

import Link from "next/link";
import { Gauge } from "lucide-react";

const TITRE_ID = "twin-cohorte-titre";
const HREF = "/outils/twin/cohorte";
const KICKER = "EN CALIBRATION";
const TITRE = "Le Locomotion Twin cherche des données";
const CTA = "Rejoindre la cohorte";

/** Le texte, écrit une fois — les deux variantes se contentent de le colorer. */
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

/** Accueil : bande pleine largeur, calquée sur la bande de capture email. */
function Bande({ className }) {
  return (
    <section
      aria-labelledby={TITRE_ID}
      className={`bg-brand-slate-dark px-6 py-11 md:px-16 ${className}`}
    >
      <div className="mx-auto flex max-w-[1000px] flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-10">
        <div>
          <Kicker className="mb-2.5 text-[11px] text-white/70 md:text-xs" />
          <h2 id={TITRE_ID} className="text-[21px] font-bold leading-[1.3] text-white">
            {TITRE}
          </h2>
          <Texte className="mt-2.5 max-w-[560px] text-[15px] leading-[1.65] text-white/85" />
        </div>
        <div className="flex-none">
          <Link
            href={HREF}
            className="inline-block whitespace-nowrap rounded-full bg-white px-6 py-3 font-heading text-[15px] font-semibold text-brand-slate-dark shadow-cta transition-colors hover:bg-brand-bg"
          >
            {CTA}
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Explorer et /live : panneau dans la colonne de lecture. */
function Carte({ className }) {
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

/** @param {{ variant?: "carte" | "bande", className?: string }} props */
export default function TwinCohorteTeaser({ variant = "carte", className = "" }) {
  return variant === "bande" ? <Bande className={className} /> : <Carte className={className} />;
}
