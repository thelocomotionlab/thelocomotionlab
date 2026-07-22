// components/SoutenirSection.jsx
//
// Page Soutenir. La capture email passe par le composant EmailCapture
// partagé (honeypot, aria-live, messages d'état harmonisés) avec la
// source « soutenir » — plus de formulaire recodé à la main ici.

import EmailCapture from "@/components/EmailCapture";
import PageHeader from "@/components/PageHeader";

export default function SoutenirSection() {
  return (
    <section className="py-10 text-center">
      <div className="mx-auto max-w-2xl px-4 text-left">
        <PageHeader kicker="/ LE LABO" title="Soutenir l'exploration" />
      </div>

      <p className="text-lg md:text-xl text-brand-text opacity-90 mb-8 max-w-2xl mx-auto px-4">
        Le{" "}
        <strong className="font-semibold text-brand-deep">
          Locomotion Lab
        </strong>{" "}
        est un projet indépendant axé sur l&apos;exploration et le partage des
        connaissances.
      </p>

      <div className="bg-white rounded-2xl shadow-card p-6 md:p-8 max-w-lg mx-auto mb-8">
        <h2 className="text-xl font-semibold mb-3 text-brand-deep">
          Comment soutenir ?
        </h2>
        <p className="text-brand-text mb-4">
          Plusieurs manières de contribuer au fonctionnement du Labo arrivent
          bientôt.
        </p>
        <p className="text-sm opacity-70">
          Ton futur soutien aidera à financer les expérimentations, le matériel,
          la création de contenu et l’entretien du site web.
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4">
        <h2 className="text-lg font-semibold mb-3 text-brand-accent-ink">
          Restez à l&rsquo;écoute !
        </h2>
        <p className="text-brand-text opacity-80 mb-4">
          Si ce projet te parle et que tu souhaites rester informé·e des futures
          explorations ou soutenir le labo à terme, laisse ton mail ci-dessous.
        </p>

        <EmailCapture
          title={null}
          description={null}
          source="soutenir"
          placeholder="Votre adresse e-mail"
          buttonLabel="M'inscrire"
        />
      </div>
    </section>
  );
}
