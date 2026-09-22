// components/twin/tableau-de-bord/File.jsx
//
// LA FILE : un dossier par athlète, la course la plus proche en tête.
//
// Quatre compteurs qui partitionnent, un statut en sept pas, et LE VERBE SUIVANT en
// dernière colonne — la seule chose que l'écran demande de décider. Les demandes des
// athlètes sont listées à part : ce ne sont pas des dossiers, ce sont des questions
// posées sur un dossier.

"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@locomotionlab/ui";
import { BadgeEtat, Tableau } from "@locomotionlab/ui/contenu";

import {
  COMPTEURS,
  PAS,
  VERBES,
  departLisible,
  duree,
  pasFranchis,
  statutDuDossier,
  tailleLisible,
} from "@/lib/twinTableauDeBord.mjs";

import { appeler } from "./api";
import Coquille, { ETIQUETTE } from "./Coquille";

const COLONNES = [
  "Prénom",
  "Course visée",
  "Départ",
  "Objectif annoncé",
  "Archive",
  "Statut",
  "Suivant",
];

/** Les sept pas, en filets. Ce qui est franchi prend la couleur de ce qui se déroule. */
function Progression({ dossier }) {
  const franchis = pasFranchis(dossier);
  const bloque = dossier.ingestion === "illisible";
  return (
    <span className="flex gap-0.5" role="img" aria-label={`${franchis} sur ${PAS.length} : ${PAS[franchis - 1]}`}>
      {PAS.map((pas, rang) => (
        <span
          key={pas}
          className={`h-1 w-5 rounded-full ${
            rang >= franchis
              ? "bg-brand-hairline"
              : bloque && rang === franchis - 1
                ? "bg-brand-deep"
                : "bg-brand-primary"
          }`}
        />
      ))}
    </span>
  );
}

function Statut({ dossier }) {
  const { mot, ton } = statutDuDossier(dossier);
  return (
    <span className="flex items-center gap-3">
      <Progression dossier={dossier} />
      {dossier.erreur ? (
        <span className="text-brand-deep-dark">
          <span className="font-semibold">{mot}</span>
          <span className="ml-1.5 text-brand-muted">· {dossier.erreur}</span>
        </span>
      ) : (
        <BadgeEtat ton={ton}>{mot}</BadgeEtat>
      )}
    </span>
  );
}

function ligneDe(dossier) {
  return [
    <Link
      key="nom"
      href={`/services/twin/tableau-de-bord/athletes?id=${encodeURIComponent(dossier.athlete_id)}`}
      className="font-semibold text-brand-text underline decoration-brand-hairline underline-offset-4 hover:decoration-brand-deep"
    >
      {dossier.prenom || "—"}
    </Link>,
    dossier.course || "",
    departLisible(dossier.depart_le) || "",
    dossier.objectif_annonce ? duree(dossier.objectif_annonce) : "",
    tailleLisible(dossier.archive),
    <Statut key="statut" dossier={dossier} />,
    VERBES[dossier.suivant] ? (
      <span key="suivant" className="flex justify-end">
        <Button
          as={Link}
          href={`/services/twin/tableau-de-bord/athletes?id=${encodeURIComponent(dossier.athlete_id)}`}
          variant="secondary"
          size="sm"
        >
          {VERBES[dossier.suivant]}
        </Button>
      </span>
    ) : (
      ""
    ),
  ];
}

function Compteurs({ compteurs }) {
  return (
    <div className="flex gap-11">
      {COMPTEURS.map(([cle, libelle]) => (
        <div key={cle}>
          <p className={ETIQUETTE}>{libelle}</p>
          <p className="mt-0.5 font-heading text-[30px] font-light leading-none text-brand-text">
            {compteurs[cle] ?? 0}
          </p>
        </div>
      ))}
    </div>
  );
}

function Demandes({ demandes }) {
  if (!demandes.length) return null;
  return (
    <section>
      <h2 className={ETIQUETTE}>Demandes</h2>
      <Tableau
        colonnes={["Demande", "Plan", "Quoi", "Pourquoi", "Reçue"]}
        cles={demandes.map((demande) => demande.id)}
        lignes={demandes.map((demande) => [
          demande.id.slice(0, 8),
          demande.plan_ref || "",
          demande.quoi || "",
          demande.pourquoi || "",
          departLisible(demande.recue_le) || "",
        ])}
      />
    </section>
  );
}

export default function File() {
  const [rafraichissement, setRafraichissement] = useState("");

  return (
    <Coquille actif="File" chemin="/file">
      {(vue, recharger, charge) => (
        <>
          <div className="flex items-end justify-between gap-8">
            <div>
              <h1 className="font-heading text-[22px] font-bold text-brand-text">File</h1>
              <p className="mt-1 text-sm text-brand-muted">
                Un dossier par dépôt, la course la plus proche en tête. Chaque dossier est
                dans une case, et une seule.
              </p>
            </div>
            <Compteurs compteurs={vue.compteurs} />
          </div>

          <section className="rounded-lg border border-brand-hairline bg-brand-paper px-5 py-2">
            {vue.dossiers.length ? (
              <Tableau
                colonnes={COLONNES}
                cles={vue.dossiers.map((dossier) => dossier.athlete_id)}
                lignes={vue.dossiers.map(ligneDe)}
              />
            ) : (
              <p className="px-1 py-16 text-center text-sm leading-relaxed text-brand-soft">
                Aucun dossier.
                <br />
                Quand un athlète dépose son archive sur le site, il apparaît ici, la
                course la plus proche en tête.
              </p>
            )}
          </section>

          <Demandes demandes={vue.demandes ?? []} />

          <div className="flex items-center gap-4">
            <Button
              variant="secondary"
              size="sm"
              loading={charge}
              onClick={async () => {
                setRafraichissement("");
                try {
                  const vu = await appeler("/file/refresh", { methode: "POST" });
                  setRafraichissement(
                    vu.rattrapes.length
                      ? `${vu.rattrapes.length} dépôt(s) rattrapé(s).`
                      : "Rien à rattraper : la File est à jour.",
                  );
                  await recharger();
                } catch (leve) {
                  setRafraichissement(leve.message);
                }
              }}
            >
              Rafraîchir
            </Button>
            <p className="text-sm text-brand-muted">
              {rafraichissement ||
                "Le dépôt prévient le moteur tout seul. Ceci rattrape, le jour où il était tombé."}
            </p>
          </div>

          <p className="text-xs text-brand-muted">
            Statut en sept pas : {PAS.join(" · ")}. La dernière colonne porte le verbe
            suivant. Un clic sur le prénom ouvre l&rsquo;athlète.
          </p>
        </>
      )}
    </Coquille>
  );
}
