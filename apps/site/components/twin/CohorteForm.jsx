// components/twin/CohorteForm.jsx
//
// Formulaire de dépôt d'archive de la cohorte Locomotion Twin (page
// /outils/twin/cohorte), fidèle à la maquette « Recrutement cohorte » :
//   * étape 1 — choix de la montre, qui déplie le tuto d'extraction de
//     l'archive (contenu : lib/twinCohorte.mjs, source unique) ;
//   * étape 2 — dépôt de l'archive (glisser-déposer ou sélecteur) ;
//   * étape 3 — identité + objectifs + consentement, puis envoi.
//
// L'envoi part en multipart vers le service twin-depot du VPS
// (NEXT_PUBLIC_TWIN_DEPOT_API, derrière Caddy) — XMLHttpRequest et non
// fetch : les archives font des centaines de Mo, la barre de progression
// (upload.onprogress) n'est pas négociable. Sans API configurée, le
// formulaire reste visible mais l'envoi renvoie vers /contact (aucune
// casse au build, pattern NEXT_PUBLIC_ATELIER_API).
//
// Garde-fous côté client : validation « Il manque : … » qui nomme les
// étapes, extension et taille de l'archive vérifiées au dépôt, honeypot
// `website` invisible (le service répond un faux succès aux robots).

"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, FileText, Upload, X } from "lucide-react";
import SectionHeading from "@/components/SectionHeading";
import {
  EXTENSIONS_ARCHIVE,
  MARQUES,
  MAX_ARCHIVE_MO,
} from "@/lib/twinCohorte.mjs";

const API_BASE = process.env.NEXT_PUBLIC_TWIN_DEPOT_API || "";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mêmes champs que le formulaire d'inscription atelier (source du pattern).
const INPUT_CLASSES =
  "w-full rounded-xl border border-brand-field bg-white px-4 py-[13px] text-base text-brand-text placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-accent";

function EtapeCard({ numero, titre, children }) {
  return (
    <section className="bg-white rounded-2xl shadow-card p-5 sm:px-9 sm:py-8">
      <p className="mb-1.5 font-heading text-[11px] font-bold tracking-[0.18em] text-brand-slate-dark">
        ÉTAPE {numero}
      </p>
      <SectionHeading className="mb-5">{titre}</SectionHeading>
      {children}
    </section>
  );
}

function formatTaille(octets) {
  if (octets >= 1048576) {
    return `${(octets / 1048576).toFixed(1).replace(".", ",")} Mo`;
  }
  if (octets >= 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${octets} o`;
}

function extensionValide(nom) {
  const minuscule = nom.toLowerCase();
  return EXTENSIONS_ARCHIVE.some((ext) => minuscule.endsWith(ext));
}

export default function CohorteForm() {
  const [marque, setMarque] = useState(null);
  const [fichier, setFichier] = useState(null);
  const [drag, setDrag] = useState(false);
  const [statut, setStatut] = useState("idle"); // idle | envoi | succes | erreur
  const [progression, setProgression] = useState(0);
  const [f, setF] = useState({ prenom: "", nom: "", email: "", objectifs: "" });
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [erreur, setErreur] = useState(null);
  const [erreurContact, setErreurContact] = useState(false);
  const fileInputRef = useRef(null);

  const m = MARQUES.find((x) => x.id === marque) || null;
  const enEnvoi = statut === "envoi";

  function poserErreur(message, contact = false) {
    setStatut("erreur");
    setErreur(message);
    setErreurContact(contact);
  }

  function effacerErreur() {
    if (statut === "erreur") {
      setStatut("idle");
      setErreur(null);
      setErreurContact(false);
    }
  }

  function prendreFichier(candidat) {
    setDrag(false);
    if (!candidat || enEnvoi) return;
    if (!extensionValide(candidat.name)) {
      poserErreur(
        "Format non reconnu — dépose l'archive en .zip (ou un fichier .fit / .tcx / .gpx).",
      );
      return;
    }
    if (candidat.size > MAX_ARCHIVE_MO * 1048576) {
      poserErreur(
        `Ton archive dépasse la taille maximale acceptée (${Math.round(MAX_ARCHIVE_MO / 1024)} Go) — écris-moi via la page contact et on s'organise.`,
        true,
      );
      return;
    }
    setFichier(candidat);
    effacerErreur();
  }

  function envoyer() {
    if (enEnvoi) return;

    const manques = [];
    if (!marque) manques.push("choisis ta montre (étape 1)");
    if (!fichier) manques.push("dépose ton archive (étape 2)");
    if (!f.prenom.trim()) manques.push("ton prénom");
    if (!EMAIL_REGEX.test(f.email.trim())) manques.push("un email valide");
    if (!consent) manques.push("la case de consentement");
    if (manques.length) {
      poserErreur(`Il manque : ${manques.join(", ")}.`);
      return;
    }

    if (!API_BASE) {
      poserErreur(
        "Le dépôt en ligne n'est pas encore ouvert — écris-moi via la page contact et on s'organise.",
        true,
      );
      return;
    }

    setStatut("envoi");
    setProgression(0);
    setErreur(null);
    setErreurContact(false);

    const data = new FormData();
    data.append("prenom", f.prenom.trim());
    data.append("nom", f.nom.trim());
    data.append("email", f.email.trim());
    data.append("objectifs", f.objectifs.trim());
    data.append("montre", marque);
    data.append("consent", "oui");
    data.append("website", website);
    data.append("archive", fichier, fichier.name);

    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        setProgression(Math.min(100, (e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setProgression(100);
        setStatut("succes");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (xhr.status === 413) {
        poserErreur(
          `Ton archive dépasse la taille maximale acceptée (${Math.round(MAX_ARCHIVE_MO / 1024)} Go) — écris-moi via la page contact et on s'organise.`,
          true,
        );
      } else if (xhr.status === 429) {
        poserErreur(
          "Trop d'envois rapprochés — patiente quelques minutes et réessaie.",
        );
      } else {
        poserErreur("L'envoi a échoué. Vérifie ta connexion et réessaie.");
      }
    });
    xhr.addEventListener("error", () => {
      poserErreur("L'envoi a échoué. Vérifie ta connexion et réessaie.");
    });
    xhr.open("POST", `${API_BASE}/depots`);
    xhr.send(data);
  }

  // ── Écran de succès : remplace les trois étapes. ─────────────────────
  if (statut === "succes") {
    return (
      <div className="bg-white rounded-2xl shadow-card p-8 sm:px-10 sm:py-12 text-center animate-fade-in">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand-success">
          <Check size={28} strokeWidth={2.5} className="text-white" aria-hidden="true" />
        </div>
        <h2 className="mb-3 text-[26px] font-bold text-brand-slate-dark">
          {f.prenom.trim() ? `Merci ${f.prenom.trim()} !` : "Merci !"}
        </h2>
        <p className="mx-auto max-w-md text-[15.5px] leading-[1.65] text-gray-700">
          Ton archive est bien arrivée au labo. Je te recontacte à{" "}
          <strong className="text-brand-deep-dark">{f.email.trim()}</strong>{" "}
          dès que ton jumeau est calibré — ton plan de course gratuit suivra.
        </p>
        <p className="mx-auto mt-4 max-w-md text-[12.5px] italic text-gray-500">
          Conformément à la règle du labo, ton archive sera supprimée
          immédiatement après analyse.
        </p>
        <div className="mt-7">
          <Link
            href="/outils/twin"
            className="inline-block rounded-full border-[1.5px] border-brand-accent-dark px-6 py-[11px] font-semibold text-brand-deep-dark transition hover:border-brand-accent hover:bg-brand-accent hover:text-white"
          >
            Retour à la page Twin
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-7">
      {/* ── Étape 1 : choix de la montre + tuto d'extraction. ─────────── */}
      <EtapeCard numero="1" titre="Choisis ta montre">
        <div className="flex flex-wrap gap-2.5">
          {MARQUES.map((x) => {
            const actif = x.id === marque;
            return (
              <button
                key={x.id}
                type="button"
                aria-pressed={actif}
                onClick={() => {
                  setMarque(x.id);
                  effacerErreur();
                }}
                className={`cursor-pointer rounded-full border-[1.5px] px-[22px] py-2.5 text-[15px] font-semibold transition hover:border-brand-accent-dark ${
                  actif
                    ? "border-brand-accent-dark bg-brand-accent text-white"
                    : "border-brand-hairline bg-white text-gray-600"
                }`}
              >
                {x.label}
              </button>
            );
          })}
        </div>

        {m ? (
          <div className="mt-6 rounded-xl border border-brand-hairline bg-brand-bg p-5 sm:p-6 animate-fade-in">
            <h3 className="mb-4 font-heading text-[11px] font-bold tracking-[0.18em] text-brand-accent-ink">
              EXTRAIRE TON ARCHIVE {m.label.toUpperCase()}
            </h3>
            <ol className="grid list-none gap-3 p-0">
              {m.etapes.map((texte, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[26px_1fr] items-start gap-2.5"
                >
                  <span className="pt-0.5 font-mono text-sm font-bold text-brand-accent-ink">
                    {i + 1}.
                  </span>
                  <span className="text-[15px] leading-relaxed text-gray-700">
                    {texte}
                  </span>
                </li>
              ))}
            </ol>
            {m.lien ? (
              <p className="mt-4">
                <a
                  href={m.lien}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-brand-deep-dark underline decoration-brand-accent-dark/60 underline-offset-2 hover:text-brand-accent-ink"
                >
                  {m.lienLabel} ↗
                </a>
              </p>
            ) : null}
            {m.note ? (
              <p className="mt-4 border-t border-brand-hairline pt-3.5 text-[13.5px] leading-normal text-gray-500">
                <strong className="text-brand-slate">Bon à savoir —</strong>{" "}
                {m.note}
              </p>
            ) : null}
          </div>
        ) : null}
      </EtapeCard>

      {/* ── Étape 2 : dépôt de l'archive. ─────────────────────────────── */}
      <EtapeCard numero="2" titre="Dépose ton archive">
        {!fichier ? (
          <>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                if (!drag) setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                prendreFichier(e.dataTransfer.files[0]);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed px-6 py-10 text-center transition hover:border-brand-accent-dark ${
                drag
                  ? "border-brand-accent-dark bg-brand-accent-light/15"
                  : "border-brand-wash-line bg-brand-bg"
              }`}
            >
              <Upload
                size={34}
                strokeWidth={1.8}
                className="text-brand-primary"
                aria-hidden="true"
              />
              <span className="max-w-[340px] text-[15.5px] font-semibold text-brand-slate-dark [text-wrap:balance]">
                Glisse ton archive ici, ou clique pour la choisir
              </span>
              <span className="font-mono text-xs text-gray-500">
                .zip de préférence — .fit / .tcx / .gpx acceptés
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept={EXTENSIONS_ARCHIVE.join(",")}
                onChange={(e) => prendreFichier(e.target.files[0])}
                className="hidden"
              />
            </label>
            <p className="mt-3 text-[13px] text-gray-500">
              Dépose le ZIP <strong>tel que reçu</strong>, sans le
              décompresser : le moteur se charge du tri.
            </p>
          </>
        ) : (
          <div className="flex items-center gap-3.5 rounded-xl border-[1.5px] border-brand-wash-line bg-brand-bg px-5 py-[18px] animate-fade-in">
            <FileText
              size={26}
              strokeWidth={1.8}
              className="shrink-0 text-brand-primary-dark"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-brand-text">
                {fichier.name}
              </p>
              <p className="mt-0.5 font-mono text-xs text-gray-500">
                {formatTaille(fichier.size)}
              </p>
            </div>
            {!enEnvoi ? (
              <button
                type="button"
                onClick={() => {
                  setFichier(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                aria-label="Retirer le fichier"
                className="cursor-pointer p-1.5 text-gray-400 transition hover:text-brand-deep-dark"
              >
                <X size={18} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        )}
      </EtapeCard>

      {/* ── Étape 3 : identité, objectifs, consentement, envoi. ───────── */}
      <EtapeCard numero="3" titre="Dis-m'en un peu plus">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-[13.5px] font-medium text-brand-slate-dark">
            <span>
              Prénom <span className="text-brand-accent-ink">*</span>
            </span>
            <input
              type="text"
              autoComplete="given-name"
              value={f.prenom}
              onChange={(e) => setF({ ...f, prenom: e.target.value })}
              className={INPUT_CLASSES}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13.5px] font-medium text-brand-slate-dark">
            <span>Nom</span>
            <input
              type="text"
              autoComplete="family-name"
              value={f.nom}
              onChange={(e) => setF({ ...f, nom: e.target.value })}
              className={INPUT_CLASSES}
            />
          </label>
        </div>

        <label className="mt-4 flex flex-col gap-1.5 text-[13.5px] font-medium text-brand-slate-dark">
          <span>
            Email <span className="text-brand-accent-ink">*</span>
          </span>
          <input
            type="email"
            autoComplete="email"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
            placeholder="Pour te renvoyer ton plan de course"
            className={INPUT_CLASSES}
          />
        </label>

        <label className="mt-4 flex flex-col gap-1.5 text-[13.5px] font-medium text-brand-slate-dark">
          <span>Tes courses passées et ton prochain objectif</span>
          <textarea
            rows={4}
            value={f.objectifs}
            onChange={(e) => setF({ ...f, objectifs: e.target.value })}
            placeholder="Ex. : Lavaredo 2025 en 18 h 40, objectif Diagonale des Fous 2026…"
            className={`${INPUT_CLASSES} resize-y leading-relaxed`}
          />
        </label>

        {/* Honeypot anti-robots : invisible et hors tabulation. */}
        <div
          className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
          aria-hidden="true"
        >
          <label>
            Ne pas remplir ce champ
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
        </div>

        <p className="mt-4 font-mono text-[12.5px] text-brand-slate">
          MONTRE : <strong>{m ? m.label : "—"}</strong> — remplie
          automatiquement depuis l&rsquo;étape 1.
        </p>

        <label className="mt-5 grid cursor-pointer grid-cols-[26px_1fr] items-start gap-2.5">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              effacerErreur();
            }}
            className="mt-px h-[22px] w-[22px] flex-none cursor-pointer accent-brand-accent-dark"
          />
          <span className="text-sm leading-normal text-gray-700">
            J&rsquo;accepte que mon archive d&rsquo;entraînement soit utilisée
            pour calibrer le Locomotion Twin, puis supprimée après analyse.{" "}
            <span className="text-brand-accent-ink">*</span>
          </span>
        </label>

        <div className="mt-6">
          <button
            type="button"
            onClick={envoyer}
            disabled={enEnvoi}
            className={`inline-block cursor-pointer rounded-full bg-brand-accent px-7 py-[13px] font-semibold text-white shadow-cta transition hover:bg-brand-accent-dark ${
              enEnvoi ? "cursor-wait opacity-70" : ""
            }`}
          >
            {enEnvoi ? "Envoi en cours…" : "Envoyer mon archive"}
          </button>
          <p className="mt-3 text-[12.5px] italic text-gray-500">
            Ton archive est supprimée immédiatement après analyse — seuls ton
            rapport et quelques métadonnées sont conservés.
          </p>
        </div>

        {enEnvoi ? (
          <div className="mt-5 animate-fade-in">
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-mono text-xs text-brand-slate-dark">
                ENVOI DE {fichier ? fichier.name : ""}
              </span>
              <span className="font-mono text-xs font-bold text-brand-accent-ink">
                {Math.round(progression)} %
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-brand-gauge">
              <div
                className="h-full rounded-full bg-brand-accent transition-[width] duration-150 ease-out"
                style={{ width: `${progression}%` }}
              />
            </div>
          </div>
        ) : null}

        {statut === "erreur" && erreur ? (
          <p
            role="alert"
            className="mt-4 text-sm font-medium text-red-700 animate-fade-in"
          >
            {erreur}
            {erreurContact ? (
              <>
                {" "}
                <Link href="/contact?sujet=twin" className="font-bold underline">
                  Page contact
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
      </EtapeCard>
    </div>
  );
}
