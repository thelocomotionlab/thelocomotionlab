// app/mentions-legales/page.jsx
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import { partageDIndex } from "@/lib/seo";

const DESCRIPTION =
  "Informations légales du site thelocomotionlab.com : éditeur, hébergeur, propriété intellectuelle et contact du Locomotion Lab.";

export const metadata = {
  title: "Mentions légales – The Locomotion Lab",
  description: DESCRIPTION,
  ...partageDIndex({
    titre: "Mentions légales – The Locomotion Lab",
    description: DESCRIPTION,
    url: "/mentions-legales",
  }),
};

export default function MentionsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 font-sans text-left md:text-justify hyphens-auto">
      <PageHeader title="Mentions légales" />

      <section className="mb-8">
        <SectionHeading className="mb-3">Éditeur du site</SectionHeading>
        <p>
          Ce site est développé et édité par <strong>Valentin Fer</strong>.
          <br />
          Contact :{" "}
          <a
            href="mailto:thelocomotionlab@gmail.com"
            className="font-semibold text-brand-deep-dark underline underline-offset-2 decoration-brand-accent-dark/60 hover:decoration-brand-accent-dark"
          >
            thelocomotionlab@gmail.com
          </a>
        </p>
      </section>

      <section className="mb-8">
        <SectionHeading className="mb-3">Hébergement</SectionHeading>
        <p>
          Le site est hébergé par <strong>Cloudflare, Inc.</strong>
          <br />
          Adresse : 101 Townsend St, San Francisco, CA 94107, États-Unis
          <br />
          Téléphone : +1 (650) 319-8930
        </p>
      </section>

      <section className="mb-8">
        <SectionHeading className="mb-3">Propriété intellectuelle</SectionHeading>
        <p>
          Sauf mention contraire, l’ensemble des contenus (textes, images,
          codes) de ce site sont la propriété exclusive de l’éditeur et ne
          peuvent être reproduits sans autorisation préalable.
        </p>
      </section>

      <section className="mb-8">
        <SectionHeading className="mb-3">Crédits photographiques</SectionHeading>
        <p>
          La photo présente en page d&apos;accueil est une œuvre originale
          réalisée par <strong>Caroline Fer</strong>.
          <br />
          Pour toute demande de contact ou de collaboration éventuelle :{" "}
          <a
            href="mailto:caroline.fer69@gmail.com"
            className="font-semibold text-brand-deep-dark underline underline-offset-2 decoration-brand-accent-dark/60 hover:decoration-brand-accent-dark"
          >
            caroline.fer69@gmail.com
          </a>
        </p>
      </section>
    </div>
  );
}
