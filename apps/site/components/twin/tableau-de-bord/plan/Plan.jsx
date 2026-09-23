// components/twin/tableau-de-bord/plan/Plan.jsx
//
// L'ÉCRAN PLAN : composer, voir, publier (récapitulatif §5.4).
//
// À gauche le choix, au centre les cinq chiffres et le PDF, à droite publier, envoyer et
// les versions. Deux entrées : `?ref=` ouvre un plan qui existe ; `?athlete=` en compose
// un nouveau — la première génération le crée.

"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { statutDuPlan } from "@/lib/twinTableauDeBord.mjs";
import { BadgeEtat } from "@locomotionlab/ui/contenu";

import { ErreurAPI, appeler } from "../api";
import Coquille, { lienVers } from "../Coquille";
import useJob from "../useJob";
import Apercu from "./Apercu";
import LeChoix, { reglagesDeLEcran, reglagesPourLeMoteur } from "./LeChoix";
import PublierEnvoyer from "./PublierEnvoyer";

function FilDAriane({ athlete, course, plan }) {
  const { mot, ton } = statutDuPlan(plan?.statut);
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-brand-hairline bg-brand-paper px-8 py-3 text-sm text-brand-muted">
      <Link href={lienVers("athletes")} className="hover:text-brand-text">
        Athlètes
      </Link>
      ›
      {athlete ? (
        <Link href={lienVers("athletes", { id: athlete.id })} className="hover:text-brand-text">
          {athlete.pseudo || athlete.prenom || "athlète"}
        </Link>
      ) : null}
      › <span className="font-semibold text-brand-text">Plan{course?.nom ? ` · ${course.nom}` : ""}</span>
      {plan?.ref ? (
        <>
          <span className="font-mono text-xs">{plan.ref}</span>
          {plan.version ? <span>version {plan.version}</span> : null}
          <BadgeEtat ton={ton}>{mot}</BadgeEtat>
        </>
      ) : null}
    </div>
  );
}

/** Un plan qui existe. */
function EcranPlan({ vue, recharger }) {
  const { plan, athlete, course } = vue;
  const [ecran, setEcran] = useState(() => reglagesDeLEcran(plan.reglages, vue.fenetre_defaut_pct));
  const [jobId, setJobId] = useState(vue.jobs?.[0]?.id || "");
  const [erreur, setErreur] = useState("");
  const [lancement, setLancement] = useState(false);

  const quandFini = useCallback(
    (job) => {
      setJobId("");
      if (job.statut === "echec") setErreur(job.erreur || "Échec, sans détail.");
      void recharger();
    },
    [recharger],
  );
  const job = useJob(jobId, quandFini);

  const lancer = async () => {
    setErreur("");
    setLancement(true);
    try {
      const { job_id: nouveau } = await appeler(`/plans/${encodeURIComponent(plan.ref)}/generate`, {
        methode: "POST",
        corps: { reglages: reglagesPourLeMoteur(ecran) },
      });
      setJobId(nouveau);
    } catch (leve) {
      // Une génération déjà en file : on la suit plutôt que d'en poser une seconde.
      if (leve instanceof ErreurAPI && leve.statut === 409 && leve.jobId) setJobId(leve.jobId);
      else setErreur(leve.message);
    } finally {
      setLancement(false);
    }
  };

  return (
    <div className="-mx-8 -my-7 flex min-h-0 flex-1 flex-col">
      <FilDAriane athlete={athlete} course={course} plan={plan} />
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[300px_1fr_340px]">
        <LeChoix
          athlete={athlete}
          course={course}
          courseId={plan.course_id}
          ecran={ecran}
          changer={(patch) => setEcran((e) => ({ ...e, ...patch }))}
          politique={vue.politique_standard}
          mesure={vue.arrets_mesures}
          surLancer={lancer}
          lancement={lancement || Boolean(jobId)}
          fige={vue.fige}
        />
        <Apercu
          plan={plan}
          version={vue.version}
          documents={vue.documents}
          job={job ?? (jobId ? { statut: "en_file" } : null)}
          erreur={erreur}
          publiee={plan.version_publiee}
        />
        <PublierEnvoyer vue={vue} recharger={recharger} surJob={setJobId} />
      </div>
    </div>
  );
}

/** Un plan à composer : l'athlète est choisi, la course reste à choisir. */
function Composer({ athlete }) {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [ecran, setEcran] = useState(() => reglagesDeLEcran(null));
  const [erreur, setErreur] = useState("");
  const [lancement, setLancement] = useState(false);

  useEffect(() => {
    appeler("/courses")
      .then((vu) => setCourses(vu.courses))
      .catch((leve) => setErreur(leve.message));
  }, []);

  const course = courses.find((c) => c.id === courseId) ?? null;

  const lancer = async () => {
    setErreur("");
    setLancement(true);
    try {
      const { ref } = await appeler("/plans", {
        methode: "POST",
        corps: { athlete_id: athlete.id, course_id: courseId, reglages: reglagesPourLeMoteur(ecran) },
      });
      window.location.assign(lienVers("plan", { ref }));
    } catch (leve) {
      // Le même athlète sur la même course, c'est le même plan : on l'ouvre.
      if (leve instanceof ErreurAPI && leve.statut === 409 && leve.ref) {
        window.location.assign(lienVers("plan", { ref: leve.ref }));
        return;
      }
      setErreur(leve.message);
      setLancement(false);
    }
  };

  return (
    <div className="-mx-8 -my-7 flex min-h-0 flex-1 flex-col">
      <FilDAriane athlete={athlete} course={course} plan={null} />
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[300px_1fr_340px]">
        <LeChoix
          athlete={athlete}
          courses={courses}
          courseId={courseId}
          surCourse={setCourseId}
          course={course}
          ecran={ecran}
          changer={(patch) => setEcran((e) => ({ ...e, ...patch }))}
          surLancer={lancer}
          lancement={lancement}
        />
        <Apercu plan={null} erreur={erreur} />
        <aside className="border-l border-brand-hairline bg-brand-paper px-6 py-7 text-sm text-brand-muted">
          Publier et envoyer viennent après la première version.
        </aside>
      </div>
    </div>
  );
}

function DepuisLaQuery() {
  const query = useSearchParams();
  const ref = query.get("ref") || "";
  const athleteId = query.get("athlete") || "";
  if (ref) {
    return (
      <Coquille actif="Athlètes" chemin={`/plans/${encodeURIComponent(ref)}`}>
        {(vue, recharger) => <EcranPlan key={vue.plan.ref} vue={vue} recharger={recharger} />}
      </Coquille>
    );
  }
  if (athleteId) {
    return (
      <Coquille actif="Athlètes" chemin={`/athletes/${encodeURIComponent(athleteId)}`}>
        {(athlete) => <Composer athlete={athlete} />}
      </Coquille>
    );
  }
  return (
    <Coquille actif="Athlètes" chemin="/file">
      {() => <p className="text-sm text-brand-muted">Un plan s&rsquo;ouvre depuis la fiche de son athlète.</p>}
    </Coquille>
  );
}

export default function Plan() {
  return (
    <Suspense fallback={null}>
      <DepuisLaQuery />
    </Suspense>
  );
}
