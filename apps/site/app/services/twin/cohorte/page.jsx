// app/services/twin/cohorte/page.jsx
//
// Rejoindre la cohorte de calibration du Locomotion Twin : les athlètes test déposent leur
// archive d'entraînement, conservée selon le texte de consentement en ligne
// (lib/twinCohorte.mjs, VERSION_EN_LIGNE). Tout l'interactif (choix de la montre, dépôt,
// formulaire, envoi vers le service twin-depot du VPS) vit dans components/twin/CohorteForm.jsx.
import CohorteForm from "@/components/twin/CohorteForm";
import DonneesStructurees from "@/components/DonneesStructurees";
import FilDAriane from "@/components/contenu/FilDAriane";
import RetourAIndex from "@/components/contenu/RetourAIndex";
import { filDAriane } from "@/lib/jsonld";
import { partageDIndex } from "@/lib/seo";
import { TES_DONNEES, TEXTES_DE_CONSENTEMENT, VERSION_EN_LIGNE } from "@/lib/twinCohorte.mjs";

const PARTAGE =
  "Tes courses passées font avancer l'outil : confie ton archive d'entraînement au labo, et reçois ton plan de course gratuit.";

export const metadata = {
  title: "Rejoindre la cohorte – Locomotion Twin",
  description:
    "Confie ton archive d'entraînement au Locomotion Lab pour calibrer le Locomotion Twin et nourrir sa recherche, et reçois ton plan de course gratuit en échange.",
  ...partageDIndex({
    titre: "Rejoindre la cohorte du Locomotion Twin – The Locomotion Lab",
    description: PARTAGE,
    url: "/services/twin/cohorte",
  }),
};

const MAILLONS = [
  { href: "/services", label: "Services" },
  { href: "/services/twin", label: "Locomotion Twin" },
  { label: "Rejoindre la cohorte" },
];

const ETIQUETTE =
  "font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted";

export default function CohortePage() {
  const donnees = TES_DONNEES[VERSION_EN_LIGNE] ?? [];
  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-10 md:px-8">
      <DonneesStructurees id="cohorte" donnees={filDAriane(MAILLONS)} />

      <FilDAriane maillons={MAILLONS} />

      <article className="mx-auto mt-9 max-w-[860px] pb-6">
        <header>
          <div className="font-mono text-meta font-semibold uppercase tracking-etiquette text-brand-muted">
            <span className="font-bold text-brand-slate-dark">En ligne</span>
          </div>
          <h1 className="mt-4 font-heading text-[32px] font-bold leading-[1.05] tracking-[-0.015em] text-brand-slate-dark md:text-[42px]">
            Rejoindre la cohorte
          </h1>
          <p className="m-0 mt-3.5 max-w-[46ch] font-sans text-xl font-light leading-snug text-brand-deep-dark [text-wrap:pretty]">
            Tes courses passées font avancer l&rsquo;outil.
          </p>
          <div className="mt-5 h-[3px] w-16 rounded-full bg-brand-accent" aria-hidden="true" />
        </header>

        <p className="mt-8 max-w-[40em] font-sans text-lecture font-lecture leading-lecture text-brand-ink [text-wrap:pretty]">
          {TEXTES_DE_CONSENTEMENT[VERSION_EN_LIGNE].page}
        </p>

        {donnees.length ? (
          <section className="mb-9 mt-8 rounded-[14px] border border-brand-hairline bg-brand-paper px-7 py-6 shadow-bloc">
            <h2 className="m-0 font-mono text-xxs font-bold uppercase tracking-etiquette text-brand-slate">
              Tes données
            </h2>
            <dl className="m-0 mt-4 grid grid-cols-1 gap-x-[18px] gap-y-3.5 text-lecture font-lecture leading-lecture sm:grid-cols-[140px_minmax(0,1fr)]">
              {donnees.map(({ titre, texte }) => (
                <div key={titre} className="contents">
                  <dt className={`${ETIQUETTE} sm:pt-1.5`}>{titre}</dt>
                  <dd className="m-0 font-sans text-brand-ink [text-wrap:pretty]">{texte}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : (
          <div className="mb-9" />
        )}

        <CohorteForm />

        <RetourAIndex href="/services/twin" label="Retour au Locomotion Twin" />
      </article>
    </div>
  );
}
