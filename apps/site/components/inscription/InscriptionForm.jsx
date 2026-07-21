// components/inscription/InscriptionForm.jsx
//
// Formulaire d'inscription à un atelier (page /pratiquer/inscription/[slug]),
// fidèle au handoff « Inscription Atelier » : ce n'est pas un simple
// formulaire, c'est un instrument de preuve — la structure reflète bloc par
// bloc le PDF généré côté serveur et envoyé par email.
//
// Interactions non négociables (README du handoff) :
//   * bouton verrouillé tant que le bloc Consignes n'a pas été affiché en
//     entier (IntersectionObserver sur le sentinel de fin de carte) ;
//   * aucune case pré-cochée, pas de « tout accepter » ;
//   * droit à l'image : choix explicite requis, jamais bloquant ;
//   * questions de santé : rendu statique, AUCUNE réponse n'entre dans le
//     payload ;
//   * erreurs de validation : messages spécifiques nommant le bloc, dans un
//     encadré terracotta role="alert" au-dessus du bouton.
//
// Le contenu volatil (consignes, questions santé) vient de
// lib/inscriptionContent.mjs (source unique page ↔ PDF). POST vers
// NEXT_PUBLIC_ATELIER_API ; sans API configurée, repli sur le flux email
// existant (récap texte à Valentin, pas de PDF).

"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  CONSIGNES,
  CONSIGNES_MINEUR,
  INFOS_PRATIQUES,
  SANTE_QUESTIONS,
  contenuInscription,
} from "@/lib/inscriptionContent.mjs";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "";
const LEGACY_ENDPOINT = "https://send-email.thelocomotionlab.workers.dev/";
const EMAIL_ENDPOINT = process.env.NEXT_PUBLIC_EMAIL_ENDPOINT || LEGACY_ENDPOINT;

const INPUT_CLASSES =
  "w-full rounded-xl border border-brand-field bg-white px-4 py-[13px] text-base text-brand-text placeholder:text-[#A8A29A] focus:border-brand-primary focus:outline-2 focus:outline-offset-1 focus:outline-brand-primary/45";

const CHECKBOX_CLASSES =
  "mt-px h-[22px] w-[22px] flex-none cursor-pointer accent-[#D89A2E]";

// En-tête de bloc : eyebrow doré « / 0x » + titre Lora italique + filet.
function BlocTitre({ numero, children }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[11.5px] font-bold tracking-[0.22em] text-[#D89A2E]">
        / {numero}
      </p>
      <div className="mb-4 flex items-baseline gap-4">
        <h2 className="flex-none font-lora text-2xl font-medium italic text-brand-deep">
          {children}
        </h2>
        <div className="h-px flex-1 bg-[#DCE7E8]" aria-hidden="true" />
      </div>
    </div>
  );
}

function Champ({ label, hint = null, children }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13.5px] font-medium text-brand-slate-dark">
      <span>
        {label}
        {hint ? <span className="font-normal text-gray-400"> {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export default function InscriptionForm({ atelier }) {
  const formId = useId();

  // ── État ────────────────────────────────────────────────────────────
  const [mode, setMode] = useState("adulte"); // "adulte" | "mineur"
  const isMineur = mode === "mineur";
  const [f, setF] = useState({
    prenom: "",
    nom: "",
    email: "",
    telephone: "",
    urgenceNom: "",
    urgenceTel: "",
    mineurPrenom: "",
    mineurNom: "",
    mineurNaissance: "",
    santeCommentaire: "",
  });
  const [c, setC] = useState({
    sante: false,
    consignes: false,
    majeur: false,
    exactitude: false,
    autorite: false,
    soins: false,
  });
  const [image, setImage] = useState(null); // null tant qu'aucun choix explicite
  const [website, setWebsite] = useState(""); // honeypot
  const [consignesSeen, setConsignesSeen] = useState(false);
  const [errors, setErrors] = useState([]);
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  // Jauge vivante (comme AteliersGrid) : compteurs du build puis API.
  const [places, setPlaces] = useState({
    registered: atelier.registered,
    capacity: atelier.capacity,
  });

  const sentinelRef = useRef(null);
  const alertRef = useRef(null);

  useEffect(() => {
    if (!API_BASE) return undefined;
    const ctrl = new AbortController();
    fetch(`${API_BASE}/places`, { signal: ctrl.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const live = data?.places?.[atelier.id];
        if (live) setPlaces({ registered: live.registered, capacity: live.capacity });
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [atelier.id]);

  // Déverrouillage du bouton : le sentinel de fin des consignes doit avoir
  // été affiché en entier (threshold 1).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || consignesSeen) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setConsignesSeen(true);
          obs.disconnect();
        }
      },
      { threshold: 1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [consignesSeen]);

  // Les erreurs viennent d'apparaître → on amène l'encadré à l'écran.
  useEffect(() => {
    if (!errors.length || !alertRef.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    alertRef.current.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  }, [errors]);

  const onField = (e) => {
    const { name, value } = e.target;
    setF((prev) => ({ ...prev, [name]: value }));
  };
  const onCheck = (e) => {
    const { name, checked } = e.target;
    setC((prev) => ({ ...prev, [name]: checked }));
  };

  // ── Validation (messages nommant le bloc, comme le prototype) ───────
  function validate() {
    const errs = [];
    if (!f.prenom.trim()) errs.push("Ton prénom est manquant (bloc 1).");
    if (!f.nom.trim()) errs.push("Ton nom est manquant (bloc 1).");
    if (!/.+@.+\..+/.test(f.email))
      errs.push("L'adresse email semble incomplète — vérifie-la (bloc 1).");
    if (!f.telephone.trim())
      errs.push("Ton numéro de téléphone est manquant — il sert le jour J (bloc 1).");
    if (!f.urgenceNom.trim() || !f.urgenceTel.trim())
      errs.push("Renseigne le contact d'urgence, nom et téléphone (bloc 1).");
    if (isMineur) {
      if (!f.mineurPrenom.trim() || !f.mineurNom.trim())
        errs.push("Renseigne le nom et le prénom du mineur (bloc 1).");
      if (!f.mineurNaissance.trim())
        errs.push("Renseigne la date de naissance du mineur (bloc 1).");
    }
    if (!c.sante) errs.push("Coche l'attestation de la déclaration de santé (bloc 4).");
    if (image === null)
      errs.push("Indique ton choix pour le droit à l'image — les deux réponses se valent (bloc 5).");
    if (!c.consignes) errs.push("Coche ton engagement sur les consignes de sécurité (bloc 7).");
    if (isMineur) {
      if (!c.autorite) errs.push("Coche l'attestation d'autorité parentale (bloc 7).");
      if (!c.soins) errs.push("Coche l'autorisation de soins d'urgence (bloc 7).");
    } else if (!c.majeur) {
      errs.push("Coche la case « je certifie être majeur·e » (bloc 7).");
    }
    if (!c.exactitude) errs.push("Coche la certification d'exactitude (bloc 7).");
    return errs;
  }

  function buildFiche() {
    return {
      participant: {
        prenom: f.prenom.trim(),
        nom: f.nom.trim(),
        email: f.email.trim(),
        telephone: f.telephone.trim(),
      },
      urgence: { nom: f.urgenceNom.trim(), telephone: f.urgenceTel.trim() },
      mineur: {
        actif: isMineur,
        prenom: isMineur ? f.mineurPrenom.trim() : "",
        nom: isMineur ? f.mineurNom.trim() : "",
        date_naissance: isMineur ? f.mineurNaissance.trim() : "",
      },
      sante: { attestation: c.sante, commentaire_libre: f.santeCommentaire.trim() },
      image: { autorise: image === true },
      consentement: {
        consignes: c.consignes,
        majeur: !isMineur && c.majeur,
        exactitude: c.exactitude,
        autorite_parentale: isMineur && c.autorite,
        soins_urgence: isMineur && c.soins,
      },
    };
  }

  async function submit() {
    const errs = validate();
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setServerError(null);
    setSending(true);

    const fiche = buildFiche();
    try {
      if (API_BASE) {
        const res = await fetch(`${API_BASE}/inscriptions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            atelierId: atelier.id,
            website,
            fiche,
            contenu: contenuInscription(),
          }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.ok) {
          if (data.places) setPlaces(data.places);
          setConfirmation({
            horodatage:
              data.horodatage ??
              new Date().toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }),
            reference: data.reference ?? "—",
            fiche: data.fiche ?? "envoyee",
          });
        } else if (res.status === 409) {
          setServerError("complet");
        } else if (res.status === 400 && data?.champs?.length) {
          setErrors([
            "Le serveur signale des champs incomplets — vérifie les blocs marqués d'un astérisque.",
          ]);
        } else {
          setServerError("erreur");
        }
      } else {
        // Repli sans API : récap texte vers le flux email existant.
        const lignes = [
          `${fiche.participant.prenom} ${fiche.participant.nom} <${fiche.participant.email}> — ${fiche.participant.telephone}`,
          `Urgence : ${fiche.urgence.nom} — ${fiche.urgence.telephone}`,
          isMineur
            ? `Mineur : ${fiche.mineur.prenom} ${fiche.mineur.nom} (né·e ${fiche.mineur.date_naissance})`
            : "Adulte",
          `Droit à l'image : ${image ? "oui" : "non"}`,
          fiche.sante.commentaire_libre ? `Signalé : ${fiche.sante.commentaire_libre}` : "",
          `Atelier : ${atelier.title} — ${atelier.dateLabel}`,
        ].filter(Boolean);
        const res = await fetch(EMAIL_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            atelierId: atelier.id,
            email: fiche.participant.email,
            source: "pratiquer",
            website,
            subject: `Inscription — ${atelier.title}`,
            message: lignes.join("\n"),
          }),
        });
        if (!res.ok) {
          setServerError("erreur");
        } else {
          setConfirmation({
            horodatage: new Date().toLocaleString("fr-FR", {
              dateStyle: "long",
              timeStyle: "short",
            }),
            reference: "—",
            fiche: "email_non_configure",
          });
        }
      }
    } catch (err) {
      console.error("Erreur réseau :", err);
      setServerError("erreur");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (confirmation) window.scrollTo({ top: 0, behavior: "auto" });
  }, [confirmation]);

  const remaining = Math.max(0, places.capacity - places.registered);
  const pct = Math.min(100, Math.round((places.registered / places.capacity) * 100));

  const recapAtelier = (
    <div className="rounded-2xl bg-white p-5 shadow-[0_6px_24px_rgba(0,0,0,0.06)] md:px-[22px]">
      <p className="mb-2 font-mono text-[11px] font-bold tracking-[0.18em] text-brand-primary">
        {confirmation ? "TON ATELIER" : "ATELIER"}
        {atelier.priceLabel ? (
          <span className="text-[#D89A2E]"> · {atelier.priceLabel}</span>
        ) : null}
      </p>
      <p className="mb-2.5 text-lg font-bold leading-[1.3] text-[#2F6F73]">{atelier.title}</p>
      <div className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-[5px] text-[14.5px] text-gray-600">
        <span className="self-center font-mono text-[11px] font-bold tracking-[0.1em] text-gray-400">
          DATE
        </span>
        <span>{atelier.dateLabel}</span>
        <span className="self-center font-mono text-[11px] font-bold tracking-[0.1em] text-gray-400">
          LIEU
        </span>
        <span>{atelier.lieu}</span>
      </div>
      {!confirmation ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-brand-gauge" aria-hidden="true">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-brand-accent-light),var(--color-brand-accent))]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="flex-none font-mono text-[13px] font-bold text-brand-slate-dark">
            {places.registered}/{places.capacity}
          </span>
          <span className="text-sm font-bold text-[#D89A2E]">
            {remaining} place{remaining > 1 ? "s" : ""} restante{remaining > 1 ? "s" : ""}
          </span>
        </div>
      ) : null}
    </div>
  );

  // ── Écran de confirmation ───────────────────────────────────────────
  if (confirmation) {
    const pdfEnvoye = confirmation.fiche === "envoyee";
    return (
      <div className="mx-auto flex max-w-[660px] flex-col gap-7 px-5 pb-16 pt-10">
        <div className="text-center">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#3F8F5B]/10">
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#3F8F5B"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <h1 className="mb-1.5 mt-4 text-[28px] font-bold text-[#2F6F73]">
            Ta place est réservée
          </h1>
          <p className="font-lora text-[17px] italic text-brand-deep">
            On se voit sur le terrain.
          </p>
        </div>

        {recapAtelier}

        <div className="rounded-2xl bg-brand-grid p-5 md:px-[22px]">
          <p className="mb-3 font-mono text-[11px] font-bold tracking-[0.18em] text-brand-deep">
            INFORMATIONS PRATIQUES
          </p>
          <div className="flex flex-col gap-2.5 text-[14.5px] leading-[1.65] text-brand-text">
            <p>
              <strong className="text-[#2F6F73]">Rendez-vous :</strong>{" "}
              {atelier.rendezVous || INFOS_PRATIQUES.rendezVousDefaut}
            </p>
            <p>
              <strong className="text-[#2F6F73]">À apporter :</strong> {INFOS_PRATIQUES.apporter}
            </p>
            <p>
              <strong className="text-[#2F6F73]">Météo :</strong> {INFOS_PRATIQUES.meteo}
            </p>
            <p>
              <strong className="text-[#2F6F73]">Contact :</strong>{" "}
              <a
                className="font-medium text-[#D89A2E] hover:text-brand-deep hover:underline"
                href={`mailto:${INFOS_PRATIQUES.contact}`}
              >
                {INFOS_PRATIQUES.contact}
              </a>
            </p>
          </div>
        </div>

        <div className="rounded-r-xl border-l-[3px] border-brand-primary bg-brand-primary/[0.14] px-[18px] py-4">
          <p className="text-[14.5px] leading-[1.65] text-brand-text">
            {pdfEnvoye ? (
              <>
                Une copie fidèle de la page que tu viens de valider t&rsquo;a été envoyée en{" "}
                <strong className="text-[#2F6F73]">PDF</strong> à l&rsquo;adresse indiquée.
              </>
            ) : (
              <>
                Une copie fidèle de la page que tu viens de valider te sera transmise en{" "}
                <strong className="text-[#2F6F73]">PDF</strong> par email.
              </>
            )}
          </p>
        </div>

        <div className="text-center">
          <p className="mb-1 font-mono text-[12.5px] uppercase text-gray-400">
            Validé le {confirmation.horodatage}
          </p>
          <p className="mb-4 font-mono text-[12.5px] text-gray-400">
            RÉFÉRENCE DOSSIER : {confirmation.reference}
          </p>
          <Link
            href="/pratiquer"
            className="text-sm font-medium text-[#D89A2E] hover:text-brand-deep hover:underline"
          >
            ← Revenir aux ateliers
          </Link>
        </div>
      </div>
    );
  }

  // ── Formulaire ──────────────────────────────────────────────────────
  const submitLocked = !consignesSeen;
  return (
    <div className="mx-auto flex max-w-[660px] flex-col gap-9 px-5 pb-16 pt-8">
      {/* En-tête */}
      <div>
        <Link
          href="/pratiquer"
          className="mb-5 inline-flex items-center gap-1.5 font-mono text-[12.5px] font-bold tracking-[0.12em] text-brand-slate transition-colors hover:text-brand-accent-dark"
        >
          ← REVENIR AUX ATELIERS
        </Link>
        <p className="mb-2.5 font-mono text-xs font-bold tracking-[0.25em] text-brand-slate">
          / INSCRIPTION
        </p>
        <h1 className="mb-1.5 text-[30px] font-bold text-[#2F6F73]">
          Ta place à l&rsquo;atelier
        </h1>
        <p className="mb-5 font-lora text-lg italic text-brand-deep">
          Cinq minutes de lecture — c&rsquo;est important, alors c&rsquo;est court.
        </p>
        {recapAtelier}
      </div>

      {/* BLOC 1 — coordonnées */}
      <section aria-label="Tes coordonnées">
        <BlocTitre numero="01">Tes coordonnées</BlocTitre>
        <div className="mb-5 flex w-fit max-w-full gap-2 rounded-full bg-brand-grid p-[5px]">
          {[
            ["adulte", "Je m'inscris pour moi"],
            ["mineur", "J'inscris un mineur que j'accompagne"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`cursor-pointer rounded-full px-[18px] py-2.5 text-sm font-bold transition-colors ${
                mode === value ? "bg-[#2F6F73] text-white" : "text-gray-600 hover:text-[#2F6F73]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {isMineur ? (
          <div className="mb-5 rounded-r-xl border-l-[3px] border-brand-primary bg-brand-primary/[0.14] px-[18px] py-4">
            <p className="text-[14.5px] leading-[1.6] text-brand-text">
              <strong className="text-[#2F6F73]">
                Les mineurs sont accueillis à partir de 12 ans, uniquement accompagnés de leur
                représentant légal, qui participe à l&rsquo;atelier.
              </strong>{" "}
              Il n&rsquo;est pas possible de déposer un mineur.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-3.5">
          {isMineur ? (
            <p className="font-mono text-[11px] font-bold tracking-[0.16em] text-brand-primary">
              L&rsquo;ADULTE ACCOMPAGNANT
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <Champ label="Prénom">
              <input type="text" name="prenom" autoComplete="given-name" value={f.prenom} onChange={onField} className={INPUT_CLASSES} />
            </Champ>
            <Champ label="Nom">
              <input type="text" name="nom" autoComplete="family-name" value={f.nom} onChange={onField} className={INPUT_CLASSES} />
            </Champ>
            <Champ label="Email">
              <input type="email" name="email" autoComplete="email" value={f.email} onChange={onField} className={INPUT_CLASSES} />
            </Champ>
            <Champ label="Téléphone">
              <input type="tel" name="telephone" autoComplete="tel" placeholder="06 …" value={f.telephone} onChange={onField} className={INPUT_CLASSES} />
            </Champ>
          </div>
          {isMineur ? (
            <div className="mt-1.5 flex flex-col gap-3.5">
              <p className="font-mono text-[11px] font-bold tracking-[0.16em] text-brand-primary">
                LE MINEUR
              </p>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                <Champ label="Prénom">
                  <input type="text" name="mineurPrenom" value={f.mineurPrenom} onChange={onField} className={INPUT_CLASSES} />
                </Champ>
                <Champ label="Nom">
                  <input type="text" name="mineurNom" value={f.mineurNom} onChange={onField} className={INPUT_CLASSES} />
                </Champ>
                <Champ label="Date de naissance">
                  <input type="date" name="mineurNaissance" value={f.mineurNaissance} onChange={onField} className={INPUT_CLASSES} />
                </Champ>
              </div>
            </div>
          ) : null}
        </div>

        {/* Contact d'urgence, détaché */}
        <div className="mt-5 rounded-2xl border-[1.5px] border-brand-accent bg-white p-5 md:px-[22px]">
          <p className="mb-1 font-mono text-[11px] font-bold tracking-[0.2em] text-[#D89A2E]">
            CONTACT D&rsquo;URGENCE
          </p>
          <p className="mb-3.5 text-sm leading-[1.55] text-gray-500">
            La personne à prévenir s&rsquo;il t&rsquo;arrive quelque chose. C&rsquo;est le champ
            le plus utile de cette page.
          </p>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <Champ label="Nom">
              <input type="text" name="urgenceNom" value={f.urgenceNom} onChange={onField} className={INPUT_CLASSES} />
            </Champ>
            <Champ label="Téléphone">
              <input type="tel" name="urgenceTel" value={f.urgenceTel} onChange={onField} className={INPUT_CLASSES} />
            </Champ>
          </div>
        </div>

        {/* Honeypot anti-robots : invisible et hors tabulation. */}
        <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor={`${formId}-website`}>Ne pas remplir ce champ</label>
          <input
            id={`${formId}-website`}
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
      </section>

      {/* BLOC 2 — ce que tu vas faire */}
      <section aria-label="Ce que tu vas faire">
        <BlocTitre numero="02">Ce que tu vas faire</BlocTitre>
        <p className="mb-3 text-[15.5px] leading-[1.7] text-brand-text">
          La séance alterne déplacements quadrupédiques, suspensions, franchissements,
          équilibres, sauts et réceptions, et travail au sol. Elle sollicite réellement les
          épaules, coudes et poignets, les genoux, chevilles et le rachis, ainsi que le système
          cardio-respiratoire.
        </p>
        <p className="mb-[18px] text-[15.5px] leading-[1.7] text-brand-text">
          Comme toute pratique physique en extérieur, elle comporte des risques inhérents
          qu&rsquo;il faut nommer : chute de faible hauteur, entorse, lésion musculaire ou
          tendineuse, contusion, abrasion — plus rarement, fracture. Les consignes du bloc
          suivant existent pour les réduire.
        </p>
        <div className="rounded-r-xl border-l-[3px] border-brand-primary bg-brand-primary/[0.14] px-5 py-[18px]">
          <p className="text-[14.5px] leading-[1.7] text-brand-text">
            Ces ateliers sont animés à titre{" "}
            <strong className="text-[#2F6F73]">bénévole et gratuit</strong>. Valentin n&rsquo;est
            pas titulaire d&rsquo;un diplôme d&rsquo;État d&rsquo;éducateur sportif et
            n&rsquo;exerce pas cette activité contre rémunération. L&rsquo;encadrement bénévole
            n&rsquo;exige aucune qualification, mais tu dois le savoir avant de t&rsquo;inscrire.
            Une assurance en responsabilité civile couvrant l&rsquo;encadrement d&rsquo;activités
            physiques a été souscrite.
          </p>
        </div>
      </section>

      {/* BLOC 3 — consignes de sécurité (élément signature) */}
      <section aria-label="Consignes de sécurité">
        <BlocTitre numero="03">Consignes de sécurité</BlocTitre>
        <p className="mb-4 text-[15px] leading-[1.65] text-gray-500">
          Lis-les en entier — le bouton de validation se déverrouille quand tu les as fait
          défiler.
        </p>
        <div className="rounded-r-2xl border-l-[3px] border-brand-accent bg-brand-grid px-6 pb-[22px] pt-[26px]">
          <ol className="flex list-none flex-col gap-[18px]">
            {CONSIGNES.map((consigne, i) => (
              <li key={consigne.titre} className="flex gap-4">
                <span
                  className="w-[30px] flex-none text-right font-lora text-[22px] font-semibold italic text-[#D89A2E]"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <p className="text-[15px] leading-[1.65] text-brand-text">
                  <strong className="text-[#2F6F73]">{consigne.titre}</strong> {consigne.texte}
                </p>
              </li>
            ))}
          </ol>
          {isMineur ? (
            <div className="mt-5 border-t border-dashed border-[#D9CDB8] pt-3.5">
              <p className="text-[14.5px] leading-[1.6] text-brand-text">
                <strong className="text-brand-deep">Participant mineur :</strong>{" "}
                {CONSIGNES_MINEUR}
              </p>
            </div>
          ) : null}
          {/* Sentinel de la détection de lecture — NE PAS déplacer. */}
          <p ref={sentinelRef} className="mt-5 text-[13px] italic text-gray-400">
            Ces consignes te seront rappelées oralement sur place avant de commencer.
          </p>
        </div>
      </section>

      {/* BLOC 4 — déclaration de santé */}
      <section aria-label="Déclaration de santé">
        <BlocTitre numero="04">Déclaration de santé</BlocTitre>
        <p className="mb-1.5 text-[15.5px] leading-[1.7] text-brand-text">
          Aucun certificat médical n&rsquo;est demandé. Réponds aux questions suivantes{" "}
          <strong className="text-[#2F6F73]">pour toi-même</strong> : tes réponses ne sont ni
          collectées ni conservées.
        </p>
        {isMineur ? (
          <p className="mb-1.5 text-sm italic text-brand-deep">
            Pour un mineur, ces questions sont passées en revue par le représentant légal, à
            propos du mineur.
          </p>
        ) : null}
        <div className="mt-3 rounded-2xl bg-white p-5 shadow-[0_6px_24px_rgba(0,0,0,0.06)] md:px-6">
          <ol className="flex list-none flex-col gap-3">
            {SANTE_QUESTIONS.map((question, i) => (
              <li key={question} className="flex gap-3.5">
                <span
                  className="w-[22px] flex-none text-right font-mono text-xs font-bold text-brand-primary"
                  aria-hidden="true"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-[14.5px] leading-[1.6] text-brand-text">{question}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="mt-3.5 rounded-r-xl border-l-[3px] border-brand-accent bg-brand-accent/[0.13] px-[18px] py-4">
          <p className="text-[14.5px] leading-[1.65] text-brand-text">
            Si tu as répondu <strong className="text-[#D89A2E]">oui</strong> à au moins une
            question, consulte un médecin avant de venir. Tu pourras participer ensuite —
            c&rsquo;est un avis médical, pas une exclusion.
          </p>
        </div>
        <label className="mt-[18px] flex cursor-pointer items-start gap-3">
          <input type="checkbox" name="sante" checked={c.sante} onChange={onCheck} className={CHECKBOX_CLASSES} />
          <span className="text-[15px] leading-[1.6] text-brand-text">
            J&rsquo;ai passé ces questions en revue et j&rsquo;en ai tenu compte pour ma
            participation. <span className="font-bold text-[#D89A2E]">*</span>
          </span>
        </label>
        <Champ
          label="Quelque chose que tu souhaites me signaler pour adapter la séance"
          hint="(facultatif — supprimé après l'atelier)"
        >
          <textarea
            name="santeCommentaire"
            rows={3}
            value={f.santeCommentaire}
            onChange={onField}
            className={`${INPUT_CLASSES} mt-2 resize-y`}
          />
        </Champ>
      </section>

      {/* BLOC 5 — droit à l'image */}
      <section aria-label="Droit à l'image">
        <BlocTitre numero="05">Droit à l&rsquo;image</BlocTitre>
        <p className="mb-3.5 text-[15px] leading-[1.7] text-brand-text">
          Des photos peuvent être prises pendant l&rsquo;atelier pour le site et les réseaux
          sociaux du Locomotion Lab, pour une durée de 3 ans. Tu peux retirer ton autorisation à
          tout moment par simple email.{" "}
          <strong className="text-[#2F6F73]">Un refus ne change rien à ta participation.</strong>
        </p>
        {isMineur ? (
          <p className="mb-3.5 text-sm italic text-brand-deep">
            Ce choix est fait par le représentant légal, pour le mineur.
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Droit à l'image">
          <button
            type="button"
            role="radio"
            aria-checked={image === true}
            onClick={() => setImage(true)}
            className={`flex cursor-pointer items-center gap-3 rounded-[14px] border-2 bg-white px-[18px] py-4 text-left transition-colors ${
              image === true ? "border-[#D89A2E]" : "border-brand-field hover:border-[#D89A2E]/60"
            }`}
          >
            <span className="inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border-2 border-[#D89A2E]">
              <span
                className={`h-[9px] w-[9px] rounded-full ${image === true ? "bg-[#D89A2E]" : "bg-transparent"}`}
              />
            </span>
            <span className="text-[15px] font-bold text-brand-text">J&rsquo;autorise les photos</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={image === false}
            onClick={() => setImage(false)}
            className={`flex cursor-pointer items-center gap-3 rounded-[14px] border-2 bg-white px-[18px] py-4 text-left transition-colors ${
              image === false ? "border-[#2F6F73]" : "border-brand-field hover:border-[#2F6F73]/60"
            }`}
          >
            <span className="inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border-2 border-[#2F6F73]">
              <span
                className={`h-[9px] w-[9px] rounded-full ${image === false ? "bg-[#2F6F73]" : "bg-transparent"}`}
              />
            </span>
            <span className="text-[15px] font-bold text-brand-text">Je n&rsquo;autorise pas</span>
          </button>
        </div>
      </section>

      {/* BLOC 6 — données */}
      <section aria-label="Tes données">
        <BlocTitre numero="06">Tes données</BlocTitre>
        <details className="group rounded-[14px] bg-brand-grid px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-bold text-[#2F6F73] [&::-webkit-details-marker]:hidden">
            Ce qu&rsquo;on garde, combien de temps, et tes droits
            <svg
              className="flex-none transition-transform group-open:rotate-90 motion-reduce:transition-none"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#2F6F73"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </summary>
          <div className="mt-3 text-[14.5px] leading-[1.7] text-brand-text">
            <p className="mb-2">
              <strong>Responsable :</strong> Valentin Fer, The Locomotion Lab.{" "}
              <strong>Finalités :</strong> organiser l&rsquo;atelier, te contacter en cas
              d&rsquo;imprévu, et conserver la preuve de ton inscription.
            </p>
            <p className="mb-2">
              <strong>Durées :</strong> fiche validée conservée 10 ans · coordonnées 12 mois ·
              photos le temps de leur diffusion · commentaire santé supprimé après
              l&rsquo;atelier.
            </p>
            <p>
              Aucun destinataire tiers. Tu disposes d&rsquo;un droit d&rsquo;accès et
              d&rsquo;effacement par simple email, et d&rsquo;un droit de réclamation auprès de
              la CNIL.
            </p>
          </div>
        </details>
      </section>

      {/* BLOC 7 — validation */}
      <section aria-label="Validation">
        <BlocTitre numero="07">Validation</BlocTitre>
        <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-[0_6px_24px_rgba(0,0,0,0.06)] md:px-6">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" name="consignes" checked={c.consignes} onChange={onCheck} className={CHECKBOX_CLASSES} />
            <span className="text-[15px] leading-[1.6] text-brand-text">
              J&rsquo;ai lu et compris la description de l&rsquo;activité et les consignes de
              sécurité. Je m&rsquo;engage à les respecter.{" "}
              <span className="font-bold text-[#D89A2E]">*</span>
            </span>
          </label>
          {!isMineur ? (
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" name="majeur" checked={c.majeur} onChange={onCheck} className={CHECKBOX_CLASSES} />
              <span className="text-[15px] leading-[1.6] text-brand-text">
                Je certifie être majeur·e. <span className="font-bold text-[#D89A2E]">*</span>
              </span>
            </label>
          ) : (
            <>
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" name="autorite" checked={c.autorite} onChange={onCheck} className={CHECKBOX_CLASSES} />
                <span className="text-[15px] leading-[1.6] text-brand-text">
                  Je suis titulaire de l&rsquo;autorité parentale et j&rsquo;atteste que
                  l&rsquo;autre titulaire est informé et d&rsquo;accord.{" "}
                  <span className="font-bold text-[#D89A2E]">*</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" name="soins" checked={c.soins} onChange={onCheck} className={CHECKBOX_CLASSES} />
                <span className="text-[15px] leading-[1.6] text-brand-text">
                  J&rsquo;autorise le recours aux secours et aux soins d&rsquo;urgence si
                  nécessaire. <span className="font-bold text-[#D89A2E]">*</span>
                </span>
              </label>
            </>
          )}
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" name="exactitude" checked={c.exactitude} onChange={onCheck} className={CHECKBOX_CLASSES} />
            <span className="text-[15px] leading-[1.6] text-brand-text">
              Je certifie l&rsquo;exactitude des informations renseignées.{" "}
              <span className="font-bold text-[#D89A2E]">*</span>
            </span>
          </label>

          <div className="flex flex-col gap-2.5 border-t border-brand-gauge pt-[18px]">
            {errors.length ? (
              <div
                ref={alertRef}
                role="alert"
                tabIndex={-1}
                className="rounded-r-[10px] border-l-[3px] border-brand-deep bg-brand-deep/10 px-4 py-3"
              >
                {errors.map((err) => (
                  <p key={err} className="my-0.5 text-sm leading-[1.55] text-brand-deep-dark">
                    {err}
                  </p>
                ))}
              </div>
            ) : null}
            {serverError === "complet" ? (
              <div role="alert" className="rounded-r-[10px] border-l-[3px] border-brand-deep bg-brand-deep/10 px-4 py-3">
                <p className="text-sm leading-[1.55] text-brand-deep-dark">
                  L&rsquo;atelier s&rsquo;est rempli entre-temps&hellip;{" "}
                  <Link href="/pratiquer" className="font-bold underline">
                    Reviens aux ateliers
                  </Link>{" "}
                  pour rejoindre la liste d&rsquo;attente.
                </p>
              </div>
            ) : null}
            {serverError === "erreur" ? (
              <div role="alert" className="rounded-r-[10px] border-l-[3px] border-brand-deep bg-brand-deep/10 px-4 py-3">
                <p className="text-sm leading-[1.55] text-brand-deep-dark">
                  L&rsquo;envoi a échoué — vérifie ta connexion et réessaie. Si ça persiste,
                  écris-nous via la page contact.
                </p>
              </div>
            ) : null}
            <button
              type="button"
              onClick={submit}
              disabled={submitLocked || sending}
              className={`w-full rounded-full py-4 text-[17px] font-bold text-white transition-all duration-300 ${
                submitLocked
                  ? "cursor-not-allowed bg-[#E3DACA]"
                  : sending
                    ? "cursor-wait bg-brand-accent opacity-70"
                    : "cursor-pointer bg-brand-accent hover:bg-brand-accent-dark"
              }`}
            >
              {sending ? "Envoi en cours…" : "Je valide mon inscription"}
            </button>
            {submitLocked ? (
              <p className="text-center text-[13.5px] font-medium text-brand-deep">
                Lis les consignes de sécurité (bloc 3) pour continuer.
              </p>
            ) : null}
            <p className="text-center text-[13px] italic text-gray-400">
              Tu recevras une copie de cette page en PDF par email.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
