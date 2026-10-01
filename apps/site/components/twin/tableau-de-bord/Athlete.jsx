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
import { useEffect, useState } from "react";
import { Button, ChampCompact } from "@locomotionlab/ui";
import { BadgeEtat, Tableau } from "@locomotionlab/ui/contenu";

import {
  NIVEAUX,
  conservationDit,
  departLisible,
  duree,
  jourLisible,
  nombre,
  passeDeLaPurge,
  signe,
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

/** Combien de temps ses données restent : l'échéance, le sort de l'archive, et l'alerte
 *  quand une course visée tombe après. */
function Conservation({ athlete }) {
  const { donnees, archive, alerte } = conservationDit(athlete.conservation, athlete.archive_conservee);
  return (
    <div className="border-t border-brand-grid pt-4">
      <p className={ETIQUETTE}>Conservation</p>
      <p className="mt-2 text-sm leading-relaxed text-brand-soft">{donnees}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-brand-muted">{archive}</p>
      {alerte ? <p className="mt-2 text-sm font-semibold text-brand-deep-dark">{alerte}</p> : null}
    </div>
  );
}

/** Les vrais ultras que la calibration a retenus, et le banc : on saisit le temps officiel
 *  d'une course, le moteur la rejoue avec ce que l'archive savait la veille. */
function VraisUltras({ athlete }) {
  const [vue, setVue] = useState(null);
  const [tour, setTour] = useState(0);
  const [temps, setTemps] = useState({});
  const [jobId, setJobId] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let vivant = true;
    appeler(`/athletes/${encodeURIComponent(athlete.id)}/ultras`)
      .then((lue) => vivant && setVue(lue))
      .catch((leve) => vivant && setMessage(leve.message));
    return () => {
      vivant = false;
    };
  }, [athlete.id, tour]);
  const job = useJob(jobId, () => {
    setJobId("");
    setTour((t) => t + 1);
  });

  if (athlete.ingestion.statut !== "ingere") return null;
  const ultras = vue?.ultras ?? [];
  const saisies = ultras.filter((u) => (temps[u.date] ?? "").trim());

  const rejouer = async () => {
    setMessage("");
    try {
      const { job_id: nouveau } = await appeler(`/athletes/${encodeURIComponent(athlete.id)}/banc`, {
        methode: "POST",
        corps: { courses: saisies.map((u) => ({ date: u.date, officiel: temps[u.date] })) },
      });
      setJobId(nouveau);
    } catch (leve) {
      setMessage(leve.message);
    }
  };

  return (
    <div>
      <h2 className="font-heading text-[22px] font-bold text-brand-text">Vrais ultras</h2>
      {!ultras.length ? (
        <p className="mt-2 text-sm text-brand-muted">
          Aucun vrai ultra retenu par la calibration : rien à rejouer au banc.
        </p>
      ) : (
        <>
          <div className="mt-2">
            <Tableau
              colonnes={["Date", "Durée", "Distance", "D+", "Temps officiel", "Banc"]}
              cles={ultras.map((u) => u.date)}
              lignes={ultras.map((u) => [
                jourLisible(u.date),
                duree(u.heures),
                nombre(u.distance_km, 0, "km"),
                nombre(u.dplus_m, 0, "m"),
                <ChampCompact
                  key="t"
                  label={`Temps officiel du ${jourLisible(u.date)}`}
                  masquerEtiquette
                  enTableau
                  value={temps[u.date] ?? ""}
                  placeholder="26:30:00"
                  onChange={(evenement) => setTemps({ ...temps, [u.date]: evenement.target.value })}
                />,
                u.rejoue
                  ? `${duree(u.rejoue.central_h)} prévu, ${signe(u.rejoue.err_pct, 1)} %`
                  : "—",
              ])}
            />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Button
              size="sm"
              variant="secondary"
              loading={Boolean(jobId)}
              disabled={Boolean(jobId) || !saisies.length || !vue?.archive_conservee}
              onClick={rejouer}
            >
              Rejouer au banc
            </Button>
            <p className="text-xs leading-relaxed text-brand-muted">
              {jobId
                ? job?.avancement || "En file."
                : vue?.archive_conservee
                  ? "La trace de l'activité du jour sert de parcours ; la coupure est la veille."
                  : "L'archive n'est plus conservée : le banc ne peut plus la relire."}
            </p>
          </div>
        </>
      )}
      {message ? <p className="mt-2 text-xs text-brand-deep-dark">{message}</p> : null}
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

      {athlete.perime ? (
        <div className="mt-6 border-t border-brand-grid pt-4">
          <BadgeEtat ton="derriere">Jumeau périmé</BadgeEtat>
          <p className="mt-2 text-sm leading-relaxed text-brand-soft">
            {athlete.archive_conservee
              ? "Il vient d'un autre moteur que celui qui tourne : ré-ingère-le tant que l'archive est conservée."
              : "Il vient d'un autre moteur que celui qui tourne, et l'archive n'est plus là pour le recalculer."}
          </p>
        </div>
      ) : null}

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

/** Le statut au registre : frais tant que le moteur n'a pas été réglé sur ses données.
 *  Une décision au registre ne compte que les athlètes frais à sa date ; le passage en
 *  développement se journalise avec son motif et ne se défait pas. */
function StatutAuRegistre({ athlete, recharger }) {
  const fiche = athlete.registre ?? { statut: "frais", depuis: null, journal: [] };
  const [motif, setMotif] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [message, setMessage] = useState("");
  const dev = fiche.statut === "dev";

  const marquer = async () => {
    setMessage("");
    try {
      await appeler(`/athletes/${encodeURIComponent(athlete.id)}/statut`, {
        methode: "POST",
        corps: { statut: "dev", motif },
      });
      setOuvert(false);
      setMotif("");
      await recharger();
    } catch (leve) {
      setMessage(leve.message);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-brand-grid pt-5">
      <p className={ETIQUETTE}>Registre</p>
      <p className="text-sm text-brand-text">
        {dev
          ? `Cas de développement depuis le ${jourLisible(fiche.depuis)}.`
          : "Athlète frais : ses courses comptent dans les décisions."}
      </p>
      {fiche.journal?.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs leading-relaxed text-brand-muted">
          {fiche.journal.map((l) => (
            <li key={`${l.le}-${l.statut}`}>
              {jourLisible(l.le)} — {l.statut === "dev" ? "développement" : "frais"} : {l.motif}
            </li>
          ))}
        </ul>
      ) : null}
      {dev ? null : ouvert ? (
        <>
          <ChampCompact
            label="Pourquoi ce passage en développement"
            value={motif}
            placeholder="réglages mis au point sur ses courses"
            onChange={(evenement) => setMotif(evenement.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={!motif.trim()} onClick={marquer}>
              Confirmer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOuvert(false)}>
              Annuler
            </Button>
          </div>
        </>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setOuvert(true)}>
          Marquer comme cas de développement
        </Button>
      )}
      {message ? <p className="text-xs text-brand-deep-dark">{message}</p> : null}
    </div>
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

      <StatutAuRegistre athlete={athlete} recharger={recharger} />

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
              Archive, jumeau et plans. Le registre garde ses entrées, anonymes.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}

/** Les échéances de conservation, les jumeaux périmés et les passes de purge. La purge
 *  reste en simulation tant que le moteur n'est pas réglé pour l'activer. */
function ConservationDuLabo() {
  const [vue, setVue] = useState(null);
  const [tour, setTour] = useState(0);
  const [jobId, setJobId] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let vivant = true;
    appeler("/conservation")
      .then((lue) => vivant && setVue(lue))
      .catch((leve) => vivant && setMessage(leve.message));
    return () => {
      vivant = false;
    };
  }, [tour]);
  const relire = () => setTour((t) => t + 1);
  const job = useJob(jobId, () => {
    setJobId("");
    relire();
  });
  if (!vue) return message ? <p className="text-xs text-brand-deep-dark">{message}</p> : null;

  const perimes = vue.athletes.filter((a) => a.perime && a.archive_conservee);
  const proches = vue.athletes.filter(
    (a) => a.jours_restants !== null && (a.jours_restants < 30 || a.courses_apres_echeance.length),
  );
  const derniere = vue.journal[vue.journal.length - 1];

  const reingerer = async () => {
    setMessage("");
    try {
      const r = await appeler("/athletes/reingerer-un-perime", { methode: "POST" });
      if (r.job_id) setJobId(r.job_id);
      else setMessage("Aucun jumeau périmé dont l'archive est encore conservée.");
    } catch (leve) {
      setMessage(leve.message);
    }
  };
  const purger = async () => {
    setMessage("");
    try {
      setMessage(passeDeLaPurge(await appeler("/conservation/purge", { methode: "POST" })));
      relire();
    } catch (leve) {
      setMessage(leve.message);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-brand-hairline bg-brand-paper px-5 py-4">
      <p className={ETIQUETTE}>
        Conservation · {vue.conservation_jours} jours · purge{" "}
        {vue.mode === "active" ? "active" : "en simulation"}
      </p>
      {proches.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-brand-text">
          {proches.map((a) => (
            <li key={a.id}>
              <Link
                href={lienVers("athletes", { id: a.id })}
                className="font-semibold underline decoration-brand-hairline underline-offset-4 hover:decoration-brand-deep"
              >
                {a.pseudo || a.id}
              </Link>{" "}
              — {conservationDit(a, a.archive_conservee).donnees}
              {a.courses_apres_echeance.length ? " Une course visée tombe après." : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-brand-muted">Aucune échéance dans les trente jours.</p>
      )}
      <p className="text-xs leading-relaxed text-brand-muted">
        {derniere ? `Dernière passe : ${passeDeLaPurge(derniere)}` : "Aucune passe de purge encore."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          loading={Boolean(jobId)}
          disabled={Boolean(jobId) || !perimes.length}
          onClick={reingerer}
        >
          Ré-ingérer le prochain périmé{perimes.length ? ` (${perimes.length})` : ""}
        </Button>
        <Button size="sm" variant="ghost" onClick={purger}>
          Lancer une passe de purge
        </Button>
      </div>
      {jobId ? <p className="text-xs text-brand-muted">{job?.avancement || "En file."}</p> : null}
      {message ? <p className="text-xs text-brand-deep-dark">{message}</p> : null}
    </section>
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
            <ConservationDuLabo />
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
              <Ligne terme="Consentement">
                {[jourLisible(athlete.consentement_le || athlete.consent_at),
                  athlete.consentement_version ? `texte ${athlete.consentement_version}` : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </Ligne>
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
            <Conservation athlete={athlete} />
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
            <VraisUltras athlete={athlete} />
          </section>

          <Actions athlete={athlete} recharger={recharger} />
        </div>
      )}
    </Coquille>
  );
}
