export default function Contact() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-12 text-gray-800 font-sans">
      <h1 className="text-3xl font-sans font-bold mb-8 text-brand-primary">
        Contact
      </h1>

      <p className="mb-6">
        Une question, une idée, une envie de collaborer ?  
        Écris-moi via ce formulaire ou directement par mail à{" "}
        <a
          href="mailto:thelocomotionlab@gmail.com"
          className="text-brand-primary hover:underline"
        >
          thelocomotionlab@gmail.com
        </a>.
      </p>

      {/* Formulaire */}
      <form
        action="https://formspree.io/f/xxxxxx"  // ⚠️ à remplacer par ton endpoint Formspree ou autre
        method="POST"
        className="space-y-4"
      >
        <div>
          <label htmlFor="name" className="block text-sm font-sans font-medium mb-1">
            Nom
          </label>
          <input
            type="text"
            id="name"
            name="name"
            required
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-sans font-medium mb-1">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent"
          />
        </div>

        <div>
          <label htmlFor="message" className="block text-sm font-sans font-medium mb-1">
            Message
          </label>
          <textarea
            id="message"
            name="message"
            rows="5"
            required
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent"
          ></textarea>
        </div>

        <button
          type="submit"
          className="bg-brand-primary text-white font-sans font-semibold px-6 py-2 rounded-lg shadow hover:bg-brand-primary/90 transition"
        >
          Envoyer
        </button>
      </form>
    </main>
  );
}
