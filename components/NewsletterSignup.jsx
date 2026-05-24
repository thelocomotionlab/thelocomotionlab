"use client";

import { useId, useState } from "react";
import { Mail } from "lucide-react";

/**
 * Reusable newsletter / email capture form.
 * Sends to your Cloudflare Worker endpoint (same as SoutenirSection).
 */
export default function NewsletterSignup({
  title = "Stay tuned !",
  description = "Laisse ton mail pour recevoir les futures explorations du Labo.",
  placeholder = "Votre adresse e-mail",
  buttonLabel = "M'inscrire",
  className = "",
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const emailId = useId();
  const statusId = useId();

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("sending");

    try {
      const res = await fetch("https://send-email.thelocomotionlab.workers.dev/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          subject: "Nouvelle souscription",
          message: email,
        }),
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
    <div className={className}>
      {title ? (
        <h4 className="text-lg font-semibold mb-2 text-brand-accent text-center">
          {title}
        </h4>
      ) : null}

      {description ? (
        <p className="text-brand-text opacity-80 mb-4 text-center max-w-xl mx-auto">
          {description}
        </p>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row justify-center items-stretch gap-2 w-full max-w-md mx-auto"
      >
        <label htmlFor={emailId} className="sr-only">
          Adresse e-mail pour s'inscrire à la newsletter
        </label>
        <input
          id={emailId}
          type="email"
          name="email"
          required
          aria-required="true"
          aria-describedby={statusId}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-4 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-brand-accent focus:rounded-full transition-all"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className={`bg-brand-accent text-white px-5 py-2 font-semibold flex items-center justify-center gap-2 transition-all duration-300 rounded-full cursor-pointer ${
            status === "sending" ? "opacity-70 cursor-wait" : "hover:opacity-90"
          }`}
        >
          <Mail size={18} aria-hidden="true" />
          {status === "sending" ? "Envoi..." : buttonLabel}
        </button>
      </form>

      <div
        id={statusId}
        className="h-6 mt-3 text-center"
        aria-live="polite"
        aria-atomic="true"
        role="status"
      >
        {status === "success" && (
          <p className="text-green-700 text-sm font-medium animate-fade-in leading-none">
            Merci ! Tu recevras bientôt les nouvelles explorations du labo.
          </p>
        )}
        {status === "error" && (
          <p className="text-red-700 text-sm font-medium animate-fade-in">
            Une erreur est survenue. Vérifie ton adresse mail.
          </p>
        )}
      </div>
    </div>
  );
}
