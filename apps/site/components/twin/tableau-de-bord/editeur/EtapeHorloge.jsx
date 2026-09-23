// components/twin/tableau-de-bord/editeur/EtapeHorloge.jsx
//
// ÉTAPE 3 — L'HORLOGE ET LE TERRAIN : ce qui fixe l'heure, la nuit et le terrain.
//
// Le coucher et le lever se CALCULENT depuis la position du départ (tirée du GPX) et la
// date ; la technicité et la chaleur se DÉCLARENT, et vides elles le restent — le moteur
// n'invente rien. Les phases se posent en glissant sur le profil : elles s'aimantent au
// ravitaillement le plus proche, parce que le rapport découpe par segments.

"use client";

import { useState } from "react";
import { Button, Choix, Segments } from "@locomotionlab/ui";

import { departLisible, nombre } from "@/lib/twinTableauDeBord.mjs";
import {
  FUSEAUX,
  bornerLesPhases,
  composerLeDepart,
  decomposerLeDepart,
  poserUnePhase,
} from "@/lib/twinCourse.mjs";
import ProfilAltimetrique from "@/components/twin/ProfilAltimetrique";

import { Bloc, ChampCourt, Inspecteur, Titre } from "./commun";

function Rail() {
  return (
    <div className="mt-5 flex flex-col gap-6">
      <Bloc titre="Poser une phase">
        <p className="text-sm leading-relaxed text-brand-soft">
          Glisse sur le profil pour poser une bande : elle commence au ravitaillement le
          plus proche et court jusqu&rsquo;à la phase suivante. Une phase porte un nom et
          un mot pour l&rsquo;athlète : le rapport s&rsquo;en sert pour situer les consignes.
        </p>
      </Bloc>
      <p className="text-xs leading-relaxed text-brand-muted">
        « Enregistrer » publie la course dans la bibliothèque ; les plans existants gardent
        leur version.
      </p>
    </div>
  );
}

const pourcent = (v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(",", ".")));

export default function EtapeHorloge({ course, trace, modifier, annoncer }) {
  const [choisie, setChoisie] = useState(0);
  const depart = decomposerLeDepart(course.depart_le);
  const kms = (course.ravitaillements ?? []).map((r) => r.km);
  const phases = bornerLesPhases(course.phases ?? [], kms);
  const phase = phases[Math.min(choisie, phases.length - 1)];
  const nomDuRavito = (km) => (course.ravitaillements ?? []).find((r) => r.km === km)?.nom ?? "";

  const changerDepart = (patch) => modifier({ depart_le: composerLeDepart({ ...depart, ...patch }) });
  const changerLesPhases = (liste) => modifier({ phases: bornerLesPhases(liste, kms) });
  const changerLaPhase = (patch) =>
    changerLesPhases(phases.map((p, i) => (i === choisie ? { ...p, ...patch } : p)));

  const supprimer = () => {
    if (!phase) return;
    const retiree = phase;
    changerLesPhases(phases.filter((_, i) => i !== choisie));
    setChoisie(0);
    annoncer(`Phase « ${retiree.nom} » supprimée.`, () =>
      modifier((c) => ({ phases: bornerLesPhases([...(c.phases ?? []), retiree], kms) })),
    );
  };

  const technicite = course.technicite_pct || null;

  return (
    <>
      <section className="flex flex-col gap-8 px-8 py-7">
        <Titre sousTitre="Ce qui fixe l'heure, la nuit et le terrain. Les champs vides le restent : le moteur n'invente rien.">
          Horloge et terrain
        </Titre>

        <Bloc titre="Horloge">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="text-sm">
              <p className="text-brand-soft">Départ</p>
              <p className="mt-1 text-brand-text">{depart.date ? departLisible(course.depart_le) : "—"}</p>
              <p className="text-xs text-brand-muted">la date se règle à l&rsquo;étape Trace</p>
            </div>
            <ChampCourt
              label="Heure de départ"
              type="time"
              value={depart.heure}
              disabled={!depart.date}
              onChange={(v) => changerDepart({ heure: v })}
            />
            <Choix
              label="Fuseau"
              valeur={depart.fuseau}
              disabled={!depart.date}
              surChange={(fuseau) => changerDepart({ fuseau })}
              options={FUSEAUX.map((f) => ({ valeur: f, libelle: `UTC${f.replace("+00:00", "")}` }))}
            />
          </div>
          <dl className="grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-brand-muted">Latitude · longitude</dt>
            <dd className="m-0 text-brand-text">
              {course.lat !== null && course.lat !== undefined
                ? `${nombre(course.lat, 3)} · ${nombre(course.lon, 3)}`
                : "—"}
            </dd>
            <dd className="m-0 text-xs text-brand-muted">tirés du GPX</dd>
            <dt className="text-brand-muted">Coucher du soleil</dt>
            <dd className="m-0 text-brand-text">{course.soleil?.coucher ? course.soleil.coucher.replace(":", "h") : "—"}</dd>
            <dd className="m-0 text-xs text-brand-muted">calculé</dd>
            <dt className="text-brand-muted">Lever du soleil</dt>
            <dd className="m-0 text-brand-text">{course.soleil?.lever ? course.soleil.lever.replace(":", "h") : "—"}</dd>
            <dd className="m-0 text-xs text-brand-muted">calculé, le lendemain</dd>
          </dl>
        </Bloc>

        <Bloc titre="Terrain">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ChampCourt
              label="Technicité"
              unite="%"
              step="1"
              value={technicite ?? ""}
              onChange={(v) => modifier({ technicite_pct: pourcent(v) ?? 0 })}
              aide={
                technicite
                  ? `+${nombre(technicite)} % de temps sur tous les segments.`
                  : "Aucune technicité déclarée : le rapport écrit l'hypothèse d'un sol comparable aux courses de référence."
              }
            />
            <ChampCourt
              label="Chaleur attendue"
              unite="°C"
              step="1"
              value={course.chaleur_c ?? ""}
              onChange={(v) => modifier({ chaleur_c: pourcent(v) })}
              aide={
                course.chaleur_c !== null && course.chaleur_c !== undefined
                  ? "Température moyenne attendue, déclarée : le moteur la lit en degrés."
                  : "Vide : aucun coût de chaleur. Le moteur ne devine pas la météo."
              }
            />
          </div>
        </Bloc>

        <Bloc titre="Phases">
          {trace?.profil?.length && kms.length > 1 ? (
            <ProfilAltimetrique
              profil={trace.profil}
              hauteur={180}
              bandes={phases.map((p, i) => ({
                cle: `${p.du_km}`,
                du_km: p.du_km,
                au_km: p.au_km,
                ton: "phase",
                actif: i === choisie,
                libelle: p.nom,
              }))}
              marqueurs={(course.ravitaillements ?? []).map((r, i) => ({
                cle: i,
                km: r.km,
                libelle: r.nom,
                assistance: r.assistance,
                base: r.base_majeure,
              }))}
              surChoix={(i) => {
                const km = kms[i];
                const trouvee = phases.findIndex((p) => p.du_km <= km && km < p.au_km);
                if (trouvee >= 0) setChoisie(trouvee);
              }}
              surGlisser={(du) => {
                const nouvelles = poserUnePhase(phases, du, kms);
                if (nouvelles) {
                  changerLesPhases(nouvelles);
                  setChoisie(nouvelles.findIndex((p) => !phases.some((q) => q.du_km === p.du_km)));
                }
              }}
              libelle="Profil : glisse pour poser une phase"
            />
          ) : (
            <p className="text-sm text-brand-muted">Pose la trace et ses ravitaillements : les phases se posent sur eux.</p>
          )}
          {phases.length ? (
            <Segments
              separes
              etiquette="Phase choisie"
              valeur={String(choisie)}
              surChange={(v) => setChoisie(Number(v))}
              options={phases.map((p, i) => ({
                valeur: String(i),
                libelle: `${p.nom} · km ${nombre(p.du_km, 1)} → ${nombre(p.au_km, 1)}`,
              }))}
            />
          ) : (
            <p className="text-sm text-brand-muted">
              Aucune phase posée. Sans elles, le rapport coupe la course en deux, à la moitié du temps prévu.
            </p>
          )}
        </Bloc>
      </section>

      <Inspecteur titre="Phase choisie">
        {phase ? (
          <>
            <ChampCourt label="Nom" type="text" value={phase.nom} onChange={(v) => changerLaPhase({ nom: v })} />
            <Choix
              label="Du km"
              valeur={String(phase.du_km)}
              surChange={(v) => {
                const km = Number(v);
                if (!phases.some((p, i) => i !== choisie && p.du_km === km)) changerLaPhase({ du_km: km });
              }}
              options={kms.slice(0, -1).map((km) => ({
                valeur: String(km),
                libelle: `${nombre(km, 1)} · ${nomDuRavito(km)}`,
                desactivee: phases.some((p, i) => i !== choisie && p.du_km === km),
              }))}
              aide="Une phase commence sur un ravitaillement : le rapport découpe par segments."
            />
            <div className="text-sm">
              <p className="text-brand-soft">Au km</p>
              <p className="mt-1 text-brand-text">
                {nombre(phase.au_km, 1)} · {nomDuRavito(phase.au_km)}
              </p>
              <p className="text-xs text-brand-muted">jusqu&rsquo;à la phase suivante, ou à l&rsquo;arrivée</p>
            </div>
            <ChampCourt
              label="Le mot pour l'athlète"
              type="text"
              value={phase.note ?? ""}
              onChange={(v) => changerLaPhase({ note: v })}
              placeholder="ça va te paraître trop facile, c'est voulu"
            />
            <Button variant="ghost" size="sm" onClick={supprimer}>
              Supprimer la phase
            </Button>
          </>
        ) : (
          <p className="text-sm text-brand-muted">Aucune. Pose une phase sur le profil : son nom et ses bornes se règlent ici.</p>
        )}

        <div className="mt-2 border-t border-brand-grid pt-4">
          <p className="text-xs font-semibold uppercase tracking-etiquette text-brand-muted">Calculé depuis la course</p>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-brand-muted">Segments</dt>
            <dd className="m-0 text-right">{kms.length > 1 ? kms.length - 1 : "—"}</dd>
            <dt className="text-brand-muted">Athlètes inscrits</dt>
            <dd className="m-0 text-right">{course.athletes ?? 0}</dd>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-brand-muted">
            Les heures de nuit d&rsquo;un plan dépendent de l&rsquo;athlète ; elles se calculent au plan, pas ici.
          </p>
        </div>
      </Inspecteur>
    </>
  );
}

EtapeHorloge.Rail = Rail;
