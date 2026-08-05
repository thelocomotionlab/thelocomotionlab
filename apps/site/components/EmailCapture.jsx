// components/EmailCapture.jsx
//
// Formulaire de capture email unique du site (ex-NewsletterSignup).
// - `source` : provenance de l'inscription (comprendre · twin · live ·
//   footer · manifeste · home), enregistrée par la passerelle email-gateway.
// - `promise` : phrase facultative sous le formulaire, seulement là où elle
//   apporte une information (ex. TrailNotify). Aucune par défaut.
// - Endpoint via NEXT_PUBLIC_EMAIL_ENDPOINT ; par défaut l'ANCIEN Worker
//   (send-email) tant que la bascule n'est pas validée — le payload est un
//   sur-ensemble compris par les deux (l'ancien lit email/subject/message,
//   la passerelle lit email/source/website).
// - Honeypot : champ `website` invisible ; s'il est rempli (robot), la
//   passerelle répond un faux succès sans rien créer.

"use client";

import { useId, useState } from "react";
import { Mail } from "lucide-react";

const LEGACY_ENDPOINT = "https://send-email.thelocomotionlab.workers.dev/";
const ENDPOINT = process.env.NEXT_PUBLIC_EMAIL_ENDPOINT || LEGACY_ENDPOINT;
// Sur la passerelle (double opt-in), le message de succès annonce l'email
// de confirmation ; sur l'ancien flux, l'ancien message.
const IS_GATEWAY = ENDPOINT !== LEGACY_ENDPOINT;

export default function EmailCapture({
  title = "Restez à l'écoute !",
  description = null,
  // Aucune micro-promesse par défaut : « Un email pour suivre les nouveautés du
  // labo » n'apprenait rien à personne. Reste possible au cas par cas, quand la
  // phrase dit quelque chose de précis (cf. TrailNotify).
  promise = null,
  source = "home",
  placeholder = "Votre adresse e-mail",
  buttonLabel = "M'inscrire",
  className = "",
  // « band » : version bande orange de l'accueil — input blanc sans bordure,
  // bouton terracotta, messages d'état en blanc. Le titre et la promesse
  // sont rendus par le parent (passer title/description/promise à null).
  variant = "default",
}) {
  const isBand = variant === "band";
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState("idle");
  const emailId = useId();
  const statusId = useId();
  const websiteId = useId();

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("sending");

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          source,
          website,
          // Champs de compatibilité avec l'ancien Worker send-email.
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
        <h4 className="text-lg font-semibold mb-2 text-brand-accent-ink text-center">
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
        className={
          isBand
            ? "flex flex-col sm:flex-row items-stretch gap-2 w-full"
            : "flex flex-col sm:flex-row justify-center items-stretch gap-2 w-full max-w-md mx-auto"
        }
      >
        <label htmlFor={emailId} className="sr-only">
          Adresse e-mail pour être prévenu·e des parutions
        </label>
        <input
          id={emailId}
          type="email"
          name="email"
          autoComplete="email"
          required
          aria-required="true"
          aria-describedby={statusId}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={placeholder}
          className={
            isBand
              ? "flex-1 rounded-full bg-white px-[18px] py-3 text-[14.5px] text-gray-700 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-deep transition-all"
              : "flex-1 px-4 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-brand-accent focus:rounded-full transition-all"
          }
        />

        {/* Honeypot anti-robots : invisible et hors tabulation. */}
        <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor={websiteId}>Ne pas remplir ce champ</label>
          <input
            id={websiteId}
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={status === "sending"}
          className={`${
            isBand
              ? // focus-visible blanc : l'outline global brand-accent serait
                // invisible sur la bande orange.
                "bg-brand-deep text-white px-[22px] py-3 text-[14.5px] focus-visible:outline-white hover:bg-brand-deep-dark"
              : "bg-brand-accent text-white px-5 py-2 hover:bg-brand-accent-dark"
          } font-semibold flex items-center justify-center gap-2 transition-all duration-300 rounded-full cursor-pointer ${
            status === "sending" ? "opacity-70 cursor-wait" : ""
          }`}
        >
          {!isBand && <Mail size={18} aria-hidden="true" />}
          {status === "sending" ? "Envoi..." : buttonLabel}
        </button>
      </form>

      {promise ? (
        <p className="mt-2 text-center text-xs text-gray-500 italic">
          {promise}
        </p>
      ) : null}

      <div
        id={statusId}
        className="min-h-6 mt-2 text-center"
        aria-live="polite"
        aria-atomic="true"
        role="status"
      >
        {status === "success" && (
          <p
            className={`${
              isBand ? "text-white" : "text-green-700"
            } text-sm font-medium animate-fade-in leading-snug`}
          >
            {IS_GATEWAY
              ? "Merci ! Un email de confirmation vient de t'être envoyé — pense à cliquer le lien."
              : "Merci ! Tu recevras bientôt les nouvelles explorations du labo."}
          </p>
        )}
        {status === "error" && (
          <p
            className={`${
              isBand
                ? "text-white underline underline-offset-2"
                : "text-red-700"
            } text-sm font-medium animate-fade-in`}
          >
            L&rsquo;envoi a échoué. Vérifie ta connexion et réessaie.
          </p>
        )}
      </div>
    </div>
  );
}
