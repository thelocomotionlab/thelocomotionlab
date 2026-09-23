// components/twin/tableau-de-bord/editeur/EtapeTrace.jsx
//
// ÉTAPE 1 — LA TRACE : le GPX du parcours, le profil qu'il donne, et ses chiffres.
//
// Distance, D+ et D− sont CALCULÉS par le moteur depuis la trace ; l'écran ne fait que
// les montrer.

"use client";

import { useState } from "react";

import { nombre, tailleLisible } from "@/lib/twinTableauDeBord.mjs";
import { composerLeDepart, decomposerLeDepart } from "@/lib/twinCourse.mjs";
import ProfilAltimetrique from "@/components/twin/ProfilAltimetrique";

import { appeler } from "../api";
import { Bloc, ChampCourt, Chiffre, Inspecteur, Titre } from "./commun";

function Rail({ course, modifier, surTrace }) {
  const [lecture, setLecture] = useState(false);
  const [erreur, setErreur] = useState("");
  const [poids, setPoids] = useState(0);
  const depart = decomposerLeDepart(course.depart_le);

  const deposer = async (fichier) => {
    if (!fichier) return;
    setErreur("");
    setLecture(true);
    setPoids(fichier.size);
    try {
      const formulaire = new FormData();
      formulaire.append("gpx", fichier, fichier.name);
      const vu = await appeler(`/courses/${encodeURIComponent(course.id)}/gpx`, {
        methode: "POST",
        fichiers: formulaire,
      });
      await surTrace(vu);
    } catch (leve) {
      setErreur(leve.message);
    } finally {
      setLecture(false);
    }
  };

  return (
    <div className="mt-5 flex flex-col gap-6">
      <Bloc titre="Course">
        <ChampCourt label="Nom" type="text" value={course.nom} onChange={(v) => modifier({ nom: v })} />
        <ChampCourt
          label="Édition"
          value={course.edition ?? ""}
          onChange={(v) => modifier({ edition: v === "" ? null : Number(v) })}
        />
        <ChampCourt
          label="Date de départ"
          type="date"
          value={depart.date}
          onChange={(v) => modifier({ depart_le: composerLeDepart({ ...depart, date: v }) })}
          aide="Demandés à la création ; la trace vient ensuite. L'heure et le fuseau se règlent à l'étape Horloge."
        />
      </Bloc>

      <Bloc titre="Fichier">
        <label
          className="flex cursor-pointer flex-col gap-1 rounded-lg border border-dashed border-brand-hairline px-4 py-5 text-sm hover:border-brand-slate"
          onDragOver={(evenement) => evenement.preventDefault()}
          onDrop={(evenement) => {
            evenement.preventDefault();
            void deposer(evenement.dataTransfer.files?.[0]);
          }}
        >
          <input
            type="file"
            accept=".gpx,application/gpx+xml,application/xml,text/xml"
            className="sr-only"
            onChange={(evenement) => void deposer(evenement.target.files?.[0])}
          />
          {lecture ? (
            <span className="text-brand-soft">Lecture de la trace…</span>
          ) : course.gpx?.nom ? (
            <>
              <span className="font-semibold text-brand-text">{course.gpx.nom}</span>
              <span className="text-xs text-brand-muted">
                {nombre(course.gpx.points)} points
                {course.gpx.avec_altitude ? " avec altitude" : " sans altitude"}
                {poids ? ` · ${tailleLisible(poids)}` : ""}
              </span>
              <span className="text-xs text-brand-accent-ink">Remplacer</span>
            </>
          ) : (
            <>
              <span className="text-brand-text">Dépose le GPX du parcours ici.</span>
              <span className="text-xs text-brand-muted">Altitude requise.</span>
            </>
          )}
        </label>
        {course.gpx?.nom && !course.gpx.avec_altitude ? (
          <p className="text-xs leading-relaxed text-brand-deep-dark">
            GPX sans altitude. Le profil et le D+ ne peuvent pas être calculés. Remplace le
            fichier par une trace qui porte l&rsquo;altitude.
          </p>
        ) : null}
        {erreur ? <p className="text-xs leading-relaxed text-brand-deep-dark">{erreur}</p> : null}
      </Bloc>
    </div>
  );
}

export default function EtapeTrace({ course, trace }) {
  const g = course.geometrie ?? {};
  const profil = trace?.profil ?? [];

  return (
    <>
      <section className="flex flex-col gap-6 px-8 py-7">
        <Titre sousTitre="Le profil et les chiffres calculés depuis le GPX.">
          Trace
        </Titre>

        {profil.length ? (
          <ProfilAltimetrique
            profil={profil}
            hauteur={240}
            marqueurs={(course.ravitaillements ?? []).map((r) => ({
              cle: r.index,
              km: r.km,
              libelle: r.nom,
              assistance: r.assistance,
              base: r.base_majeure,
            }))}
          />
        ) : (
          <p className="rounded-lg border border-brand-hairline bg-brand-paper px-6 py-16 text-center text-sm leading-relaxed text-brand-soft">
            {course.gpx?.nom && !course.gpx.avec_altitude ? (
              <>
                Aucun profil : la trace ne porte pas d&rsquo;altitude.
                <br />
                Distance lisible, D+ impossible. Remplace le GPX.
              </>
            ) : (
              <>
                Pas encore de trace.
                <br />
                Dépose le GPX à gauche : le profil, la distance et le D+ se calculent ici.
              </>
            )}
          </p>
        )}

        <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-3">
          <Chiffre titre="Distance" valeur={g.distance_km ? nombre(g.distance_km, 1, "km") : "—"} />
          <Chiffre titre="D+" valeur={g.dplus_m ? nombre(g.dplus_m, 0, "m") : "—"} />
          <Chiffre titre="D−" valeur={g.dminus_m ? nombre(g.dminus_m, 0, "m") : "—"} />
        </div>
      </section>

      <Inspecteur titre="Lecture de la trace">
        <div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-brand-muted">Altitude max.</dt>
            <dd className="m-0 text-right">{g.alt_max !== null && g.alt_max !== undefined ? nombre(g.alt_max, 0, "m") : "—"}</dd>
            <dt className="text-brand-muted">Altitude min.</dt>
            <dd className="m-0 text-right">{g.alt_min !== null && g.alt_min !== undefined ? nombre(g.alt_min, 0, "m") : "—"}</dd>
            <dt className="text-brand-muted">Départ</dt>
            <dd className="m-0 text-right">{profil.length ? nombre(profil[0][1], 0, "m") : "—"}</dd>
            <dt className="text-brand-muted">Arrivée</dt>
            <dd className="m-0 text-right">{profil.length ? nombre(profil[profil.length - 1][1], 0, "m") : "—"}</dd>
          </dl>
        </div>
      </Inspecteur>
    </>
  );
}

EtapeTrace.Rail = Rail;
