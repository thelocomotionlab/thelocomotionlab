import { Helmet } from "react-helmet";

export default function Mentions() {
  return (
    <>
      <Helmet>
        <title>Mentions légales – The Locomotion Lab</title>
        <meta
          name="description"
          content="Informations légales du site thelocomotionlab.com : éditeur, hébergeur, propriété intellectuelle et contact du Locomotion Lab."
        />
        <link rel="canonical" href="https://thelocomotionlab.com/mentions-legales" />

        {/* Open Graph */}
        <meta property="og:title" content="Mentions légales – The Locomotion Lab" />
        <meta
          property="og:description"
          content="Informations légales du site thelocomotionlab.com : éditeur, hébergeur, propriété intellectuelle et contact du Locomotion Lab."
        />
        <meta
          property="og:image"
          content="https://thelocomotionlab.com/images/assets/og-image.jpg"
        />
        <meta property="og:url" content="https://thelocomotionlab.com/mentions-legales" />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="fr_FR" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Mentions légales – The Locomotion Lab" />
        <meta
          name="twitter:description"
          content="Informations légales du site thelocomotionlab.com : éditeur, hébergeur, propriété intellectuelle et contact du Locomotion Lab."
        />
        <meta
          name="twitter:image"
          content="https://thelocomotionlab.com/images/assets/og-image.jpg"
        />
      </Helmet>


      <main className="max-w-3xl mx-auto px-6 py-12 text-gray-800 font-sans">
        <h1 className="text-3xl font-sans font-bold mb-6 text-brand-primary">
          Mentions légales
        </h1>

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
              className="text-brand-accent hover:underline"
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
            La photo présente en page d'accueil est une œuvre originale réalisée
            par <strong>Caroline Fer</strong>, et retouchée à l'aide de l'Intelligence Artificielle.
            <br />
            Pour toute demande de contact ou de collaboration éventuelle :{" "}
            <a
              href="mailto:caroline.fer69@gmail.com"
              className="text-brand-accent hover:underline"
            >
              caroline.fer69@gmail.com
            </a>
          </p>
        </section>
      </main>
    </>
  );
}
