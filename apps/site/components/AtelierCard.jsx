// components/AtelierCard.jsx
//
// Carte atelier de la page Pratiquer (même gabarit que les cartes du pilier
// Comprendre) : photo, méta ATELIER · prix, date/lieu, jauge de places en
// barre, et formulaire d'inscription inline (prénom + email). État complet :
// badge COMPLET, jauge grise, bouton « liste d'attente » qui révèle le même
// formulaire (flag waitlist).
//
// Composant CONTRÔLÉ par AteliersGrid : les compteurs (registered/capacity/
// status) arrivent par props, déjà fusionnés avec l'API ; après une
// inscription la carte remonte les nouveaux compteurs via `onPlaces`.
//
// Inscription : POST {NEXT_PUBLIC_ATELIER_API}/inscriptions (service
// services/atelier-api) — un 409 « complet » bascule la carte en état complet
// et ouvre la liste d'attente. Sans API configurée : repli sur le flux email
// existant (passerelle Listmonk ou ancien Worker send-email, payload
// sur-ensemble compris par les deux). Honeypot `website` comme EmailCapture.

"use client";

import { useId, useState } from "react";
import PhotoSlot from "@/components/PhotoSlot";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "";
const LEGACY_ENDPOINT = "https://send-email.thelocomotionlab.workers.dev/";
const EMAIL_ENDPOINT = process.env.NEXT_PUBLIC_EMAIL_ENDPOINT || LEGACY_ENDPOINT;

const INPUT_CLASSES =
  "min-w-0 rounded-full border border-brand-field bg-white px-4 py-3 text-[15px] text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-accent sm:py-2.5 sm:text-[14.5px]";

const SUBMIT_CLASSES =
  "cursor-pointer rounded-full bg-brand-accent py-3 text-[15px] font-bold text-white transition-all duration-300";

export default function AtelierCard({ atelier, onPlaces = () => {} }) {
  const { id, title, dateLabel, lieu, capacity, priceLabel, cover, coverAlt } =
    atelier;
  const registered = atelier.registered;

  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState("idle");
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  const prenomId = useId();
  const emailId = useId();
  const websiteId = useId();
  const statusId = useId();

  const isFull = atelier.status === "full" || registered >= capacity;
  const remaining = Math.max(0, capacity - registered);
  const pct = Math.min(100, Math.round((registered / capacity) * 100));
  const done = status === "success" || status === "success-waitlist";

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("sending");

    try {
      if (API_BASE) {
        const res = await fetch(`${API_BASE}/inscriptions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            atelierId: id,
            prenom,
            email,
            website,
            waitlist: isFull,
          }),
        });
        const data = await res.json().catch(() => null);

        if (res.ok && data?.ok) {
          if (data.places) onPlaces(id, data.places);
          setStatus(data.waitlist ? "success-waitlist" : "success");
          setPrenom("");
          setEmail("");
        } else if (res.status === 409 && data?.places) {
          // Complet entre-temps : on bascule la carte et on garde les champs
          // remplis pour que la liste d'attente parte en un clic.
          onPlaces(id, data.places);
          setWaitlistOpen(true);
          setStatus("fullnow");
        } else {
          console.error("Erreur :", data);
          setStatus("error");
        }
        return;
      }

      // Repli sans API : flux email existant.
      const res = await fetch(EMAIL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          atelierId: id,
          atelier: title,
          prenom,
          email,
          waitlist: isFull,
          source: "pratiquer",
          website,
          // Champs de compatibilité avec l'ancien Worker send-email.
          subject: `Atelier — ${title}`,
          message: `${prenom} <${email}> — ${
            isFull ? "liste d'attente" : "inscription"
          } — ${dateLabel}`,
        }),
      });

      if (res.ok) {
        if (!isFull) onPlaces(id, { registered: registered + 1 });
        setStatus(isFull ? "success-waitlist" : "success");
        setPrenom("");
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

  const fields = (
    <div className="flex flex-col gap-2.5 sm:flex-row">
      <label htmlFor={prenomId} className="sr-only">
        Prénom
      </label>
      <input
        id={prenomId}
        type="text"
        name="prenom"
        autoComplete="given-name"
        required
        aria-required="true"
        value={prenom}
        onChange={(e) => setPrenom(e.target.value)}
        placeholder="Prénom"
        className={`${INPUT_CLASSES} sm:flex-1`}
      />
      <label htmlFor={emailId} className="sr-only">
        Adresse e-mail
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
        placeholder="Email"
        className={`${INPUT_CLASSES} sm:flex-[1.4]`}
      />
    </div>
  );

  const honeypot = (
    <div
      className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
      aria-hidden="true"
    >
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
  );

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-card">
      <div className="relative h-[160px] flex-none md:h-[190px]">
        <PhotoSlot
          src={cover}
          alt={coverAlt}
          sizes="(min-width: 768px) 546px, 100vw"
          className="h-full w-full"
        />
        {isFull ? (
          <span className="absolute right-3.5 top-3.5 rounded-full bg-brand-slate-dark px-3 py-[5px] font-mono text-[11px] font-bold tracking-[0.14em] text-brand-bg md:text-xs">
            COMPLET
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5 md:gap-3.5 md:px-[26px] md:pb-[26px] md:pt-6">
        <p className="font-mono text-[11px] font-bold tracking-[0.18em] text-brand-primary md:text-xs">
          ATELIER <span className="text-brand-accent-dark">· {priceLabel}</span>
        </p>

        <h3 className="text-[18.5px] font-bold leading-[1.3] text-brand-slate-dark md:text-[21px]">
          {title}
        </h3>

        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-[5px] text-sm text-gray-600 md:gap-x-4 md:gap-y-1.5 md:text-[15px]">
          <span className="self-center font-mono text-[11px] font-bold tracking-[0.12em] text-gray-400 md:text-xs">
            DATE
          </span>
          <span>{dateLabel}</span>
          <span className="self-center font-mono text-[11px] font-bold tracking-[0.12em] text-gray-400 md:text-xs">
            LIEU
          </span>
          <span>{lieu}</span>
        </div>

        {/* Jauge de places (barre) ; l'info est portée par le texte à côté. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div
            className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-brand-gauge"
            aria-hidden="true"
          >
            <div
              className={
                isFull
                  ? "h-full bg-brand-gauge-full"
                  : "h-full rounded-full bg-[linear-gradient(90deg,var(--color-brand-accent-light),var(--color-brand-accent))]"
              }
              style={{ width: `${pct}%` }}
            />
          </div>
          <span
            className={`flex-none font-mono text-[13px] font-bold ${
              isFull ? "text-gray-400" : "text-brand-slate-dark"
            }`}
          >
            {registered}/{capacity}
          </span>
          <span
            className={`w-full text-[13.5px] font-bold sm:w-auto sm:text-sm ${
              isFull ? "text-gray-400" : "text-brand-accent-dark"
            }`}
          >
            {isFull
              ? "complet"
              : `${remaining} place${remaining > 1 ? "s" : ""} restante${
                  remaining > 1 ? "s" : ""
                }`}
          </span>
        </div>

        <div
          className={`flex flex-col gap-2.5 border-t border-brand-gauge pt-3.5 md:pt-4 ${
            isFull && !done ? "mt-auto" : ""
          }`}
        >
          {!done && !isFull ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
              {fields}
              {honeypot}
              <button
                type="submit"
                disabled={status === "sending"}
                className={`${SUBMIT_CLASSES} ${
                  status === "sending"
                    ? "cursor-wait opacity-70"
                    : "hover:bg-brand-accent-dark"
                }`}
              >
                {status === "sending" ? "Envoi..." : "Je réserve ma place"}
              </button>
              <p className="text-center text-xs italic text-gray-400">
                Confirmation immédiate. Désinscription en un clic.
              </p>
            </form>
          ) : null}

          {!done && isFull ? (
            !waitlistOpen ? (
              <button
                type="button"
                aria-expanded={waitlistOpen}
                onClick={() => setWaitlistOpen(true)}
                className="w-full cursor-pointer rounded-full border-[1.5px] border-brand-accent py-3 text-[15px] font-bold text-brand-accent-dark transition-all duration-300 hover:bg-brand-accent hover:text-white"
              >
                Rejoindre la liste d&rsquo;attente
              </button>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
                {fields}
                {honeypot}
                <button
                  type="submit"
                  disabled={status === "sending"}
                  className={`${SUBMIT_CLASSES} ${
                    status === "sending"
                      ? "cursor-wait opacity-70"
                      : "hover:bg-brand-accent-dark"
                  }`}
                >
                  {status === "sending"
                    ? "Envoi..."
                    : "Rejoindre la liste d'attente"}
                </button>
                <p className="text-center text-xs italic text-gray-400">
                  On te prévient si une place se libère.
                </p>
              </form>
            )
          ) : null}

          {/* Zone d'état stable (aria-live) : succès, erreur, complet entre-temps. */}
          <div
            id={statusId}
            className="min-h-5 text-center"
            aria-live="polite"
            aria-atomic="true"
            role="status"
          >
            {status === "success" && (
              <p className="animate-fade-in text-[13px] font-medium text-green-700">
                Merci ! Ta place est réservée.
              </p>
            )}
            {status === "success-waitlist" && (
              <p className="animate-fade-in text-[13px] font-medium text-green-700">
                C&rsquo;est noté ! On te prévient dès qu&rsquo;une place se
                libère.
              </p>
            )}
            {status === "fullnow" && (
              <p className="animate-fade-in text-[13px] font-medium text-brand-accent-dark">
                Complet entre-temps&hellip; Renvoie le formulaire pour
                rejoindre la liste d&rsquo;attente.
              </p>
            )}
            {status === "error" && (
              <p className="animate-fade-in text-[13px] font-medium text-red-700">
                Une erreur est survenue. Vérifie ton adresse mail.
              </p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
