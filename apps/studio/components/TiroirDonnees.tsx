"use client";

// components/TiroirDonnees.tsx
//
// CHARGER UNE TRACE, ET LA COUPER EN JOURNÉES.
//
// Le découpage est KILOMÉTRIQUE, pas horaire : avant le départ il n'existe
// aucune position datée, et « J1 » ne peut se déduire que d'un point de coupure
// sur l'itinéraire — un bivouac. C'est aussi ce qui rend l'outil utilisable sur
// une trace prévue.
//
// La lecture est entièrement locale : le fichier ne quitte jamais le navigateur.

import { useRef, useState } from "react";
import {
  coupuresRegulieres,
  decouperTrace,
  fusionnerTraces,
  seanceDepuisGpx,
  traceDepuisGpx,
  traceDepuisTrackJson,
  type Trace,
} from "@locomotionlab/trace";
import { VARIABLES, formatEntier, formatKm } from "@locomotionlab/planche";

import type { PosteDeTravail } from "@/lib/usePosteDeTravail";

/** Lit un fichier selon son extension. `null` si rien d'exploitable dedans. */
async function lire(fichier: File): Promise<Trace | null> {
  const texte = await fichier.text();
  if (/\.json$/i.test(fichier.name)) {
    try {
      return traceDepuisTrackJson(JSON.parse(texte));
    } catch {
      return null;
    }
  }
  return traceDepuisGpx(texte);
}

/**
 * LES JOURNÉES D'UNE TRACE QUI ARRIVE.
 *
 * Les jonctions d'une fusion l'emportent : ce sont les bivouacs réels, un
 * fichier par jour. Sinon, UNE SORTIE DÉJÀ FAITE EST D'UN SEUL TENANT — elle se
 * raconte, elle ne se planifie plus — et un itinéraire prévu, lui, se découpe.
 * Sans ce partage, une carte chargée restait d'une seule couleur et sans une
 * étiquette, et il fallait deviner qu'un réglage ailleurs la coupait.
 */
function coupuresALOuverture(trace: Trace): number[] {
  if (trace.jonctions?.length) return trace.jonctions;
  return trace.vecue ? [] : coupuresRegulieres(trace.totalKm, 2);
}

const CHAMP =
  "w-full rounded-md border border-brand-field bg-brand-bg px-2 py-1.5 text-[13px] tabulaire";

export default function TiroirDonnees({ poste }: { poste: PosteDeTravail }) {
  const { projet, modifier } = poste;
  const entree = useRef<HTMLInputElement | null>(null);
  const [souci, setSouci] = useState<string | null>(null);
  const [enLecture, setEnLecture] = useState(false);

  const trace = projet.donnees.trace;
  const segments = decouperTrace(trace, projet.donnees.coupures);

  async function charger(fichiers: FileList | null) {
    if (!fichiers || fichiers.length === 0) return;
    setEnLecture(true);
    setSouci(null);
    try {
      const lues = await Promise.all([...fichiers].map(lire));
      // Bout à bout, dans l'ordre des fichiers : une aventure de plusieurs jours
      // s'enregistre souvent en une sortie par jour, la montre s'arrêtant au
      // bivouac.
      const fusionnee = fusionnerTraces(lues);
      if (!fusionnee) {
        setSouci("Aucune trace exploitable dans ce fichier.");
        return;
      }
      // Un GPX horodaté porte aussi une SÉANCE : c'est elle que Survol rejouera,
      // et elle qui remplit `{allure}` et `{fc_max}`.
      const gpx = fichiers.length === 1 && !/\.json$/i.test(fichiers[0]!.name)
        ? seanceDepuisGpx(await fichiers[0]!.text())
        : null;

      modifier(
        (p) => ({
          ...p,
          donnees: {
            ...p.donnees,
            trace: fusionnee,
            seance: gpx,
            // Le cadrage se fige sur la trace complète : changer la tranche de
            // journées ne doit pas recadrer les cartes de la série.
            traceCadrage: fusionnee,
            coupures: coupuresALOuverture(fusionnee),
          },
          modifieLe: new Date().toISOString(),
        }),
        { libelle: "charger une trace" },
      );
    } catch {
      setSouci("Ce fichier n'a pas pu être lu.");
    } finally {
      setEnLecture(false);
    }
  }

  /** Le nom de la trace est un TITRE, pas une donnée de mesure : il vient d'un
   *  fichier qu'on n'a pas écrit, et il se réécrit ici sans toucher au reste. */
  function renommer(nom: string) {
    if (!trace) return;
    modifier(
      (p) => (p.donnees.trace ? { ...p, donnees: { ...p.donnees, trace: { ...p.donnees.trace, nom } } } : p),
      { libelle: "renommer la trace", fusion: "nom-trace" },
    );
  }

  function couperEn(n: number) {
    if (!trace) return;
    modifier(
      (p) => ({
        ...p,
        donnees: { ...p.donnees, coupures: coupuresRegulieres(trace.totalKm, n) },
      }),
      { libelle: "découper en journées" },
    );
  }

  return (
    <div className="space-y-4 px-3.5 py-3">
      <div>
        <input
          ref={entree}
          type="file"
          accept=".gpx,.json,application/gpx+xml,application/json"
          multiple
          className="sr-only"
          onChange={(e) => charger(e.target.files)}
        />
        <button
          type="button"
          onClick={() => entree.current?.click()}
          disabled={enLecture}
          className="w-full rounded-md border border-brand-field px-3 py-2 text-[13px] transition-colors hover:bg-brand-primary/10 motion-reduce:transition-none disabled:opacity-50"
        >
          {enLecture ? "Lecture…" : "Charger une trace (GPX, .track.json)"}
        </button>
        <p className="mt-1.5 text-[11px] leading-snug text-brand-muted">
          Plusieurs fichiers se recollent bout à bout, dans l&rsquo;ordre choisi.
          Rien ne quitte ce navigateur.
        </p>
        {souci && (
          <p role="alert" className="mt-2 text-[12px] text-brand-deep-dark">
            {souci}
          </p>
        )}
      </div>

      {trace && (
        <>
          <section>
            <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
              La trace
            </h3>
            <label className="mb-1.5 block text-[12px]" htmlFor="nom-trace">
              <span className="text-brand-muted">Nom</span>
              <input
                id="nom-trace"
                type="text"
                value={trace.nom ?? ""}
                placeholder="sans nom"
                onChange={(e) => renommer(e.target.value)}
                onBlur={poste.sceller}
                className="mt-0.5 w-full rounded-md border border-brand-field bg-brand-bg px-2 py-1.5 text-[13px]"
              />
            </label>
            <p className="mb-2 text-[11px] leading-snug text-brand-muted">
              C&rsquo;est lui qu&rsquo;écrit {"{nom}"} — le titre des modèles. Un nom de GPX fait
              souvent trois lignes ; celui-ci est le tien.
            </p>
            <dl className="space-y-0.5 text-[13px]">
              <Ligne k="Distance" v={`${formatKm(trace.totalKm)} km`} />
              <Ligne k="D+" v={`${formatEntier(trace.dPlusM)} m`} />
              <Ligne k="D−" v={`${formatEntier(trace.dMinusM)} m`} />
              <Ligne k="Points" v={formatEntier(trace.coords.length)} />
              <Ligne k="Nature" v={trace.vecue ? "sortie vécue" : "itinéraire prévu"} />
              <Ligne k="Séance" v={projet.donnees.seance ? "chargée" : "aucune"} />
            </dl>
          </section>

          <section>
            <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
              Journées ({segments.length})
            </h3>
            <label className="block text-[12px] text-brand-muted" htmlFor="jours">
              Découpage régulier
            </label>
            <input
              id="jours"
              type="number"
              min={1}
              max={12}
              value={segments.length}
              onChange={(e) => couperEn(Number(e.target.value))}
              className={CHAMP}
            />
            <ul className="mt-2 space-y-0.5 text-[12px] text-brand-soft">
              {segments.map((s) => (
                <li key={s.index} className="tabulaire flex justify-between gap-2">
                  <span>J{s.index + 1}</span>
                  <span>
                    {formatKm(s.distanceKm)} km · {formatEntier(s.dPlusM)} m D+
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
              Variables
            </h3>
            <p className="mb-1.5 text-[11px] leading-snug text-brand-muted">
              À écrire entre accolades dans n&rsquo;importe quel texte.
            </p>
            <ul className="flex flex-wrap gap-1">
              {VARIABLES.map((v) => (
                <li
                  key={v.cle}
                  title={v.label}
                  className="tabulaire rounded border border-brand-hairline px-1.5 py-0.5 text-[11px] text-brand-soft"
                >
                  {`{${v.cle}}`}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Ligne({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-brand-muted">{k}</dt>
      <dd className="tabulaire text-brand-text">{v}</dd>
    </div>
  );
}
