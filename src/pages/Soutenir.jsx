// src/pages/Soutenir.jsx
import { useState } from "react";
import { Mail } from "lucide-react"; // Icône Mail

import { Helmet } from "react-helmet";


export default function Soutenir() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | success | error

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("sending");

    try {
      const res = await fetch("https://formspree.io/f/mwprjnje", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (

    <>
      <Helmet>
        <title>Soutenir le Labo – The Locomotion Lab</title>
        <meta
          name="description"
          content="Contribue au développement du Locomotion Lab : financement matériel, soutien aux expérimentations et à la création de contenus indépendants."
        />
        <link rel="canonical" href="https://thelocomotionlab.com/soutenir" />

        {/* Open Graph */}
        <meta property="og:title" content="Soutenir le Labo – The Locomotion Lab" />
        <meta
          property="og:description"
          content="Contribue au développement du Locomotion Lab : financement matériel, soutien aux expérimentations et à la création de contenus indépendants."
        />
        <meta property="og:image" content="https://thelocomotionlab.com/images/assets/og-image.jpg" />
        <meta property="og:url" content="https://thelocomotionlab.com/soutenir" />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="fr_FR" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Soutenir le Labo – The Locomotion Lab" />
        <meta
          name="twitter:description"
          content="Contribue au développement du Locomotion Lab : financement matériel, soutien aux expérimentations et à la création de contenus indépendants."
        />
        <meta name="twitter:image" content="https://thelocomotionlab.com/images/assets/og-image.jpg" />
      </Helmet>


      <section className="py-10 text-center">
        {/* Titre principal */}
        <h2 className="text-3xl font-bold mb-6 text-brand-primary text-center">
          Soutenir l'Exploration
        </h2>

        {/* Texte explicatif */}
        <p className="text-lg md:text-xl text-brand-text opacity-90 mb-8 max-w-2xl mx-auto px-4">
          Le{" "}
          <strong className="font-semibold text-brand-deep">
            Locomotion Lab
          </strong>{" "}
          est un projet indépendant nourri par la passion de l'exploration et le
          partage des connaissances.
        </p>

        {/* Section "À venir" */}
        <div className="bg-white rounded-2xl shadow-card p-6 md:p-8 max-w-lg mx-auto mb-8">
          <h3 className="text-xl font-semibold mb-3 text-brand-deep">
            Comment soutenir ?
          </h3>
          <p className="text-brand-text mb-4">
            Plusieurs manières de contribuer au fonctionnement du Labo arrivent
            bientôt.
          </p>
          <p className="text-sm opacity-70">
            Votre futur soutien aidera à financer les expérimentations, le
            matériel, la création de contenu et l’entretien du site web.
          </p>
        </div>

        {/* Bloc newsletter */}
        <div className="max-w-lg mx-auto px-4">
          <h4 className="text-lg font-semibold mb-3 text-brand-accent">
            Stay tuned !
          </h4>
          <p className="text-brand-text opacity-80 mb-4">
            Si ce projet vous parle et que vous souhaitez rester informé·e des
            futures explorations ou soutenir le Labo à terme, laissez votre mail
            ci-dessous.
          </p>

          {/* Formulaire Formspree */}
          <form onSubmit={handleSubmit} className="flex justify-center">
            <input
              type="email"
              name="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Votre adresse e-mail"
              className="px-4 py-2 border rounded-l-full focus:outline-none focus:ring-2 focus:ring-brand-accent w-64"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className={`bg-brand-accent text-white px-5 py-2 rounded-r-full font-semibold flex items-center gap-2 transition ${
                status === "sending"
                  ? "opacity-70 cursor-wait"
                  : "hover:opacity-90"
              }`}
            >
              <Mail size={18} />{" "}
              {status === "sending" ? "Envoi..." : "M'inscrire"}
            </button>
          </form>

          {/* Message de confirmation */}
          <div className="h-6 mt-3">
            {status === "success" && (
              <p className="text-green-600 text-sm font-medium animate-fade-in">
                Merci pour ton inscription ! Tu recevras bientôt les nouvelles
                explorations du Labo 🔬🌿🦍.
              </p>
            )}
            {status === "error" && (
              <p className="text-red-500 text-sm font-medium animate-fade-in">
                Une erreur est survenue. Vérifier le format du mail.
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
