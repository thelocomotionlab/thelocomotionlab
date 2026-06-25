// components/SoutenirSection.jsx
"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

export default function SoutenirSection() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("sending");

    try {
      const res = await fetch(
        "https://send-email.thelocomotionlab.workers.dev/",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            subject: "Nouvelle souscription",
            message: email,
          }),
        }
      );

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
    <section className="py-10 text-center">
      <h2 className="text-3xl font-bold mb-6 text-brand-primary text-center">
        Soutenir l&apos;Exploration
      </h2>

      <p className="text-lg md:text-xl text-brand-text opacity-90 mb-8 max-w-2xl mx-auto px-4">
        Le{" "}
        <strong className="font-semibold text-brand-deep">
          Locomotion Lab
        </strong>{" "}
        est un projet indépendant axé sur l&apos;exploration et le partage des
        connaissances.
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
          Ton futur soutien aidera à financer les expérimentations, le matériel,
          la création de contenu et l’entretien du site web.
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4">
        <h4 className="text-lg font-semibold mb-3 text-brand-accent">
          Stay tuned !
        </h4>
        <p className="text-brand-text opacity-80 mb-4">
          Si ce projet te parle et que tu souhaites rester informé·e des futures
          explorations ou soutenir le labo à terme, laisse ton mail ci-dessous.
        </p>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col sm:flex-row justify-center items-stretch gap-2 w-full max-w-md mx-auto"
        >
          <label htmlFor="soutenir-email" className="sr-only">
            Adresse e-mail
          </label>
          <input
            id="soutenir-email"
            type="email"
            name="email"
            required
            aria-required="true"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Votre adresse e-mail"
            className="flex-1 px-4 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-brand-accent focus:rounded-full transition-all"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className={`bg-brand-accent text-white px-5 py-2 font-semibold flex items-center justify-center gap-2 transition-all duration-300 rounded-full cursor-pointer ${
              status === "sending"
                ? "opacity-70 cursor-wait"
                : "hover:opacity-90"
            }`}
          >
            <Mail size={18} />
            {status === "sending" ? "Envoi..." : "M'inscrire"}
          </button>
        </form>

        <div className="h-6 mt-3" aria-live="polite" aria-atomic="true" role="status">
          {status === "success" && (
            <p className="text-green-700 text-sm font-medium animate-fade-in flex items-center justify-center gap-2 leading-none">
              <span>
                Merci pour ton inscription ! Tu recevras bientôt les nouvelles
                explorations du labo.
              </span>
            </p>
          )}
          {status === "error" && (
            <p className="text-red-700 text-sm font-medium animate-fade-in">
              Une erreur est survenue. Vérifie ton adresse mail.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
