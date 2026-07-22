// app/mentions-legales/page.jsx
import PageHeader from "@/components/PageHeader";

export const metadata = {
  title: "Mentions légales – The Locomotion Lab",
  description:
    "Informations légales du site thelocomotionlab.com : éditeur, hébergeur, propriété intellectuelle et contact du Locomotion Lab.",
  alternates: {
    canonical: "https://thelocomotionlab.com/mentions-legales",
  },
  openGraph: {
    title: "Mentions légales – The Locomotion Lab",
    description:
      "Informations légales du site thelocomotionlab.com : éditeur, hébergeur, propriété intellectuelle et contact du Locomotion Lab.",
    url: "https://thelocomotionlab.com/mentions-legales",
    type: "website",
    locale: "fr_FR",
    images: [
      {
        url: "https://thelocomotionlab.com/images/assets/og-image.jpg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mentions légales – The Locomotion Lab",
    description:
      "Informations légales du site thelocomotionlab.com : éditeur, hébergeur, propriété intellectuelle et contact du Locomotion Lab.",
    images: ["https://thelocomotionlab.com/images/assets/og-image.jpg"],
  },
};

export default function MentionsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 font-sans text-left md:text-justify hyphens-auto">
      <PageHeader title="Mentions légales" />

      <section className="mb-8">
        <h2 className="text-xl font-sans font-semibold mb-2 text-brand-deep">
          Éditeur du site
        </h2>
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
        <h2 className="text-xl font-sans font-semibold mb-2 text-brand-deep">
          Hébergement
        </h2>
        <p>
          Le site est hébergé par <strong>Cloudflare, Inc.</strong>
          <br />
          Adresse : 101 Townsend St, San Francisco, CA 94107, États-Unis
          <br />
          Téléphone : +1 (650) 319-8930
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-sans font-semibold mb-2 text-brand-deep">
          Propriété intellectuelle
        </h2>
        <p>
          Sauf mention contraire, l’ensemble des contenus (textes, images,
          codes) de ce site sont la propriété exclusive de l’éditeur et ne
          peuvent être reproduits sans autorisation préalable.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-sans font-semibold mb-2 text-brand-deep">
          Crédits photographiques
        </h2>
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
