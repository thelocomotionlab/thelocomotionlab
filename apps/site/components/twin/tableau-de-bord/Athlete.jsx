// components/twin/tableau-de-bord/Athlete.jsx
//
// LA FICHE D'UN ATHLÈTE : ce qu'il a déposé, ce que son archive a donné, ses plans.
//
// Trois colonnes, comme la planche : l'identité et le consentement à gauche, le jumeau
// et les plans au centre, les actions à droite. Le niveau y est dit en deux mots —
// Plan de base, Plan calibré — avec les raisons que le moteur a rendues, jamais une
// note sur dix.
//
// Aucune durée n'est annoncée pour une ingestion : l'écran montre l'état en cours et
// l'avancement que le job renvoie, et rien d'autre. On ne sait pas combien de temps
// prend une archive avant de l'avoir lue.

"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@locomotionlab/ui";
import { BadgeEtat, Tableau } from "@locomotionlab/ui/contenu";

import {
  NIVEAUX,
  departLisible,
  duree,
  jourLisible,
  nombre,
  statutDuDossier,
  statutDuPlan,
  tailleLisible,
} from "@/lib/twinTableauDeBord.mjs";

import { appeler } from "./api";
import Coquille, { ETIQUETTE, lienVers } from "./Coquille";
import useJob from "./useJob";

const INGESTION_DIT = {
  recu: "Archive reçue, pas encore lue.",
  en_cours: "Le jumeau se calcule. Le tableau de bord reste utilisable ; la fiche se remplit toute seule.",
  ingere: "",
  illisible: "Aucun jumeau : l'archive n'a pas pu être lue.",
};

/** Une ligne de la fiche. Une valeur trop longue pour la colonne (un email, le nom d'une
 *  archive) se coupe à sa largeur ; elle se lit en entier au survol. */
function Ligne({ terme, children }) {
  return (
    <>
      <dt className="text-brand-muted">{terme}</dt>
      <dd
        className={`m-0 min-w-0 truncate text-right ${children ? "text-brand-text" : "text-brand-faint"}`}
        title={typeof children === "string" ? children : undefined}
      >
        {children || "—"}
      </dd>
    </>
  );
}

function Chiffre({ titre, valeur, aide }) {
  return (
    <div className="border-t border-brand-grid pt-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className={ETIQUETTE}>{titre}</p>
        <p className="font-heading text-[26px] font-light leading-none text-brand-text">
          {valeur}
        </p>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-brand-muted">{aide}</p>
    </div>
  );
}

function LeJumeau({ athlete }) {
  const { jumeau, ingestion, niveau } = athlete;
  if (ingestion.statut !== "ingere") {
    return (
      <p className="text-sm leading-relaxed text-brand-soft">
        {INGESTION_DIT[ingestion.statut] ?? "Pas encore de jumeau."}
        {ingestion.erreur ? (
          <span className="mt-1 block text-brand-deep-dark">{ingestion.erreur}</span>
        ) : null}
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-x-10 gap-y-4">
        <Chiffre
          titre="Vitesse critique"
          valeur={nombre(jumeau.vc_kmh, 1, "km/h")}
          aide="Vitesse tenue des heures sans que la fatigue s'emballe. Référence de tout le plan."
        />
        <Chiffre
          titre="Endurance"
          valeur={jumeau.E === null ? "—" : `E = ${nombre(jumeau.E, 2)}`}
          aide="Baisse de l'allure quand la course s'allonge."
        />
        <Chiffre
          titre="Durabilité"
          valeur={nombre(jumeau.durabilite_pct, 0, "%")}
          aide="Vitesse perdue après plusieurs heures, à effort cardiaque égal."
        />
        <Chiffre
          titre="Vrais ultras"
          valeur={`${nombre(jumeau.n_vrais_ultras)} dont ${nombre(jumeau.n_avec_fc)} avec FC`}
          aide={
            jumeau.plus_long_h
              ? `Le plus long ${duree(jumeau.plus_long_h)}, le plus montagneux ${nombre(jumeau.plus_gros_dplus_m, 0, "m D+")}.`
              : "Ce que le moteur a retenu pour calibrer."
          }
        />
      </div>

      <div className="mt-6 border-t border-brand-grid pt-4">
        <BadgeEtat ton={niveau.nom === "calibre" ? "deroule" : "annonce"}>
          {NIVEAUX[niveau.nom] ?? niveau.nom}
        </BadgeEtat>
        {niveau.raisons.length ? (
          <ul className="mt-3 flex list-none flex-col gap-1.5 p-0 text-sm leading-relaxed text-brand-soft">
            {niveau.raisons.map((raison) => (
              <li key={raison}>{raison}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-brand-muted">
            Aucune réserve : l&rsquo;archive porte de quoi calibrer.
          </p>
        )}
      </div>
    </>
  );
}

function Plans({ plans }) {
  if (!plans.length) {
    return (
      <p className="text-sm text-brand-muted">
        Aucun plan. Le premier se compose après l&rsquo;ingestion.
      </p>
    );
  }
  return (
    <Tableau
      colonnes={["Référence", "Niveau", "Statut", "Version", "Arrivée prévue"]}
      cles={plans.map((plan) => plan.ref)}
      lignes={plans.map((plan) => {
        const { mot, ton } = statutDuPlan(plan.statut);
        return [
          <Link
            key="ref"
            href={lienVers("plan", { ref: plan.ref })}
            className="font-semibold text-brand-text underline decoration-brand-hairline underline-offset-4 hover:decoration-brand-deep"
          >
            {plan.ref}
          </Link>,
          NIVEAUX[plan.prediction?.niveau] ?? "",
          <BadgeEtat key="s" ton={ton}>
            {mot}
          </BadgeEtat>,
          plan.version ? `v${plan.version}` : "—",
          plan.prediction?.central_h ? duree(plan.prediction.central_h) : "",
        ];
      })}
    />
  );
}

function Actions({ athlete, recharger }) {
  const [jobId, setJobId] = useState("");
  const [message, setMessage] = useState("");
  const [aConfirmer, setAConfirmer] = useState(false);
  const job = useJob(jobId, () => {
    setJobId("");
    void recharger();
  });

  const lancer = async (chemin) => {
    setMessage("");
    try {
      const { job_id: nouveau } = await appeler(chemin, { methode: "POST" });
      setJobId(nouveau);
    } catch (leve) {
      setMessage(leve.message);
    }
  };

  const ingere = athlete.ingestion.statut === "ingere";

  return (
    <aside className="flex flex-col gap-5 border-l border-brand-hairline bg-brand-paper px-6 py-7">
      <p className={ETIQUETTE}>Actions</p>

      <div className="flex flex-col gap-2">
        {ingere ? (
          <Button as={Link} href={lienVers("plan", { athlete: athlete.id })} size="sm">
            Nouveau plan
          </Button>
        ) : (
          <Button size="sm" disabled>
            Nouveau plan
          </Button>
        )}
        <p className="text-xs leading-relaxed text-brand-muted">
          {ingere
            ? "Une course de la bibliothèque, des réglages, et la version 1 se génère."
            : "Un plan se compose une fois l'archive ingérée."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          size="sm"
          loading={Boolean(jobId)}
          onClick={() => lancer(`/athletes/${encodeURIComponent(athlete.id)}/ingest`)}
          disabled={Boolean(jobId) || !athlete.depot_id}
        >
          {athlete.ingestion.statut === "ingere" ? "Ré-ingérer" : "Ingérer"}
        </Button>
        <p className="text-xs leading-relaxed text-brand-muted">
          {jobId
            ? job?.avancement || "En file."
            : athlete.depot_id
              ? "Ré-ingérer sert quand le moteur a changé : le jumeau se recalcule, les plans publiés restent tels quels."
              : "Aucun dépôt rattaché. Renvoie l'archive depuis ton ordinateur."}
        </p>
      </div>

      {message ? <p className="text-xs text-brand-deep-dark">{message}</p> : null}

      <div className="mt-auto border-t border-brand-grid pt-5">
        {aConfirmer ? (
          <>
            <p className="text-sm font-semibold text-brand-text">
              Supprimer {athlete.pseudo || "cet athlète"} ?
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-brand-soft">
              Son archive, son jumeau et ses plans disparaissent ; sa page cesse de
              répondre. Définitif.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await appeler(`/athletes/${encodeURIComponent(athlete.id)}`, {
                      methode: "DELETE",
                    });
                    window.location.assign("/services/twin/tableau-de-bord");
                  } catch (leve) {
                    setMessage(leve.message);
                    setAConfirmer(false);
                  }
                }}
              >
                Supprimer
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAConfirmer(false)}>
                Annuler
              </Button>
            </div>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => setAConfirmer(true)}>
              Supprimer cet athlète
            </Button>
            <p className="mt-1.5 text-xs leading-relaxed text-brand-muted">
              Archive, jumeau et plans. Le registre garde ses entrées, sous pseudonyme.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}

/** Sans athlète choisi : tous ceux du laboratoire, par ordre alphabétique. */
function ListeDesAthletes({ dossiers }) {
  const tries = [...dossiers].sort((a, b) =>
    (a.prenom || "").localeCompare(b.prenom || "", "fr"),
  );
  if (!tries.length) {
    return (
      <p className="text-sm text-brand-muted">
        Aucun athlète. Un athlète naît de son dépôt d&rsquo;archive.
      </p>
    );
  }
  return (
    <section className="rounded-lg border border-brand-hairline bg-brand-paper px-5 py-2">
      <Tableau
        colonnes={["Athlète", "Niveau", "Statut", "Course visée"]}
        cles={tries.map((d) => d.athlete_id)}
        lignes={tries.map((d) => {
          const { mot, ton } = statutDuDossier(d);
          return [
            <Link
              key="nom"
              href={lienVers("athletes", { id: d.athlete_id })}
              className="font-semibold text-brand-text underline decoration-brand-hairline underline-offset-4 hover:decoration-brand-deep"
            >
              {d.prenom || "—"}
            </Link>,
            NIVEAUX[d.niveau] ?? "",
            <BadgeEtat key="s" ton={ton}>
              {mot}
            </BadgeEtat>,
            d.course || "",
          ];
        })}
      />
    </section>
  );
}

export default function Athlete({ athleteId }) {
  if (!athleteId) {
    return (
      <Coquille actif="Athlètes" chemin="/file">
        {(vue) => (
          <>
            <div>
              <h1 className="font-heading text-[22px] font-bold text-brand-text">Athlètes</h1>
              <p className="mt-1 text-sm text-brand-muted">
                Un athlète est durable : sa deuxième course ne redemande rien.
              </p>
            </div>
            <ListeDesAthletes dossiers={vue.dossiers} />
          </>
        )}
      </Coquille>
    );
  }

  return (
    <Coquille actif="Athlètes" chemin={`/athletes/${encodeURIComponent(athleteId)}`}>
      {(athlete, recharger) => (
        <div className="-mx-8 -my-7 grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_1fr_296px]">
          <aside className="flex flex-col gap-6 border-r border-brand-hairline bg-brand-paper px-6 py-7">
            <div>
              <p className={ETIQUETTE}>Athlète</p>
              <h1 className="mt-1.5 font-heading text-[34px] font-light leading-none text-brand-text">
                {athlete.pseudo || athlete.prenom || "Sans nom"}
              </h1>
            </div>
            <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <Ligne terme="Email">{athlete.email}</Ligne>
              <Ligne terme="Montre">{athlete.montre}</Ligne>
              <Ligne terme="Dépôt">{athlete.depot_id}</Ligne>
              <Ligne terme="Consentement">{jourLisible(athlete.consent_at)}</Ligne>
              <Ligne terme="Archive">{athlete.archive.nom}</Ligne>
              <Ligne terme="Taille">{tailleLisible(athlete.archive.taille)}</Ligne>
              <Ligne terme="Données jusqu'au">{jourLisible(athlete.jumeau.donnees_jusquau)}</Ligne>
            </dl>
            <div className="border-t border-brand-grid pt-4">
              <p className={ETIQUETTE}>Ingestion</p>
              <p className="mt-2 text-sm leading-relaxed text-brand-soft">
                {athlete.ingestion.statut === "ingere"
                  ? `Ingérée le ${jourLisible(athlete.ingestion.le)}.`
                  : INGESTION_DIT[athlete.ingestion.statut]}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-brand-muted">
                Un athlète est durable : sa deuxième course ne redemande rien.
              </p>
            </div>
          </aside>

          <section className="flex flex-col gap-8 px-8 py-7">
            <div>
              <h2 className="font-heading text-[22px] font-bold text-brand-text">Le jumeau</h2>
              <div className="mt-4">
                <LeJumeau athlete={athlete} />
              </div>
            </div>
            <div>
              <h2 className="font-heading text-[22px] font-bold text-brand-text">Plans</h2>
              <div className="mt-2">
                <Plans plans={athlete.plans ?? []} />
              </div>
            </div>
          </section>

          <Actions athlete={athlete} recharger={recharger} />
        </div>
      )}
    </Coquille>
  );
}
