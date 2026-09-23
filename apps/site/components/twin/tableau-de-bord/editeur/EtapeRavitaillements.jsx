// components/twin/tableau-de-bord/editeur/EtapeRavitaillements.jsx
//
// ÉTAPE 2 — LES RAVITAILLEMENTS : un clic sur le profil en pose un, un glisser le
// déplace, et l'inspecteur règle celui qui est choisi — son nom, son kilomètre, base
// majeure, assistance autorisée, arrêt par défaut.
//
// Une phase commence toujours sur un ravitaillement : déplacer celui-ci emmène la phase,
// le supprimer la supprime aussi — et « Annuler » remet les deux.

"use client";

import { useState } from "react";
import { Button } from "@locomotionlab/ui";

import { nombre } from "@/lib/twinTableauDeBord.mjs";
import {
  deplacer,
  estUneExtremite,
  importerLesWaypoints,
  poser,
  remettre,
  resume,
  retirer,
} from "@/lib/twinCourse.mjs";
import ProfilAltimetrique from "@/components/twin/ProfilAltimetrique";

import { Bloc, Case, ChampCourt, Inspecteur, Titre } from "./commun";

function Rail({ course, trace, modifier }) {
  const waypoints = trace?.waypoints ?? [];
  return (
    <div className="mt-5 flex flex-col gap-6">
      <Bloc titre="Poser">
        <p className="text-sm leading-relaxed text-brand-soft">
          Un clic sur le profil pose un ravitaillement au kilomètre visé. Un glisser le
          déplace ; le kilomètre se recalcule.
        </p>
        <Button
          variant="secondary"
          size="sm"
          disabled={!waypoints.length}
          onClick={() =>
            modifier((c) => ({
              ravitaillements: importerLesWaypoints(
                c.ravitaillements ?? [],
                waypoints,
                c.geometrie?.distance_km,
              ),
            }))
          }
        >
          Importer les waypoints du GPX
        </Button>
        <p className="text-xs text-brand-muted">
          {waypoints.length
            ? `${waypoints.length} waypoint(s) dans la trace. Un point déjà posé n'est pas doublé.`
            : course.gpx?.nom
              ? "La trace ne porte pas de waypoint."
              : "Pose d'abord la trace."}
        </p>
      </Bloc>
      <Bloc titre="Légende">
        <p className="flex items-center gap-2 text-sm text-brand-soft">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-brand-accent-ink bg-brand-paper" />
          assistance autorisée
        </p>
        <p className="flex items-center gap-2 text-sm text-brand-soft">
          <span className="w-2.5 text-center text-xxs font-bold text-brand-deep">B</span>
          base majeure
        </p>
      </Bloc>
    </div>
  );
}

/** Les phases qui commençaient à `ancien` commencent désormais à `nouveau`. */
function suivreLesPhases(phases, ancien, nouveau) {
  return (phases ?? []).map((p) => (p.du_km === ancien ? { ...p, du_km: nouveau } : p));
}

export default function EtapeRavitaillements({ course, trace, modifier, annoncer }) {
  const [choix, setChoix] = useState(1);
  const ravitaillements = course.ravitaillements ?? [];
  const index = Math.min(choix, Math.max(0, ravitaillements.length - 1));
  const choisi = ravitaillements[index];
  const segment = (trace?.segments ?? []).find((s) => s.index === index);
  const { poses, assistance, bases } = resume(ravitaillements);

  const changer = (patch) =>
    modifier((c) => ({
      ravitaillements: c.ravitaillements.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));

  // Les gestes partent de la course affichée : chacun suit un clic, sur l'état que
  // l'écran montre à ce moment-là.
  const deplacerA = (i, km) => {
    const ancien = ravitaillements[i].km;
    const { liste, index: nouvel } = deplacer(ravitaillements, i, km);
    modifier({ ravitaillements: liste, phases: suivreLesPhases(course.phases, ancien, liste[nouvel].km) });
    setChoix(nouvel);
  };

  const poserA = (km) => {
    const { liste, index: i } = poser(ravitaillements, km);
    modifier({ ravitaillements: liste });
    setChoix(i);
  };

  const supprimer = () => {
    if (!choisi || estUneExtremite(ravitaillements, index)) return;
    const { liste, retire } = retirer(ravitaillements, index);
    const phasesRetirees = (course.phases ?? []).filter((p) => p.du_km === retire.km);
    modifier({
      ravitaillements: liste,
      phases: (course.phases ?? []).filter((p) => p.du_km !== retire.km),
    });
    setChoix(Math.max(1, index - 1));
    // « Annuler » peut venir après d'autres changements : il repart de la course du
    // moment, pas de celle d'avant la suppression.
    annoncer(
      `« ${retire.nom} » supprimé${phasesRetirees.length ? ", avec la phase qui y commençait" : ""}.`,
      () =>
        modifier((c) => ({
          ravitaillements: remettre(c.ravitaillements, retire).liste,
          phases: [...(c.phases ?? []), ...phasesRetirees],
        })),
    );
  };

  const dupliquer = () => {
    if (!choisi || index === ravitaillements.length - 1) return;
    const suivant = ravitaillements[index + 1];
    const { liste, index: i } = poser(ravitaillements, (choisi.km + suivant.km) / 2, `${choisi.nom} (copie)`);
    modifier({
      ravitaillements: liste.map((r, j) =>
        j === i ? { ...r, base_majeure: choisi.base_majeure, assistance: choisi.assistance, arret_min: choisi.arret_min } : r,
      ),
    });
    setChoix(i);
  };

  return (
    <>
      <section className="flex flex-col gap-5 px-8 py-7">
        <Titre
          sousTitre={`${poses} posés · ${assistance} ouverts à l'assistance · ${bases} base${bases > 1 ? "s" : ""} majeure${bases > 1 ? "s" : ""}`}
        >
          Ravitaillements
        </Titre>

        {trace?.profil?.length ? (
          <ProfilAltimetrique
            profil={trace.profil}
            hauteur={220}
            marqueurs={ravitaillements.map((r, i) => ({
              cle: i,
              km: r.km,
              libelle: `${i} · ${r.nom}`,
              actif: i === index,
              assistance: r.assistance,
              base: r.base_majeure,
            }))}
            surChoix={setChoix}
            surDeplacement={deplacerA}
            surClic={poserA}
            libelle="Profil : un clic pose un ravitaillement, un glisser le déplace"
          />
        ) : (
          <p className="text-sm text-brand-muted">Pose d&rsquo;abord la trace : les ravitaillements se placent sur son profil.</p>
        )}

        <div className="overflow-x-auto rounded-lg border border-brand-hairline bg-brand-paper">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-etiquette text-brand-muted">
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Ravitaillement</th>
                <th className="px-3 py-2 text-right font-semibold">km</th>
                <th className="px-3 py-2 font-semibold">Base majeure</th>
                <th className="px-3 py-2 font-semibold">Assistance</th>
                <th className="px-3 py-2 text-right font-semibold">Arrêt</th>
              </tr>
            </thead>
            <tbody>
              {ravitaillements.map((r, i) => (
                <tr
                  key={`${i}-${r.nom}`}
                  onClick={() => setChoix(i)}
                  className={`cursor-pointer border-t border-brand-grid border-l-4 ${
                    r.assistance ? "border-l-brand-accent" : "border-l-transparent"
                  } ${i === index ? "bg-brand-mist" : "hover:bg-brand-grid"}`}
                >
                  <td className="px-3 py-1.5 text-brand-muted">{i}</td>
                  <td className="px-3 py-1.5 text-brand-text">{r.nom}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{nombre(r.km, 1)}</td>
                  <td className="px-3 py-1.5 font-bold text-brand-deep">{r.base_majeure ? "B" : ""}</td>
                  <td className="px-3 py-1.5 text-brand-accent-ink">{r.assistance ? "oui" : ""}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-brand-soft">
                    {r.arret_min !== null && r.arret_min !== undefined ? `${nombre(r.arret_min)} min` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Inspecteur titre="Ravitaillement choisi">
        {choisi ? (
          <>
            <div>
              <p className="font-heading text-[20px] font-light text-brand-text">
                {index} · {choisi.nom}
              </p>
              <p className="mt-1 text-xs text-brand-muted">
                km {nombre(choisi.km, 1)}
                {segment
                  ? ` · segment de ${nombre(segment.au_km - segment.du_km, 1)} km · ${nombre(segment.dplus_m)} m D+ · ${nombre(segment.dminus_m)} m D−`
                  : index === 0
                    ? " · le départ"
                    : ""}
              </p>
            </div>
            <ChampCourt label="Nom" type="text" value={choisi.nom} onChange={(v) => changer({ nom: v })} />
            <ChampCourt
              label="Kilomètre"
              unite="km"
              step="0.1"
              value={choisi.km}
              disabled={index === 0}
              onChange={(v) => v !== "" && deplacerA(index, Number(v))}
              aide="Changer le kilomètre déplace le marqueur ; glisser le marqueur change le kilomètre."
            />
            <Case label="Base majeure" checked={choisi.base_majeure} onChange={(v) => changer({ base_majeure: v })} />
            <Case label="Assistance autorisée" checked={choisi.assistance} onChange={(v) => changer({ assistance: v })} />
            <ChampCourt
              label="Arrêt par défaut"
              unite="min"
              value={choisi.arret_min ?? ""}
              onChange={(v) => changer({ arret_min: v === "" ? null : Number(v) })}
              aide="L'arrêt par défaut est celui du plan tant que l'athlète ne l'amende pas. Vide : la politique du moteur (5 min, 15 aux bases majeures)."
            />
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={dupliquer} disabled={index === ravitaillements.length - 1}>
                Dupliquer
              </Button>
              <Button variant="ghost" size="sm" onClick={supprimer} disabled={estUneExtremite(ravitaillements, index)}>
                Supprimer
              </Button>
            </div>
            {estUneExtremite(ravitaillements, index) ? (
              <p className="text-xs text-brand-muted">Le départ et l&rsquo;arrivée tiennent le parcours : ils se renomment, ils ne se suppriment pas.</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-brand-muted">Aucun ravitaillement. Un clic sur le profil pose le premier.</p>
        )}
      </Inspecteur>
    </>
  );
}

EtapeRavitaillements.Rail = Rail;
