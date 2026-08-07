// components/SoutenirSection.jsx
//
// Page Soutenir, au gabarit des pages de lecture (Quête / À propos) :
// colonne max-w-3xl alignée à gauche, sections en SectionHeading (Lora
// italique + filet). Seul le bloc email final reste centré — c'est le
// motif commun à Comprendre / Quête / Twin. La capture email passe par le
// composant EmailCapture partagé (honeypot, aria-live, source « soutenir »).

import EmailCapture from "@/components/EmailCapture";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";

export default function SoutenirSection() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 font-sans">
      <PageHeader title="Soutenir l'exploration" />

      <p className="mb-10 text-lg text-brand-text/90">
        Le{" "}
        <strong className="font-semibold text-brand-deep">
          Locomotion Lab
        </strong>{" "}
        est un projet indépendant axé sur l&apos;exploration et le partage des
        connaissances.
      </p>

      <section className="mb-10">
        <SectionHeading className="mb-3">Comment soutenir ?</SectionHeading>
        <p className="mb-4">
          Plusieurs manières de contribuer au fonctionnement du Labo arrivent
          bientôt.
        </p>
        <p className="text-sm text-gray-600">
          Ton futur soutien aidera à financer les expérimentations, le matériel,
          la création de contenu et l’entretien du site web.
        </p>
      </section>

      <div className="mt-12 max-w-2xl mx-auto text-center">
        <h2 className="text-lg font-semibold mb-3 text-brand-accent-ink">
          Reste à l&rsquo;écoute !
        </h2>
        <p className="text-brand-text/80 mb-4">
          Si ce projet te parle et que tu souhaites rester informé·e des futures
          explorations ou soutenir le labo à terme, laisse ton mail ci-dessous.
        </p>
        <EmailCapture
          title={null}
          description={null}
          source="soutenir"
          placeholder="Ton adresse e-mail"
          buttonLabel="M'inscrire"
        />
      </div>
    </div>
  );
}
