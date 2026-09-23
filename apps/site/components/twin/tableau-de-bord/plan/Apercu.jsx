// components/twin/tableau-de-bord/plan/Apercu.jsx
//
// LE CENTRE DE L'ÉCRAN PLAN : les cinq chiffres de la version courante et son PDF.
//
// Pendant une génération, l'écran montre ce que le moteur dit faire, au présent, et rien
// d'autre — aucune durée : on ne sait pas combien de temps prend un rendu avant de
// l'avoir fait.

"use client";

import { useEffect, useState } from "react";
import { Button } from "@locomotionlab/ui";

import { NIVEAUX, duree, heureDePassage } from "@/lib/twinTableauDeBord.mjs";

import { lireUnFichier, telecharger } from "../api";
import { ETIQUETTE } from "../Coquille";

const DOCUMENTS = [
  ["pdf", "Le PDF · rapport, feuille, fiches"],
  ["feuille.pdf", "La feuille seule"],
  ["ics", "Calendrier (ICS)"],
  ["gpx", "Trace (GPX)"],
];

function Chiffre({ titre, valeur, sous, large, appuye }) {
  return (
    <div
      className={`rounded-md border border-brand-hairline bg-brand-paper px-4 py-3.5 ${
        large ? "col-span-2 md:col-span-3" : "md:col-span-2"
      }`}
    >
      <p className={ETIQUETTE}>{titre}</p>
      <p
        className={`mt-2 whitespace-nowrap font-heading text-[22px] leading-none text-brand-text ${
          appuye ? "font-semibold" : "font-light"
        }`}
      >
        {valeur}
      </p>
      {sous ? <p className="mt-1.5 text-xs text-brand-muted">{sous}</p> : null}
    </div>
  );
}

const bande = (b) => (b?.length === 2 && b[0] !== null ? `${duree(b[0])} – ${duree(b[1])}` : "—");

export default function Apercu({ plan, version, documents, job, erreur, publiee }) {
  const ref = plan?.ref;
  const numero = plan?.version;
  const avecPdf = Boolean(ref && numero && documents?.includes("pdf"));
  // Un amendement refait les documents SANS changer de numéro : il change la clé aussi.
  const cle = avecPdf ? `${ref}/v${numero}/${version?.amende_le || version?.cree_le || ""}` : "";
  // Ce qui a été lu, et pour quelle version : un aperçu ne survit pas à sa version.
  const [lu, setLu] = useState({ cle: "", url: null, erreur: "" });

  // Le PDF se lit sous le jeton, puis s'affiche depuis la mémoire de l'onglet.
  useEffect(() => {
    if (!cle) return undefined;
    let vivant = true;
    let adresse = null;
    lireUnFichier(`/plans/${encodeURIComponent(ref)}/pdf?version=${numero}`)
      .then(({ url }) => {
        adresse = url;
        if (vivant) setLu({ cle, url, erreur: "" });
        else URL.revokeObjectURL(url);
      })
      .catch((leve) => vivant && setLu({ cle, url: null, erreur: leve.message }));
    return () => {
      vivant = false;
      if (adresse) URL.revokeObjectURL(adresse);
    };
  }, [cle, ref, numero]);

  const pdf = lu.cle === cle ? lu.url : null;
  const lecture = lu.cle === cle ? lu.erreur : "";

  const enCours = job && (job.statut === "en_file" || job.statut === "en_cours");
  const p = plan?.prediction ?? {};

  return (
    <section className="flex min-w-0 flex-col gap-6 px-8 py-7">
      {enCours ? (
        <div className="rounded-lg border border-brand-primary bg-brand-mist px-5 py-4" aria-live="polite">
          <p className="font-semibold text-brand-text">
            {job.type === "amendement" ? "Les documents se refont." : "Génération en cours."}
          </p>
          <p className="mt-1 text-sm text-brand-soft">
            {job.statut === "en_file" ? "En file : un autre travail passe d'abord." : job.avancement || "Le moteur démarre."}
          </p>
        </div>
      ) : null}
      {erreur ? (
        <div className="rounded-lg border border-brand-deep px-5 py-4">
          <p className="font-semibold text-brand-deep-dark">Le moteur n&rsquo;a pas pu générer ce plan.</p>
          <p className="mt-1 text-sm text-brand-soft">{erreur}</p>
        </div>
      ) : null}

      {numero ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <Chiffre titre="Arrivée" valeur={heureDePassage(p.arrivee_le) || "—"} />
            <Chiffre titre="Durée" valeur={duree(p.central_h)} />
            <Chiffre titre="Niveau" valeur={NIVEAUX[p.niveau] ?? "—"} appuye />
            <Chiffre titre="Fourchette de course" valeur={bande(p.fourchette)} sous="une course sur deux" large />
            <Chiffre titre="Bornes de sécurité" valeur={bande(p.bornes)} sous="quatre courses sur cinq" large />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-brand-muted">
              Version {numero}
              {version?.cree_le ? ` · ${version.origine === "import" ? "importée" : "générée"} le ${new Date(version.cree_le).toLocaleDateString("fr-FR")}` : ""}
              {version?.amende_le ? " · amendée par l'athlète" : ""}
              {publiee === numero ? " · c'est celle que la page sert" : publiee ? ` · la page sert encore la version ${publiee}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {DOCUMENTS.filter(([nom]) => documents?.includes(nom)).map(([nom, libelle]) => (
              <Button
                key={nom}
                variant="secondary"
                size="sm"
                onClick={() => telecharger(`/plans/${encodeURIComponent(ref)}/${nom}?version=${numero}`)}
              >
                {libelle}
              </Button>
            ))}
          </div>

          {pdf ? (
            <iframe
              title={`PDF de la version ${numero}`}
              src={pdf}
              className="h-[900px] w-full rounded-lg border border-brand-hairline bg-brand-paper"
            />
          ) : lecture ? (
            <p className="text-sm text-brand-deep-dark">{lecture}</p>
          ) : (
            <p className="text-sm text-brand-muted">Lecture du PDF…</p>
          )}
        </>
      ) : enCours || erreur ? null : (
        <p className="rounded-lg border border-brand-hairline bg-brand-paper px-6 py-16 text-center text-sm leading-relaxed text-brand-soft">
          Aucun aperçu.
          <br />
          Choisis la course à gauche, puis lance : les cinq chiffres et le PDF arrivent ici.
        </p>
      )}
    </section>
  );
}
