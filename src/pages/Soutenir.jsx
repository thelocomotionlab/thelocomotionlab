// src/pages/Soutenir.jsx
import { useState } from "react";
import { Mail, Microscope } from "lucide-react";
import { Helmet } from "react-helmet";

export default function Soutenir() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("sending");

    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setStatus("success");
        setEmail("");
      } else {
        console.error("Erreur :", await res.text());
        setStatus("error");
      }
    } catch (err) {
      console.error("Erreur réseau :", err);
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
      </Helmet>

      <section className="py-10 text-center">
        <h2 className="text-3xl font-bold mb-6 text-brand-primary text-center">
          Soutenir l'Exploration
        </h2>

        <p className="text-lg md:text-xl text-brand-text opacity-90 mb-8 max-w-2xl mx-auto px-4">
          Le{" "}
          <strong className="font-semibold text-brand-deep">
            Locomotion Lab
          </strong>{" "}
          est un projet indépendant nourri par la passion de l'exploration et le
          partage des connaissances.
        </p>

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

        <div className="max-w-lg mx-auto px-4">
          <h4 className="text-lg font-semibold mb-3 text-brand-accent">
            Stay tuned !
          </h4>
          <p className="text-brand-text opacity-80 mb-4">
            Si ce projet vous parle et que vous souhaitez rester informé·e des
            futures explorations ou soutenir le Labo à terme, laissez votre mail
            ci-dessous.
          </p>

          <form onSubmit={handleSubmit} className="flex justify-center">
            <input
              type="email"
              name="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Votre adresse e-mail"
              className="px-4 py-2 border focus:outline-none focus:ring-2 focus:ring-brand-accent w-64 rounded-l-full sm:rounded-l-full"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className={`bg-brand-accent text-white px-5 py-2 font-semibold flex items-center gap-2 transition-all duration-300 rounded-r-full sm:rounded-r-full ${
                status === "sending"
                  ? "opacity-70 cursor-wait"
                  : "hover:opacity-90"
              }`}
            >
              <Mail size={18} />{" "}
              {status === "sending" ? "Envoi..." : "M'inscrire"}
            </button>
          </form>

          <div className="h-6 mt-3">
            {status === "success" && (
              <p className="text-green-600 text-sm font-medium animate-fade-in">
                Merci pour ton inscription ! Tu recevras bientôt les nouvelles
                explorations du Labo <Microscope />
              </p>
            )}
            {status === "error" && (
              <p className="text-red-500 text-sm font-medium animate-fade-in">
                Une erreur est survenue. Vérifie ton adresse mail.
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
