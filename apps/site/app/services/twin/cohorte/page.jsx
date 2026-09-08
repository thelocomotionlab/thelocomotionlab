// app/services/twin/cohorte/page.jsx
//
// Rejoindre la cohorte de calibration du Locomotion Twin (maquette
// « Recrutement cohorte », 07/2026) : les athlètes test déposent leur
// archive d'entraînement, qui sert à calibrer et valider le moteur sur
// des données réelles, puis est supprimée. Tout l'interactif (choix de
// la montre, dépôt, formulaire, envoi vers le service twin-depot du VPS)
// vit dans components/twin/CohorteForm.jsx.
import CohorteForm from "@/components/twin/CohorteForm";
import DonneesStructurees from "@/components/DonneesStructurees";
import FilDAriane from "@/components/contenu/FilDAriane";
import RetourAIndex from "@/components/contenu/RetourAIndex";
import { filDAriane } from "@/lib/jsonld";
import { partageDIndex } from "@/lib/seo";

const PARTAGE =
  "Tes courses passées font avancer l'outil : dépose ton archive d'entraînement, elle calibre le moteur puis est supprimée — ton plan de course gratuit en échange.";

export const metadata = {
  title: "Rejoindre la cohorte – Locomotion Twin",
  description:
    "Confie ton archive d'entraînement au Locomotion Lab pour calibrer le Locomotion Twin sur des données réelles, et reçois ton plan de course gratuit en échange.",
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

export default function CohortePage() {
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

        <p className="mb-9 mt-8 max-w-[40em] font-sans text-lecture font-lecture leading-lecture text-brand-ink [text-wrap:pretty]">
          Le Twin apprend sur des données réelles. En rejoignant la cohorte, tu me confies ton
          archive d&rsquo;entraînement : elle sert à calibrer et valider le moteur, puis elle est{" "}
          <strong>supprimée</strong>. En échange, tu recevras ton plan de course gratuit dès que
          ton jumeau sera prêt.
        </p>

        <CohorteForm />

        <RetourAIndex href="/services/twin" label="Retour au Locomotion Twin" />
      </article>
    </div>
  );
}
