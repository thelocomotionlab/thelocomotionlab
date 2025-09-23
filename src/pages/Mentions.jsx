export default function Mentions() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 text-gray-800 font-sans">
      <h1 className="text-3xl font-sans font-bold mb-6 text-brand-primary">
        Mentions légales
      </h1>

      <section className="mb-8">
        <h2 className="text-xl font-sans font-semibold mb-2 text-brand-primary">Éditeur du site</h2>
        <p>
          Ce site est édité par Valentin FER.<br/>  
          Contact : <a
            href="mailto:thelocomotionlab@gmail.com"
            className="text-brand-primary hover:underline"
          >
            thelocomotionlab@gmail.com
          </a>
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-sans font-semibold mb-2 text-brand-primary">Hébergement</h2>
        <p>
          Le site est hébergé par Cloudflare, Inc.<br/>
          Adresse : 101 Townsend St, San Francisco, CA 94107, États-Unis<br/>
          Téléphone : +1 (650) 319-8930
        </p>
      </section>

      <section>
        <h2 className="text-xl font-sans font-semibold mb-2 text-brand-primary">Propriété intellectuelle</h2>
        <p>
          Sauf mention contraire, l’ensemble des contenus (textes, images, codes) de ce site
          sont la propriété exclusive de l’éditeur et ne peuvent être reproduits sans autorisation préalable.
        </p>
      </section>
    </main>
  );
}
