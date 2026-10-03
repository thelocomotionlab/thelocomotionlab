// app/services/twin/tableau-de-bord/cohorte/page.jsx
//
// L'APERÇU DE LA PAGE COHORTE : le texte et la case de la version en ligne
// (lib/twinCohorte.mjs, VERSION_EN_LIGNE), le formulaire en aperçu — rien ne part au
// dépôt.
//
// Hors index, hors plan de site, hors navigation, derrière la serrure du tableau de bord :
// cf. app/robots.js, app/sitemap.js et public/_headers.
import CohorteForm from "@/components/twin/CohorteForm";
import { TEXTES_DE_CONSENTEMENT, VERSION_EN_LIGNE } from "@/lib/twinCohorte.mjs";

const VERSION = VERSION_EN_LIGNE;

export const metadata = {
  title: "Aperçu de la page cohorte – Tableau de bord Twin",
  robots: { index: false, follow: false },
};

export default function ApercuCohortePage() {
  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-10 md:px-8">
      <article className="mx-auto max-w-[860px] pb-6">
        <p className="font-mono text-meta font-semibold uppercase tracking-etiquette text-brand-deep-dark">
          Aperçu · texte {VERSION} · en ligne
        </p>
        <header className="mt-4">
          <h1 className="font-heading text-[32px] font-bold leading-[1.05] tracking-[-0.015em] text-brand-slate-dark md:text-[42px]">
            Rejoindre la cohorte
          </h1>
          <p className="m-0 mt-3.5 max-w-[46ch] font-sans text-xl font-light leading-snug text-brand-deep-dark [text-wrap:pretty]">
            Tes courses passées font avancer l&rsquo;outil.
          </p>
          <div className="mt-5 h-[3px] w-16 rounded-full bg-brand-accent" aria-hidden="true" />
        </header>
        <p className="mb-9 mt-8 max-w-[40em] font-sans text-lecture font-lecture leading-lecture text-brand-ink [text-wrap:pretty]">
          {TEXTES_DE_CONSENTEMENT[VERSION].page}
        </p>
        <CohorteForm version={VERSION} apercu />
      </article>
    </div>
  );
}
