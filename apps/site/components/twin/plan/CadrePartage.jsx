// components/twin/plan/CadrePartage.jsx
//
// LE CADRE PARTAGÉ : ce que l'assistance lit au lien de partage — les trois arrivées, la
// nuit sur le parcours, où passe le temps, les postes et leurs heures, les documents.
//
// Tous les chiffres viennent de l'annexe de la version publiée, que le moteur a écrite
// avec le PDF. La page ne prédit rien : elle met en page.

"use client";

import { useState } from "react";
import { BoutonTexte } from "@locomotionlab/ui";

import { duree, nombre } from "@/lib/twinTableauDeBord.mjs";
import { arriveesDuPlan, heureApres, nuitsEnKm } from "@/lib/twinPlan.mjs";
import ProfilAltimetrique from "@/components/twin/ProfilAltimetrique";

import { lienDuDocument } from "./api";

export const ETIQUETTE = "font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted";

export function TitreDeSection({ children, sous }) {
  return (
    <div>
      <h2 className="m-0 font-heading text-[22px] font-bold leading-tight text-brand-deep">{children}</h2>
      <div className="mt-1.5 h-[3px] w-10 rounded-full bg-brand-accent" aria-hidden="true" />
      {sous ? <p className="mt-3 text-sm leading-relaxed text-brand-soft">{sous}</p> : null}
    </div>
  );
}

function Copier({ texte }) {
  const [fait, setFait] = useState(false);
  if (!texte) return null;
  return (
    <BoutonTexte
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texte);
          setFait(true);
          setTimeout(() => setFait(false), 2500);
        } catch {
          /* presse-papiers refusé : rien à faire de plus */
        }
      }}
    >
      {fait ? "lien copié" : "copier le lien"}
    </BoutonTexte>
  );
}

function Scenario({ titre, heures, depart, accent }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${accent ? "border-brand-slate bg-brand-mist" : "border-brand-hairline bg-brand-paper"}`}>
      <p className={ETIQUETTE}>{titre}</p>
      <p className="mt-1 font-heading text-[26px] font-light leading-none text-brand-text">{duree(heures)}</p>
      <p className="mt-1 text-sm text-brand-soft">{heureApres(depart, heures)}</p>
    </div>
  );
}

function Assistance({ postes, arrivee, surObjectif }) {
  const lignes = [...postes, ...(arrivee ? [{ ...arrivee, note: arrivee.note ?? "" }] : [])];
  if (!lignes.length) {
    return <p className="text-sm text-brand-muted">Aucun poste d&rsquo;assistance déclaré sur cette course.</p>;
  }
  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-etiquette text-brand-muted">
              {["Poste", "km", "Au plus tôt", "Prévu", "Au plus tard", "À prévoir"].map((c) => (
                <th key={c} className="px-3 py-2 font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((p) => (
              <tr key={`${p.index}-${p.name}`} className="border-t border-brand-grid">
                <td className="px-3 py-2 font-semibold text-brand-text">
                  {p.night ? <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand-text align-middle" title="poste de nuit" /> : null}
                  {p.name}
                </td>
                <td className="px-3 py-2 tabular-nums">{nombre(p.km, 1)}</td>
                <td className="px-3 py-2 tabular-nums text-brand-soft">{p.earliest_clock || "—"}</td>
                <td className="px-3 py-2 font-semibold tabular-nums text-brand-text">{p.central_clock || "—"}</td>
                <td className="px-3 py-2 tabular-nums text-brand-soft">{p.latest_clock || "—"}</td>
                <td className="px-3 py-2 text-brand-soft">{p.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex list-none flex-col gap-3 p-0 sm:hidden">
        {lignes.map((p) => (
          <li key={`${p.index}-${p.name}`} className="rounded-lg border border-brand-hairline bg-brand-paper px-4 py-3">
            <p className="font-semibold text-brand-text">
              {p.night ? <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand-text align-middle" title="poste de nuit" /> : null}
              {p.name} <span className="font-normal text-brand-muted">· km {nombre(p.km, 1)}</span>
            </p>
            <p className="mt-1 flex justify-between text-sm tabular-nums">
              <span className="text-brand-soft">{p.earliest_clock}</span>
              <span className="font-semibold text-brand-text">{p.central_clock}</span>
              <span className="text-brand-soft">{p.latest_clock}</span>
            </p>
            <p className="mt-1 text-sm text-brand-soft">{p.note ? `à prévoir : ${p.note}` : "— rien à prévoir de noté"}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-brand-muted">
        « Prévu » est l&rsquo;heure que suit l&rsquo;athlète ; les deux autres{" "}
        {surObjectif ? "bornent la fenêtre de son plan" : "sont les bornes de sécurité"}. Point
        d&rsquo;encre : poste de nuit, prévoir de quoi éclairer et avoir chaud.
      </p>
    </>
  );
}

export function Documents({ reference, cle, documents, fige, version }) {
  const liens = [
    ["pdf", "Le PDF complet · rapport, feuille, fiches"],
    ["feuille.pdf", "La feuille seule · PDF"],
    ["ics", "Le calendrier des passages (ICS)"],
    ["gpx", "La trace avec les postes (GPX)"],
  ].filter(([nom]) => documents?.includes(nom));
  return (
    <ul className="flex list-none flex-col gap-2 p-0 sm:flex-row sm:flex-wrap sm:gap-5">
      {liens.map(([nom, libelle]) => (
        <li key={nom}>
          <a
            href={lienDuDocument(reference, cle, nom)}
            rel="noreferrer"
            className="font-semibold text-brand-deep underline decoration-brand-accent underline-offset-4 hover:text-brand-deep-dark"
          >
            {libelle}
          </a>
          <span className="ml-2 text-xs text-brand-muted">
            version {version}
            {fige ? " · figé" : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function CadrePartage({ vue, reference, cle, titre, lienDePartage }) {
  const depart = vue.plan?.start_time || vue.course?.start_time || vue.depart_le;
  const a = arriveesDuPlan(vue);
  const nuits = nuitsEnKm({
    depart,
    sun: vue.plan?.sun,
    segments: vue.plan?.segments,
    totalH: vue.plan?.t_clock_h,
  });
  const segments = vue.course?.segments ?? [];

  return (
    <section className="rounded-xl border border-brand-hairline bg-brand-paper px-5 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className={ETIQUETTE}>{titre}</p>
        {lienDePartage ? (
          <p className="text-sm text-brand-muted">
            Tout ce cadre se lit au lien de partage · <Copier texte={lienDePartage} />
          </p>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Scenario titre={a.surObjectif ? "Au plus tôt" : "Rapide"} heures={a.bas} depart={depart} />
        <Scenario titre={a.surObjectif ? "Objectif" : "Centrale"} heures={a.centre} depart={depart} accent />
        <Scenario titre={a.surObjectif ? "Au plus tard" : "Prudent"} heures={a.haut} depart={depart} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-brand-soft">
        {a.surObjectif ? (
          <>
            La fenêtre du plan, {duree(a.assistance[0])} – {duree(a.assistance[1])}
            {a.tolerancePct !== null ? <>&nbsp;: ±{nombre(a.tolerancePct, 1)}&nbsp;% autour de l&rsquo;objectif</> : null}. C&rsquo;est
            la fenêtre que l&rsquo;assistance étale le long du parcours.
          </>
        ) : (
          <>
            Les bornes de sécurité, {duree(a.assistance[0])} – {duree(a.assistance[1])}&nbsp;: quatre courses sur
            cinq y tiennent, arrivée comprise. C&rsquo;est la fenêtre que l&rsquo;assistance étale le long du parcours.
          </>
        )}
      </p>

      <div className="mt-8">
        <TitreDeSection>Le parcours</TitreDeSection>
        <div className="mt-4">
          <ProfilAltimetrique
            profil={vue.course?.profil ?? []}
            hauteur={200}
            bandes={nuits.map((n, i) => ({ cle: `nuit-${i}`, ...n, ton: "nuit" }))}
            marqueurs={segments.map((s) => ({ cle: s.index, km: s.km, libelle: `${s.index} · ${s.to}`, numero: s.index }))}
            libelle="Profil du parcours, avec les heures de nuit"
          />
        </div>
        <p className="mt-2 text-xs text-brand-muted">
          La trame bleu-vert marque les heures de nuit du plan central. Les numéros sont ceux des ravitaillements.
        </p>
      </div>

      {vue.ventilation?.parts?.length ? (
        <div className="mt-8">
          <TitreDeSection>Où passe le temps</TitreDeSection>
          <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-brand-grid" aria-hidden="true">
            {vue.ventilation.parts.map((part, i) => (
              <span
                key={part.cle}
                className={["bg-brand-deep", "bg-brand-primary", "bg-brand-slate", "bg-brand-accent"][i % 4]}
                style={{ width: `${Math.max(0, part.fraction * 100)}%` }}
              />
            ))}
          </div>
          <ul className="mt-3 grid list-none grid-cols-2 gap-2 p-0 text-sm sm:grid-cols-4">
            {vue.ventilation.parts.map((part) => (
              <li key={part.cle}>
                <span className="text-brand-soft">{part.quoi}</span>{" "}
                <span className="whitespace-nowrap font-semibold text-brand-text">
                  {part.hm} · {part.pct}&nbsp;%
                </span>
              </li>
            ))}
          </ul>
          {vue.ventilation.lecture ? (
            <p className="mt-2 text-sm leading-relaxed text-brand-soft">{vue.ventilation.lecture}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8">
        <TitreDeSection>L&rsquo;assistance</TitreDeSection>
        <div className="mt-4">
          <Assistance postes={vue.assistance ?? []} arrivee={vue.arrivee} surObjectif={a.surObjectif} />
        </div>
      </div>

      <div className="mt-8 border-t border-brand-grid pt-5">
        <Documents reference={reference} cle={cle} documents={vue.documents} fige={vue.fige} version={vue.version} />
      </div>
    </section>
  );
}
