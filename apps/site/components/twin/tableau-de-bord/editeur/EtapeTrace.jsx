// components/twin/tableau-de-bord/editeur/EtapeTrace.jsx
//
// ÉTAPE 1 — LA TRACE : le GPX du parcours, le profil qu'il donne, et ses chiffres face
// aux chiffres officiels.
//
// Distance et D+ sont CALCULÉS par le moteur depuis la trace ; les chiffres officiels
// sont SAISIS, jamais devinés. L'écart ne se calcule que sur ce qui est renseigné, et se
// signale au-delà du seuil — le rapport imprime alors le D+ du carnet de route à côté.

"use client";

import { useState } from "react";

import { ecartEnPourcent, nombre, signe, tailleLisible } from "@/lib/twinTableauDeBord.mjs";
import { composerLeDepart, decomposerLeDepart } from "@/lib/twinCourse.mjs";
import ProfilAltimetrique from "@/components/twin/ProfilAltimetrique";

import { appeler } from "../api";
import { Bloc, ChampCourt, Chiffre, Inspecteur, Titre } from "./commun";

const nombreOuVide = (texte) => (texte === "" ? null : Number(String(texte).replace(",", ".")));

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

function Ecart({ calcule, officiel, seuil, unite, decimales }) {
  const pct = ecartEnPourcent(calcule, officiel);
  if (pct === null) {
    return <Chiffre titre="Écart" valeur="—" legende={officiel ? "" : "rien d'officiel à comparer"} />;
  }
  const signale = Math.abs(pct) > (seuil ?? 5);
  return (
    <Chiffre
      titre={signale ? "Écart signalé" : "Écart"}
      valeur={`${signe(pct)} %`}
      ton={signale ? "alerte" : ""}
      legende={`${signe(calcule - officiel, decimales)} ${unite} · ${
        signale ? `au-delà du seuil de ${nombre(seuil, 0)} %` : `sous le seuil de ${nombre(seuil, 0)} %`
      }`}
    />
  );
}

export default function EtapeTrace({ course, trace, modifier }) {
  const g = course.geometrie ?? {};
  const o = course.officiel ?? {};
  const profil = trace?.profil ?? [];
  const officiel = (champ, v) => modifier((c) => ({ officiel: { ...c.officiel, [champ]: nombreOuVide(v) } }));

  return (
    <>
      <section className="flex flex-col gap-6 px-8 py-7">
        <Titre sousTitre="Le profil calculé depuis le GPX, et ses chiffres face aux chiffres officiels.">
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
          <Chiffre titre="Distance calculée" valeur={g.distance_km ? nombre(g.distance_km, 1, "km") : "—"} />
          <Chiffre
            titre="Officielle"
            valeur={o.distance_km ? nombre(o.distance_km, 1, "km") : "—"}
            legende={o.distance_km ? "" : "aucune distance officielle"}
          />
          <Ecart calcule={g.distance_km} officiel={o.distance_km} seuil={course.seuil_ecart_pct} unite="km" decimales={1} />
          <Chiffre titre="D+ calculé" valeur={g.dplus_m ? nombre(g.dplus_m, 0, "m") : "—"} />
          <Chiffre titre="Officiel" valeur={o.dplus_m ? nombre(o.dplus_m, 0, "m") : "—"} />
          <Ecart calcule={g.dplus_m} officiel={o.dplus_m} seuil={course.seuil_ecart_pct} unite="m" decimales={0} />
        </div>
      </section>

      <Inspecteur titre="Chiffres officiels">
        <ChampCourt label="Distance" unite="km" step="0.1" value={o.distance_km ?? ""} onChange={(v) => officiel("distance_km", v)} />
        <ChampCourt label="D+" unite="m" value={o.dplus_m ?? ""} onChange={(v) => officiel("dplus_m", v)} />
        <ChampCourt label="D−" unite="m" value={o.dminus_m ?? ""} onChange={(v) => officiel("dminus_m", v)} />
        <ChampCourt
          label="Seuil d'écart"
          unite="%"
          step="0.5"
          value={course.seuil_ecart_pct ?? 5}
          onChange={(v) => modifier({ seuil_ecart_pct: v === "" ? 5 : Number(v) })}
          aide="Au-delà du seuil, l'écart est signalé ici et dans le rapport, qui imprime le D+ du carnet de route à côté du calculé."
        />

        <div className="mt-2 border-t border-brand-grid pt-4">
          <p className="text-xs font-semibold uppercase tracking-etiquette text-brand-muted">Lecture de la trace</p>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-brand-muted">D− calculé</dt>
            <dd className="m-0 text-right">{g.dminus_m ? nombre(g.dminus_m, 0, "m") : "—"}</dd>
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
